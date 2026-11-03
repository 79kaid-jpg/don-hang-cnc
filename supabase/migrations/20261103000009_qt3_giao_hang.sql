-- QT3 Giao thành phẩm: B2 thông báo giao + F8 packing list → B3 Lệnh giao hàng F9 duyệt 2 chặng
-- (LGH1 CNC→IPC: Dung → Chị Trang, rồi LGH2 IPC→Hanwa: Nhung → Anh Kiên) → B4 Giao hàng, ảnh → B5 Ký & lưu BBGH → Hoàn tất
-- gh_status: thong_bao → lap_lgh → cho_duyet_lgh → giao_hang → ky_bbgh → hoan_tat
create table public.packing_lists (
  order_id uuid primary key references public.orders(id) on delete cascade,
  planned_date date, place text not null default '', note text not null default '', sent_at timestamptz
);
create table public.packing_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  pallet_no int not null, content text not null default '',
  qty int not null default 0 check (qty >= 0), kg numeric(14,2) not null default 0 check (kg >= 0),
  unique (order_id, pallet_no)
);
create table public.deliveries (
  order_id uuid primary key references public.orders(id) on delete cascade,
  pmkt_code text not null default '', vehicle text not null default '', driver text not null default '',
  planned_at timestamptz, delivered_at timestamptz, photo_paths text[] not null default '{}', bbgh_path text, note text not null default ''
);
create trigger audit_pk after insert or update on public.packing_lists for each row execute function public.audit_row();
create trigger audit_pkl after insert or update on public.packing_lines for each row execute function public.audit_row();
create trigger audit_dlv after insert or update on public.deliveries for each row execute function public.audit_row();
alter table public.packing_lists enable row level security;
alter table public.packing_lines enable row level security;
alter table public.deliveries enable row level security;
create policy "xem F8" on public.packing_lists for select to authenticated using (true);
create policy "sửa F8" on public.packing_lists for update to authenticated
  using (has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gh_status = 'thong_bao')) with check (true);
create policy "xem dòng F8" on public.packing_lines for select to authenticated using (true);
create policy "sửa dòng F8" on public.packing_lines for update to authenticated
  using (has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gh_status = 'thong_bao')) with check (true);
create policy "xem F9" on public.deliveries for select to authenticated using (true);
create policy "sửa F9" on public.deliveries for update to authenticated
  using ((has_role('admin_cnc') and exists (select 1 from orders o where o.id = order_id and o.gh_status = 'lap_lgh'))
      or ((has_role('kho_qc') or has_role('admin_cnc')) and exists (select 1 from orders o where o.id = order_id and o.gh_status in ('giao_hang','ky_bbgh'))))
  with check (true);

