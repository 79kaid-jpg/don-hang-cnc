-- Giai đoạn 2: QT2 chuẩn bị NVL (F3, PO, F4, sổ kho) + QT3 lệnh gia công (F5 duyệt 4 cấp, ĐK4, F6 bàn giao, F7 phát sinh, QC thành phẩm)
-- Trạng thái nhánh:
--   nvl_status: du_toan → cho_duyet_f3 → mua_hang → cho_duyet_po → nhap_kho → san_sang (ĐK3)
--   gc_status : lap_lgc → cho_duyet_lgc → cho_nvl → ban_giao (ĐK4) → gia_cong → qc_dat (ĐK5)

-- ───────────── Sổ kho NVL ─────────────
create table public.stock_moves (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  material text not null,
  thickness_mm numeric(8,2) not null,
  warehouse text not null default 'Kho NVL IPC',
  qty_kg numeric(14,2) not null,            -- + nhập, − xuất
  kind text not null check (kind in ('nhap','xuat','dieu_chinh')),
  order_id uuid references public.orders(id) on delete set null,
  ref text not null default '',
  actor uuid default public.app_uid()
);
create index on public.stock_moves(material, thickness_mm);

create or replace view public.stock_balance with (security_invoker = true) as
  select material, thickness_mm, warehouse, round(sum(qty_kg), 2) as qty_kg
  from public.stock_moves group by material, thickness_mm, warehouse;

-- ───────────── F3 dự toán NVL ─────────────
create table public.material_plans (
  order_id uuid primary key references public.orders(id) on delete cascade,
  waste_pct numeric(5,2) not null default 3 check (waste_pct >= 0 and waste_pct < 100),
  note text not null default ''
);
create table public.material_plan_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material text not null,
  thickness_mm numeric(8,2) not null,
  f1_kg numeric(14,2) not null,
  need_kg numeric(14,2) not null,
  stock_kg numeric(14,2) not null default 0,
  buy_kg numeric(14,2) generated always as (greatest(need_kg - stock_kg, 0)) stored,
  unique (order_id, material, thickness_mm)
);

-- ───────────── PO ─────────────
create table public.purchase_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  po_no text not null default '',
  supplier text not null default '',
  eta date,
  unit_price numeric(16,0) not null default 0 check (unit_price >= 0),  -- đ/kg
  note text not null default ''
);

-- ───────────── F4 nhập kho & QC NVL ─────────────
create table public.receipts (
  order_id uuid primary key references public.orders(id) on delete cascade,
  received_at date,
  qc_result text not null default 'chua' check (qc_result in ('chua','dat','khong_dat')),
  qc_note text not null default '',
  report_path text
);
create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material text not null,
  thickness_mm numeric(8,2) not null,
  expected_kg numeric(14,2) not null,
  received_kg numeric(14,2),
  bad_kg numeric(14,2) not null default 0,
  ok_kg numeric(14,2) generated always as (coalesce(received_kg,0) - bad_kg) stored,
  diff_kg numeric(14,2) generated always as (coalesce(received_kg,0) - bad_kg - expected_kg) stored,
  unique (order_id, material, thickness_mm)
);

-- ───────────── F5 lệnh gia công ─────────────
create table public.wo_counters (period text primary key, last_no int not null);
create table public.work_orders (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code text unique,
  reserve_pct numeric(5,2) not null default 3 check (reserve_pct >= 0 and reserve_pct < 50),
  wh_from text not null default 'Kho NVL IPC',
  wh_to text not null default 'Xưởng CNC Phương Nam',
  start_date date,
  finish_date date,
  note text not null default ''
);
create table public.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material text not null,
  thickness_mm numeric(8,2) not null,
  qty int not null,
  f1_kg numeric(14,2) not null,
  issue_kg numeric(14,2) not null,       -- = F1 kg × (1 + dự phòng)
  unique (order_id, material, thickness_mm)
);

