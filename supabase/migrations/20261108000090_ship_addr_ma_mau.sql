-- Nhiều địa chỉ giao hàng cho khách; cột Mã màu ở bảng thành phẩm QT3
alter table public.customers add column if not exists ship_addresses text[] not null default '{}';
update public.proc_fields set ord = ord + 1 where proc = 'QT3' and area = 'col' and tbl = 'tp' and key = 'ghi_chu' and ord = 7;
insert into public.proc_fields(proc, area, tbl, key, label, type, ord, sys) values ('QT3','col','tp','ma_mau','Mã màu','text',7,false) on conflict do nothing;
