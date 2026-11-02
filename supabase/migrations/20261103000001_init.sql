-- Đơn hàng CNC · giai đoạn 0–1 (QT0 tiếp nhận & bóc tách, QT1 xác nhận đơn hàng, duyệt nhiều cấp)
-- Chạy trên Supabase (Postgres 15+). Mọi quy tắc nghiệp vụ nằm ở đây, giao diện chỉ gọi.

create extension if not exists pgcrypto;

-- ───────────── Người dùng & vai trò ─────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  unit text not null default 'CNC' check (unit in ('CNC','IPC','IT','KHAC')),
  roles text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on column public.profiles.roles is 'admin_it, kinh_doanh, ky_thuat, kiem_tra_f1, admin_cnc, ke_hoach, mua_hang, kho_qc, ipc, duyet, xem';

create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and (r = any(roles) or 'admin_it' = any(roles)));
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────── Danh mục ─────────────
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- ───────────── Đơn hàng (F0) ─────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  kh1_id uuid references public.customers(id),
  kh2_id uuid references public.customers(id),
  project text not null default '',
  channel text not null default 'Email' check (channel in ('Email','Điện thoại','Hệ thống')),
  contact text not null default '',
  description text not null default '',
  quote_due date,
  due_date date,
  extractor_id uuid references public.profiles(id),
  supplement_note text not null default '',
  -- trạng thái: chỉ đổi qua hàm (xem guard bên dưới)
  status text not null default 'tiep_nhan'
    check (status in ('tiep_nhan','boc_tach','kiem_tra_f1','xndh','cho_duyet_xndh','cho_khach','san_xuat','giao_hang','hoan_tat','huy')),
  f1_result text not null default 'chua' check (f1_result in ('chua','dat','khong_dat')),
  f1_checked_by uuid references public.profiles(id),
  nvl_status text not null default 'chua_bat_dau',
  gc_status text not null default 'chua_bat_dau',
  gh_status text not null default 'chua_giao',
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Mã đơn ĐH-YYYYMM-NNN, đánh số lại mỗi tháng
create table public.order_counters (period text primary key, last_no int not null);
create or replace function public.set_order_code() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMM'); n int;
begin
  if new.code is null then
    insert into order_counters(period, last_no) values (p, 1)
      on conflict (period) do update set last_no = order_counters.last_no + 1
      returning last_no into n;
    new.code := 'ĐH-' || p || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
create trigger orders_code before insert on public.orders for each row execute function public.set_order_code();

-- Chặn sửa trạng thái trực tiếp: chỉ các hàm nghiệp vụ (đặt app.in_fn = on) mới được đổi
create or replace function public.guard_order_status() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.in_fn', true), '') <> 'on' and (
     new.status is distinct from old.status or new.f1_result is distinct from old.f1_result
     or new.nvl_status is distinct from old.nvl_status or new.gc_status is distinct from old.gc_status
     or new.gh_status is distinct from old.gh_status or new.code is distinct from old.code) then
    raise exception 'Trạng thái đơn chỉ đổi qua thao tác nghiệp vụ';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger orders_guard before update on public.orders for each row execute function public.guard_order_status();

-- ───────────── F1 chi tiết đơn hàng ─────────────
create table public.order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  line_no int not null default 1,
  product_code text not null default '',
  material text not null default 'SS400',
  thickness_mm numeric(8,2) not null check (thickness_mm > 0),
  length_mm numeric(10,1) not null check (length_mm > 0),
  width_mm numeric(10,1) not null check (width_mm > 0),
  qty int not null check (qty > 0),
  area_m2 numeric(14,3) generated always as (round(length_mm * width_mm * qty / 1000000.0, 3)) stored,
  -- thép: 7,85 kg/dm³
  weight_kg numeric(14,2) generated always as (round(length_mm * width_mm * thickness_mm * qty * 7.85 / 1000000.0, 2)) stored,
  spec text not null default ''
);
create index on public.order_lines(order_id);

