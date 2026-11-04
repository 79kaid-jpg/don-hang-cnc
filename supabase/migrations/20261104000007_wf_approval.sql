-- Luồng duyệt linh hoạt gắn vào bước (step.approval).
-- approval = { levels: [{id, name, approvers: Assignee[], rule: 'all'|'any'|'min', min, sla_hours, when?: {field, op, value}}], on_reject: 'back'|'fail'|'restart' }
--   levels chạy nối tiếp; cấp có "when" chỉ áp dụng khi điều kiện đúng (vd. Tổng tiền > 500 triệu mới cần Giám đốc).
--   rule: all = tất cả đồng ý · any = một người đồng ý là đạt · min = tối thiểu N người đồng ý.
--   Cấp bị từ chối khi không còn đủ người để đạt. on_reject: back = trả về bước trước · fail = dừng quy trình · restart = duyệt lại từ cấp 1 sau khi người làm bước sửa.
create table if not exists public.wf_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wf_tasks(id),
  round int not null default 1,
  level int not null,
  level_id text not null,
  level_name text not null,
  approver uuid not null references public.profiles(id),
  status text not null default 'cho' check (status in ('cho','dong_y','tu_choi','bo_qua')),
  note text not null default '',
  due_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists wf_appr_task on public.wf_approvals(task_id);
create index if not exists wf_appr_open on public.wf_approvals(approver) where status = 'cho';
alter table public.wf_approvals enable row level security;
create policy wfa_r on public.wf_approvals for select to authenticated using (true);
grant select on public.wf_approvals to authenticated;
alter table public.wf_tasks add column if not exists appr_state text; -- null | 'dang_duyet' | 'cho_sua' (bị từ chối, chờ người làm sửa rồi gửi duyệt lại)

create or replace function public._wf_has_appr(st jsonb) returns boolean language sql immutable as $$
  select coalesce(jsonb_array_length(st->'approval'->'levels'), 0) > 0 $$;

-- Mở cấp duyệt áp dụng được kể từ cấp p_from; trả về false nếu không còn cấp nào
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
      select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(lv->'approvers', '[]')) a, _wf_people(a) x
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

-- Gửi duyệt: người làm bước bấm "Gửi duyệt" (thay cho "Xong") → kiểm tra checklist/bắt buộc rồi mở cấp 1
create or replace function public.wf_submit_approval(p_task uuid, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare c record; it record; miss text; r int;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' or (c.ins).status <> 'dang_chay' then raise exception 'Việc đã xử lý xong'; end if;
  if not _wf_has_appr(c.st) then raise exception 'Bước này không có luồng duyệt'; end if;
  if (c.t).appr_state = 'dang_duyet' then raise exception 'Đang trong luồng duyệt'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không phụ trách bước "%"', c.st->>'name'; end if;
  for it in select * from _wf_items(c.st) loop
    if it.kind = 'file' then
      if not exists (select 1 from jsonb_array_elements((c.t).files) f where f->>'item' = it.key) then raise exception 'Chưa tải file: %', it.text; end if;
    elsif coalesce((p_checklist->>it.key)::boolean, false) is not true then raise exception 'Chưa tích: %', it.text; end if;
  end loop;
  miss := _wf_required_missing((c.v).def, c.st, (c.ins).data);
  if miss is not null then raise exception 'Chưa nhập trường bắt buộc: %', miss; end if;
  update wf_tasks set checklist = coalesce(p_checklist, '{}'), note = coalesce(p_note, '') where id = p_task;
  select coalesce(max(round), 0) + 1 into r from wf_approvals where task_id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, 'gui_duyet', (c.st->>'name') || coalesce(': ' || nullif(trim(p_note), ''), ''));
  if not _wf_open_level(p_task, 0, r) then
    -- không cấp nào áp dụng (điều kiện đều sai) → coi như đạt
    perform set_config('wf.sys', 'on', true);
    perform wf_act(p_task, 'next', coalesce(p_note, ''), coalesce(p_checklist, '{}'));
    perform set_config('wf.sys', 'off', true);
    return 'dat';
  end if;
  return 'dang_duyet';
end $$;

