-- Báo cáo 8h sáng mỗi ngày qua Zalo bot cho giám đốc / admin (và ai bật nhận)
alter table public.profiles add column if not exists daily_report boolean; -- null = theo vai trò (duyet, admin_it nhận)

create or replace function public.daily_report_text() returns text language plpgsql stable security definer set search_path = public as $$
declare run int; done1 int; stuck int; late int; newb int; bn text; t text; r record;
begin
  select count(*) into run from batches where status in ('dang_lam','cho_ky');
  select count(*) into done1 from batches where status = 'hoan_tat' and done_at >= now() - interval '1 day';
  select count(*) into newb from batches where status <> 'huy' and created_at >= now() - interval '1 day';
  select count(*) into stuck from batches b where b.status in ('dang_lam','cho_ky')
    and coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at) < now() - interval '2 days';
  select count(*) into late from orders o where o.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and exists (select 1 from batches b where b.order_id = o.id and b.status in ('dang_lam','cho_ky'));
  select b.proc || ' · ' || coalesce(case when b.proc <> 'QT0' then (case d.company when 'HW' then 'Hanwha' else d.company end) || ' · ' end, '') || (case d.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm' when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'lap' then 'Lập' else d.status end) || ' (' || count(*) || ')' into bn
    from batches b join lateral (select * from docs x where x.batch_id = b.id order by x.status_at desc limit 1) d on true
    where b.status = 'dang_lam' group by b.proc, d.company, d.status order by count(*) desc limit 1;
  t := '📊 Báo cáo sáng ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || E'\n'
    || '▶️ Đang chạy: ' || run || ' hồ sơ' || E'\n'
    || '✅ Hoàn tất hôm qua: ' || done1 || '  ·  🆕 Mở mới: ' || newb || E'\n'
    || case when stuck > 0 then '⏳ Kẹt ≥ 2 ngày: ' || stuck else '⏳ Không có hồ sơ kẹt' end || E'\n'
    || case when late > 0 then '⚠️ Đơn quá hạn giao: ' || late else '👍 Không có đơn quá hạn' end;
  if bn is not null then t := t || E'\n🔥 Nghẽn nhiều nhất: ' || bn; end if;
  -- 3 hồ sơ chờ lâu nhất
  for r in select o.code, b.title, b.proc, extract(day from now() - coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at))::int as dd
      from batches b join orders o on o.id = b.order_id where b.status in ('dang_lam','cho_ky')
      order by coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at) limit 3 loop
    if r.dd >= 1 then t := t || E'\n  • ' || r.code || ' ' || r.proc || ' – chờ ' || r.dd || ' ngày'; end if;
  end loop;
  return t || E'\n\nXem chi tiết: https://79kaid-jpg.github.io/don-hang-cnc/#/thong-ke';
end $$;

create or replace function public.send_daily_report() returns int language plpgsql security definer set search_path = public as $$
declare tok text; txt text; r record; n int := 0;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if coalesce(tok, '') = '' then return 0; end if;
  txt := daily_report_text();
  for r in select zalo_chat_id from profiles where active and coalesce(zalo_chat_id, '') <> ''
      and coalesce(daily_report, roles && array['duyet','admin_it']) loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Người dùng tự bật / tắt nhận báo cáo; gửi thử cho chính mình
create or replace function public.set_daily_report(p_on boolean) returns void language sql security definer set search_path = public as $$
  update profiles set daily_report = p_on where id = app_uid();
$$;
create or replace function public.send_daily_report_me() returns boolean language plpgsql security definer set search_path = public as $$
declare tok text; cid text;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  select zalo_chat_id into cid from profiles where id = app_uid();
  if coalesce(tok, '') = '' or coalesce(cid, '') = '' then return false; end if;
  perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', cid, 'text', left(daily_report_text(), 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  return true;
end $$;
revoke execute on function public.daily_report_text(), public.send_daily_report() from public, anon, authenticated;
revoke execute on function public.set_daily_report(boolean), public.send_daily_report_me() from public, anon;
grant execute on function public.set_daily_report(boolean), public.send_daily_report_me() to authenticated;

-- 8:00 sáng giờ Việt Nam = 01:00 UTC, mỗi ngày
select cron.schedule('daily-report-8am', '0 1 * * *', $$select public.send_daily_report()$$);