create or replace function public.f8_build(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare n int; t_qty int; t_kg numeric;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gh_status <> 'thong_bao' then raise exception 'Đơn không ở bước thông báo giao'; end if;
  if exists (select 1 from packing_lines where order_id = p_order) then raise exception 'Packing list đã có – sửa từng pallet'; end if;
  select coalesce(pallets, 0) into n from qc_finished where order_id = p_order;
  if coalesce(n, 0) <= 0 then raise exception 'Chưa có số pallet từ QC thành phẩm'; end if;
  select coalesce(sum(qty), 0), coalesce(sum(weight_kg), 0) into t_qty, t_kg from order_lines where order_id = p_order;
  insert into packing_lists(order_id) values (p_order) on conflict do nothing;
  insert into packing_lines(order_id, pallet_no, content, qty, kg)
  select p_order, g, 'Thành phẩm theo F1', (t_qty / n) + case when g <= t_qty % n then 1 else 0 end, round(t_kg / n, 2)
  from generate_series(1, n) g;
  perform log_event(p_order, 'Lập packing list F8: ' || n || ' pallet');
end $$;

create or replace function public.f8_submit(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from packing_lines where order_id = p_order) then raise exception 'Chưa lập packing list'; end if;
  if exists (select 1 from packing_lists where order_id = p_order and (planned_date is null or place = '')) then raise exception 'Ghi ngày giao dự kiến và địa điểm giao'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'lap_lgh' where id = p_order and gh_status = 'thong_bao';
  if not found then raise exception 'Đơn không ở bước thông báo giao'; end if;
  update packing_lists set sent_at = now() where order_id = p_order;
  insert into deliveries(order_id) values (p_order) on conflict do nothing;
  perform log_event(p_order, 'Đã thông báo giao hàng kèm packing list F8');
end $$;

create or replace function public.f9_delivered(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from deliveries where order_id = p_order and cardinality(photo_paths) > 0) then raise exception 'Tải ít nhất 1 ảnh giao hàng'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'ky_bbgh' where id = p_order and gh_status = 'giao_hang';
  if not found then raise exception 'Lệnh giao hàng chưa duyệt đủ 2 chặng'; end if;
  update deliveries set delivered_at = coalesce(delivered_at, now()) where order_id = p_order;
  perform log_event(p_order, 'Đã giao hàng, có ảnh giao');
end $$;

create or replace function public.f9_close(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from deliveries where order_id = p_order and coalesce(bbgh_path, '') <> '') then raise exception 'Tải bộ LGH / BBGH đã ký'; end if;
  if exists (select 1 from issues where order_id = p_order and status = 'mo') then raise exception 'Còn phiếu F7 đang mở – xử lý trước khi hoàn tất'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'hoan_tat', status = 'hoan_tat' where id = p_order and gh_status = 'ky_bbgh';
  if not found then raise exception 'Đơn chưa ở bước ký BBGH'; end if;
  perform log_event(p_order, 'Hoàn tất đơn: đã ký và lưu bộ LGH / BBGH');
end $$;

create or replace function public.submit_for_approval(p_order uuid, p_doc text) returns void
language plpgsql security definer set search_path = public as $$
declare s approval_steps; r int; o orders := _order(p_order);
begin
  if p_doc not in ('F2','F3','PO','F5','LGH1') then raise exception 'Phiếu % chưa mở ở phiên bản này', p_doc; end if;
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
    raise exception 'Dự toán NVL nay duyệt chung trong LGC (QT2-B2). Gửi duyệt LGC.';
  elsif p_doc = 'PO' then
    if not has_role('mua_hang') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from purchase_orders where order_id = p_order and po_no <> '' and supplier <> '' and eta is not null and unit_price > 0)
      then raise exception 'PO cần số PO, nhà cung cấp, ngày về, đơn giá'; end if;
    update orders set nvl_status = 'cho_duyet_po' where id = p_order and nvl_status = 'mua_hang';
  elsif p_doc = 'F5' then
    if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from work_order_lines where order_id = p_order) then raise exception 'Chưa lập LGC'; end if;
    if not exists (select 1 from work_orders where order_id = p_order and start_date is not null and finish_date is not null) then raise exception 'LGC cần ngày bắt đầu và hoàn thành'; end if;
    if not exists (select 1 from material_plan_lines where order_id = p_order) then raise exception 'Chưa tính dự toán NVL (B1)'; end if;
    update orders set gc_status = 'cho_duyet_lgc', nvl_status = 'cho_duyet_f3' where id = p_order and gc_status = 'lap_lgc' and nvl_status = 'du_toan';
  elsif p_doc = 'LGH1' then
    if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
    if exists (select 1 from approval_steps where doc_type = 'LGH2' and approver_id is null) then
      raise exception 'Chuỗi duyệt LGH2 còn cấp chưa gán người (Quản trị → Chuỗi duyệt)'; end if;
    if not exists (select 1 from deliveries where order_id = p_order and pmkt_code <> '' and vehicle <> '' and driver <> '' and planned_at is not null)
      then raise exception 'Lệnh giao hàng cần mã lệnh PMKT, xe, tài xế, ngày giờ giao'; end if;
    update orders set gh_status = 'cho_duyet_lgh' where id = p_order and gh_status = 'lap_lgh';
  end if;
  if not found then raise exception 'Đơn không ở đúng bước để gửi duyệt %', p_doc; end if;
  select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
  insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
  values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  perform log_event(p_order, 'Gửi duyệt ' || p_doc || ' (lượt ' || r || ')');
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
      -- lần duyệt PO đầu: tạo dòng nhập theo số cần mua; PO bổ sung (sau F4 thiếu) giữ dòng còn thiếu
      insert into receipt_lines(order_id, material, thickness_mm, expected_kg)
        select order_id, material, thickness_mm, buy_kg from material_plan_lines
        where order_id = p_order and buy_kg > 0 and not exists (select 1 from receipt_lines r where r.order_id = p_order);
    end if;
  elsif p_doc = 'LGH1' then
    if p_ok then
      insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
      select p_order, 'LGH2', coalesce((select max(round) from approvals where order_id = p_order and doc_type = 'LGH2'), 0) + 1,
             s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours)
      from approval_steps s where s.doc_type = 'LGH2' order by s.step_no limit 1;
      perform log_event(p_order, 'LGH chặng 1 (CNC → IPC) đã duyệt → gửi chặng 2 (IPC → Hanwa)');
    else
      update orders set gh_status = 'lap_lgh' where id = p_order;
    end if;
  elsif p_doc = 'LGH2' then
    update orders set gh_status = case when p_ok then 'giao_hang' else 'lap_lgh' end where id = p_order;
    if p_ok then perform log_event(p_order, 'Lệnh giao hàng đã duyệt đủ 2 chặng → giao hàng'); end if;
  elsif p_doc = 'F5' then
    if p_ok then
      if exists (select 1 from material_plan_lines where order_id = p_order and buy_kg > 0) then
        update orders set gc_status = 'cho_nvl', nvl_status = 'mua_hang' where id = p_order;
        insert into purchase_orders(order_id) values (p_order) on conflict do nothing;
      else
        update orders set gc_status = 'cho_nvl', nvl_status = 'san_sang' where id = p_order;
        perform log_event(p_order, 'Tồn kho đủ – không cần mua NVL');
      end if;
      perform _check_dk4(p_order);
    else
      update orders set gc_status = 'lap_lgc', nvl_status = 'du_toan' where id = p_order;
    end if;
  end if;
end $$;

revoke execute on function public.f8_build(uuid), public.f8_submit(uuid), public.f9_delivered(uuid), public.f9_close(uuid) from public, anon;
grant execute on function public.f8_build(uuid), public.f8_submit(uuid), public.f9_delivered(uuid), public.f9_close(uuid) to authenticated;
