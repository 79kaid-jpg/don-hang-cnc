-- Chặn ghi khi vào vai: bỏ chặn nếu có uỷ quyền làm thay còn hạn (đã áp dụng qua MCP)
create or replace function public._act_locked() returns boolean language sql stable security definer set search_path = public as $$
  select public._is_acting() and (public._act_grant(public.app_uid())).id is null;
$$;
-- _act_guard_orders/_batches: dùng _act_locked(); _act_guard_docs: thêm điều kiện _act_grant; thông báo hướng dẫn cấp uỷ quyền.
drop trigger if exists docs_sign_by on public.docs;
drop function if exists public._sign_by();
