-- Gộp QT2 + QT3 thành một quy trình tuần tự "QT2 Lệnh gia công & bàn giao NVL"
-- B1 Lập LGC + dự toán NVL → B2 Duyệt LGC 4 cấp (Dung duyệt kèm NVL) → B3 PO (nếu cần mua) → B4 Nhập kho & QC
-- → ĐK3 (LGC duyệt + NVL sẵn sàng) → B5 Bàn giao NVL → B6 Gia công & QC thành phẩm → ĐK4 → QT3 Giao hàng
update public.approval_steps set label = 'CNC · Dung duyệt (kèm dự toán NVL)' where doc_type = 'F5' and step_no = 2;
update public.approval_steps set label = '[Không dùng] F3 duyệt trong LGC' where doc_type = 'F3';

create or replace function public.f3_build(p_order uuid, p_waste numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare w numeric;
begin
  if not (has_role('ke_hoach') or has_role('admin_cnc')) then raise exception 'Không có quyền lập dự toán'; end if;
  if (_order(p_order)).nvl_status <> 'du_toan' or (_order(p_order)).gc_status <> 'lap_lgc' then raise exception 'Chỉ lập dự toán NVL ở bước B1 (lập LGC)'; end if;
  insert into material_plans(order_id) values (p_order) on conflict do nothing;
  if p_waste is not null then update material_plans set waste_pct = p_waste where order_id = p_order; end if;
  select waste_pct into w from material_plans where order_id = p_order;
  delete from material_plan_lines where order_id = p_order;
  insert into material_plan_lines(order_id, material, thickness_mm, f1_kg, need_kg, stock_kg)
  select p_order, material, thickness_mm, sum(weight_kg), round(sum(weight_kg) * (1 + w/100), 2), greatest(_stock(material, thickness_mm), 0)
  from order_lines where order_id = p_order group by material, thickness_mm;
  perform log_event(p_order, 'Lập dự toán NVL (hao hụt ' || w || '%)');
end $$;

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
      delete from receipt_lines where order_id = p_order;
      insert into receipt_lines(order_id, material, thickness_mm, expected_kg)
        select order_id, material, thickness_mm, buy_kg from material_plan_lines where order_id = p_order and buy_kg > 0;
    end if;
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
    perform log_event(p_order, 'ĐK3 đạt: LGC đã duyệt + NVL sẵn sàng → B5 bàn giao NVL');
  end if;
end $$;

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
    perform log_event(p_order, 'NVL đạt QC, đã nhập kho (B4)');
    perform _check_dk4(p_order);
  end if;
end $$;

create or replace function public.f6_submit(p_order uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare lech boolean;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'ban_giao' then raise exception 'Chưa đủ ĐK3 để bàn giao'; end if;
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
    perform log_event(p_order, 'ĐK4 đạt: QC thành phẩm đạt, ' || p_pallets || ' pallet → QT3 giao hàng');
  else
    insert into issues(order_id, source, kind, description) values (p_order, 'QC_TP', 'loi_gia_cong', p_note);
    perform log_event(p_order, 'QC thành phẩm không đạt → F7: ' || p_note);
  end if;
end $$;
