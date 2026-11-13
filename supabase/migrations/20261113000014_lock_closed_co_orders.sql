-- Phiếu đã chốt: không sửa mã đơn / tham chiếu (đã áp dụng qua MCP)
create or replace function public._closed_co_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (new.code is distinct from old.code or new.ref_id is distinct from old.ref_id)
     and exists (select 1 from docs d where d.id = old.doc_id and d.status in ('da_duyet', 'fail')) then
    raise exception 'Phiếu đã chốt – không sửa mã đơn / tham chiếu được.'; end if;
  return new;
end $$;
drop trigger if exists co_orders_closed_guard on public.co_orders;
create trigger co_orders_closed_guard before update on public.co_orders for each row execute function public._closed_co_guard();
