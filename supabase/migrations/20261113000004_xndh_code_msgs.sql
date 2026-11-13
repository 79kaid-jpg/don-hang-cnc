-- Tin Zalo / báo cáo dùng mã XNĐH của công ty; ghi mã tin bot gửi để nhận trả lời bằng quote
create or replace function public.doc_code(p_doc uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.code from co_orders c where c.batch_id = d.batch_id and c.company = d.company order by c.created_at desc limit 1),
    (select c.code from co_orders c where c.batch_id = d.batch_id order by c.created_at desc limit 1),
    o.code)
  from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
$$;
create or replace function public.batch_code(p_batch uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select c.code from co_orders c where c.batch_id = b.id order by c.created_at desc limit 1), o.code)
  from batches b join orders o on o.id = b.order_id where b.id = p_batch;
$$;
create or replace function public._short_code(p_doc uuid) returns text language sql stable security definer set search_path = public as $$
  select regexp_replace(public.doc_code(p_doc), '^.*-', '');
$$;

create table if not exists public.zalo_out (req_id bigint primary key, chat_id text not null, doc_id uuid, message_id text, at timestamptz not null default now());
create index if not exists zalo_out_msg on public.zalo_out(message_id);
create table if not exists public.zalo_raw (id bigserial primary key, at timestamptz not null default now(), payload jsonb);
alter table public.zalo_out enable row level security; alter table public.zalo_raw enable row level security;
drop policy if exists zalo_raw_admin on public.zalo_raw;
create policy zalo_raw_admin on public.zalo_raw for select to authenticated using (public.is_real_admin());

-- Dòng đầu tin: mã XNĐH · dự án; nhớ phiếu để _zsend ghi lại
create or replace function public._doc_line(p_doc uuid) returns text language plpgsql volatile security definer set search_path = public as $$
declare t text;
begin
  perform set_config('pms.zdoc', p_doc::text, true);
  select public.doc_code(p_doc) || ' · ' || coalesce(o.project, '') || E'\n' || b.proc || ' · ' || d.company || ' · ' ||
    coalesce(case d.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm'
      when 'lap' then 'Lập' when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'duyet_them' then 'Duyệt thêm' end, d.status)
    || E'\n' || 'https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || o.id || '?tab=' || b.proc
  into t from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
  return t;
end $$;

create or replace function public._zsend(p_ids uuid[], p_text text) returns integer language plpgsql security definer set search_path = public, extensions as $$
declare tk text; p record; n int := 0; rid bigint; dc uuid := nullif(current_setting('pms.zdoc', true), '')::uuid;
begin
  select value into tk from app_secrets where name = 'ZALO_BOT_TOKEN'; if tk is null then return 0; end if;
  for p in select zalo_chat_id from profiles where id = any(p_ids) and zalo_chat_id is not null and active loop
    rid := net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tk || '/sendMessage',
      body := jsonb_build_object('chat_id', p.zalo_chat_id, 'text', left(p_text, 2000)), headers := '{"Content-Type":"application/json"}'::jsonb);
    if dc is not null then insert into zalo_out(req_id, chat_id, doc_id) values (rid, p.zalo_chat_id, dc) on conflict do nothing; end if;
    n := n + 1;
  end loop;
  perform set_config('pms.zdoc', '', true);
  return n;
end $$;

-- Ghi tin do edge function gửi (đã có message_id)
create or replace function public.zalo_out_add(p_chat text, p_doc uuid, p_msg text) returns void language sql security definer set search_path = public as $$
  insert into zalo_out(req_id, chat_id, doc_id, message_id) values (-(nextval('zalo_raw_id_seq')), p_chat, p_doc, p_msg);
$$;

-- Lấy message_id từ phản hồi của pg_net (giữ ~6 giờ)
create or replace function public._zalo_out_resolve() returns void language sql security definer set search_path = public, net as $$
  update zalo_out z set message_id = coalesce(r.content::jsonb -> 'result' ->> 'message_id', r.content::jsonb ->> 'message_id')
  from net._http_response r where z.message_id is null and r.id = z.req_id and r.content is not null and r.content ~ '^\s*\{';
  delete from zalo_out where at < now() - interval '60 days';
  delete from zalo_raw where at < now() - interval '14 days';