-- ───────────── F6 bàn giao NVL ─────────────
create table public.handovers (
  order_id uuid primary key references public.orders(id) on delete cascade,
  lot_no int not null default 1,
  delivered_by text not null default '',
  received_by text not null default '',
  signed_pdf_path text,
  done_at timestamptz
);
create table public.handover_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  material text not null,
  thickness_mm numeric(8,2) not null,
  planned_kg numeric(14,2) not null,
  actual_kg numeric(14,2),
  diff_kg numeric(14,2) generated always as (coalesce(actual_kg,0) - planned_kg) stored,
  unique (order_id, material, thickness_mm)
);

-- ───────────── F7 phát sinh ─────────────
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  source text not null check (source in ('F4','F6','QC_TP','F9','khac')),
  kind text not null check (kind in ('sai_lech_nvl','loi_nvl','loi_gia_cong','khach_doi','khac')),
  description text not null,
  action text not null default '',
  due_date date,
  status text not null default 'mo' check (status in ('mo','da_xu_ly','chuyen_cap_tren')),
  created_by uuid default public.app_uid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- ───────────── QC thành phẩm ─────────────
create table public.qc_finished (
  order_id uuid primary key references public.orders(id) on delete cascade,
  result text not null default 'chua' check (result in ('chua','dat','khong_dat')),
  pallets int,
  note text not null default '',
  checked_at timestamptz
);

-- audit
create trigger audit_mpl after insert or update or delete on public.material_plan_lines for each row execute function public.audit_row();
create trigger audit_po after insert or update on public.purchase_orders for each row execute function public.audit_row();
create trigger audit_rl after insert or update on public.receipt_lines for each row execute function public.audit_row();
create trigger audit_wo after insert or update on public.work_orders for each row execute function public.audit_row();
create trigger audit_hl after insert or update on public.handover_lines for each row execute function public.audit_row();
create trigger audit_issues after insert or update on public.issues for each row execute function public.audit_row();

-- ───────────── Hàm nghiệp vụ ─────────────
create or replace function public._order(p_order uuid) returns orders
language sql stable security definer set search_path = public as $$ select * from orders where id = p_order $$;

create or replace function public._stock(p_mat text, p_thk numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty_kg), 0) from stock_moves where material = p_mat and thickness_mm = p_thk and warehouse = 'Kho NVL IPC'
$$;

-- QT2-B1: lập / tính lại dự toán từ F1 + hao hụt + tồn kho
create or replace function public.f3_build(p_order uuid, p_waste numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare w numeric;
begin
  if not has_role('ke_hoach') then raise exception 'Không có quyền lập dự toán'; end if;
  if (_order(p_order)).nvl_status <> 'du_toan' then raise exception 'Nhánh NVL không ở bước dự toán'; end if;
  insert into material_plans(order_id) values (p_order) on conflict do nothing;
  if p_waste is not null then update material_plans set waste_pct = p_waste where order_id = p_order; end if;
  select waste_pct into w from material_plans where order_id = p_order;
  delete from material_plan_lines where order_id = p_order;
  insert into material_plan_lines(order_id, material, thickness_mm, f1_kg, need_kg, stock_kg)
  select p_order, material, thickness_mm, sum(weight_kg), round(sum(weight_kg) * (1 + w/100), 2), greatest(_stock(material, thickness_mm), 0)
  from order_lines where order_id = p_order group by material, thickness_mm;
  perform log_event(p_order, 'Lập dự toán NVL (hao hụt ' || w || '%)');
end $$;

-- Gửi duyệt chung: F2 (QT1), F3, PO (QT2), F5 (QT3)
create or replace function public.submit_for_approval(p_order uuid, p_doc text) returns void
language plpgsql security definer set search_path = public as $$
declare s approval_steps; r int; o orders := _order(p_order);
begin
  if p_doc not in ('F2','F3','PO','F5') then raise exception 'Phiếu % chưa mở ở phiên bản này', p_doc; end if;
  if exists (select 1 from approvals where order_id = p_order and doc_type = p_doc and status = 'cho') then raise exception 'Phiếu đang chờ duyệt'; end if;
  select * into s from approval_steps where doc_type = p_doc order by step_no limit 1;
  if s.id is null then raise exception 'Chưa cấu hình chuỗi duyệt cho %', p_doc; end if;
  if exists (select 1 from approval_steps where doc_type = p_doc and approver_id is null) then
    raise exception 'Chuỗi duyệt % còn cấp chưa gán người (Quản trị → Chuỗi duyệt)', p_doc; end if;
  perform _set_in_fn();
  if p_doc = 'F2' then
    if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from order_prices p join order_lines l on l.id = p.line_id where l.order_id = p_order and p.unit_price > 0) then raise exception 'Chưa nhập đơn giá'; end if;
    update orders set status = 'cho_duyet_xndh' where id = p_order and status = 'xndh';
  elsif p_doc = 'F3' then
    if not has_role('ke_hoach') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from material_plan_lines where order_id = p_order) then raise exception 'Chưa lập dự toán'; end if;
    update orders set nvl_status = 'cho_duyet_f3' where id = p_order and nvl_status = 'du_toan';
  elsif p_doc = 'PO' then
    if not has_role('mua_hang') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from purchase_orders where order_id = p_order and po_no <> '' and supplier <> '' and eta is not null and unit_price > 0)
      then raise exception 'PO cần số PO, nhà cung cấp, ngày về, đơn giá'; end if;
    update orders set nvl_status = 'cho_duyet_po' where id = p_order and nvl_status = 'mua_hang';
  elsif p_doc = 'F5' then
    if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from work_order_lines where order_id = p_order) then raise exception 'Chưa lập LGC'; end if;
    if not exists (select 1 from work_orders where order_id = p_order and start_date is not null and finish_date is not null) then raise exception 'LGC cần ngày bắt đầu và hoàn thành'; end if;
    update orders set gc_status = 'cho_duyet_lgc' where id = p_order and gc_status = 'lap_lgc';
  end if;
  if not found then raise exception 'Đơn không ở đúng bước để gửi duyệt %', p_doc; end if;
  select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
  insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
  values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  perform log_event(p_order, 'Gửi duyệt ' || p_doc || ' (lượt ' || r || ')');
