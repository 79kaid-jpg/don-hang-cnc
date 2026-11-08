-- BẢO MẬT: mỗi công ty chỉ thấy hồ sơ của mình; trường nhạy cảm (giá, tiền…) chỉ người được cấp quyền thấy.
-- Thực thi ở máy chủ: client không còn đọc trực tiếp bảng docs, mà đọc view docs_v đã lọc / che.

-- 1) Vai trò Giám đốc + công ty của người dùng ---------------------------------------
create or replace function public.app_company() returns text language sql stable security definer set search_path = public as $$
  select case unit when 'CNC' then 'PN' when 'IPC' then 'IPC' when 'HANWA' then 'HW' end from profiles where id = app_uid();
$$;
create or replace function public.is_adm() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = app_uid() and active and 'admin_it' = any(roles));
$$;
-- Hồ sơ của công ty nào: QT0 là dữ liệu chung, QT1–QT3 chỉ cùng công ty
create or replace function public.doc_visible(p_company text, p_proc text) returns boolean language sql stable security definer set search_path = public as $$
  select is_adm() or p_proc = 'QT0' or p_company = app_company();
$$;

-- 2) Quyền xem theo trường ------------------------------------------------------------
alter table public.proc_fields add column if not exists restricted boolean not null default false;   -- trường nhạy cảm
alter table public.proc_fields add column if not exists view_roles text[] not null default '{}';     -- vai trò được xem (trong cùng công ty)
alter table public.proc_fields add column if not exists view_users uuid[] not null default '{}';     -- người cụ thể được xem
alter table public.proc_fields add column if not exists view_approver boolean not null default false; -- người duyệt của công ty đó được xem

-- Người dùng có là người duyệt (Duyệt / Duyệt thêm) của quy trình × công ty này không
create or replace function public.is_approver(p_proc text, p_company text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from chain_people c left join work_groups g on g.id = c.group_id
                 where c.proc = p_proc and c.company = p_company and c.role = 'duyet' and (c.user_id = app_uid() or app_uid() = any(coalesce(g.member_ids, '{}'))))
      or exists (select 1 from approval_levels l left join work_groups g on g.id = l.group_id
                 where l.proc = p_proc and l.company = p_company and l.active and (l.user_id = app_uid() or app_uid() = any(coalesce(g.member_ids, '{}'))));
$$;

-- Khoá các trường người dùng hiện tại KHÔNG được xem: 'h:key' (đầu phiếu) / 'tbl:key' (cột bảng)
create or replace function public.hidden_keys(p_proc text, p_company text) returns text[] language plpgsql stable security definer set search_path = public as $$
declare me profiles; out text[] := '{}'; f record; appr boolean;
begin
  if is_adm() then return out; end if;
  select * into me from profiles where id = app_uid();
  for f in select * from proc_fields where proc = p_proc and restricted and active loop
    if app_uid() = any(f.view_users) then continue; end if;
    if p_company = app_company() and me.roles && f.view_roles then continue; end if;
    if f.view_approver and p_company = app_company() then
      if appr is null then appr := is_approver(p_proc, p_company); end if;
      if appr then continue; end if;
    end if;
    out := out || (case when f.area = 'header' then 'h:' || f.key else f.tbl || ':' || f.key end);
  end loop;
  -- tổng tiền QT1 được app lưu sẵn ở đầu phiếu: ẩn theo giá
  if p_proc = 'QT1' and cardinality(out) > 0 then out := out || array['h:tong_tt']; end if;
  return out;
end $$;

create or replace function public._mask_h(h jsonb, hk text[]) returns jsonb language sql immutable as $$
  select coalesce(h, '{}') - coalesce((select array_agg(substr(x, 3)) from unnest(hk) x where x like 'h:%'), '{}');
$$;
create or replace function public._mask_t(t jsonb, hk text[]) returns jsonb language sql immutable as $$
  select case when cardinality(hk) = 0 or t is null or jsonb_typeof(t) <> 'object' then t else
    coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
        coalesce((select jsonb_agg(r - coalesce((select array_agg(split_part(x, ':', 2)) from unnest(hk) x where split_part(x, ':', 1) = k), '{}') order by i)
                  from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
      from jsonb_each(t) e(k, v)), '{}') end;
$$;

-- 3) View docs_v: thay cho đọc trực tiếp bảng docs ---------------------------------------
-- Hàng hồ sơ công ty khác vẫn trả về (để Kanban / danh sách biết TRẠNG THÁI) nhưng nội dung bị xoá trắng.
create or replace view public.docs_v with (security_barrier = true) as
select d.id, d.batch_id, d.company, d.status, d.status_at, d.created_at, d.apv, d.assignee,
  case when v.vis then d.assign_note end as assign_note,
  case when v.vis then d.signs else coalesce((select jsonb_agg(s - 'note' order by i) from jsonb_array_elements(d.signs) with ordinality x(s, i)), '[]') end as signs,
  case when v.vis then _mask_h(d.header, v.hk) else '{}'::jsonb end as header,
  case when v.vis then _mask_t(d.tables, v.hk) else '{}'::jsonb end as tables,
  case when v.vis then d.files else '[]'::jsonb end as files,
  case when v.vis then d.notes else '[]'::jsonb end as notes,
  v.vis as can_view,
  case when v.vis then v.hk else '{}'::text[] end as hidden
