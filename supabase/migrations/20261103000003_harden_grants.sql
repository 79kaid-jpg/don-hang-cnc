-- Sau khi chạy advisor: chặn anon gọi hàm nghiệp vụ; giai đoạn 1 chỉ cho gửi duyệt F2
revoke execute on function public.start_extraction(uuid) from public, anon;
revoke execute on function public.submit_f1(uuid) from public, anon;
revoke execute on function public.check_f1(uuid, boolean, text) from public, anon;
revoke execute on function public.decide_approval(uuid, boolean, text) from public, anon;
revoke execute on function public.confirm_customer(uuid, int, text) from public, anon;
revoke execute on function public.close_qt1(uuid) from public, anon;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.start_extraction(uuid), public.submit_f1(uuid), public.check_f1(uuid, boolean, text),
  public.decide_approval(uuid, boolean, text), public.confirm_customer(uuid, int, text), public.close_qt1(uuid),
  public.has_role(text) to authenticated;

create or replace function public.submit_for_approval(p_order uuid, p_doc text) returns void
language plpgsql security definer set search_path = public as $$
declare s approval_steps; r int;
begin
  if p_doc <> 'F2' then raise exception 'Phiếu % chưa mở ở phiên bản này', p_doc; end if;
  if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  if exists (select 1 from approvals where order_id = p_order and doc_type = p_doc and status = 'cho') then
    raise exception 'Phiếu đang chờ duyệt';
  end if;
  if not exists (select 1 from order_prices p join order_lines l on l.id = p.line_id where l.order_id = p_order and p.unit_price > 0) then
    raise exception 'Chưa nhập đơn giá';
  end if;
  select * into s from approval_steps where doc_type = p_doc order by step_no limit 1;
  if s.id is null then raise exception 'Chưa cấu hình chuỗi duyệt cho %', p_doc; end if;
  if s.approver_id is null then raise exception 'Chưa gán người duyệt cấp 1 cho % (Quản trị → Chuỗi duyệt)', p_doc; end if;
  perform _set_in_fn();
  update orders set status = 'cho_duyet_xndh' where id = p_order and status = 'xndh';
  if not found then raise exception 'Đơn không ở bước lập XNĐH'; end if;
  select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
  insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
  values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  perform log_event(p_order, 'Gửi duyệt ' || p_doc || ' (lượt ' || r || ')');
end $$;
revoke execute on function public.submit_for_approval(uuid, text) from public, anon;
grant execute on function public.submit_for_approval(uuid, text) to authenticated;

create policy "không truy cập trực tiếp" on public.order_counters for select to authenticated using (false);
