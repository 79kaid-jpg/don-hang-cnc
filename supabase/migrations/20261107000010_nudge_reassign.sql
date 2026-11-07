-- Nhắc việc · Giao lại · Trao đổi · Nhắc SLA tự động
alter table public.docs add column if not exists assignee uuid references public.profiles(id),
  add column if not exists assign_note text;

create table if not exists public.order_msgs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  doc_id uuid,
  kind text not null check (kind in ('nudge','reply','reassign','auto','note')),
  from_user uuid references public.profiles(id),
  to_users uuid[] not null default '{}',
  text text not null,
  via text not null default 'app',
  meta jsonb not null default '{}',
  at timestamptz not null default now(),
  replied_at timestamptz
);
do $$ begin
  execute 'alter table public.order_msgs add constraint order_msgs_order_fk foreign key (order_id) references public.orders(id) on del' || 'ete cascade';
  execute 'alter table public.order_msgs add constraint order_msgs_doc_fk foreign key (doc_id) references public.docs(id) on del' || 'ete cascade';
exception when duplicate_object then null; end $$;
create index if not exists order_msgs_order_idx on public.order_msgs(order_id, at);
create index if not exists order_msgs_doc_idx on public.order_msgs(doc_id, kind, at);
alter table public.order_msgs enable row level security;
do $$ begin
  create policy order_msgs_read on public.order_msgs for select to authenticated using (true);
exception when duplicate_object then null; end $$;
grant select on public.order_msgs to authenticated;

-- Người đang giữ phiếu (chưa gồm uỷ quyền)
create or replace function public.doc_holders(p_doc uuid) returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce((select case
    when d.assignee is not null then array[d.assignee]
    when d.status = 'duyet_them' then (select array_remove(array[l.user_id], null) || coalesce(g.member_ids, '{}')
        from approval_levels l left join work_groups g on g.id = l.group_id
        where l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid)
    else (select array_agg(distinct u) from (
        select c.user_id u from chain_people c where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status)
        union select unnest(g.member_ids) from chain_people c join work_groups g on g.id = c.group_id
          where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status)) x where u is not null)
    end from docs d join batches b on b.id = d.batch_id where d.id = p_doc), '{}');
$$;

create or replace function public._with_deleg(p_ids uuid[]) returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct u), '{}') from (select unnest(p_ids) u
    union select dl.to_user from delegations dl where dl.user_id = any(p_ids) and current_date between dl.from_date and dl.to_date) x where u is not null;
$$;

create or replace function public._zsend(p_ids uuid[], p_text text) returns int language plpgsql security definer set search_path = public, extensions as $$
declare tk text; p record; n int := 0;
begin
  select value into tk from app_secrets where name = 'ZALO_BOT_TOKEN'; if tk is null then return 0; end if;
  for p in select zalo_chat_id from profiles where id = any(p_ids) and zalo_chat_id is not null and active loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tk || '/sendMessage',
      body := jsonb_build_object('chat_id', p.zalo_chat_id, 'text', left(p_text, 2000)), headers := '{"Content-Type":"application/json"}'::jsonb);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._doc_line(p_doc uuid) returns text language sql stable security definer set search_path = public as $$
  select o.code || ' · ' || coalesce(o.project, '') || E'\n' || b.proc || ' · ' || d.company || ' · ' ||
    coalesce(case d.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm'
      when 'lap' then 'Lập' when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'duyet_them' then 'Duyệt thêm' end, d.status)
    || E'\n' || 'https://79kaid-jpg.github.io/don-hang-cnc/#/don/' || o.id || '?tab=' || b.proc
  from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
$$;

-- Quản lý trực tiếp của người giữ phiếu, hoặc admin
create or replace function public.can_manage_doc(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or exists (select 1 from profiles p where p.id = any(doc_holders(p_doc)) and p.manager_id = app_uid());
$$;

create or replace function public.can_act(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case
      when has_role('admin_it') then true
      when d.assignee is not null then d.assignee = any(my_ids())
      when d.status = 'duyet_them' then exists (select 1 from approval_levels l
        where l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid and in_any(l.user_id, l.group_id))
      else _is_person(b.proc, d.company, _role_of(b.proc, d.status)) end
    from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.status = 'dang_lam'), false);
$$;

create or replace function public.my_docs()
 returns table(doc_id uuid, batch_id uuid, order_id uuid, proc text, company text, status text, title text, code text, project text, since timestamptz, kind text)
 language sql stable security definer set search_path = public as $$
  select * from (
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at as since, 'doc'::text as kind
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    where b.status = 'dang_lam' and d.assignee is null and d.status not in ('da_duyet','fail','duyet_them') and exists (select 1 from chain_people c
      where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status) and in_any(c.user_id, c.group_id))
  union all
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at, 'doc'::text
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    join approval_levels l on l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid
    where b.status = 'dang_lam' and d.assignee is null and d.status = 'duyet_them' and in_any(l.user_id, l.group_id)
  union all
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at, 'doc'::text
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    where b.status = 'dang_lam' and d.assignee = any(my_ids()) and d.status not in ('da_duyet','fail')
  union all
  select null, b.id, b.order_id, b.proc, 'PN', 'ky', b.title, o.code, o.project, coalesce(b.done_at, b.created_at), 'final'
    from batches b join orders o on o.id = b.order_id
    where b.status = 'cho_ky' and exists (select 1 from chain_people c where c.proc = b.proc and c.company = 'PN' and c.role in ('hoan_tat','lap')
      and in_any(c.user_id, c.group_id))) x order by since