-- Quyết định của người duyệt
create or replace function public.wf_approve(p_appr uuid, p_ok boolean, p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare a wf_approvals; c record; lv jsonb; need int; tot int; yes int; pend int; res text := 'cho'; rej text;
begin
  select * into a from wf_approvals where id = p_appr for update;
  if a.id is null or a.status <> 'cho' then raise exception 'Phiếu duyệt đã được xử lý'; end if;
  if a.approver <> app_uid() and not has_role('admin_it') then raise exception 'Bạn không phải người duyệt của cấp này'; end if;
  if not p_ok and coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
  select * into c from _wf_ctx(a.task_id);
  if (c.t).status <> 'cho' then raise exception 'Bước đã kết thúc'; end if;
  update wf_approvals set status = case when p_ok then 'dong_y' else 'tu_choi' end, note = coalesce(p_note, ''), decided_at = now() where id = a.id;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, case when p_ok then 'dong_y' else 'tu_choi' end,
    (c.st->>'name') || ' · ' || a.level_name || coalesce(': ' || nullif(trim(p_note), ''), ''));

  lv := c.st->'approval'->'levels'->a.level;
  select count(*), count(*) filter (where status = 'dong_y'), count(*) filter (where status = 'cho')
    into tot, yes, pend from wf_approvals where task_id = a.task_id and round = a.round and level = a.level;
  need := case coalesce(lv->>'rule', 'all') when 'any' then 1 when 'min' then least(greatest(coalesce((lv->>'min')::int, 1), 1), tot) else tot end;

  if yes >= need then
    update wf_approvals set status = 'bo_qua' where task_id = a.task_id and round = a.round and level = a.level and status = 'cho';
    if _wf_open_level(a.task_id, a.level + 1, a.round) then res := 'cap_sau';
    else
      update wf_tasks set appr_state = null where id = a.task_id;
      perform set_config('wf.sys', 'on', true);
      perform wf_act(a.task_id, 'next', 'Đã duyệt đủ các cấp', (c.t).checklist);
      perform set_config('wf.sys', 'off', true);
      res := 'dat';
    end if;
  elsif yes + pend < need then
    update wf_approvals set status = 'bo_qua' where task_id = a.task_id and round = a.round and status = 'cho';
    rej := coalesce(c.st->'approval'->>'on_reject', 'restart');
    perform set_config('wf.sys', 'on', true);
    if rej = 'fail' then perform wf_act(a.task_id, 'fail', a.level_name || ' từ chối: ' || p_note);
    elsif rej = 'back' then perform wf_act(a.task_id, 'back', a.level_name || ' từ chối: ' || p_note);
    else update wf_tasks set appr_state = 'cho_sua' where id = a.task_id;
    end if;
    perform set_config('wf.sys', 'off', true);
    res := 'tu_choi';
  end if;
  return res;
end $$;

