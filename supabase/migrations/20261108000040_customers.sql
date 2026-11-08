-- Một ô Khách hàng cho đơn: IPC, Hanwha hay khách cuối (BM, Euro Windows…) đều là khách
alter table public.customers add column if not exists tax_code text, add column if not exists address text,
  add column if not exists contact text, add column if not exists phone text, add column if not exists email text,
  add column if not exists note text, add column if not exists active boolean not null default true;
alter table public.orders add column if not exists customer_id uuid references public.customers(id);
update public.orders set customer_id = coalesce(kh2_id, kh1_id) where customer_id is null;
create index if not exists orders_customer_idx on public.orders(customer_id);
create unique index if not exists customers_tax_uq on public.customers(tax_code) where tax_code is not null and tax_code <> '';

do $$ begin
  create policy "tạo khách" on public.customers for insert to authenticated with check (has_role('kinh_doanh') or has_role('admin_cnc') or has_role('admin_it'));
  create policy "sửa khách (quản trị)" on public.customers for update to authenticated using (has_role('admin_cnc') or has_role('admin_it')) with check (true);
exception when duplicate_object then null; end $$;

-- Gán / đổi khách cho đơn ở mọi trạng thái
create or replace function public.set_order_customer(p_order uuid, p_customer uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('kinh_doanh') or has_role('admin_cnc') or has_role('admin_it')) then raise exception 'Không có quyền đổi khách hàng'; end if;
  update orders set customer_id = p_customer where id = p_order;
  perform log_event(p_order, 'Đổi khách hàng: ' || coalesce((select name from customers where id = p_customer), '—'));
end $$;
revoke execute on function public.set_order_customer(uuid, uuid) from public, anon;
grant execute on function public.set_order_customer(uuid, uuid) to authenticated;