$$;
select cron.schedule('zalo-out-resolve', '*/5 * * * *', 'select public._zalo_out_resolve()');

drop function if exists public.zalo_reply(text, text);
-- Trả lời từ Zalo: ưu tiên tin được quote → mã XNĐH gõ ở đầu → nhắc việc gần nhất
create or replace function public.zalo_reply(p_chat text, p_text text, p_raw jsonb default null) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; t text := trim(coalesce(p_text, '')); q text; dc uuid; m record; how text := '';
begin
  select id into uid from profiles where zalo_chat_id = p_chat and active limit 1;
  if uid is null or t = '' then return null; end if;
  perform _zalo_out_resolve();
  q := coalesce(p_raw #>> '{quote,message_id}', p_raw #>> '{quote,msg_id}', p_raw #>> '{reply_to_message,message_id}', p_raw #>> '{quoted_message,message_id}',
                p_raw ->> 'quote_msg_id', p_raw ->> 'reply_to_message_id', p_raw #>> '{quote_message,message_id}');
  if q is not null then select doc_id into dc from zalo_out where message_id = q and chat_id = p_chat order by at desc limit 1; if dc is not null then how := 'q'; end if; end if;
  if dc is null then
    for m in select * from (select distinct on (x.doc_id) x.doc_id, x.at, doc_code(x.doc_id) code from order_msgs x
        where x.at > now() - interval '14 days' and uid = any(_with_deleg(x.to_users)) and x.doc_id is not null order by x.doc_id, x.at desc) z order by z.at desc loop
      if upper(t) like upper(m.code) || '%' then dc := m.doc_id; t := trim(substr(t, length(m.code) + 1)); how := 'c'; exit; end if;
      if upper(t) like upper(regexp_replace(m.code, '^.*-', '')) || '%' and m.code ~ '-' then dc := m.doc_id; t := trim(substr(t, length(regexp_replace(m.code, '^.*-', '')) + 1)); how := 'c'; exit; end if;
    end loop;
    t := trim(regexp_replace(t, '^[:.,-]\s*', ''));
  end if;
  if dc is null then
    select doc_id into dc from order_msgs where kind in ('nudge','reassign') and at > now() - interval '48 hours' and uid = any(_with_deleg(to_users)) and doc_id is not null
      order by (replied_at is null) desc, at desc limit 1;
  end if;
  if dc is null then return null; end if;
  if t = '' then t := trim(p_text); end if;
  perform _reply(uid, dc, t, 'zalo');
  return '✓ Đã ghi phản hồi vào ' || doc_code(dc) || '.' || case when how = '' then E'\nMẹo: bấm giữ tin cần trả lời → Trả lời (quote) để chọn đúng XNĐH.' else '' end;
end $$;
revoke execute on function public.zalo_reply(text, text, jsonb), public.zalo_out_add(text, uuid, text), public._zalo_out_resolve() from public, anon, authenticated;
grant execute on function public.zalo_reply(text, text, jsonb), public.zalo_out_add(text, uuid, text) to service_role;

-- Báo cáo sáng: mã XNĐH
do $$ declare d text; begin
  d := pg_get_functiondef('public.daily_report_text'::regproc);
  d := replace(d, 'for r in select o.code, b.title', 'for r in select public.batch_code(b.id) as code, b.title');
  execute d;
end $$;
-- Gợi ý trả lời trong tin nhắc / giao việc / trao đổi
do $$ declare f text; d text; begin
  foreach f in array array['nudge','reassign_doc','_reply'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f limit 1;
    d := replace(d, 'Trả lời: gõ số đơn + nội dung, VD: ', 'Trả lời: quote tin này, hoặc gõ mã + nội dung, VD: ');
    execute d;
  end loop;
end $$;
