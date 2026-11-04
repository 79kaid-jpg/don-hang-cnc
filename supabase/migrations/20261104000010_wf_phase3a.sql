-- Trình tạo quy trình – đợt áp dụng điểm tốt của 1Office:
-- (1) gắn lượt chạy với đơn hàng + kế thừa dữ liệu từ hồ sơ trước · (2) mẫu in (cấu hình trong def.print, phần in làm ở giao diện)
-- (3) nhắc hạn nhiều nấc + leo thang · (5) người làm theo quan hệ: người tạo hồ sơ / quản lý trực tiếp của người tạo
-- (4) Kanban + báo cáo dùng các bảng sẵn có, thêm hàm thống kê.

-- ── (5) Hồ sơ người dùng: chức vụ + quản lý trực tiếp ──
alter table public.profiles add column if not exists position text not null default '';
alter table public.profiles add column if not exists manager_id uuid references public.profiles(id);

-- ── (1) Gắn đơn hàng ──
alter table public.wf_instances add column if not exists order_id uuid references public.orders(id);
create index if not exists wf_inst_order on public.wf_instances(order_id);

-- Người theo quan hệ: 'creator' = người tạo hồ sơ, 'manager' = quản lý trực tiếp của người tạo
create or replace function public._wf_people_i(a jsonb, p_inst uuid) returns setof uuid language sql stable security definer set search_path = public as $$
  select x from _wf_people(a) x where a->>'type' in ('user','group','role')
  union select i.started_by from wf_instances i where a->>'type' = 'creator' and i.id = p_inst
  union select p.manager_id from wf_instances i join profiles p on p.id = i.started_by where a->>'type' = 'manager' and i.id = p_inst and p.manager_id is not null $$;

create or replace function public._wf_open_task(p_inst uuid, p_step jsonb) returns void language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if p_step->'assignee'->>'type' = 'user' and coalesce(p_step->'assignee'->>'id', '') <> '' then who := (p_step->'assignee'->>'id')::uuid;
  elsif p_step->'assignee'->>'type' in ('creator', 'manager') then select x into who from _wf_people_i(p_step->'assignee', p_inst) x limit 1;
  end if;
  insert into wf_tasks(instance_id, step_id, step_name, due_at, assigned_to)
  values (p_inst, p_step->>'id', p_step->>'name',
    case when coalesce((p_step->>'sla_hours')::numeric, 0) > 0 then now() + ((p_step->>'sla_hours')::numeric * interval '1 hour') end, who);
end $$;

-- Cấp duyệt: dùng được người tạo / quản lý trực tiếp
create or replace function public._wf_open_level(p_task uuid, p_from int, p_round int) returns boolean
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; lv jsonb; k int; n int; ids uuid[];
begin
  select * into t from wf_tasks where id = p_task; select * into ins from wf_instances where id = t.instance_id; select * into v from wf_versions where id = ins.version_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = t.step_id limit 1);
  n := coalesce(jsonb_array_length(st->'approval'->'levels'), 0);
  k := p_from;
  while k < n loop
    lv := st->'approval'->'levels'->k;
    if lv->'when' is null or coalesce(lv->'when'->>'field', '') = '' or coalesce(_wf_test(ins.data, lv->'when'), false) then
      select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(lv->'approvers', '[]')) a, _wf_people_i(a, ins.id) x
        join profiles p on p.id = x and p.active;
      if coalesce(array_length(ids, 1), 0) > 0 then
        insert into wf_approvals(task_id, round, level, level_id, level_name, approver, due_at)
        select t.id, p_round, k, lv->>'id', coalesce(nullif(lv->>'name', ''), 'Cấp ' || (k + 1)), u,
          case when coalesce((lv->>'sla_hours')::numeric, 0) > 0 then now() + ((lv->>'sla_hours')::numeric * interval '1 hour') end
        from unnest(ids) u;
        update wf_tasks set appr_state = 'dang_duyet' where id = t.id;
        insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'mo_duyet',
          (st->>'name') || ' · ' || coalesce(nullif(lv->>'name', ''), 'Cấp ' || (k + 1)) || ' (' || array_length(ids, 1) || ' người)');
        return true;
      end if;
    end if;
    k := k + 1;
  end loop;
  return false;
end $$;

