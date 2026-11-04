-- Trình tạo quy trình: người theo dõi / người quản trị giai đoạn, phân công khi chưa xác định người làm, checklist có mục "tải file".
-- Bước (JSON) thêm: watchers: Assignee[], managers: Assignee[]; checklist: [string | {id,text,kind:'check'|'file'}]
alter table public.wf_tasks add column if not exists assigned_to uuid references public.profiles(id);
alter table public.wf_tasks add column if not exists files jsonb not null default '[]';

-- Một đối tượng (người / nhóm / vai trò) có khớp người hiện tại không – không tính quyền IT
create or replace function public._wf_match(a jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(a->>'id', '') <> '' and case a->>'type'
    when 'user'  then (a->>'id')::uuid = app_uid()
    when 'group' then exists (select 1 from work_groups g where g.id = (a->>'id')::uuid and g.active and app_uid() = any(g.member_ids))
    when 'role'  then exists (select 1 from profiles where id = app_uid() and active and (a->>'id') = any(roles))
    else false end $$;
create or replace function public._wf_any(arr jsonb) returns boolean language sql stable as $$
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(arr) = 'array' then arr else '[]' end) x where _wf_match(x)) $$;

create or replace function public.wf_is_manager(p_step jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or _wf_any(p_step->'managers') $$;
create or replace function public.wf_is_watcher(p_step jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select _wf_any(p_step->'watchers') $$;
-- Người làm việc: nếu đã phân công đích danh thì chỉ người đó; nếu chưa thì theo cấu hình bước
create or replace function public.wf_can_do(p_assigned uuid, p_step jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or case when p_assigned is not null then p_assigned = app_uid() else _wf_match(p_step->'assignee') end $$;

-- Mục checklist: chuỗi cũ hoặc {id,text,kind}
create or replace function public._wf_items(p_step jsonb) returns table(key text, text text, kind text) language sql immutable as $$
  select coalesce(x->>'id', x#>>'{}'), coalesce(x->>'text', x#>>'{}'), coalesce(x->>'kind', 'check')
  from jsonb_array_elements(coalesce(p_step->'checklist', '[]')) x $$;

create or replace function public.wf_validate(p_def jsonb) returns text[] language plpgsql stable as $$
declare e text[] := '{}'; s jsonb; i int := 0; ids text[] := '{}'; lanes text[]; it record;
begin
  select coalesce(array_agg(x->>'id'), '{}') into lanes from jsonb_array_elements(coalesce(p_def->'lanes', '[]')) x;
  if coalesce(jsonb_array_length(p_def->'steps'), 0) = 0 then return array['Quy trình chưa có bước nào']; end if;
  for s in select * from jsonb_array_elements(p_def->'steps') loop
    i := i + 1;
    if coalesce(trim(s->>'name'), '') = '' then e := e || ('Bước ' || i || ' chưa có tên'); end if;
    if coalesce(s->'assignee'->>'id', '') = '' and coalesce(jsonb_array_length(s->'managers'), 0) = 0 then
      e := e || ('Bước ' || i || ' (' || coalesce(s->>'name','') || ') chưa có người làm hoặc người quản trị để phân công'); end if;
    if i = 1 and coalesce(s->'assignee'->>'id', '') = '' then e := e || 'Bước đầu tiên phải có người làm'::text; end if;
    if s->>'id' = any(ids) then e := e || ('Bước ' || i || ' trùng mã'); end if;
    if coalesce(s->>'lane','') <> '' and not (s->>'lane' = any(lanes)) then e := e || ('Bước ' || i || ' thuộc làn không tồn tại'); end if;
    if i = 1 and coalesce((s->>'allow_back')::boolean, false) then e := e || 'Bước đầu tiên không thể trả lại'::text; end if;
    for it in select * from _wf_items(s) loop
      if coalesce(trim(it.text), '') = '' then e := e || ('Bước ' || i || ' có mục checklist trống'); end if;
    end loop;
    ids := ids || (s->>'id');
  end loop;
  return e;
end $$;

-- Bắt đầu: bước đầu phải do người làm của bước đó mở
create or replace function public.wf_start(p_version uuid, p_title text, p_test boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v wf_versions; i uuid; s0 jsonb; e text[];
begin
  select * into v from wf_versions where id = p_version;
  if v.id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  if v.status <> 'phat_hanh' and not (p_test and has_role('admin_it')) then raise exception 'Phiên bản chưa phát hành'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Quy trình còn lỗi: %', array_to_string(e, '; '); end if;
  s0 := wf_step(v.def, 0);
  if not wf_can_do(null, s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  insert into wf_instances(version_id, title, is_test) values (v.id, coalesce(nullif(trim(p_title), ''), 'Lượt chạy'), p_test or v.status <> 'phat_hanh') returning id into i;
  perform _wf_open_task(i, s0);
  insert into wf_events(instance_id, process_id, action, detail) values (i, v.process_id, 'bat_dau', 'Bắt đầu: ' || coalesce(p_title, ''));
  return i;
end $$;

-- Mở việc: nếu cấu hình là một người thì phân công luôn; chưa xác định → chờ người quản trị giai đoạn phân công
create or replace function public._wf_open_task(p_inst uuid, p_step jsonb) returns void language sql as $$
  insert into wf_tasks(instance_id, step_id, step_name, due_at, assigned_to)
  values (p_inst, p_step->>'id', p_step->>'name',
    case when coalesce((p_step->>'sla_hours')::numeric, 0) > 0 then now() + ((p_step->>'sla_hours')::numeric * interval '1 hour') end,
    case when p_step->'assignee'->>'type' = 'user' and coalesce(p_step->'assignee'->>'id', '') <> '' then (p_step->'assignee'->>'id')::uuid end) $$;

-- Lấy việc đang mở + bước tương ứng (dùng chung)
create or replace function public._wf_ctx(p_task uuid, out t wf_tasks, out ins wf_instances, out v wf_versions, out st jsonb)
language plpgsql security definer set search_path = public as $$
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.id is null then raise exception 'Không tìm thấy việc'; end if;
  select * into ins from wf_instances where id = t.instance_id;
  select * into v from wf_versions where id = ins.version_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = t.step_id limit 1);
end $$;

-- Phân công / đổi người làm (người quản trị giai đoạn)
create or replace function public.wf_assign(p_task uuid, p_user uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' then raise exception 'Việc đã xử lý xong'; end if;
  if not wf_is_manager(c.st) then raise exception 'Chỉ người quản trị giai đoạn được phân công'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'Người nhận không hợp lệ'; end if;
  update wf_tasks set assigned_to = p_user where id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, 'phan_cong',
    (c.st->>'name') || ' → ' || (select full_name from profiles where id = p_user) || coalesce(': ' || nullif(trim(p_note), ''), ''));
end $$;

-- Gắn / gỡ file cho một mục checklist (người làm hoặc người quản trị giai đoạn)
create or replace function public.wf_task_file(p_task uuid, p_item text, p_name text, p_path text, p_remove boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; f jsonb;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' then raise exception 'Việc đã xử lý xong, không sửa file được'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không được sửa nội dung bước này'; end if;
  if p_remove then
    select coalesce(jsonb_agg(x), '[]') into f from jsonb_array_elements((c.t).files) x where x->>'path' <> p_path;
  else
    if coalesce(p_path, '') = '' or p_path not like 'wf/' || (c.ins).id || '/%' then raise exception 'Đường dẫn file không hợp lệ'; end if;
    f := (c.t).files || jsonb_build_array(jsonb_build_object('item', p_item, 'name', p_name, 'path', p_path, 'at', now(), 'by', app_uid()));
  end if;
  update wf_tasks set files = f where id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, case when p_remove then 'go_file' else 'tai_file' end,
    (c.st->>'name') || ': ' || coalesce(p_name, p_path));
  return f;
end $$;

create or replace function public.wf_act(p_task uuid, p_action text, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; n int; nxt jsonb; it record; label text;
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  select * into v from wf_versions where id = ins.version_id;
  st := wf_step(v.def, ins.step_idx); n := jsonb_array_length(v.def->'steps');
  if st->>'id' <> t.step_id then raise exception 'Việc không khớp bước hiện tại'; end if;
  if t.assigned_to is null and not _wf_match(st->'assignee') and not has_role('admin_it') then
    raise exception 'Bước "%" chưa có người làm – chờ người quản trị giai đoạn phân công', st->>'name'; end if;
  if not (wf_can_do(t.assigned_to, st) or wf_is_manager(st)) then raise exception 'Bạn không phụ trách bước "%"', st->>'name'; end if;
  if p_action = 'next' then
    for it in select * from _wf_items(st) loop
      if it.kind = 'file' then
        if not exists (select 1 from jsonb_array_elements(t.files) f where f->>'item' = it.key) then raise exception 'Chưa tải file: %', it.text; end if;
      elsif coalesce((p_checklist->>it.key)::boolean, false) is not true then raise exception 'Chưa tích: %', it.text; end if;
    end loop;
    if coalesce((st->>'require_note')::boolean, false) and coalesce(trim(p_note), '') = '' then raise exception 'Bước này bắt buộc ghi chú'; end if;
    update wf_tasks set status = 'xong', done_by = app_uid(), done_at = now(), note = coalesce(p_note, ''), checklist = coalesce(p_checklist, '{}') where id = t.id;
    if ins.step_idx + 1 >= n then
      update wf_instances set status = 'hoan_tat', done_at = now(), step_idx = n where id = ins.id; label := 'hoan_tat';
    else
      nxt := wf_step(v.def, ins.step_idx + 1);
      update wf_instances set step_idx = step_idx + 1 where id = ins.id;
      perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    end if;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'ky', (st->>'name') || ' → ' || label);
  elsif p_action = 'back' then
    if not coalesce((st->>'allow_back')::boolean, false) or ins.step_idx = 0 then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    nxt := wf_step(v.def, ins.step_idx - 1);
    update wf_instances set step_idx = step_idx - 1 where id = ins.id;
    perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    -- trả về đúng người đã làm bước trước
    update wf_tasks set assigned_to = (select done_by from wf_tasks where instance_id = ins.id and step_id = nxt->>'id' and status = 'xong' order by done_at desc limit 1)
      where instance_id = ins.id and status = 'cho' and assigned_to is null;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'tra_lai', (st->>'name') || ' → ' || label || ': ' || p_note);
  elsif p_action = 'fail' then
    if not coalesce((st->>'allow_fail')::boolean, false) then raise exception 'Bước này không cho từ chối (Fail)'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
    update wf_tasks set status = 'fail', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    update wf_instances set status = 'fail', done_at = now() where id = ins.id; label := 'fail';
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'fail', (st->>'name') || ': ' || p_note);
  else raise exception 'Thao tác không hợp lệ';
  end if;
  return label;
end $$;

-- Hộp việc: vai = 'lam' (tôi làm) · 'phan_cong' (chưa có người, tôi quản trị) · 'quan_tri' · 'theo_doi'
create or replace function public.wf_inbox() returns table(task_id uuid, instance_id uuid, title text, process_name text, step_name text,
  due_at timestamptz, is_test boolean, created_at timestamptz, assigned_to uuid, vai text)
language sql stable security definer set search_path = public as $$
  select * from (
    select t.id, i.id, i.title, p.name, t.step_name, t.due_at, i.is_test, t.created_at, t.assigned_to,
      case when t.assigned_to is null and coalesce(st->'assignee'->>'id', '') = '' and wf_is_manager(st) then 'phan_cong'
           when (t.assigned_to = app_uid()) or (t.assigned_to is null and _wf_match(st->'assignee')) then 'lam'
           when _wf_any(st->'managers') then 'quan_tri'
           when wf_is_watcher(st) then 'theo_doi' end as vai
    from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    cross join lateral (select wf_step(v.def, i.step_idx) as st) s
    where t.status = 'cho' and i.status = 'dang_chay') q
  where vai is not null order by due_at nulls last, created_at $$;

-- Quyền của tôi với một lượt chạy (cho màn hình chạy)
create or replace function public.wf_my_rights(p_inst uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('do', wf_can_do(t.assigned_to, st) and (t.assigned_to is not null or _wf_match(st->'assignee') or has_role('admin_it')),
    'manage', wf_is_manager(st), 'watch', wf_is_watcher(st))
  from wf_instances i join wf_versions v on v.id = i.version_id join wf_tasks t on t.instance_id = i.id and t.status = 'cho'
  cross join lateral (select wf_step(v.def, i.step_idx) as st) s where i.id = p_inst limit 1 $$;

revoke execute on function public._wf_match(jsonb), public.wf_is_manager(jsonb), public.wf_is_watcher(jsonb), public.wf_can_do(uuid, jsonb),
  public._wf_ctx(uuid), public.wf_assign(uuid, uuid, text), public.wf_task_file(uuid, text, text, text, boolean), public.wf_inbox(), public.wf_my_rights(uuid) from public, anon;
grant execute on function public.wf_assign(uuid, uuid, text), public.wf_task_file(uuid, text, text, text, boolean), public.wf_inbox(), public.wf_my_rights(uuid) to authenticated;

-- Mẫu QT0: mục Excel thành mục "tải file"; Dung là người quản trị giai đoạn bóc tách
update public.wf_versions v set def = jsonb_set(jsonb_set(v.def, '{steps,1,checklist}',
    '[{"id":"excel","text":"File Excel bóc tách chi tiết","kind":"file"}]'),
    '{steps,1,managers}', jsonb_build_array(jsonb_build_object('type','user','id',(v.def#>>'{steps,4,assignee,id}'))))
  where v.process_id = (select id from public.wf_processes where code = 'MAU-QT0') and v.version = 1;
