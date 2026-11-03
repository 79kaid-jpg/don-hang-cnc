-- Sai số cho phép khi đối chiếu khối lượng (F4 nhập kho, F6 bàn giao): 0,5% hoặc 5 kg, lấy số lớn hơn
create or replace function public._tol(kg numeric) returns numeric language sql immutable as $$ select greatest(abs(coalesce(kg,0)) * 0.005, 5) $$;

create or replace function public.f4_submit(p_order uuid, p_ok boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare bad boolean;
begin
  if not has_role('kho_qc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).nvl_status <> 'nhap_kho' then raise exception 'Nhánh NVL không ở bước nhập kho'; end if;
  if exists (select 1 from receipt_lines where order_id = p_order and received_kg is null) then raise exception 'Chưa nhập đủ số thực nhận'; end if;
  bad := not p_ok or exists (select 1 from receipt_lines where order_id = p_order and (bad_kg > 0 or diff_kg < -_tol(expected_kg)));
  if bad and coalesce(trim(p_note),'') = '' then raise exception 'Ghi rõ lỗi / thiếu để lập phiếu F7'; end if;
  -- nhập kho phần đạt
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, ok_kg, 'nhap', order_id, 'F4' from receipt_lines where order_id = p_order and ok_kg > 0;
  update receipts set qc_result = case when bad then 'khong_dat' else 'dat' end, qc_note = p_note, received_at = coalesce(received_at, current_date) where order_id = p_order;
  perform _set_in_fn();
  if bad then
    insert into issues(order_id, source, kind, description) values (p_order, 'F4', case when not p_ok then 'loi_nvl' else 'sai_lech_nvl' end, p_note);
    update orders set nvl_status = 'mua_hang' where id = p_order;
    -- lượt nhập sau chỉ chờ phần còn thiếu; dòng đã đủ giữ lại với 0 kg
    update receipt_lines set expected_kg = greatest(-diff_kg, 0),
      received_kg = case when greatest(-diff_kg, 0) = 0 then 0 else null end, bad_kg = 0 where order_id = p_order;
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
  lech := exists (select 1 from handover_lines where order_id = p_order and abs(diff_kg) > _tol(planned_kg));
  if lech and coalesce(trim(p_note),'') = '' then raise exception 'Chênh lệch vượt 0,5%% / 5 kg: ghi lý do để lập F7'; end if;
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, -actual_kg, 'xuat', order_id, 'F6' from handover_lines where order_id = p_order;
  if lech then insert into issues(order_id, source, kind, description) values (p_order, 'F6', 'sai_lech_nvl', p_note); end if;
  update handovers set done_at = now() where order_id = p_order;
  perform _set_in_fn();
  update orders set gc_status = 'gia_cong' where id = p_order;
  perform log_event(p_order, 'Bàn giao NVL xong' || case when lech then ' (có chênh lệch → F7)' else '' end);
end $$;

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
  perform log_event(p_order, 'ĐK2 đạt: mở QT2 Lệnh gia công & bàn giao NVL');
end $$;