-- Đơn giá tách bảng riêng để ẩn với Kho/QC, Kỹ thuật
create table public.order_prices (
  line_id uuid primary key references public.order_lines(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  unit_price numeric(16,0) not null default 0 check (unit_price >= 0),
  price_unit text not null default 'kg' check (price_unit in ('kg','tấm','m²'))
);

-- ───────────── F2 xác nhận đơn hàng ─────────────
create table public.confirmations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  vat_rate numeric(5,2) not null default 8,
  terms text not null default '',
  kh1_confirmed_at timestamptz, kh1_channel text,
  kh2_confirmed_at timestamptz, kh2_channel text,
  signed_pdf_path text
);

-- ───────────── Duyệt nhiều cấp ─────────────
create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null,          -- F2, F3, PO, F5, LGH1, LGH2
  step_no int not null,
  label text not null,             -- 'CNC · kiểm tra', 'IPC · duyệt'...
  approver_id uuid references public.profiles(id),
  hours int not null default 4,
  unique (doc_type, step_no)
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  doc_type text not null,
  round int not null default 1,
  step_no int not null,
  label text not null,
  approver_id uuid references public.profiles(id),
  status text not null default 'cho' check (status in ('cho','dat','tu_choi','huy')),
  note text,
  due_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.approvals(approver_id, status);
create index on public.approvals(order_id);

-- ───────────── Nhật ký ─────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),
  order_id uuid,
  table_name text not null,
  action text not null,
  detail jsonb
);
create index on public.audit_log(order_id, at desc);

