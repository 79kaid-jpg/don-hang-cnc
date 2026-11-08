-- Logo cho khách hàng / công ty (dùng làm logo bên bán khi in) + thêm Phương Nam CNC vào danh mục
alter table public.customers add column if not exists logo_path text;
insert into public.customers(code, name, address) select 'PNCNC', 'Công ty Cổ phần Phương Nam CNC', 'Lô B5-9, KCN Tân Phú Trung, Đường D4, Xã Tân Phú Trung, Huyện Củ Chi, TP.HCM'
  where not exists (select 1 from customers where code = 'PNCNC');
