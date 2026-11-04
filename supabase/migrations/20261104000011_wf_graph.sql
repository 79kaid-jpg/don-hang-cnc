-- Trình tạo quy trình – engine dạng đồ thị (theo kiểu 1Office):
-- Mỗi nút (step) có type: task (công việc, mặc định) · action (hành động tự động) · parallel (tách song song) · join (gộp) · subprocess (quy trình con)
--   parallel: branches[] = các nút mở cùng lúc
--   join: join_mode 'all' (chờ mọi nhánh đang chạy xong) | 'any' (nhánh đầu tiên tới thì đi tiếp, huỷ các việc còn lại)
--   action: actions[] = {kind:'zalo', to:Assignee[], text} | {kind:'set', field, value} | {kind:'start', process_id}
--   subprocess: process_id, wait (mặc định true), copy_in / copy_out (mảng mã trường; bỏ trống = mọi trường trùng mã)
-- Định nghĩa còn có trigger = {on:'process_done', process_id}: quy trình tự mở khi quy trình kia hoàn tất (cùng đơn hàng).
-- Một hồ sơ có thể có nhiều việc mở cùng lúc; mỗi việc nhớ việc trước nó (prev_task) để "Trả lại" đúng đường.

alter table public.wf_tasks add column if not exists kind text not null default 'task';
alter table public.wf_tasks add column if not exists prev_task uuid references public.wf_tasks(id);
alter table public.wf_tasks add column if not exists join_from jsonb not null default '[]';
alter table public.wf_instances add column if not exists parent_task uuid references public.wf_tasks(id);
create index if not exists wf_inst_parent on public.wf_instances(parent_task);

create or replace function public._wf_node(p_def jsonb, p_id text) returns jsonb language sql immutable as $$
  select x from jsonb_array_elements(p_def->'steps') x where x->>'id' = p_id limit 1 $$;
create or replace function public._wf_type(st jsonb) returns text language sql immutable as $$ select coalesce(nullif(st->>'type', ''), 'task') $$;

-- Mở một việc (công việc / gộp / quy trình con)
create or replace function public._wf_open_task2(p_inst uuid, p_step jsonb, p_prev uuid, p_kind text default 'task') returns uuid
language plpgsql security definer set search_path = public as $$
declare who uuid; tid uuid; v wf_versions;
begin
  if p_kind = 'task' then
    if p_step->'assignee'->>'type' = 'user' and coalesce(p_step->'assignee'->>'id', '') <> '' then who := (p_step->'assignee'->>'id')::uuid;
    elsif p_step->'assignee'->>'type' in ('creator', 'manager') then select x into who from _wf_people_i(p_step->'assignee', p_inst) x limit 1;
    end if;
  end if;
  insert into wf_tasks(instance_id, step_id, step_name, due_at, assigned_to, kind, prev_task)
  values (p_inst, p_step->>'id', p_step->>'name',
    case when p_kind = 'task' and coalesce((p_step->>'sla_hours')::numeric, 0) > 0 then now() + ((p_step->>'sla_hours')::numeric * interval '1 hour') end,
    who, p_kind, p_prev) returning id into tid;
  select v2.* into v from wf_instances i join wf_versions v2 on v2.id = i.version_id where i.id = p_inst;
  update wf_instances set step_idx = coalesce(_wf_idx(v.def, p_step->>'id'), step_idx) where id = p_inst;
  return tid;
end $$;
-- giữ hàm cũ cho tương thích
create or replace function public._wf_open_task(p_inst uuid, p_step jsonb) returns void language plpgsql security definer set search_path = public as $$
begin perform _wf_open_task2(p_inst, p_step, null, 'task'); end $$;

-- Lấy trường cần chép: mảng mã trường, hoặc mọi trường của biểu mẫu đích
create or replace function public._wf_pick(p_data jsonb, p_def_to jsonb, p_list jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, p_data->k), '{}') from (
    select case when jsonb_typeof(p_list) = 'array' and jsonb_array_length(p_list) > 0 then x #>> '{}' end k
      from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' and jsonb_array_length(p_list) > 0 then p_list else '[null]' end) x
    union select f->>'id' from jsonb_array_elements(coalesce(p_def_to->'fields', '[]')) f
      where not (jsonb_typeof(p_list) = 'array' and jsonb_array_length(p_list) > 0)) q
  where k is not null and p_data ? k $$;