-- Bắt đầu hồ sơ gắn đơn hàng; trường đánh dấu "inherit" lấy giá trị từ hồ sơ gần nhất (đã hoàn tất, ưu tiên) của cùng đơn hàng
create or replace function public.wf_start_order(p_version uuid, p_title text, p_test boolean, p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare i uuid; v wf_versions; d jsonb := '{}'; f jsonb; val jsonb; o record;
begin
  i := wf_start(p_version, coalesce(nullif(trim(p_title), ''), (select code || coalesce(' · ' || nullif(project, ''), '') from orders where id = p_order)), p_test);
  if p_order is null then return i; end if;
  update wf_instances set order_id = p_order where id = i;
  select * into v from wf_versions where id = p_version;
  for f in select * from jsonb_array_elements(coalesce(v.def->'fields', '[]')) loop
    if coalesce((f->>'inherit')::boolean, false) then
      select x.data->(f->>'id') into val from wf_instances x where x.order_id = p_order and x.id <> i and x.status in ('hoan_tat', 'dang_chay')
        and _wf_filled(x.data->(f->>'id')) order by (x.status = 'hoan_tat') desc, coalesce(x.done_at, x.started_at) desc limit 1;
      if val is not null then d := d || jsonb_build_object(f->>'id', val); end if;
    end if;
  end loop;
  -- Trường hệ thống từ đơn hàng (tên dự án, mã đơn) nếu biểu mẫu có trường cùng mã
  select code, project into o from orders where id = p_order;
  for f in select * from jsonb_array_elements(coalesce(v.def->'fields', '[]')) loop
    if f->>'id' = 'ma_don' and not (d ? 'ma_don') then d := d || jsonb_build_object('ma_don', o.code); end if;
    if f->>'id' = 'du_an' and not (d ? 'du_an') then d := d || jsonb_build_object('du_an', o.project); end if;
  end loop;
  if d <> '{}' then
    update wf_instances set data = data || d where id = i;
    insert into wf_events(instance_id, action, detail) values (i, 'ke_thua', 'Lấy dữ liệu từ hồ sơ trước của đơn: ' || (select string_agg(k, ', ') from jsonb_object_keys(d) k));
  end if;
  return i;
end $$;

-- ── (3) Nhắc hạn nhiều nấc + leo thang ──
alter table public.wf_tasks add column if not exists half_sent boolean not null default false;
alter table public.wf_tasks add column if not exists over_sent boolean not null default false;
alter table public.wf_tasks add column if not exists esc_sent boolean not null default false;
alter table public.wf_approvals add column if not exists over_sent boolean not null default false;

create or replace function public._wf_zalo_send(p_users uuid[], p_text text) returns int language plpgsql security definer set search_path = public, extensions as $$
declare tok text; r record; n int := 0;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if tok is null then return 0; end if;
  for r in select distinct zalo_chat_id from profiles where id = any(p_users) and coalesce(zalo_chat_id, '') <> '' loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(p_text, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
    n := n + 1;
  end loop;
  return n;
exception when others then return n;
end $$;

-- Chạy mỗi 15 phút: 50% hạn → nhắc người làm; quá hạn → người làm + người quản trị giai đoạn; quá gấp đôi thời hạn → quản lý trực tiếp của người làm
create or replace function public.wf_remind() returns int language plpgsql security definer set search_path = public as $$
declare r record; st jsonb; ids uuid[]; link text; n int := 0; total interval;
begin
  for r in select t.*, i.title, i.is_test, v.def, p.name pname from wf_tasks t join wf_instances i on i.id = t.instance_id
      join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
      where t.status = 'cho' and i.status = 'dang_chay' and t.due_at is not null and coalesce(t.appr_state, '') <> 'dang_duyet'
        and (not t.half_sent or not t.over_sent or not t.esc_sent) loop
    st := (select x from jsonb_array_elements(r.def->'steps') x where x->>'id' = r.step_id limit 1);
    link := E'\n' || r.pname || ' · ' || r.title || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/#/quy-trinh-moi/chay/' || r.instance_id;
    if r.assigned_to is not null then ids := array[r.assigned_to]; else select array_agg(distinct x) into ids from _wf_people_i(st->'assignee', r.instance_id) x; end if;
    total := r.due_at - r.created_at;
    if not r.half_sent and now() >= r.created_at + total / 2 and now() < r.due_at then
      perform _wf_zalo_send(ids, '⏳ Đã dùng nửa thời hạn: ' || r.step_name || E'\nHạn: ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || link);
      update wf_tasks set half_sent = true where id = r.id; n := n + 1;
    end if;
    if not r.over_sent and now() >= r.due_at then
      select array_agg(distinct x) into ids from (select unnest(ids) x union select y from jsonb_array_elements(coalesce(st->'managers', '[]')) m, _wf_people_i(m, r.instance_id) y) q;
      perform _wf_zalo_send(ids, '🔴 Quá hạn: ' || r.step_name || ' (hạn ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')' || link);
      update wf_tasks set over_sent = true, half_sent = true where id = r.id; n := n + 1;
    end if;
    if not r.esc_sent and now() >= r.due_at + total then
      select array_agg(distinct p.manager_id) into ids from profiles p where p.manager_id is not null
        and p.id = any(coalesce(case when r.assigned_to is not null then array[r.assigned_to] end, (select array_agg(x) from _wf_people_i(st->'assignee', r.instance_id) x)));
      if ids is not null then perform _wf_zalo_send(ids, '⚠️ Leo thang – việc của nhân viên quá hạn lâu: ' || r.step_name || link); end if;
      update wf_tasks set esc_sent = true, over_sent = true, half_sent = true where id = r.id; n := n + 1;
    end if;
  end loop;
  -- Phiếu duyệt quá hạn
  for r in select a.*, t.step_name, t.instance_id, i.title from wf_approvals a join wf_tasks t on t.id = a.task_id join wf_instances i on i.id = t.instance_id
      where a.status = 'cho' and not a.over_sent and a.due_at is not null and a.due_at <= now() and i.status = 'dang_chay' loop
    perform _wf_zalo_send(array[r.approver], '🔴 Phiếu duyệt quá hạn: ' || r.step_name || ' · ' || r.level_name || E'\n' || r.title ||
      E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/#/quy-trinh-moi/chay/' || r.instance_id);
    update wf_approvals set over_sent = true where id = r.id; n := n + 1;
  end loop;
  return n;
end $$;
select cron.schedule('wf_remind', '*/15 * * * *', 'select public.wf_remind()');

-- ── (4) Thống kê cho báo cáo: theo bước của một quy trình ──
create or replace function public.wf_stats(p_process uuid) returns table(step_id text, step_name text, open_n int, late_n int, done_n int, avg_hours numeric, back_n int)
language sql stable security definer set search_path = public as $$
  select t.step_id, max(t.step_name), count(*) filter (where t.status = 'cho' and i.status = 'dang_chay')::int,
    count(*) filter (where t.status = 'cho' and i.status = 'dang_chay' and t.due_at < now())::int,
    count(*) filter (where t.status = 'xong')::int,
    round(avg(extract(epoch from (t.done_at - t.created_at)) / 3600) filter (where t.status = 'xong')::numeric, 1),
    count(*) filter (where t.status = 'tra_lai')::int
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id
  where v.process_id = p_process and not i.is_test group by t.step_id $$;

revoke execute on function public._wf_people_i(jsonb, uuid), public._wf_zalo_send(uuid[], text), public.wf_remind() from public, anon, authenticated;
revoke execute on function public.wf_start_order(uuid, text, boolean, uuid), public.wf_stats(uuid) from public, anon;
grant execute on function public.wf_start_order(uuid, text, boolean, uuid), public.wf_stats(uuid) to authenticated;

-- 'creator': ai mở hồ sơ thì người đó là người làm bước đầu (luôn khớp); 'manager' chỉ phân giải khi mở việc
create or replace function public._wf_match(a jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a->>'id', '') <> '' and case a->>'type'
    when 'user'  then (a->>'id')::uuid = app_uid()
    when 'group' then exists (select 1 from work_groups g where g.id = (a->>'id')::uuid and g.active and app_uid() = any(g.member_ids))
    when 'role'  then exists (select 1 from profiles where id = app_uid() and active and (a->>'id') = any(roles))
    when 'creator' then true
    else false end $$;
-- Mẫu QT0/QT1 cập nhật qua MCP: QT0 ds_tam inherit + mẫu in; QT1 có biểu mẫu (dự án, mã đơn, danh sách tấm kế thừa + đơn giá, thành tiền) + ô ký tay Khách hàng