from docs d join batches b on b.id = d.batch_id
cross join lateral (select doc_visible(d.company, b.proc) as vis,
                           case when doc_visible(d.company, b.proc) then hidden_keys(b.proc, d.company) else '{}'::text[] end as hk) v;
grant select on public.docs_v to authenticated;
revoke select on public.docs from anon, authenticated;

-- 4) Mã dòng ổn định để giữ dữ liệu ẩn khi người không có quyền sửa bảng --------------------
create or replace function public._row_ids(t jsonb) returns jsonb language sql volatile as $$
  select case when t is null or jsonb_typeof(t) <> 'object' then t else
    coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
        coalesce((select jsonb_agg(case when jsonb_typeof(r) = 'object' and coalesce(r->>'_id', '') = '' then r || jsonb_build_object('_id', gen_random_uuid()::text) else r end order by i)
                  from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
      from jsonb_each(t) e(k, v)), '{}') end;
$$;
update public.docs set tables = _row_ids(tables) where tables is not null and tables::text <> '{}';

-- Gộp: lấy giá trị ẩn từ bản cũ (theo _id), bỏ giá trị ẩn người dùng cố gửi lên
create or replace function public._merge_hidden(p_new jsonb, p_old jsonb, hk text[]) returns jsonb language sql immutable as $$
  select coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(
          (r - coalesce((select array_agg(split_part(x, ':', 2)) from unnest(hk) x where split_part(x, ':', 1) = k), '{}'))
          || coalesce((select jsonb_object_agg(kk, o->kk) from jsonb_array_elements(coalesce(p_old->k, '[]')) o, unnest(hk) x,
                         lateral (select split_part(x, ':', 2) kk) z
                       where split_part(x, ':', 1) = k and o->>'_id' = r->>'_id' and o ? kk), '{}')
          order by i) from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
    from jsonb_each(p_new) e(k, v)), '{}');
$$;

create or replace function public.doc_save(p_doc uuid, p_header jsonb, p_tables jsonb, p_files jsonb)
 returns void language plpgsql security definer set search_path = public as $function$
declare d docs; b batches; adm boolean := has_role('admin_it'); own boolean; ch text[] := '{}'; k text; lb text; hk text[];
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if not doc_visible(d.company, b.proc) then raise exception 'Không có quyền với hồ sơ này'; end if;
  own := not adm and can_act(p_doc);
  if adm then
    own := b.status = 'dang_lam' and d.status not in ('da_duyet','fail') and app_uid() = any(_with_deleg(doc_holders(p_doc)));
  elsif not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  -- trường bị ẩn với người này: giữ nguyên giá trị cũ
  hk := hidden_keys(b.proc, d.company);
  if cardinality(hk) > 0 then
    if p_header is not null then
      p_header := _mask_h(p_header, hk) || coalesce((select jsonb_object_agg(substr(x, 3), d.header->substr(x, 3)) from unnest(hk) x where x like 'h:%' and d.header ? substr(x, 3)), '{}');
    end if;
    if p_tables is not null then p_tables := _merge_hidden(p_tables, d.tables, hk); end if;
  end if;
  if p_tables is not null then p_tables := _row_ids(p_tables); end if;
  if adm and not own then
    for k in select x from (select jsonb_object_keys(coalesce(p_header, '{}')) x union select jsonb_object_keys(d.header) where p_header is not null) y loop
      if coalesce(p_header->>k, '') is distinct from coalesce(d.header->>k, '') and k <> 'tong_tt' then
        select label into lb from proc_fields where proc = b.proc and area = 'header' and key = k;
        ch := ch || (coalesce(lb, k) || ': ' || coalesce(nullif(d.header->>k, ''), '∅') || ' → ' || coalesce(nullif(p_header->>k, ''), '∅'));
      end if;
    end loop;
    for k in select x from (select jsonb_object_keys(coalesce(p_tables, '{}')) x union select jsonb_object_keys(d.tables) where p_tables is not null) y loop
      if coalesce(p_tables->k, '[]') is distinct from coalesce(d.tables->k, '[]') then ch := ch || ('bảng ' || k || ' (' || jsonb_array_length(coalesce(p_tables->k, '[]')) || ' dòng)'); end if;
    end loop;
    if p_files is not null and p_files is distinct from coalesce(d.files, '[]') then ch := ch || ('tệp đính kèm (' || jsonb_array_length(coalesce(p_files, '[]')) || ')'); end if;
    if cardinality(ch) > 0 then
      perform log_event(b.order_id, 'Admin sửa ' || b.proc || ' · ' || b.title || ' · ' || d.company || ' [' || d.status || ']: ' || array_to_string(ch, '; '));
    end if;
  end if;
  update docs set header = coalesce(p_header, header), tables = coalesce(p_tables, tables), files = coalesce(p_files, files) where id = p_doc;