-- Tạo hồ sơ (không kiểm quyền – dùng nội bộ): kế thừa dữ liệu theo đơn hàng, vào nút đầu tiên
create or replace function public._wf_create_instance(p_version uuid, p_title text, p_test boolean, p_order uuid, p_parent uuid, p_init jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare i uuid; v wf_versions; d jsonb := '{}'; f jsonb; val jsonb; o record;
begin
  select * into v from wf_versions where id = p_version;
  insert into wf_instances(version_id, title, is_test, order_id, parent_task)
  values (v.id, coalesce(nullif(trim(p_title), ''), (select code || coalesce(' · ' || nullif(project, ''), '') from orders where id = p_order), 'Hồ sơ'),
    p_test, p_order, p_parent) returning id into i;
  if p_order is not null then
    for f in select * from jsonb_array_elements(coalesce(v.def->'fields', '[]')) loop
      if coalesce((f->>'inherit')::boolean, false) then
        select x.data->(f->>'id') into val from wf_instances x where x.order_id = p_order and x.id <> i and x.status in ('hoan_tat', 'dang_chay')
          and _wf_filled(x.data->(f->>'id')) order by (x.status = 'hoan_tat') desc, coalesce(x.done_at, x.started_at) desc limit 1;
        if val is not null then d := d || jsonb_build_object(f->>'id', val); end if;
      end if;
    end loop;
    select code, project into o from orders where id = p_order;
    if exists (select 1 from jsonb_array_elements(coalesce(v.def->'fields', '[]')) f where f->>'id' = 'ma_don') and not (d ? 'ma_don') then d := d || jsonb_build_object('ma_don', o.code); end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v.def->'fields', '[]')) f where f->>'id' = 'du_an') and not (d ? 'du_an') then d := d || jsonb_build_object('du_an', o.project); end if;
  end if;
  d := d || coalesce(p_init, '{}');
  update wf_instances set data = d where id = i;
  insert into wf_events(instance_id, process_id, action, detail) values (i, v.process_id, 'bat_dau', 'Bắt đầu: ' || (select title from wf_instances where id = i));
  perform _wf_enter(i, v.def->'steps'->0->>'id', null, 0);
  perform _wf_settle(i);
  return i;
end $$;

