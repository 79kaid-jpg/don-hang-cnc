-- "Đăng nhập với tư cách" cho IT: admin chọn một người dùng, mọi quyền và thao tác sau đó tính như người đó.
-- Không cần mật khẩu của họ, không tạo phiên đăng nhập mới. Nhật ký luôn ghi người thật (actor) + người được đóng vai (acting_as).

alter table public.profiles add column if not exists impersonating uuid references public.profiles(id) on delete set null;
alter table public.audit_log add column if not exists acting_as uuid;

-- Người dùng "hiệu lực": nếu người đăng nhập là admin_it và đang đóng vai → người được đóng vai
create or replace function public.app_uid() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.impersonating from profiles p where p.id = auth.uid() and p.active and 'admin_it' = any(p.roles) and p.impersonating is not null),
    auth.uid());
$$;

create or replace function public.is_real_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active and 'admin_it' = any(roles));
$$;

-- Quyền tính theo người dùng hiệu lực (khi đóng vai: đúng quyền của người đó, không còn quyền admin)
create or replace function public.has_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = public.app_uid() and active and (r = any(roles) or 'admin_it' = any(roles)));
$$;

create or replace function public.start_impersonation(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_real_admin() then raise exception 'Chỉ IT quản trị được dùng chức năng này'; end if;
  if p_user = auth.uid() then raise exception 'Không thể đóng vai chính mình'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'Người dùng không tồn tại hoặc đã khoá'; end if;
  update profiles set impersonating = p_user where id = auth.uid();
  insert into audit_log(actor, acting_as, table_name, action, detail) values (auth.uid(), p_user, 'event', 'Bắt đầu đăng nhập với tư cách', '{}');
end $$;

create or replace function public.stop_impersonation() returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select impersonating into t from profiles where id = auth.uid();
  update profiles set impersonating = null where id = auth.uid();
  if t is not null then
    insert into audit_log(actor, acting_as, table_name, action, detail) values (auth.uid(), t, 'event', 'Kết thúc đăng nhập với tư cách', '{}');
  end if;
end $$;

-- Nhật ký: actor = người thật, acting_as = người được đóng vai (nếu có)
alter table public.audit_log alter column actor set default auth.uid();
create or replace function public.fill_acting_as() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.acting_as is null and public.app_uid() is distinct from auth.uid() then new.acting_as := public.app_uid(); end if;
  return new;
end $$;
create trigger audit_acting_as before insert on public.audit_log for each row execute function public.fill_acting_as();

-- Người tạo đơn = người dùng hiệu lực
alter table public.orders alter column created_by set default public.app_uid();

create or replace function public.check_f1(p_order uuid, p_ok boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_role('kiem_tra_f1') then raise exception 'Không có quyền kiểm tra F1'; end if;
  perform _set_in_fn();
  if p_ok then
    update orders set f1_result = 'dat', f1_checked_by = app_uid(), status = 'xndh' where id = p_order and status = 'kiem_tra_f1';
  else
    if coalesce(trim(p_note),'') = '' then raise exception 'Cần ghi nội dung cần bổ sung'; end if;
    update orders set f1_result = 'khong_dat', f1_checked_by = app_uid(), status = 'boc_tach', supplement_note = p_note
      where id = p_order and status = 'kiem_tra_f1';
  end if;
  if not found then raise exception 'Đơn không ở bước kiểm tra F1'; end if;
  insert into confirmations(order_id) values (p_order) on conflict do nothing;
  perform log_event(p_order, case when p_ok then 'ĐK1 đạt: F1 đạt' else 'F1 không đạt: ' || p_note end);
end $$;

create or replace function public.decide_approval(p_approval uuid, p_ok boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a approvals; nxt approval_steps;
begin
  select * into a from approvals where id = p_approval for update;
  if a.id is null then raise exception 'Không tìm thấy lượt duyệt'; end if;
  if a.status <> 'cho' then raise exception 'Lượt duyệt đã xử lý'; end if;
  if a.approver_id is distinct from app_uid() and not has_role('admin_it') then raise exception 'Không phải người duyệt của cấp này'; end if;
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

-- Không ai tự sửa cột impersonating qua API (chỉ qua 2 hàm trên); IT vẫn sửa vai trò người khác như cũ
create or replace function public.guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.impersonating is distinct from old.impersonating and current_user in ('authenticated','anon') then
    raise exception 'Dùng chức năng Đăng nhập với tư cách';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profile();

-- Khi đang đóng vai, policy "IT sửa người dùng" sẽ tính theo người được đóng vai → admin không tự sửa quyền khi đang đóng vai
revoke execute on function public.app_uid() from public, anon;
revoke execute on function public.is_real_admin() from public, anon;
revoke execute on function public.start_impersonation(uuid) from public, anon;
revoke execute on function public.stop_impersonation() from public, anon;
revoke execute on function public.fill_acting_as() from public, anon, authenticated;
grant execute on function public.app_uid(), public.is_real_admin(), public.start_impersonation(uuid), public.stop_impersonation() to authenticated;