end $function$;

-- Trường bắt buộc nhưng người ký không được xem → không bắt người đó nhập
create or replace function public._req_check(p_doc uuid) returns void language plpgsql stable security definer set search_path = public as $$
declare d docs; b batches; st text; miss text[] := '{}'; f record; hk text[];
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  st := case when d.status = 'duyet_them' then 'duyet' else d.status end;
  hk := hidden_keys(b.proc, d.company);
  for f in select * from proc_fields where proc = b.proc and active and perms->d.company->>st = 'required' order by area, ord loop
    if (case when f.area = 'header' then 'h:' || f.key else f.tbl || ':' || f.key end) = any(hk) then continue; end if;
    if f.area = 'header' and coalesce(trim(d.header->>f.key), '') = '' then miss := miss || f.label;
    elsif f.area = 'file' and not exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) x where x->>'kind' = f.key) then miss := miss || ('Tệp: ' || f.label);
    elsif f.area = 'col' and f.sys = false and exists (select 1 from jsonb_array_elements(coalesce(d.tables->f.tbl, '[]')) x where coalesce(trim(x->>f.key), '') = '')
      then miss := miss || ('Cột ' || f.label);
    end if;
  end loop;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
end $$;
revoke execute on function public._req_check(uuid) from public, anon, authenticated;

-- 5) Chứng từ PDF: theo công ty; bản có giá chỉ người được xem giá -------------------------
alter table public.doc_records add column if not exists has_secret boolean not null default false;
create or replace function public._rec_secret() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.has_secret := exists (select 1 from proc_fields where proc = new.proc and restricted and active)
                    and cardinality(hidden_keys(new.proc, new.company)) = 0;
  return new;
end $$;
drop trigger if exists doc_records_secret on public.doc_records;
create trigger doc_records_secret before insert on public.doc_records for each row execute function public._rec_secret();
update public.doc_records set has_secret = true where proc in (select distinct proc from proc_fields where restricted);

create or replace function public.rec_visible(p_proc text, p_company text, p_secret boolean) returns boolean language sql stable security definer set search_path = public as $$
  select doc_visible(p_company, p_proc) and (not p_secret or cardinality(hidden_keys(p_proc, p_company)) = 0);
$$;
drop policy if exists doc_records_read on public.doc_records;
create policy doc_records_read on public.doc_records for select to authenticated using (rec_visible(proc, company, has_secret));

-- 6) Trao đổi / chuông: chỉ tin của hồ sơ mình được xem ------------------------------------
create or replace function public.msg_visible(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_doc is null or exists (select 1 from docs d join batches b on b.id = d.batch_id where d.id = p_doc and doc_visible(d.company, b.proc));
$$;
drop policy if exists order_msgs_read on public.order_msgs;
create policy order_msgs_read on public.order_msgs for select to authenticated using (msg_visible(doc_id));

-- 7) Tệp: PDF chứng từ theo doc_records; tệp đính kèm phiếu theo công ty trong đường dẫn ------
create or replace function public.file_visible(p_name text) returns boolean language plpgsql stable security definer set search_path = public as $$
declare seg text[] := string_to_array(p_name, '/'); r doc_records; pr text;
begin
  if is_adm() then return true; end if;
  if seg[1] = 'records' then
    select * into r from doc_records where path = p_name limit 1;
    return r.id is null or rec_visible(r.proc, r.company, r.has_secret);
  end if;
  -- <order>/<batch>/<PN|IPC|HW>/file
  if cardinality(seg) >= 4 and seg[3] in ('PN', 'IPC', 'HW') then
    select proc into pr from batches where id::text = seg[2];
    return pr is null or doc_visible(seg[3], pr);
  end if;
  return true;
end $$;
drop policy if exists "đọc file" on storage.objects;
create policy "đọc file" on storage.objects for select to authenticated using (bucket_id = 'files' and public.file_visible(name));

-- 8) Mặc định: giá / tiền QT1 là trường nhạy cảm (Giám đốc + người duyệt của công ty) --------
update public.proc_fields set restricted = true, view_roles = array['giam_doc'], view_approver = true
 where proc = 'QT1' and ((area = 'col' and tbl = 'ds' and key in ('don_gia', 'tt')) or (area = 'header' and key = 'vat'));

-- Giám đốc
update public.profiles set roles = array_append(roles, 'giam_doc') where full_name = 'A Kiên' and not 'giam_doc' = any(roles);