-- Thực hiện hành động tự động
create or replace function public._wf_run_actions(p_inst uuid, st jsonb) returns text language plpgsql security definer set search_path = public as $$
declare a jsonb; ins wf_instances; v wf_versions; ids uuid[]; out text := ''; pv wf_versions; nv jsonb; txt text;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  for a in select * from jsonb_array_elements(coalesce(st->'actions', '[]')) loop
    if a->>'kind' = 'zalo' then
      select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(a->'to', '[]')) t, _wf_people_i(t, p_inst) x;
      txt := replace(replace(coalesce(a->>'text', ''), '{ho_so}', ins.title), '{quy_trinh}', coalesce((select name from wf_processes where id = v.process_id), ''));
      perform _wf_zalo_send(ids, '🔔 ' || txt || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/#/quy-trinh-moi/chay/' || p_inst);
      out := out || 'Gửi Zalo (' || coalesce(array_length(ids, 1), 0) || ' người); ';
    elsif a->>'kind' = 'set' and coalesce(a->>'field', '') <> '' then
      nv := case when (a->>'value') ~ '^-?[0-9]+([.][0-9]+)?$' then to_jsonb((a->>'value')::numeric)
                 when a->>'value' = '{hom_nay}' then to_jsonb(to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'))
                 else to_jsonb(coalesce(a->>'value', '')) end;
      update wf_instances set data = jsonb_set(data, array[a->>'field'], nv, true) where id = p_inst;
      out := out || 'Gán ' || (a->>'field') || '; ';
    elsif a->>'kind' = 'start' and coalesce(a->>'process_id', '') <> '' then
      select pv2.* into pv from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
        where pv2.process_id = (a->>'process_id')::uuid and pv2.status = 'phat_hanh' and p.deleted_at is null limit 1;
      if pv.id is not null then
        perform _wf_create_instance(pv.id, ins.title, ins.is_test, ins.order_id, null, _wf_pick((select data from wf_instances where id = p_inst), pv.def, a->'copy'));
        out := out || 'Mở quy trình ' || (select name from wf_processes where id = pv.process_id) || '; ';
      else out := out || 'Bỏ qua mở quy trình (chưa phát hành); ';
      end if;
    end if;
  end loop;
  return out;
end $$;

-- Huỷ mọi việc đang mở (trừ một việc), kể cả hồ sơ con đang chờ
create or replace function public._wf_cancel_open(p_inst uuid, p_except uuid) returns void language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  update wf_approvals set status = 'bo_qua' where status = 'cho' and task_id in (select id from wf_tasks where instance_id = p_inst and status = 'cho' and id is distinct from p_except);
  for c in select i.id from wf_instances i join wf_tasks t on t.id = i.parent_task where t.instance_id = p_inst and t.status = 'cho' and t.id is distinct from p_except and i.status = 'dang_chay' loop
    perform _wf_cancel_open(c, null);
    update wf_instances set status = 'huy', done_at = now() where id = c;
  end loop;
  update wf_tasks set status = 'huy', done_at = now() where instance_id = p_inst and status = 'cho' and id is distinct from p_except;
end $$;

-- Vào một nút
create or replace function public._wf_enter(p_inst uuid, p_node text, p_from uuid, p_depth int) returns void
language plpgsql security definer set search_path = public as $$
declare ins wf_instances; v wf_versions; st jsonb; ty text; j wf_tasks; tid uuid; pv wf_versions; child uuid; msg text;
begin
  if p_depth > 60 then raise exception 'Quy trình lặp vô hạn giữa các nút tự động – kiểm tra lại các mũi tên'; end if;
  if p_node is null or p_node = '__end' then return; end if;
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.status <> 'dang_chay' then return; end if;
  st := _wf_node(v.def, p_node);
  if st is null then return; end if;
  ty := _wf_type(st);
  if ty = 'task' then
    perform _wf_open_task2(p_inst, st, p_from, 'task');
  elsif ty = 'action' then
    msg := _wf_run_actions(p_inst, st);
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'hanh_dong', coalesce(st->>'name', 'Hành động') || ': ' || msg);
    perform _wf_leave(p_inst, st, p_from, p_depth + 1);
  elsif ty = 'parallel' then
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'song_song', coalesce(st->>'name', 'Tách song song') || ' → ' || coalesce(jsonb_array_length(st->'branches'), 0) || ' nhánh');
    perform _wf_leave(p_inst, st, p_from, p_depth + 1);
  elsif ty = 'join' then
    select * into j from wf_tasks where instance_id = p_inst and step_id = st->>'id' and status = 'cho' and kind = 'join' limit 1;
    if j.id is null then
      tid := _wf_open_task2(p_inst, st, p_from, 'join');
      update wf_tasks set join_from = jsonb_build_array(p_from) where id = tid;
    else update wf_tasks set join_from = join_from || jsonb_build_array(p_from) where id = j.id; tid := j.id;
    end if;
    if coalesce(st->>'join_mode', 'all') = 'any' then
      perform _wf_cancel_open(p_inst, tid);
      update wf_tasks set status = 'xong', done_at = now() where id = tid;
      insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'gop', coalesce(st->>'name', 'Gộp') || ': một nhánh đã xong, huỷ các nhánh còn lại');
      perform _wf_leave(p_inst, st, tid, p_depth + 1);
    end if; -- 'all': _wf_settle quyết định khi nào đi tiếp
  elsif ty = 'subprocess' then
    tid := _wf_open_task2(p_inst, st, p_from, 'sub');
    select pv2.* into pv from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
      where pv2.process_id = nullif(st->>'process_id', '')::uuid and pv2.status = 'phat_hanh' and p.deleted_at is null limit 1;
    if pv.id is null then raise exception 'Quy trình con của "%" chưa phát hành', st->>'name'; end if;
    child := _wf_create_instance(pv.id, ins.title || ' · ' || (select name from wf_processes where id = pv.process_id), ins.is_test, ins.order_id,
      case when coalesce((st->>'wait')::boolean, true) then tid end, _wf_pick(ins.data, pv.def, st->'copy_in'));
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'quy_trinh_con', coalesce(st->>'name', 'Quy trình con') || ' → mở ' || (select name from wf_processes where id = pv.process_id));
    if not coalesce((st->>'wait')::boolean, true) then
      update wf_tasks set status = 'xong', done_at = now() where id = tid;
      perform _wf_leave(p_inst, st, tid, p_depth + 1);
    end if;
  end if;
end $$;