-- wf_act: chặn "Xong" thủ công ở bước có luồng duyệt; cho phép khi hệ thống gọi (wf.sys = on)
create or replace function public.wf_act(p_task uuid, p_action text, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; nxt jsonb; it record; label text; tgt text; prev wf_tasks; sys boolean := coalesce(current_setting('wf.sys', true), '') = 'on';
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  select * into v from wf_versions where id = ins.version_id;
  st := wf_step(v.def, ins.step_idx);
  if st->>'id' <> t.step_id then raise exception 'Việc không khớp bước hiện tại'; end if;
  if not sys then
    if t.assigned_to is null and not _wf_match(st->'assignee') and not has_role('admin_it') then
      raise exception 'Bước "%" chưa có người làm – chờ người quản trị giai đoạn phân công', st->>'name'; end if;
    if not (wf_can_do(t.assigned_to, st) or wf_is_manager(st)) then raise exception 'Bạn không phụ trách bước "%"', st->>'name'; end if;
    if p_action = 'next' and _wf_has_appr(st) then raise exception 'Bước này cần đi qua luồng duyệt – bấm "Gửi duyệt"'; end if;
    if t.appr_state = 'dang_duyet' and p_action in ('back', 'fail') and not wf_is_manager(st) then raise exception 'Đang trong luồng duyệt'; end if;
  end if;
  if p_action = 'next' then
    if not sys then
      for it in select * from _wf_items(st) loop
        if it.kind = 'file' then
          if not exists (select 1 from jsonb_array_elements(t.files) f where f->>'item' = it.key) then raise exception 'Chưa tải file: %', it.text; end if;
        elsif coalesce((p_checklist->>it.key)::boolean, false) is not true then raise exception 'Chưa tích: %', it.text; end if;
      end loop;
      if coalesce((st->>'require_note')::boolean, false) and coalesce(trim(p_note), '') = '' then raise exception 'Bước này bắt buộc ghi chú'; end if;
    end if;
    update wf_tasks set status = 'xong', done_by = coalesce(done_by, app_uid()), done_at = now(), note = case when sys then note else coalesce(p_note, '') end, checklist = coalesce(p_checklist, '{}') where id = t.id;
    tgt := _wf_route(v.def, ins.step_idx, ins.data);
    if tgt = '__end' or _wf_idx(v.def, tgt) is null then
      update wf_instances set status = 'hoan_tat', done_at = now() where id = ins.id; label := 'hoan_tat';
    else
      nxt := wf_step(v.def, _wf_idx(v.def, tgt));
      update wf_instances set step_idx = _wf_idx(v.def, tgt) where id = ins.id;
      perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    end if;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'ky', (st->>'name') || ' → ' || case when label = 'hoan_tat' then 'Kết thúc' else label end);
  elsif p_action = 'back' then
    if not sys and not coalesce((st->>'allow_back')::boolean, false) then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    select * into prev from wf_tasks where instance_id = ins.id and status = 'xong' and id <> t.id order by done_at desc limit 1;
    if prev.id is null or _wf_idx(v.def, prev.step_id) is null then
      if sys then update wf_tasks set appr_state = 'cho_sua' where id = t.id; return 'cho_sua'; end if;
      raise exception 'Không có bước trước để trả lại'; end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    update wf_tasks set status = 'tra_lai' where id = prev.id;
    nxt := wf_step(v.def, _wf_idx(v.def, prev.step_id));
    update wf_instances set step_idx = _wf_idx(v.def, prev.step_id) where id = ins.id;
    perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    update wf_tasks set assigned_to = prev.done_by where instance_id = ins.id and status = 'cho' and assigned_to is null;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'tra_lai', (st->>'name') || ' → ' || label || ': ' || p_note);
  elsif p_action = 'fail' then
    if not sys and not coalesce((st->>'allow_fail')::boolean, false) then raise exception 'Bước này không cho từ chối (Fail)'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
    update wf_tasks set status = 'fail', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    update wf_instances set status = 'fail', done_at = now() where id = ins.id; label := 'fail';
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'fail', (st->>'name') || ': ' || p_note);
  else raise exception 'Thao tác không hợp lệ';
  end if;
  update wf_approvals set status = 'bo_qua' where task_id = t.id and status = 'cho';
  return label;
end $$;

-- Hộp việc: thêm phiếu duyệt chờ tôi (vai = 'duyet')
create or replace function public.wf_inbox() returns table(task_id uuid, instance_id uuid, title text, process_name text, step_name text,
  due_at timestamptz, is_test boolean, created_at timestamptz, assigned_to uuid, vai text)
language sql stable security definer set search_path = public as $$
  select * from (
    select t.id, i.id, i.title, p.name, t.step_name, t.due_at, i.is_test, t.created_at, t.assigned_to,
      case when t.appr_state = 'dang_duyet' then null
           when t.assigned_to is null and coalesce(st->'assignee'->>'id', '') = '' and wf_is_manager(st) then 'phan_cong'
           when (t.assigned_to = app_uid()) or (t.assigned_to is null and _wf_match(st->'assignee')) then 'lam'
           when _wf_any(st->'managers') then 'quan_tri'
           when wf_is_watcher(st) then 'theo_doi' end as vai
    from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    cross join lateral (select wf_step(v.def, i.step_idx) as st) s
    where t.status = 'cho' and i.status = 'dang_chay'
    union all
    select t.id, i.id, i.title, p.name, t.step_name || ' · ' || a.level_name, a.due_at, i.is_test, a.created_at, a.approver, 'duyet'
    from wf_approvals a join wf_tasks t on t.id = a.task_id join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    where a.status = 'cho' and a.approver = app_uid() and t.status = 'cho' and i.status = 'dang_chay') q
  where vai is not null order by due_at nulls last, created_at $$;