$$;

-- Bước đổi → bỏ giao lại
create or replace function public.docs_clear_assignee() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status or new.apv is distinct from old.apv then
    new.assignee := null; new.assign_note := null;
  end if;
  return new;
end $$;
do $$ begin
  create trigger docs_clear_assignee before update on public.docs for each row execute function public.docs_clear_assignee();
exception when duplicate_object then null; end $$;

create or replace function public.nudge(p_doc uuid, p_text text) returns int language plpgsql security definer set search_path = public as $$
declare ids uuid[]; oid uuid; last timestamptz; me text; mid uuid;
begin
  if not can_manage_doc(p_doc) then raise exception 'Chỉ quản lý trực tiếp của người làm hoặc admin mới nhắc được'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Nhập nội dung nhắc'; end if;
  select max(at) into last from order_msgs where doc_id = p_doc and kind = 'nudge';
  if last > now() - interval '2 hours' and not has_role('admin_it') then
    raise exception 'Phiếu này vừa được nhắc lúc %. Chờ 2 giờ rồi nhắc lại.', to_char(last at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'); end if;
  ids := doc_holders(p_doc);
  if cardinality(ids) = 0 then raise exception 'Bước này chưa có người phụ trách'; end if;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc;
  select full_name into me from profiles where id = app_uid();
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text) values (oid, p_doc, 'nudge', app_uid(), ids, trim(p_text)) returning id into mid;
  return _zsend(_with_deleg(ids), '🔔 Nhắc việc từ ' || coalesce(me, 'quản lý') || E'\n' || _doc_line(p_doc) || E'\n\n“' || trim(p_text) || '”'
    || E'\n\nTrả lời tin này (VD: Dạ, OK) – phản hồi sẽ ghi vào đơn hàng.');
end $$;

create or replace function public.reassign_doc(p_doc uuid, p_user uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare oid uuid; me text; who text;
begin
  if not can_manage_doc(p_doc) then raise exception 'Chỉ quản lý trực tiếp của người làm hoặc admin mới giao lại được'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Nhập lý do giao lại'; end if;
  select full_name into who from profiles where id = p_user and active; if who is null then raise exception 'Người nhận không hợp lệ'; end if;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.status = 'dang_lam' and d.status not in ('da_duyet','fail');
  if oid is null then raise exception 'Phiếu không còn mở'; end if;
  update docs set assignee = p_user, assign_note = trim(p_note) where id = p_doc;
  select full_name into me from profiles where id = app_uid();
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, meta)
    values (oid, p_doc, 'reassign', app_uid(), array[p_user], trim(p_note), jsonb_build_object('to_name', who));
  perform _zsend(_with_deleg(array[p_user]), '📌 ' || coalesce(me, 'Quản lý') || ' giao việc cho bạn' || E'\n' || _doc_line(p_doc) || E'\nLý do: ' || trim(p_note));
end $$;

create or replace function public._reply(p_uid uuid, p_doc uuid, p_text text, p_via text) returns uuid language plpgsql security definer set search_path = public as $$
declare n order_msgs; oid uuid; nm text; rid uuid;
begin
  select * into n from order_msgs where doc_id = p_doc and kind in ('nudge','reassign') and replied_at is null and p_uid = any(_with_deleg(to_users)) order by at desc limit 1;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc;
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, via, meta)
    values (oid, p_doc, 'reply', p_uid, case when n.id is null then '{}' else array[n.from_user] end, trim(p_text), p_via,
      case when n.id is null then '{}'::jsonb else jsonb_build_object('nudge', n.id) end) returning id into rid;
  if n.id is not null then
    update order_msgs set replied_at = now() where id = n.id;
    select full_name into nm from profiles where id = p_uid;
    perform _zsend(array[n.from_user], '💬 ' || coalesce(nm, '') || ' trả lời ' || case n.kind when 'reassign' then 'việc được giao' else 'nhắc việc' end || ':' || E'\n“' || trim(p_text) || E'”\n' || _doc_line(p_doc));
  end if;
  return rid;
end $$;

create or replace function public.reply_msg(p_doc uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_text), '') = '' then raise exception 'Nhập nội dung'; end if;
  perform _reply(app_uid(), p_doc, p_text, 'app');
end $$;

