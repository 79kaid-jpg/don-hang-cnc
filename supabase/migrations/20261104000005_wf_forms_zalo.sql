-- Trình tạo quy trình – GĐ2 phần 1: biểu mẫu theo bước + thông báo Zalo khi việc tới lượt.
-- def.fields: [{id,label,type:text|textarea|number|date|select|table, options[], columns[{id,label,type,formula,sum}], help}]
-- step.perms: {fieldId: 'edit'|'required'|'view'|'hide'} (mặc định view). Dữ liệu lưu wf_instances.data {fieldId: giá trị}.

-- Giá trị coi là "đã nhập"
create or replace function public._wf_filled(v jsonb) returns boolean language sql immutable as $$
  select v is not null and jsonb_typeof(v) <> 'null' and case jsonb_typeof(v)
    when 'string' then trim(v #>> '{}') <> '' when 'array' then jsonb_array_length(v) > 0 else true end $$;

-- Lưu dữ liệu biểu mẫu: chỉ ghi các trường bước hiện tại cho sửa
create or replace function public.wf_save_data(p_task uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c record; d jsonb; k text; pm text;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' or (c.ins).status <> 'dang_chay' then raise exception 'Việc đã xử lý xong, không sửa được'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không được sửa nội dung bước này'; end if;
  d := (c.ins).data;
  for k in select jsonb_object_keys(coalesce(p_data, '{}')) loop
    pm := coalesce(c.st->'perms'->>k, 'view');
    if pm in ('edit', 'required') then d := jsonb_set(d, array[k], p_data->k, true); end if;
  end loop;
  update wf_instances set data = d where id = (c.ins).id;
  return d;
end $$;

-- Kiểm tra trường bắt buộc khi chuyển bước: bọc wf_act cũ
create or replace function public._wf_required_missing(p_def jsonb, p_step jsonb, p_data jsonb) returns text language sql stable as $$
  select string_agg(coalesce(f->>'label', f->>'id'), ', ')
  from jsonb_array_elements(coalesce(p_def->'fields', '[]')) f
  where p_step->'perms'->>(f->>'id') = 'required' and not _wf_filled(p_data->(f->>'id')) $$;

create or replace function public._wf_guard_required() returns trigger language plpgsql security definer set search_path = public as $$
declare ins wf_instances; v wf_versions; st jsonb; miss text;
begin
  if new.status = 'xong' and old.status = 'cho' then
    select * into ins from wf_instances where id = new.instance_id;
    select * into v from wf_versions where id = ins.version_id;
    st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = new.step_id limit 1);
    miss := _wf_required_missing(v.def, st, ins.data);
    if miss is not null then raise exception 'Chưa nhập trường bắt buộc: %', miss; end if;
  end if;
  return new;
end $$;
create trigger wf_tasks_required before update on public.wf_tasks for each row execute function public._wf_guard_required();

-- ── Zalo: báo người làm khi việc mở / được phân công; báo người quản trị khi cần phân công ──
create or replace function public._wf_people(a jsonb) returns setof uuid language sql stable security definer set search_path = public as $$
  select (a->>'id')::uuid where a->>'type' = 'user' and coalesce(a->>'id','') <> ''
  union select unnest(g.member_ids) from work_groups g where a->>'type' = 'group' and g.active and g.id::text = a->>'id'
  union select p.id from profiles p where a->>'type' = 'role' and p.active and (a->>'id') = any(p.roles) $$;

create or replace function public._wf_tasks_zalo() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare tok text; ins wf_instances; v wf_versions; pn text; st jsonb; ids uuid[]; txt text; r record; head text;
begin
  if new.status <> 'cho' then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if tok is null then return new; end if;
  select * into ins from wf_instances where id = new.instance_id;
  select * into v from wf_versions where id = ins.version_id;
  select name into pn from wf_processes where id = v.process_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = new.step_id limit 1);
  head := pn || ' · ' || ins.title || case when ins.is_test then ' (chạy thử)' else '' end;
  if new.assigned_to is not null then
    ids := array[new.assigned_to]; txt := '📌 Đến lượt bạn: ' || new.step_name;
  elsif coalesce(st->'assignee'->>'id', '') <> '' then
    select array_agg(distinct x) into ids from _wf_people(st->'assignee') x; txt := '📌 Đến lượt bạn: ' || new.step_name;
  else
    select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(st->'managers', '[]')) m, _wf_people(m) x;
    txt := '👥 Cần phân công người làm: ' || new.step_name;
  end if;
  if new.due_at is not null then txt := txt || E'\nHạn: ' || to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'); end if;
  txt := txt || E'\n' || head || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/#/quy-trinh-moi/chay/' || ins.id;
  for r in select zalo_chat_id from profiles where id = any(coalesce(ids, '{}')) and id is distinct from app_uid() and coalesce(zalo_chat_id, '') <> '' loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  end loop;
  return new;
exception when others then return new; -- không để lỗi gửi tin chặn quy trình
end $$;
create trigger wf_tasks_zalo after insert or update of assigned_to on public.wf_tasks for each row execute function public._wf_tasks_zalo();

revoke execute on function public.wf_save_data(uuid, jsonb), public._wf_people(jsonb), public._wf_tasks_zalo(), public._wf_guard_required() from public, anon;
grant execute on function public.wf_save_data(uuid, jsonb) to authenticated;

-- Mẫu QT0: thêm biểu mẫu danh sách tấm + ghi chú nối tiếp
update public.wf_versions v set def = v.def
  || jsonb_build_object('fields', '[
    {"id":"khach","label":"Khách hàng / dự án","type":"text"},
    {"id":"ghi_chu_admin","label":"Ghi chú tiếp nhận (yêu cầu của khách)","type":"textarea"},
    {"id":"ds_tam","label":"Danh sách tấm","type":"table","columns":[
      {"id":"ma_tam","label":"Mã tấm","type":"text"},
      {"id":"so_tam","label":"Số tấm","type":"number","sum":true},
      {"id":"m2_tam","label":"m² trải phẳng / tấm","type":"number"},
      {"id":"day","label":"Dày (mm)","type":"number"},
      {"id":"m2","label":"Tổng m²","type":"number","formula":"m2_tam * so_tam","sum":true},
      {"id":"kg","label":"Khối lượng (kg)","type":"number","formula":"m2 * day * 7.85","sum":true}]},
    {"id":"ghi_chu_kt","label":"Ghi chú kỹ thuật","type":"textarea"},
    {"id":"ghi_chu_kiem_tra","label":"Lưu ý của người kiểm tra","type":"textarea"}]'::jsonb)
  || jsonb_build_object('steps', (select jsonb_agg(s || jsonb_build_object('perms', case s->>'id'
      when 's1' then '{"khach":"required","ghi_chu_admin":"edit"}'::jsonb
      when 's2' then '{"ghi_chu_kt":"edit","ds_tam":"edit"}'::jsonb
      when 's3' then '{"ds_tam":"required"}'::jsonb
      when 's4' then '{"ghi_chu_kiem_tra":"edit"}'::jsonb else '{}'::jsonb end) order by o)
    from jsonb_array_elements(v.def->'steps') with ordinality as e(s, o)))
  where v.process_id = (select id from public.wf_processes where code = 'MAU-QT0') and v.version = 1;
