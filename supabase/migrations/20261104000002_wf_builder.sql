-- Trình tạo quy trình (thử nghiệm) – Giai đoạn 1. Tách riêng hoàn toàn: chỉ thêm bảng/hàm tiền tố wf_, không đụng batches/docs/chain_people.
-- Định nghĩa quy trình = JSON: { lanes:[{id,name}], steps:[{id,name,kind,lane,assignee:{type:user|group|role,id},sla_hours,checklist[],allow_back,allow_fail,require_note}] }
create table if not exists public.wf_processes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'Khác',
  is_template boolean not null default false,
  created_by uuid default public.app_uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.wf_versions (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.wf_processes(id),
  version int not null,
  status text not null default 'nhap' check (status in ('nhap','phat_hanh','luu_tru')),
  def jsonb not null default '{"lanes":[],"steps":[]}',
  note text not null default '',
  updated_by uuid default public.app_uid(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (process_id, version)
);
create table if not exists public.wf_instances (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.wf_versions(id),
  title text not null,
  status text not null default 'dang_chay' check (status in ('dang_chay','hoan_tat','fail','huy')),
  is_test boolean not null default false,
  step_idx int not null default 0,
  data jsonb not null default '{}',
  started_by uuid default public.app_uid(),
  started_at timestamptz not null default now(),
  done_at timestamptz
);
create table if not exists public.wf_tasks (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.wf_instances(id),
  step_id text not null,
  step_name text not null,
  status text not null default 'cho' check (status in ('cho','xong','tra_lai','fail','huy')),
  due_at timestamptz,
  checklist jsonb not null default '{}',
  done_by uuid,
  note text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create table if not exists public.wf_events (
  id bigint generated always as identity primary key,
  instance_id uuid references public.wf_instances(id),
  process_id uuid references public.wf_processes(id),
  actor uuid default public.app_uid(),
  real_actor uuid default auth.uid(),
  action text not null,
  detail text not null default '',
  at timestamptz not null default now()
);
create index if not exists wf_tasks_inst on public.wf_tasks(instance_id);
create index if not exists wf_tasks_open on public.wf_tasks(status) where status = 'cho';
create index if not exists wf_events_inst on public.wf_events(instance_id);

alter table public.wf_processes enable row level security;
alter table public.wf_versions enable row level security;
alter table public.wf_instances enable row level security;
alter table public.wf_tasks enable row level security;
alter table public.wf_events enable row level security;
-- Đọc: mọi người đăng nhập; ghi: chỉ qua hàm (security definer). Sửa định nghĩa: chỉ admin_it.
create policy wfp_r on public.wf_processes for select to authenticated using (true);
create policy wfv_r on public.wf_versions for select to authenticated using (true);
create policy wfi_r on public.wf_instances for select to authenticated using (true);
create policy wft_r on public.wf_tasks for select to authenticated using (true);
create policy wfe_r on public.wf_events for select to authenticated using (true);
grant select on public.wf_processes, public.wf_versions, public.wf_instances, public.wf_tasks, public.wf_events to authenticated;

-- ── Tiện ích ──
create or replace function public.wf_step(p_def jsonb, p_idx int) returns jsonb language sql immutable as $$ select p_def->'steps'->p_idx $$;

-- Người hiện tại có phải người làm bước không (người / nhóm / vai trò); admin_it luôn được
create or replace function public.wf_is_assignee(p_step jsonb) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or case p_step->'assignee'->>'type'
    when 'user'  then (p_step->'assignee'->>'id')::uuid = app_uid()
    when 'group' then exists (select 1 from work_groups g where g.id = (p_step->'assignee'->>'id')::uuid and g.active and app_uid() = any(g.member_ids))
    when 'role'  then has_role(p_step->'assignee'->>'id')
    else false end $$;

-- Kiểm tra lỗi định nghĩa trước khi phát hành → mảng câu tiếng Việt (rỗng = hợp lệ)
create or replace function public.wf_validate(p_def jsonb) returns text[] language plpgsql stable as $$
declare e text[] := '{}'; s jsonb; i int := 0; ids text[] := '{}'; lanes text[];
begin
  select coalesce(array_agg(x->>'id'), '{}') into lanes from jsonb_array_elements(coalesce(p_def->'lanes', '[]')) x;
  if coalesce(jsonb_array_length(p_def->'steps'), 0) = 0 then return array['Quy trình chưa có bước nào']; end if;
  for s in select * from jsonb_array_elements(p_def->'steps') loop
    i := i + 1;
    if coalesce(trim(s->>'name'), '') = '' then e := e || ('Bước ' || i || ' chưa có tên'); end if;
    if coalesce(s->'assignee'->>'id', '') = '' then e := e || ('Bước ' || i || ' (' || coalesce(s->>'name','') || ') chưa có người làm'); end if;
    if s->>'id' = any(ids) then e := e || ('Bước ' || i || ' trùng mã'); end if;
    if coalesce(s->>'lane','') <> '' and not (s->>'lane' = any(lanes)) then e := e || ('Bước ' || i || ' thuộc làn không tồn tại'); end if;
    if i = 1 and coalesce((s->>'allow_back')::boolean, false) then e := e || 'Bước đầu tiên không thể trả lại'::text; end if;
    ids := ids || (s->>'id');
  end loop;
  return e;
end $$;

-- ── Thiết kế (chỉ admin_it) ──
create or replace function public.wf_process_create(p_name text, p_from_version uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare p uuid; d jsonb := '{"lanes":[],"steps":[]}'; c text;
begin
  if not has_role('admin_it') then raise exception 'Chỉ IT được tạo quy trình (thử nghiệm)'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nhập tên quy trình'; end if;
  if p_from_version is not null then select def into d from wf_versions where id = p_from_version; end if;
  c := 'WF' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  insert into wf_processes(code, name) values (c, trim(p_name)) returning id into p;
  insert into wf_versions(process_id, version, def) values (p, 1, coalesce(d, '{"lanes":[],"steps":[]}'));
  insert into wf_events(process_id, action, detail) values (p, 'tao', case when p_from_version is null then 'Tạo mới' else 'Nhân bản từ mẫu' end);
  return p;
end $$;

-- Lưu nháp: nếu bản mới nhất đã phát hành thì tự mở bản nháp mới (đơn đang chạy giữ phiên bản cũ)
create or replace function public.wf_save_draft(p_process uuid, p_def jsonb, p_name text default null, p_desc text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v wf_versions;
begin
  if not has_role('admin_it') then raise exception 'Chỉ IT được sửa quy trình'; end if;
  if exists (select 1 from wf_processes where id = p_process and is_template) then raise exception 'Mẫu chỉ đọc – hãy nhân bản để sửa'; end if;
  update wf_processes set name = coalesce(nullif(trim(p_name), ''), name), description = coalesce(p_desc, description) where id = p_process;
  select * into v from wf_versions where process_id = p_process order by version desc limit 1;
  if v.status = 'nhap' then
    update wf_versions set def = p_def, updated_by = app_uid(), updated_at = now() where id = v.id;
    return v.id;
  end if;
  insert into wf_versions(process_id, version, def) values (p_process, coalesce(v.version, 0) + 1, p_def) returning id into v.id;
  return v.id;
end $$;

create or replace function public.wf_publish(p_version uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare v wf_versions; e text[];
begin
  if not has_role('admin_it') then raise exception 'Chỉ IT được phát hành'; end if;
  select * into v from wf_versions where id = p_version for update;
  if v.status <> 'nhap' then raise exception 'Chỉ phát hành được bản nháp'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Chưa phát hành được: %', array_to_string(e, '; '); end if;
  update wf_versions set status = 'luu_tru' where process_id = v.process_id and status = 'phat_hanh' and id <> v.id;
  update wf_versions set status = 'phat_hanh', published_at = now(), note = coalesce(p_note, '') where id = v.id;
  insert into wf_events(process_id, action, detail) values (v.process_id, 'phat_hanh', 'Phát hành phiên bản ' || v.version);
end $$;

-- ── Chạy ──
create or replace function public._wf_open_task(p_inst uuid, p_step jsonb) returns void language sql as $$
  insert into wf_tasks(instance_id, step_id, step_name, due_at)
  values (p_inst, p_step->>'id', p_step->>'name',
    case when coalesce((p_step->>'sla_hours')::numeric, 0) > 0 then now() + ((p_step->>'sla_hours')::numeric * interval '1 hour') end) $$;

-- Bắt đầu một lượt chạy. p_test = chạy thử bản nháp (chỉ IT)
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
  if not wf_is_assignee(s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  insert into wf_instances(version_id, title, is_test) values (v.id, coalesce(nullif(trim(p_title), ''), 'Lượt chạy'), p_test or v.status <> 'phat_hanh') returning id into i;
  perform _wf_open_task(i, s0);
  insert into wf_events(instance_id, process_id, action, detail) values (i, v.process_id, 'bat_dau', 'Bắt đầu: ' || coalesce(p_title, ''));
  return i;
end $$;

-- Xử lý việc: next (ký/xong) · back (trả lại bước trước, bắt buộc lý do) · fail (dừng, nếu bước cho phép)
create or replace function public.wf_act(p_task uuid, p_action text, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; n int; nxt jsonb; item text; label text;
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  select * into v from wf_versions where id = ins.version_id;
  st := wf_step(v.def, ins.step_idx); n := jsonb_array_length(v.def->'steps');
  if st->>'id' <> t.step_id then raise exception 'Việc không khớp bước hiện tại'; end if;
  if not wf_is_assignee(st) then raise exception 'Bạn không phụ trách bước "%"', st->>'name'; end if;

  if p_action = 'next' then
    for item in select jsonb_array_elements_text(coalesce(st->'checklist', '[]')) loop
      if coalesce((p_checklist->>item)::boolean, false) is not true then raise exception 'Chưa tích: %', item; end if;
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
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'ky', st->>'name' || ' → ' || label);
  elsif p_action = 'back' then
    if not coalesce((st->>'allow_back')::boolean, false) or ins.step_idx = 0 then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    nxt := wf_step(v.def, ins.step_idx - 1);
    update wf_instances set step_idx = step_idx - 1 where id = ins.id;
    perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'tra_lai', st->>'name' || ' → ' || label || ': ' || p_note);
  elsif p_action = 'fail' then
    if not coalesce((st->>'allow_fail')::boolean, false) then raise exception 'Bước này không cho từ chối (Fail)'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
    update wf_tasks set status = 'fail', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    update wf_instances set status = 'fail', done_at = now() where id = ins.id; label := 'fail';
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'fail', st->>'name' || ': ' || p_note);
  else raise exception 'Thao tác không hợp lệ';
  end if;
  return label;
end $$;

create or replace function public.wf_cancel(p_inst uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin_it') and not exists (select 1 from wf_instances where id = p_inst and started_by = app_uid()) then raise exception 'Không có quyền huỷ'; end if;
  update wf_tasks set status = 'huy', done_at = now() where instance_id = p_inst and status = 'cho';
  update wf_instances set status = 'huy', done_at = now() where id = p_inst and status = 'dang_chay';
  insert into wf_events(instance_id, action, detail) values (p_inst, 'huy', coalesce(p_note, ''));
end $$;

-- Việc đang chờ tôi
create or replace function public.wf_my_tasks() returns table(task_id uuid, instance_id uuid, title text, process_name text, step_name text, due_at timestamptz, is_test boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, i.id, i.title, p.name, t.step_name, t.due_at, i.is_test, t.created_at
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
  where t.status = 'cho' and i.status = 'dang_chay' and wf_is_assignee(wf_step(v.def, i.step_idx))
  order by t.due_at nulls last, t.created_at $$;

revoke execute on function public.wf_process_create(text, uuid), public.wf_save_draft(uuid, jsonb, text, text), public.wf_publish(uuid, text),
  public.wf_start(uuid, text, boolean), public.wf_act(uuid, text, text, jsonb), public.wf_cancel(uuid, text), public.wf_my_tasks(),
  public.wf_is_assignee(jsonb), public._wf_open_task(uuid, jsonb) from public, anon;
grant execute on function public.wf_process_create(text, uuid), public.wf_save_draft(uuid, jsonb, text, text), public.wf_publish(uuid, text),
  public.wf_start(uuid, text, boolean), public.wf_act(uuid, text, text, jsonb), public.wf_cancel(uuid, text), public.wf_my_tasks(),
  public.wf_validate(jsonb) to authenticated;
