-- Khoá hồ sơ khi dự án đóng. Đã áp dụng qua MCP (migration "project_lock").
create or replace function public._project_locked(p_order uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o join projects p on p.id = o.project_id where o.id = p_order and p.status = 'closed') $$;
create or replace function public._lock_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  if tg_table_name = 'orders' then oid := coalesce(new.id, old.id);
  elsif tg_table_name = 'batches' then oid := coalesce(new.order_id, old.order_id);
  else select b.order_id into oid from batches b where b.id = coalesce(new.batch_id, old.batch_id); end if;
  if _project_locked(oid) then raise exception 'Dự án đã đóng – không sửa được. Admin mở lại dự án nếu cần.'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists lock_orders on public.orders; drop trigger if exists lock_batches on public.batches; drop trigger if exists lock_docs on public.docs;
create trigger lock_orders before update or delete on public.orders for each row execute function public._lock_guard();
create trigger lock_batches before insert or update or delete on public.batches for each row execute function public._lock_guard();
create trigger lock_docs before insert or update or delete on public.docs for each row execute function public._lock_guard();
revoke execute on function public._project_locked(uuid), public._lock_guard() from public, anon, authenticated;