-- Zalo cho người duyệt
create or replace function public._wf_appr_zalo() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare tok text; chat text; t wf_tasks; ins wf_instances; pn text; txt text;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  select zalo_chat_id into chat from profiles where id = new.approver;
  if tok is null or coalesce(chat, '') = '' or new.approver = app_uid() then return new; end if;
  select * into t from wf_tasks where id = new.task_id; select * into ins from wf_instances where id = t.instance_id;
  select p.name into pn from wf_versions v join wf_processes p on p.id = v.process_id where v.id = ins.version_id;
  txt := '✅ Cần bạn duyệt: ' || t.step_name || ' · ' || new.level_name ||
    case when new.due_at is not null then E'\nHạn: ' || to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') else '' end ||
    E'\n' || pn || ' · ' || ins.title || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/#/quy-trinh-moi/chay/' || ins.id;
  perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  return new;
exception when others then return new;
end $$;
create trigger wf_approvals_zalo after insert on public.wf_approvals for each row execute function public._wf_appr_zalo();

revoke execute on function public._wf_open_level(uuid, int, int), public._wf_appr_zalo() from public, anon, authenticated;
revoke execute on function public.wf_submit_approval(uuid, text, jsonb), public.wf_approve(uuid, boolean, text) from public, anon;
grant execute on function public.wf_submit_approval(uuid, text, jsonb), public.wf_approve(uuid, boolean, text) to authenticated;

-- Kiểm lỗi: cấp duyệt phải có người duyệt
create or replace function public.wf_validate(p_def jsonb) returns text[] language plpgsql stable as $$
declare e text[] := '{}'; s jsonb; i int := 0; ids text[] := '{}'; lanes text[]; it record; r jsonb;
begin
  select coalesce(array_agg(x->>'id'), '{}') into lanes from jsonb_array_elements(coalesce(p_def->'lanes', '[]')) x;
  if coalesce(jsonb_array_length(p_def->'steps'), 0) = 0 then return array['Quy trình chưa có bước nào']; end if;
  select coalesce(array_agg(x->>'id'), '{}') into ids from jsonb_array_elements(p_def->'steps') x;
  for s in select * from jsonb_array_elements(p_def->'steps') loop
    i := i + 1;
    if coalesce(trim(s->>'name'), '') = '' then e := e || ('Bước ' || i || ' chưa có tên'); end if;
    if coalesce(s->'assignee'->>'id', '') = '' and coalesce(jsonb_array_length(s->'managers'), 0) = 0 then
      e := e || ('Bước ' || i || ' (' || coalesce(s->>'name','') || ') chưa có người làm hoặc người quản trị để phân công'); end if;
    if i = 1 and coalesce(s->'assignee'->>'id', '') = '' then e := e || 'Bước đầu tiên phải có người làm'::text; end if;
    if (select count(*) from unnest(ids) x where x = s->>'id') > 1 then e := e || ('Bước ' || i || ' trùng mã'); end if;
    if coalesce(s->>'lane','') <> '' and not (s->>'lane' = any(lanes)) then e := e || ('Bước ' || i || ' thuộc làn không tồn tại'); end if;
    if i = 1 and coalesce((s->>'allow_back')::boolean, false) then e := e || 'Bước đầu tiên không thể trả lại'::text; end if;
    for it in select * from _wf_items(s) loop
      if coalesce(trim(it.text), '') = '' then e := e || ('Bước ' || i || ' có mục checklist trống'); end if;
    end loop;
    if coalesce(s->>'next', '') not in ('', '__end') and not (s->>'next' = any(ids)) then e := e || ('Bước ' || i || ': bước mặc định tiếp theo không tồn tại'); end if;
    for r in select * from jsonb_array_elements(coalesce(s->'approval'->'levels', '[]')) loop
      if coalesce(jsonb_array_length(r->'approvers'), 0) = 0 then e := e || ('Bước ' || i || ': cấp duyệt "' || coalesce(nullif(r->>'name',''), '?') || '" chưa có người duyệt'); end if;
    end loop;
    for r in select * from jsonb_array_elements(coalesce(s->'routes', '[]')) loop
      if coalesce(r->>'field', '') = '' or coalesce(r->>'goto', '') = '' then e := e || ('Bước ' || i || ': nhánh điều kiện chưa đủ trường / bước đến');
      elsif r->>'goto' <> '__end' and not (r->>'goto' = any(ids)) then e := e || ('Bước ' || i || ': nhánh trỏ tới bước không tồn tại'); end if;
    end loop;
  end loop;
  return e;
end $$;