-- Rời một nút: song song → mọi nhánh; còn lại → theo rẽ nhánh / mặc định
create or replace function public._wf_leave(p_inst uuid, st jsonb, p_from uuid, p_depth int) returns void
language plpgsql security definer set search_path = public as $$
declare ins wf_instances; v wf_versions; b text;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.status <> 'dang_chay' then return; end if;
  if _wf_type(st) = 'parallel' then
    for b in select jsonb_array_elements_text(coalesce(st->'branches', '[]')) loop perform _wf_enter(p_inst, b, p_from, p_depth + 1); end loop;
  else
    perform _wf_enter(p_inst, _wf_route(v.def, _wf_idx(v.def, st->>'id'), ins.data), p_from, p_depth + 1);
  end if;
end $$;

-- Ổn định trạng thái: gộp 'all' khi không còn việc nào khác; hết việc → hoàn tất
create or replace function public._wf_settle(p_inst uuid) returns void language plpgsql security definer set search_path = public as $$
declare ins wf_instances; v wf_versions; j wf_tasks; k int := 0;
begin
  loop
    k := k + 1; exit when k > 30;
    select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
    exit when ins.status <> 'dang_chay';
    if not exists (select 1 from wf_tasks where instance_id = p_inst and status = 'cho' and kind <> 'join') then
      select * into j from wf_tasks where instance_id = p_inst and status = 'cho' and kind = 'join' order by created_at limit 1;
      if j.id is not null then
        update wf_tasks set status = 'xong', done_at = now() where id = j.id;
        insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'gop', j.step_name || ': đủ ' || jsonb_array_length(j.join_from) || ' nhánh');
        perform _wf_leave(p_inst, _wf_node(v.def, j.step_id), j.id, 0);
        continue;
      end if;
      update wf_instances set status = 'hoan_tat', done_at = now() where id = p_inst;
      insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'hoan_tat', 'Hoàn tất');
      perform _wf_on_done(p_inst);
    end if;
    exit;
  end loop;
end $$;

-- Khi hồ sơ hoàn tất: trả kết quả cho quy trình cha; tự mở các quy trình có điều kiện bắt đầu "khi quy trình này hoàn tất"
create or replace function public._wf_on_done(p_inst uuid) returns void language plpgsql security definer set search_path = public as $$
declare ins wf_instances; v wf_versions; pt wf_tasks; pins wf_instances; pv wf_versions; st jsonb; r record;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.parent_task is not null then
    select * into pt from wf_tasks where id = ins.parent_task;
    if pt.status = 'cho' then
      select * into pins from wf_instances where id = pt.instance_id; select * into pv from wf_versions where id = pins.version_id;
      st := _wf_node(pv.def, pt.step_id);
      update wf_instances set data = data || _wf_pick(ins.data, pv.def, st->'copy_out') where id = pins.id;
      update wf_tasks set status = 'xong', done_at = now() where id = pt.id;
      insert into wf_events(instance_id, process_id, action, detail) values (pins.id, pv.process_id, 'quy_trinh_con', pt.step_name || ': quy trình con hoàn tất');
      perform _wf_leave(pins.id, st, pt.id, 0);
      perform _wf_settle(pins.id);
    end if;
  end if;
  if not ins.is_test then
    for r in select pv2.id vid from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
        where pv2.status = 'phat_hanh' and p.deleted_at is null and pv2.def->'trigger'->>'on' = 'process_done' and pv2.def->'trigger'->>'process_id' = v.process_id::text loop
      perform _wf_create_instance(r.vid, ins.title, false, ins.order_id, null, '{}');
    end loop;
  end if;
end $$;

-- Dừng hồ sơ (Fail) và báo lên quy trình cha
create or replace function public._wf_fail(p_inst uuid, p_note text) returns void language plpgsql security definer set search_path = public as $$
declare ins wf_instances; pt wf_tasks;
begin
  select * into ins from wf_instances where id = p_inst;
  perform _wf_cancel_open(p_inst, null);
  update wf_instances set status = 'fail', done_at = now() where id = p_inst;
  if ins.parent_task is not null then
    select * into pt from wf_tasks where id = ins.parent_task;
    if pt.status = 'cho' then
      update wf_tasks set status = 'fail', done_at = now(), note = 'Quy trình con Fail: ' || p_note where id = pt.id;
      perform _wf_fail(pt.instance_id, 'Quy trình con Fail: ' || p_note);
    end if;
  end if;
end $$;

