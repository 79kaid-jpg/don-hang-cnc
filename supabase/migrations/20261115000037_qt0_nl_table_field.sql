-- QT0: cấu hình được bảng NVL trong Quản trị → Trường dữ liệu (mặc định ẩn ở bước Tiếp nhận, như bảng Thành phẩm)
insert into proc_fields(proc, area, tbl, key, label, type, ord, active, sys, perms)
select 'QT0', 'table', '', 'nl', 'Bảng 1 – Nguyên vật liệu (phôi)', 'text', 0, true, true, '{"PN":{"tiep_nhan":"hide"}}'::jsonb
where not exists (select 1 from proc_fields where proc = 'QT0' and area = 'table' and key = 'nl');
update proc_fields set label = 'Bảng 2 – Thành phẩm', ord = 1 where proc = 'QT0' and area = 'table' and key = 'ds';