end $$;

-- ĐK4: LGC đã duyệt + NVL sẵn sàng → mở bàn giao
create or replace function public._check_dk4(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _set_in_fn();
  update orders set gc_status = 'ban_giao' where id = p_order and gc_status = 'cho_nvl' and nvl_status = 'san_sang';
  if found then
    insert into handovers(order_id) values (p_order) on conflict do nothing;
    delete from handover_lines where order_id = p_order;
    insert into handover_lines(order_id, material, thickness_mm, planned_kg)
      select order_id, material, thickness_mm, issue_kg from work_order_lines where order_id = p_order;
    perform log_event(p_order, 'ĐK4 đạt: LGC đã duyệt + NVL đạt QC → bàn giao NVL');
  end if;
end $$;

create or replace function public._on_doc_decided(p_order uuid, p_doc text, p_ok boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _set_in_fn();
  if p_doc = 'F2' then
    update orders set status = case when p_ok then 'cho_khach' else 'xndh' end where id = p_order;
  elsif p_doc = 'F3' then
    update orders set nvl_status = case when p_ok then 'mua_hang' else 'du_toan' end where id = p_order;
    if p_ok then insert into purchase_orders(order_id) values (p_order) on conflict do nothing; end if;
  elsif p_doc = 'PO' then
    update orders set nvl_status = case when p_ok then 'nhap_kho' else 'mua_hang' end where id = p_order;
    if p_ok then
      insert into receipts(order_id) values (p_order) on conflict do nothing;
      delete from receipt_lines where order_id = p_order;
      insert into receipt_lines(order_id, material, thickness_mm, expected_kg)
        select order_id, material, thickness_mm, buy_kg from material_plan_lines where order_id = p_order and buy_kg > 0;
    end if;
  elsif p_doc = 'F5' then
    update orders set gc_status = case when p_ok then 'cho_nvl' else 'lap_lgc' end where id = p_order;
    if p_ok then perform _check_dk4(p_order); end if;
  end if;
end $$;

-- PO không cần mua (tồn kho đủ): bỏ qua mua hàng, NVL sẵn sàng luôn
create or replace function public.f3_skip_purchase(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('mua_hang') then raise exception 'Không có quyền'; end if;
  if exists (select 1 from material_plan_lines where order_id = p_order and buy_kg > 0) then raise exception 'Còn NVL cần mua'; end if;
  perform _set_in_fn();
  update orders set nvl_status = 'san_sang' where id = p_order and nvl_status = 'mua_hang';
  if not found then raise exception 'Nhánh NVL không ở bước mua hàng'; end if;
  perform log_event(p_order, 'Tồn kho đủ – không cần mua. ĐK3 đạt');
  perform _check_dk4(p_order);
end $$;

-- QT2-B3: chốt nhập kho & QC (ĐK3)
create or replace function public.f4_submit(p_order uuid, p_ok boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare bad boolean;
begin
  if not has_role('kho_qc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).nvl_status <> 'nhap_kho' then raise exception 'Nhánh NVL không ở bước nhập kho'; end if;
  if exists (select 1 from receipt_lines where order_id = p_order and received_kg is null) then raise exception 'Chưa nhập đủ số thực nhận'; end if;
  bad := not p_ok or exists (select 1 from receipt_lines where order_id = p_order and (bad_kg > 0 or diff_kg < 0));
  if bad and coalesce(trim(p_note),'') = '' then raise exception 'Ghi rõ lỗi / thiếu để lập phiếu F7'; end if;
  -- nhập kho phần đạt
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, ok_kg, 'nhap', order_id, 'F4' from receipt_lines where order_id = p_order and ok_kg > 0;
  update receipts set qc_result = case when bad then 'khong_dat' else 'dat' end, qc_note = p_note, received_at = coalesce(received_at, current_date) where order_id = p_order;
  perform _set_in_fn();
  if bad then
    insert into issues(order_id, source, kind, description) values (p_order, 'F4', case when not p_ok then 'loi_nvl' else 'sai_lech_nvl' end, p_note);
    update orders set nvl_status = 'mua_hang' where id = p_order;
    -- lượt nhập sau chỉ chờ phần còn thiếu
    update receipt_lines set expected_kg = greatest(-diff_kg, 0), received_kg = null, bad_kg = 0 where order_id = p_order;
    delete from receipt_lines where order_id = p_order and expected_kg = 0;
    perform log_event(p_order, 'F4 không đạt → F7, mua bổ sung: ' || p_note);
  else
    update orders set nvl_status = 'san_sang' where id = p_order;
    perform log_event(p_order, 'ĐK3 đạt: NVL đạt QC, đã nhập kho');
    perform _check_dk4(p_order);
  end if;
end $$;

-- QT3-B1: lập / tính lại LGC từ F1 + dự phòng
create or replace function public.f5_build(p_order uuid, p_reserve numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare rs numeric; per text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM'); n int;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'lap_lgc' then raise exception 'Nhánh gia công không ở bước lập LGC'; end if;
  if not exists (select 1 from work_orders where order_id = p_order) then
    insert into wo_counters(period, last_no) values (per, 1) on conflict (period) do update set last_no = wo_counters.last_no + 1 returning last_no into n;
    insert into work_orders(order_id, code) values (p_order, 'LGC-' || per || '-' || lpad(n::text, 3, '0'));
  end if;
  if p_reserve is not null then update work_orders set reserve_pct = p_reserve where order_id = p_order; end if;
  select reserve_pct into rs from work_orders where order_id = p_order;
  delete from work_order_lines where order_id = p_order;
  insert into work_order_lines(order_id, material, thickness_mm, qty, f1_kg, issue_kg)
  select p_order, material, thickness_mm, sum(qty), sum(weight_kg), round(sum(weight_kg) * (1 + rs/100), 2)
  from order_lines where order_id = p_order group by material, thickness_mm;
  perform log_event(p_order, 'Lập LGC (dự phòng ' || rs || '%)');
end $$;

-- QT3-B3: chốt bàn giao NVL (xuất kho theo số thực giao; lệch → F7)
create or replace function public.f6_submit(p_order uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare lech boolean;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'ban_giao' then raise exception 'Chưa đủ ĐK4 để bàn giao'; end if;
  if exists (select 1 from handover_lines where order_id = p_order and actual_kg is null) then raise exception 'Chưa nhập đủ số thực giao'; end if;
  if exists (select 1 from handovers where order_id = p_order and (delivered_by = '' or received_by = '')) then raise exception 'Ghi bên giao và bên nhận'; end if;
  if exists (select 1 from handovers where order_id = p_order and coalesce(signed_pdf_path,'') = '') then raise exception 'Tải biên bản F6 đã ký'; end if;
  lech := exists (select 1 from handover_lines where order_id = p_order and diff_kg <> 0);
  if lech and coalesce(trim(p_note),'') = '' then raise exception 'Có chênh lệch: ghi lý do để lập F7'; end if;
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, -actual_kg, 'xuat', order_id, 'F6' from handover_lines where order_id = p_order;
  if lech then insert into issues(order_id, source, kind, description) values (p_order, 'F6', 'sai_lech_nvl', p_note); end if;
  update handovers set done_at = now() where order_id = p_order;
  perform _set_in_fn();
  update orders set gc_status = 'gia_cong' where id = p_order;
  perform log_event(p_order, 'Bàn giao NVL xong' || case when lech then ' (có chênh lệch → F7)' else '' end);
end $$;

-- QT3-B4: QC thành phẩm (ĐK5) → mở QT4
create or replace function public.qc_tp_submit(p_order uuid, p_ok boolean, p_pallets int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'gia_cong' then raise exception 'Đơn chưa ở bước gia công'; end if;
  if not p_ok and coalesce(trim(p_note),'') = '' then raise exception 'Ghi lỗi để lập F7'; end if;
  if p_ok and coalesce(p_pallets, 0) <= 0 then raise exception 'Nhập số pallet'; end if;
  insert into qc_finished(order_id) values (p_order) on conflict do nothing;
  update qc_finished set result = case when p_ok then 'dat' else 'khong_dat' end, pallets = p_pallets, note = p_note, checked_at = now() where order_id = p_order;
  if p_ok then
    perform _set_in_fn();
    update orders set gc_status = 'qc_dat', status = 'giao_hang', gh_status = 'thong_bao' where id = p_order;
    perform log_event(p_order, 'ĐK5 đạt: QC thành phẩm đạt, ' || p_pallets || ' pallet → QT4 giao hàng');
  else
    insert into issues(order_id, source, kind, description) values (p_order, 'QC_TP', 'loi_gia_cong', p_note);
    perform log_event(p_order, 'QC thành phẩm không đạt → F7: ' || p_note);
  end if;
end $$;

-- F7: xử lý phát sinh
create or replace function public.f7_close(p_issue uuid, p_status text, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare i issues;
begin
  if not (has_role('admin_cnc') or has_role('kho_qc') or has_role('mua_hang') or has_role('ke_hoach')) then raise exception 'Không có quyền'; end if;
  if p_status not in ('da_xu_ly','chuyen_cap_tren') then raise exception 'Kết quả không hợp lệ'; end if;
  if coalesce(trim(p_action),'') = '' then raise exception 'Ghi hướng xử lý'; end if;
  update issues set status = p_status, action = p_action, closed_at = now() where id = p_issue and status = 'mo' returning * into i;
  if i.id is null then raise exception 'Phiếu không còn mở'; end if;
  perform log_event(i.order_id, 'F7 ' || case when p_status = 'da_xu_ly' then 'đã xử lý' else 'chuyển cấp trên' end || ': ' || p_action);
end $$;

-- ───────────── RLS ─────────────
alter table public.stock_moves enable row level security;
alter table public.material_plans enable row level security;
alter table public.material_plan_lines enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.wo_counters enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.handovers enable row level security;
alter table public.handover_lines enable row level security;
alter table public.issues enable row level security;
alter table public.qc_finished enable row level security;

create policy "xem sổ kho" on public.stock_moves for select to authenticated using (true);
create policy "xem F3" on public.material_plans for select to authenticated using (true);
create policy "sửa F3" on public.material_plans for update to authenticated
  using (has_role('ke_hoach') and exists (select 1 from orders o where o.id = order_id and o.nvl_status = 'du_toan')) with check (true);
create policy "xem dòng F3" on public.material_plan_lines for select to authenticated using (true);
create policy "sửa tồn F3" on public.material_plan_lines for update to authenticated
  using (has_role('ke_hoach') and exists (select 1 from orders o where o.id = order_id and o.nvl_status = 'du_toan')) with check (true);
-- PO có tiền: ẩn với kho_qc, ky_thuat như đơn giá
create policy "xem PO" on public.purchase_orders for select to authenticated
  using (has_role('mua_hang') or has_role('ke_hoach') or has_role('duyet') or has_role('admin_cnc') or has_role('xem'));
create policy "sửa PO" on public.purchase_orders for update to authenticated
  using (has_role('mua_hang') and exists (select 1 from orders o where o.id = order_id and o.nvl_status = 'mua_hang')) with check (true);
create policy "xem F4" on public.receipts for select to authenticated using (true);
create policy "sửa F4" on public.receipts for update to authenticated
  using (has_role('kho_qc') and exists (select 1 from orders o where o.id = order_id and o.nvl_status = 'nhap_kho')) with check (true);
create policy "xem dòng F4" on public.receipt_lines for select to authenticated using (true);
create policy "sửa dòng F4" on public.receipt_lines for update to authenticated
  using (has_role('kho_qc') and exists (select 1 from orders o where o.id = order_id and o.nvl_status = 'nhap_kho')) with check (true);
create policy "không đọc bộ đếm LGC" on public.wo_counters for select to authenticated using (false);
create policy "xem F5" on public.work_orders for select to authenticated using (true);
create policy "sửa F5" on public.work_orders for update to authenticated
  using (has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gc_status = 'lap_lgc')) with check (true);
create policy "xem dòng F5" on public.work_order_lines for select to authenticated using (true);
create policy "xem F6" on public.handovers for select to authenticated using (true);
create policy "sửa F6" on public.handovers for update to authenticated
  using (has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gc_status = 'ban_giao')) with check (true);
create policy "xem dòng F6" on public.handover_lines for select to authenticated using (true);
create policy "sửa dòng F6" on public.handover_lines for update to authenticated
  using (has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gc_status = 'ban_giao')) with check (true);
create policy "xem F7" on public.issues for select to authenticated using (true);
create policy "tạo F7" on public.issues for insert to authenticated
  with check (has_role('admin_cnc') or has_role('kho_qc') or has_role('mua_hang') or has_role('ke_hoach'));
create policy "xem QC TP" on public.qc_finished for select to authenticated using (true);

-- Không cho sửa cột tính sẵn bằng tay (chỉ sửa ô nhập liệu): RLS update cho phép cả dòng nên chặn bằng trigger
create or replace function public.guard_mpl() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (new.need_kg, new.f1_kg, new.material, new.thickness_mm) is distinct from (old.need_kg, old.f1_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được tồn kho'; end if;
  return new;
end $$;
create or replace function public.guard_rl() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (new.expected_kg, new.material, new.thickness_mm) is distinct from (old.expected_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được số thực nhận / lỗi'; end if;
  return new;
end $$;
create or replace function public.guard_hl() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and (new.planned_kg, new.material, new.thickness_mm) is distinct from (old.planned_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được số thực giao'; end if;
  return new;
end $$;
create trigger g_mpl before update on public.material_plan_lines for each row execute function public.guard_mpl();
create trigger g_rl before update on public.receipt_lines for each row execute function public.guard_rl();
create trigger g_hl before update on public.handover_lines for each row execute function public.guard_hl();

-- quyền gọi hàm
revoke execute on function public._order(uuid), public._stock(text, numeric), public._check_dk4(uuid) from public, anon, authenticated;
revoke execute on function public.f3_build(uuid, numeric), public.f3_skip_purchase(uuid), public.f4_submit(uuid, boolean, text),
  public.f5_build(uuid, numeric), public.f6_submit(uuid, text), public.qc_tp_submit(uuid, boolean, int, text), public.f7_close(uuid, text, text),
  public.submit_for_approval(uuid, text) from public, anon;
grant execute on function public.f3_build(uuid, numeric), public.f3_skip_purchase(uuid), public.f4_submit(uuid, boolean, text),
  public.f5_build(uuid, numeric), public.f6_submit(uuid, text), public.qc_tp_submit(uuid, boolean, int, text), public.f7_close(uuid, text, text),
  public.submit_for_approval(uuid, text) to authenticated;
grant select on public.stock_balance to authenticated;