create or replace function public.log_event(p_order uuid, p_action text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log(order_id, table_name, action, detail) values (p_order, 'event', p_action, p_detail);
$$;

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare oid uuid; rec jsonb;
begin
  rec := to_jsonb(coalesce(new, old));
  oid := case when tg_table_name = 'orders' then (rec->>'id')::uuid else (rec->>'order_id')::uuid end;
  insert into audit_log(order_id, table_name, action, detail)
  values (oid, tg_table_name, lower(tg_op),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else rec end);
  return coalesce(new, old);
end $$;
create trigger audit_orders after insert or update or delete on public.orders for each row execute function public.audit_row();
create trigger audit_lines after insert or update or delete on public.order_lines for each row execute function public.audit_row();
create trigger audit_conf after insert or update on public.confirmations for each row execute function public.audit_row();

-- ───────────── Hàm nghiệp vụ ─────────────
create or replace function public._set_in_fn() returns void language sql as $$ select set_config('app.in_fn','on', true); $$;

-- QT0: bắt đầu bóc tách
create or replace function public.start_extraction(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('kinh_doanh') or has_role('ky_thuat')) then raise exception 'Không có quyền'; end if;
  perform _set_in_fn();
  update orders set status = 'boc_tach' where id = p_order and status in ('tiep_nhan','kiem_tra_f1');
  if not found then raise exception 'Đơn không ở bước tiếp nhận'; end if;
  perform log_event(p_order, 'Bắt đầu bóc tách F1');
end $$;

-- QT0: gửi kiểm tra F1
create or replace function public.submit_f1(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('ky_thuat') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from order_lines where order_id = p_order) then raise exception 'F1 chưa có dòng nào'; end if;
  perform _set_in_fn();
  update orders set status = 'kiem_tra_f1', f1_result = 'chua' where id = p_order and status = 'boc_tach';
  if not found then raise exception 'Đơn không ở bước bóc tách'; end if;
  perform log_event(p_order, 'Gửi kiểm tra F1');
end $$;

-- ĐK1: kết quả kiểm tra F1
create or replace function public.check_f1(p_order uuid, p_ok boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('kiem_tra_f1') then raise exception 'Không có quyền kiểm tra F1'; end if;
  perform _set_in_fn();
  if p_ok then
    update orders set f1_result = 'dat', f1_checked_by = auth.uid(), status = 'xndh' where id = p_order and status = 'kiem_tra_f1';
  else
    if coalesce(trim(p_note),'') = '' then raise exception 'Cần ghi nội dung cần bổ sung'; end if;
    update orders set f1_result = 'khong_dat', f1_checked_by = auth.uid(), status = 'boc_tach', supplement_note = p_note
      where id = p_order and status = 'kiem_tra_f1';
  end if;
  if not found then raise exception 'Đơn không ở bước kiểm tra F1'; end if;
  insert into confirmations(order_id) values (p_order) on conflict do nothing;
  perform log_event(p_order, case when p_ok then 'ĐK1 đạt: F1 đạt' else 'F1 không đạt: ' || p_note end);
end $$;

-- Gửi một phiếu đi duyệt: tạo lượt cấp 1 theo approval_steps
create or replace function public.submit_for_approval(p_order uuid, p_doc text) returns void
language plpgsql security definer set search_path = public as $$
declare s approval_steps; r int;
begin
  if exists (select 1 from approvals where order_id = p_order and doc_type = p_doc and status = 'cho') then
    raise exception 'Phiếu đang chờ duyệt';
  end if;
  select * into s from approval_steps where doc_type = p_doc order by step_no limit 1;
  if s.id is null then raise exception 'Chưa cấu hình chuỗi duyệt cho %', p_doc; end if;
  select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
  insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
  values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  perform _set_in_fn();
  if p_doc = 'F2' then
    if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from order_prices p join order_lines l on l.id = p.line_id where l.order_id = p_order and p.unit_price > 0) then
      raise exception 'Chưa nhập đơn giá';
    end if;
    update orders set status = 'cho_duyet_xndh' where id = p_order and status = 'xndh';
    if not found then raise exception 'Đơn không ở bước lập XNĐH'; end if;
  end if;
  perform log_event(p_order, 'Gửi duyệt ' || p_doc || ' (lượt ' || r || ')');
end $$;

-- Khi phiếu duyệt xong cấp cuối hoặc bị từ chối
create or replace function public._on_doc_decided(p_order uuid, p_doc text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _set_in_fn();
  if p_doc = 'F2' then
    update orders set status = case when p_ok then 'cho_khach' else 'xndh' end where id = p_order;
  end if;
end $$;

-- Người duyệt bấm Duyệt / Từ chối
create or replace function public.decide_approval(p_approval uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a approvals; nxt approval_steps;
begin
  select * into a from approvals where id = p_approval for update;
  if a.id is null then raise exception 'Không tìm thấy lượt duyệt'; end if;
  if a.status <> 'cho' then raise exception 'Lượt duyệt đã xử lý'; end if;
  if a.approver_id is distinct from auth.uid() and not has_role('admin_it') then raise exception 'Không phải người duyệt của cấp này'; end if;
  if not p_ok and coalesce(trim(p_note),'') = '' then raise exception 'Cần ghi lý do từ chối'; end if;
  update approvals set status = case when p_ok then 'dat' else 'tu_choi' end, note = p_note, decided_at = now() where id = a.id;
  if p_ok then
    select * into nxt from approval_steps where doc_type = a.doc_type and step_no > a.step_no order by step_no limit 1;
    if nxt.id is not null then
      insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
      values (a.order_id, a.doc_type, a.round, nxt.step_no, nxt.label, nxt.approver_id, now() + make_interval(hours => nxt.hours));
    else
      perform _on_doc_decided(a.order_id, a.doc_type, true);
    end if;
  else
    perform _on_doc_decided(a.order_id, a.doc_type, false);
  end if;
  perform log_event(a.order_id, a.doc_type || ' cấp ' || a.step_no || ': ' || case when p_ok then 'đạt' else 'từ chối – ' || p_note end);
end $$;

-- QT1 B4: khách KH1 / KH2 xác nhận
create or replace function public.confirm_customer(p_order uuid, p_which int, p_channel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from orders where id = p_order and status = 'cho_khach') then raise exception 'XNĐH chưa được duyệt nội bộ'; end if;
  if p_which = 1 then
    update confirmations set kh1_confirmed_at = now(), kh1_channel = p_channel where order_id = p_order;
  elsif p_which = 2 then
    if not exists (select 1 from confirmations where order_id = p_order and kh1_confirmed_at is not null) then
      raise exception 'KH1 (IPC) xác nhận trước, rồi mới tới KH2 (Hanwa)';
    end if;
    update confirmations set kh2_confirmed_at = now(), kh2_channel = p_channel where order_id = p_order;
  else raise exception 'p_which phải là 1 hoặc 2'; end if;
  perform log_event(p_order, 'KH' || p_which || ' xác nhận XNĐH qua ' || p_channel);
end $$;

-- ĐK2: đủ 2 xác nhận + PDF ký → mở nhánh NVL và nhánh gia công
create or replace function public.close_qt1(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c confirmations;
begin
  if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  select * into c from confirmations where order_id = p_order;
  if c.kh1_confirmed_at is null or c.kh2_confirmed_at is null then raise exception 'Chưa đủ xác nhận KH1 và KH2'; end if;
  if coalesce(c.signed_pdf_path,'') = '' then raise exception 'Chưa tải PDF XNĐH đã ký'; end if;
  perform _set_in_fn();
  update orders set status = 'san_xuat', nvl_status = 'du_toan', gc_status = 'lap_lgc' where id = p_order and status = 'cho_khach';
  if not found then raise exception 'Đơn không ở bước chờ khách'; end if;
  perform log_event(p_order, 'ĐK2 đạt: mở nhánh NVL (QT2) và gia công (QT3)');
end $$;

-- ───────────── Bảo mật hàng (RLS) ─────────────
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_counters enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_prices enable row level security;
alter table public.confirmations enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;

create policy "xem hồ sơ người dùng" on public.profiles for select to authenticated using (true);
create policy "IT sửa người dùng" on public.profiles for update to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));

create policy "xem khách" on public.customers for select to authenticated using (true);
create policy "sửa khách" on public.customers for all to authenticated using (has_role('kinh_doanh')) with check (has_role('kinh_doanh'));

create policy "xem đơn" on public.orders for select to authenticated using (true);
create policy "tạo đơn" on public.orders for insert to authenticated with check (has_role('kinh_doanh') or has_role('admin_cnc'));
create policy "sửa F0" on public.orders for update to authenticated
  using ((has_role('kinh_doanh') or has_role('admin_cnc')) and status in ('tiep_nhan','boc_tach','kiem_tra_f1','xndh'))
  with check (true);

create policy "xem F1" on public.order_lines for select to authenticated using (true);
create policy "sửa F1" on public.order_lines for all to authenticated
  using ((has_role('ky_thuat') or has_role('kinh_doanh')) and exists (select 1 from orders o where o.id = order_id and o.status in ('tiep_nhan','boc_tach')))
  with check ((has_role('ky_thuat') or has_role('kinh_doanh')) and exists (select 1 from orders o where o.id = order_id and o.status in ('tiep_nhan','boc_tach')));

create policy "xem giá" on public.order_prices for select to authenticated
  using (has_role('admin_cnc') or has_role('kinh_doanh') or has_role('duyet') or has_role('xem'));
create policy "sửa giá" on public.order_prices for all to authenticated
  using ((has_role('admin_cnc') or has_role('kinh_doanh')) and exists (select 1 from orders o where o.id = order_id and o.status = 'xndh'))
  with check ((has_role('admin_cnc') or has_role('kinh_doanh')) and exists (select 1 from orders o where o.id = order_id and o.status = 'xndh'));

create policy "xem XNĐH" on public.confirmations for select to authenticated using (true);
create policy "sửa XNĐH" on public.confirmations for update to authenticated
  using (has_role('admin_cnc') or has_role('kinh_doanh')) with check (has_role('admin_cnc') or has_role('kinh_doanh'));

create policy "xem chuỗi duyệt" on public.approval_steps for select to authenticated using (true);
create policy "IT sửa chuỗi duyệt" on public.approval_steps for all to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));

create policy "xem lượt duyệt" on public.approvals for select to authenticated using (true);
create policy "xem nhật ký" on public.audit_log for select to authenticated using (true);
-- approvals, audit_log, order_counters: không có policy ghi → chỉ hàm security definer ghi được

-- Hàm nội bộ không cho gọi trực tiếp từ API
revoke execute on function public._set_in_fn() from public, anon, authenticated;
revoke execute on function public._on_doc_decided(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_order_code() from public, anon, authenticated;
revoke execute on function public.log_event(uuid, text, jsonb) from public, anon, authenticated;

-- Realtime cho chuông thông báo
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.approvals;
  end if;
end $$;