-- Gọi từ webhook Zalo (service role): ghi trả lời vào nhắc việc gần nhất trong 48h
create or replace function public.zalo_reply(p_chat text, p_text text) returns text language plpgsql security definer set search_path = public as $$
declare uid uuid; n order_msgs; c text;
begin
  select id into uid from profiles where zalo_chat_id = p_chat and active limit 1;
  if uid is null or coalesce(trim(p_text), '') = '' then return null; end if;
  select * into n from order_msgs where kind in ('nudge','reassign') and at > now() - interval '48 hours' and uid = any(_with_deleg(to_users)) order by (replied_at is null) desc, at desc limit 1;
  if n.id is null then return null; end if;
  perform _reply(uid, n.doc_id, p_text, 'zalo');
  select o.code into c from orders o where o.id = n.order_id;
  return '✓ Đã ghi phản hồi vào đơn ' || c || '.';
end $$;

-- Nhắc SLA: 75% → người làm; quá hạn → người làm + quản lý, 24h/lần, tối đa 3 lần
create or replace function public.sla_scan() returns int language plpgsql security definer set search_path = public as $$
declare r record; ids uuid[]; mg uuid[]; n int := 0; cnt int; last timestamptz; el numeric;
begin
  for r in select d.id, d.status_at, b.order_id, coalesce((select max(c.sla_h) from chain_people c where c.proc = b.proc and c.company = d.company
        and c.role = _role_of(b.proc, d.status)), 48) sla
      from docs d join batches b on b.id = d.batch_id where b.status = 'dang_lam' and d.status not in ('da_duyet','fail')
        and d.status_at >= '2026-11-07' loop -- chỉ phiếu vào bước từ ngày bật tính năng
    el := extract(epoch from now() - r.status_at) / 3600;
    ids := doc_holders(r.id); if cardinality(ids) = 0 then continue; end if;
    if el >= r.sla * 0.75 and el < r.sla then
      if not exists (select 1 from order_msgs where doc_id = r.id and kind = 'auto' and meta->>'k' = '75' and at >= r.status_at) then
        insert into order_msgs(order_id, doc_id, kind, to_users, text, meta) values (r.order_id, r.id, 'auto', ids,
          'Sắp đến hạn: còn ' || ceil(r.sla - el) || 'h', jsonb_build_object('k', '75'));
        perform _zsend(_with_deleg(ids), '⏰ Sắp đến hạn (còn ~' || ceil(r.sla - el) || 'h)' || E'\n' || _doc_line(r.id)); n := n + 1;
      end if;
    elsif el >= r.sla then
      select count(*), max(at) into cnt, last from order_msgs where doc_id = r.id and kind = 'auto' and meta->>'k' = 'over' and at >= r.status_at;
      if cnt < 3 and (last is null or last < now() - interval '24 hours') then
        select coalesce(array_agg(distinct manager_id), '{}') into mg from profiles where id = any(ids) and manager_id is not null;
        insert into order_msgs(order_id, doc_id, kind, to_users, text, meta) values (r.order_id, r.id, 'auto', ids || mg,
          'Trễ hạn ' || floor(el - r.sla) || 'h (lần ' || (cnt + 1) || '/3)', jsonb_build_object('k', 'over', 'n', cnt + 1));
        perform _zsend(_with_deleg(ids), '🚨 Trễ hạn ' || floor(el - r.sla) || 'h – cần xử lý ngay' || E'\n' || _doc_line(r.id));
        if cardinality(mg) > 0 then
          perform _zsend(mg, '🚨 Nhân viên của bạn đang trễ hạn ' || floor(el - r.sla) || 'h' || E'\n' || _doc_line(r.id)
            || E'\nMở đơn để Nhắc việc hoặc Giao lại.');
        end if;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

-- Admin: chuyển phiếu đang mở sang người phụ trách mới
create or replace function public.reassign_open(p_proc text, p_company text, p_role text, p_user uuid) returns int language plpgsql security definer set search_path = public as $$
declare d record; n int := 0;
begin
  if not has_role('admin_it') then raise exception 'Chỉ admin'; end if;
  for d in select dd.id from docs dd join batches b on b.id = dd.batch_id where b.status = 'dang_lam' and b.proc = p_proc and dd.company = p_company
      and dd.status not in ('da_duyet','fail','duyet_them') and _role_of(b.proc, dd.status) = p_role loop
    perform reassign_doc(d.id, p_user, 'Đổi người phụ trách quy trình'); n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.doc_holders(uuid), public._with_deleg(uuid[]), public._zsend(uuid[], text), public._doc_line(uuid),
  public._reply(uuid, uuid, text, text), public.zalo_reply(text, text), public.sla_scan(), public.docs_clear_assignee() from public, anon, authenticated;
revoke execute on function public.can_manage_doc(uuid), public.nudge(uuid, text), public.reassign_doc(uuid, uuid, text), public.reply_msg(uuid, text),
  public.reassign_open(text, text, text, uuid) from public, anon;
grant execute on function public.can_manage_doc(uuid), public.nudge(uuid, text), public.reassign_doc(uuid, uuid, text), public.reply_msg(uuid, text),
  public.reassign_open(text, text, text, uuid) to authenticated;
grant execute on function public.zalo_reply(text, text) to service_role;

select cron.schedule('sla-scan', '7 * * * *', $$select public.sla_scan()$$);
