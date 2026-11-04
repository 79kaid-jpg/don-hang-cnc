-- Trình tạo quy trình – rẽ nhánh theo điều kiện.
-- step.routes: [{id, field, op, value, goto}] xét lần lượt khi bấm "xong"; khớp đầu tiên → sang bước goto ('__end' = kết thúc).
-- step.next: bước mặc định khi không nhánh nào khớp (bỏ trống = bước kế tiếp trong danh sách; '__end' = kết thúc).
-- field: mã trường, hoặc 'bang.cot' = tổng cột của bảng. op: gt ge lt le eq ne contains empty filled.
-- Trả lại: quay về bước đã làm gần nhất (đúng nhánh đã đi), không còn là "bước liền trước trong danh sách".

create or replace function public._wf_val(p_data jsonb, p_field text) returns jsonb language sql immutable as $$
  select case when position('.' in p_field) > 0 then
      (select to_jsonb(coalesce(sum(case when jsonb_typeof(r->split_part(p_field, '.', 2)) = 'number' then (r->>split_part(p_field, '.', 2))::numeric
                                           when (r->>split_part(p_field, '.', 2)) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(r->>split_part(p_field, '.', 2), ',', '.')::numeric end), 0))
       from jsonb_array_elements(case when jsonb_typeof(p_data->split_part(p_field, '.', 1)) = 'array' then p_data->split_part(p_field, '.', 1) else '[]' end) r)
    else p_data->p_field end $$;

create or replace function public._wf_num(v jsonb) returns numeric language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when (v #>> '{}') ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$' then replace(trim(v #>> '{}'), ',', '.')::numeric end $$;

create or replace function public._wf_test(p_data jsonb, r jsonb) returns boolean language plpgsql immutable as $$
declare v jsonb := _wf_val(p_data, r->>'field'); a numeric := _wf_num(v); b numeric := _wf_num(r->'value'); s text := lower(coalesce(v #>> '{}', '')); t text := lower(coalesce(r->>'value', ''));
begin
  return case r->>'op'
    when 'gt' then a > b when 'ge' then a >= b when 'lt' then a < b when 'le' then a <= b
    when 'eq' then case when a is not null and b is not null then a = b else s = t end
    when 'ne' then case when a is not null and b is not null then a <> b else s <> t end
    when 'contains' then position(t in s) > 0
    when 'empty' then not _wf_filled(v) when 'filled' then _wf_filled(v)
    else false end;
end $$;

-- Bước tiếp theo: id bước hoặc '__end'
create or replace function public._wf_route(p_def jsonb, p_idx int, p_data jsonb) returns text language plpgsql immutable as $$
declare st jsonb := p_def->'steps'->p_idx; r jsonb; n int := jsonb_array_length(p_def->'steps');
begin
  for r in select * from jsonb_array_elements(coalesce(st->'routes', '[]')) loop
    if coalesce(r->>'goto', '') <> '' and _wf_test(p_data, r) then return r->>'goto'; end if;
  end loop;
  if coalesce(st->>'next', '') <> '' then return st->>'next'; end if;
  if p_idx + 1 >= n then return '__end'; end if;
  return p_def->'steps'->(p_idx + 1)->>'id';
end $$;
create or replace function public._wf_idx(p_def jsonb, p_id text) returns int language sql immutable as $$
  select (o - 1)::int from jsonb_array_elements(p_def->'steps') with ordinality e(s, o) where s->>'id' = p_id $$;

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
    for r in select * from jsonb_array_elements(coalesce(s->'routes', '[]')) loop
      if coalesce(r->>'field', '') = '' or coalesce(r->>'goto', '') = '' then e := e || ('Bước ' || i || ': nhánh điều kiện chưa đủ trường / bước đến');
      elsif r->>'goto' <> '__end' and not (r->>'goto' = any(ids)) then e := e || ('Bước ' || i || ': nhánh trỏ tới bước không tồn tại'); end if;
    end loop;
  end loop;
  return e;
end $$;

create or replace function public.wf_act(p_task uuid, p_action text, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; nxt jsonb; it record; label text; tgt text; prev wf_tasks;
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  select * into v from wf_versions where id = ins.version_id;
  st := wf_step(v.def, ins.step_idx);
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
    if not coalesce((st->>'allow_back')::boolean, false) then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    select * into prev from wf_tasks where instance_id = ins.id and status = 'xong' and id <> t.id order by done_at desc limit 1;
    if prev.id is null or _wf_idx(v.def, prev.step_id) is null then raise exception 'Không có bước trước để trả lại'; end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    -- đánh dấu bước được trả về là chưa xong để lần trả lại sau đi tiếp về trước nữa
    update wf_tasks set status = 'tra_lai' where id = prev.id;
    nxt := wf_step(v.def, _wf_idx(v.def, prev.step_id));
    update wf_instances set step_idx = _wf_idx(v.def, prev.step_id) where id = ins.id;
    perform _wf_open_task(ins.id, nxt); label := nxt->>'name';
    update wf_tasks set assigned_to = prev.done_by where instance_id = ins.id and status = 'cho' and assigned_to is null;
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