-- ── Thao tác của người dùng ──
create or replace function public.wf_act(p_task uuid, p_action text, p_note text default '', p_checklist jsonb default '{}') returns text
language plpgsql security definer set search_path = public as $$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; it record; label text; prev wf_tasks; nt uuid; sys boolean := coalesce(current_setting('wf.sys', true), '') = 'on';
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.id is null then raise exception 'Không tìm thấy việc'; end if;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  if t.kind <> 'task' then raise exception 'Nút này do hệ thống xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  if ins.status <> 'dang_chay' then raise exception 'Hồ sơ không còn chạy'; end if;
  select * into v from wf_versions where id = ins.version_id;
  st := _wf_node(v.def, t.step_id);
  if st is null then raise exception 'Bước không còn trong định nghĩa'; end if;
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
    update wf_tasks set status = 'xong', done_by = coalesce(done_by, app_uid()), done_at = now(),
      note = case when sys then note else coalesce(p_note, '') end, checklist = coalesce(p_checklist, '{}') where id = t.id;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'ky', (st->>'name') || ' xong');
    perform _wf_leave(ins.id, st, t.id, 0);
  elsif p_action = 'back' then
    if not sys and not coalesce((st->>'allow_back')::boolean, false) then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    -- về đúng việc đã dẫn tới việc này (bỏ qua nút hệ thống)
    select * into prev from wf_tasks where id = t.prev_task;
    while prev.id is not null and prev.kind <> 'task' loop select * into prev from wf_tasks where id = prev.prev_task; end loop;
    if prev.id is null then
      if sys then update wf_tasks set appr_state = 'cho_sua' where id = t.id; return 'cho_sua'; end if;
      raise exception 'Không có bước trước để trả lại';
    end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    nt := _wf_open_task2(ins.id, _wf_node(v.def, prev.step_id), prev.prev_task, 'task');
    update wf_tasks set assigned_to = coalesce(assigned_to, prev.done_by) where id = nt;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'tra_lai', (st->>'name') || ' → ' || prev.step_name || ': ' || p_note);
  elsif p_action = 'fail' then
    if not sys and not coalesce((st->>'allow_fail')::boolean, false) then raise exception 'Bước này không cho từ chối (Fail)'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
    update wf_tasks set status = 'fail', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'fail', (st->>'name') || ': ' || p_note);
    perform _wf_fail(ins.id, p_note);
    return 'fail';
  else raise exception 'Thao tác không hợp lệ';
  end if;
  update wf_approvals set status = 'bo_qua' where task_id = t.id and status = 'cho';
  perform _wf_settle(ins.id);
  select case when status = 'hoan_tat' then 'hoan_tat' when status = 'fail' then 'fail' end into label from wf_instances where id = ins.id;
  if label is null then
    select coalesce(string_agg(step_name, ', '), 'đang chờ nhánh khác') into label from wf_tasks where instance_id = ins.id and status = 'cho' and kind = 'task' and created_at = now();
  end if;
  return label;
end $$;

create or replace function public.wf_start(p_version uuid, p_title text, p_test boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v wf_versions; s0 jsonb; e text[];
begin
  select * into v from wf_versions where id = p_version;
  if v.id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  if v.status <> 'phat_hanh' and not (p_test and _wf_can_design(v.process_id)) then raise exception 'Phiên bản chưa phát hành'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Quy trình còn lỗi: %', array_to_string(e, '; '); end if;
  s0 := wf_step(v.def, 0);
  if not wf_can_do(null, s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  return _wf_create_instance(v.id, p_title, p_test or v.status <> 'phat_hanh', null, null, '{}');
end $$;

create or replace function public.wf_start_order(p_version uuid, p_title text, p_test boolean, p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v wf_versions; s0 jsonb; e text[];
begin
  select * into v from wf_versions where id = p_version;
  if v.id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  if v.status <> 'phat_hanh' and not (p_test and _wf_can_design(v.process_id)) then raise exception 'Phiên bản chưa phát hành'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Quy trình còn lỗi: %', array_to_string(e, '; '); end if;
  s0 := wf_step(v.def, 0);
  if not wf_can_do(null, s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  return _wf_create_instance(v.id, p_title, p_test or v.status <> 'phat_hanh', p_order, null, '{}');
end $$;

create or replace function public.wf_cancel(p_inst uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin_it') and not exists (select 1 from wf_instances where id = p_inst and started_by = app_uid()) then raise exception 'Không có quyền huỷ'; end if;
  perform _wf_cancel_open(p_inst, null);
  update wf_instances set status = 'huy', done_at = now() where id = p_inst and status = 'dang_chay';
  insert into wf_events(instance_id, action, detail) values (p_inst, 'huy', coalesce(p_note, ''));
end $$;

-- Quyền của tôi với một việc
create or replace function public.wf_task_rights(p_task uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('do', t.kind = 'task' and wf_can_do(t.assigned_to, st) and (t.assigned_to is not null or _wf_match(st->'assignee') or has_role('admin_it')),
    'manage', t.kind = 'task' and wf_is_manager(st), 'watch', wf_is_watcher(st))
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id
  cross join lateral (select _wf_node(v.def, t.step_id) as st) s where t.id = p_task $$;
-- giữ wf_my_rights (việc đầu tiên đang mở) cho tương thích
create or replace function public.wf_my_rights(p_inst uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select wf_task_rights((select id from wf_tasks where instance_id = p_inst and status = 'cho' and kind = 'task' order by created_at limit 1)) $$;

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
    cross join lateral (select _wf_node(v.def, t.step_id) as st) s
    where t.status = 'cho' and t.kind = 'task' and i.status = 'dang_chay'
    union all
    select t.id, i.id, i.title, p.name, t.step_name || ' · ' || a.level_name, a.due_at, i.is_test, a.created_at, a.approver, 'duyet'
    from wf_approvals a join wf_tasks t on t.id = a.task_id join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    where a.status = 'cho' and a.approver = app_uid() and t.status = 'cho' and i.status = 'dang_chay') q
  where vai is not null order by due_at nulls last, created_at $$;

create or replace function public.wf_stats(p_process uuid) returns table(step_id text, step_name text, open_n int, late_n int, done_n int, avg_hours numeric, back_n int)
language sql stable security definer set search_path = public as $$
  select t.step_id, max(t.step_name), count(*) filter (where t.status = 'cho' and i.status = 'dang_chay')::int,
    count(*) filter (where t.status = 'cho' and i.status = 'dang_chay' and t.due_at < now())::int,
    count(*) filter (where t.status = 'xong')::int,
    round(avg(extract(epoch from (t.done_at - t.created_at)) / 3600) filter (where t.status = 'xong')::numeric, 1),
    count(*) filter (where t.status = 'tra_lai')::int
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id
  where v.process_id = p_process and not i.is_test and t.kind = 'task' group by t.step_id $$;

-- Kiểm lỗi định nghĩa theo loại nút
create or replace function public.wf_validate(p_def jsonb) returns text[] language plpgsql stable as $$
declare e text[] := '{}'; s jsonb; i int := 0; ids text[] := '{}'; lanes text[]; it record; r jsonb; ty text; b text;
begin
  select coalesce(array_agg(x->>'id'), '{}') into lanes from jsonb_array_elements(coalesce(p_def->'lanes', '[]')) x;
  if coalesce(jsonb_array_length(p_def->'steps'), 0) = 0 then return array['Quy trình chưa có bước nào']; end if;
  select coalesce(array_agg(x->>'id'), '{}') into ids from jsonb_array_elements(p_def->'steps') x;
  for s in select * from jsonb_array_elements(p_def->'steps') loop
    i := i + 1; ty := _wf_type(s);
    if coalesce(trim(s->>'name'), '') = '' and ty = 'task' then e := e || ('Bước ' || i || ' chưa có tên'); end if;
    if i = 1 and ty <> 'task' then e := e || 'Nút đầu tiên phải là Công việc'::text; end if;
    if (select count(*) from unnest(ids) x where x = s->>'id') > 1 then e := e || ('Bước ' || i || ' trùng mã'); end if;
    if coalesce(s->>'lane','') <> '' and not (s->>'lane' = any(lanes)) then e := e || ('Bước ' || i || ' thuộc làn không tồn tại'); end if;
    if ty = 'task' then
      if coalesce(s->'assignee'->>'id', '') = '' and coalesce(jsonb_array_length(s->'managers'), 0) = 0 then
        e := e || ('Bước ' || i || ' (' || coalesce(s->>'name','') || ') chưa có người làm hoặc người quản trị để phân công'); end if;
      if i = 1 and coalesce(s->'assignee'->>'id', '') = '' then e := e || 'Bước đầu tiên phải có người làm'::text; end if;
      if i = 1 and coalesce((s->>'allow_back')::boolean, false) then e := e || 'Bước đầu tiên không thể trả lại'::text; end if;
      for it in select * from _wf_items(s) loop
        if coalesce(trim(it.text), '') = '' then e := e || ('Bước ' || i || ' có mục checklist trống'); end if;
      end loop;
      for r in select * from jsonb_array_elements(coalesce(s->'approval'->'levels', '[]')) loop
        if coalesce(jsonb_array_length(r->'approvers'), 0) = 0 then e := e || ('Bước ' || i || ': cấp duyệt "' || coalesce(nullif(r->>'name',''), '?') || '" chưa có người duyệt'); end if;
      end loop;
    elsif ty = 'parallel' then
      if coalesce(jsonb_array_length(s->'branches'), 0) < 2 then e := e || ('Nút ' || i || ' (tách song song) cần ít nhất 2 nhánh'); end if;
      for b in select jsonb_array_elements_text(coalesce(s->'branches', '[]')) loop
        if not (b = any(ids)) then e := e || ('Nút ' || i || ': nhánh song song trỏ tới nút không tồn tại'); end if;
      end loop;
    elsif ty = 'action' then
      if coalesce(jsonb_array_length(s->'actions'), 0) = 0 then e := e || ('Nút ' || i || ' (hành động) chưa có hành động nào'); end if;
      for r in select * from jsonb_array_elements(coalesce(s->'actions', '[]')) loop
        if r->>'kind' = 'zalo' and coalesce(jsonb_array_length(r->'to'), 0) = 0 then e := e || ('Nút ' || i || ': hành động gửi Zalo chưa có người nhận'); end if;
        if r->>'kind' = 'set' and coalesce(r->>'field', '') = '' then e := e || ('Nút ' || i || ': hành động gán giá trị chưa chọn trường'); end if;
        if r->>'kind' = 'start' and coalesce(r->>'process_id', '') = '' then e := e || ('Nút ' || i || ': hành động mở quy trình chưa chọn quy trình'); end if;
      end loop;
    elsif ty = 'subprocess' then
      if coalesce(s->>'process_id', '') = '' then e := e || ('Nút ' || i || ' (quy trình con) chưa chọn quy trình'); end if;
    end if;
    if ty <> 'parallel' then
      if coalesce(s->>'next', '') not in ('', '__end') and not (s->>'next' = any(ids)) then e := e || ('Bước ' || i || ': bước tiếp theo không tồn tại'); end if;
      for r in select * from jsonb_array_elements(coalesce(s->'routes', '[]')) loop
        if coalesce(r->>'field', '') = '' or coalesce(r->>'goto', '') = '' then e := e || ('Bước ' || i || ': nhánh điều kiện chưa đủ trường / bước đến');
        elsif r->>'goto' <> '__end' and not (r->>'goto' = any(ids)) then e := e || ('Bước ' || i || ': nhánh trỏ tới bước không tồn tại'); end if;
      end loop;
    end if;
  end loop;
  return e;
end $$;

revoke execute on function public._wf_open_task2(uuid, jsonb, uuid, text), public._wf_create_instance(uuid, text, boolean, uuid, uuid, jsonb),
  public._wf_run_actions(uuid, jsonb), public._wf_cancel_open(uuid, uuid), public._wf_enter(uuid, text, uuid, int), public._wf_leave(uuid, jsonb, uuid, int),
  public._wf_settle(uuid), public._wf_on_done(uuid), public._wf_fail(uuid, text) from public, anon, authenticated;
revoke execute on function public.wf_task_rights(uuid) from public, anon;
grant execute on function public.wf_task_rights(uuid) to authenticated;

-- Thông báo Zalo / nhắc hạn chỉ cho việc của người (không cho nút gộp, quy trình con)
do $$ declare src text; begin
  select pg_get_functiondef('public._wf_tasks_zalo()'::regprocedure) into src;
  src := replace(src, $q$if new.status <> 'cho' then return new; end if;$q$, $q$if new.status <> 'cho' or coalesce(new.kind, 'task') <> 'task' then return new; end if;$q$);
  execute src;
  select pg_get_functiondef('public.wf_remind()'::regprocedure) into src;
  src := replace(src, $q$where t.status = 'cho' and i.status = 'dang_chay' and t.due_at is not null$q$, $q$where t.status = 'cho' and t.kind = 'task' and i.status = 'dang_chay' and t.due_at is not null$q$);
  execute src;
end $$;
