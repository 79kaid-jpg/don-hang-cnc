-- QT0 Bảng 2 – Thành phẩm: cùng trường, thứ tự, nhãn với Bảng 2 của Lệnh gia công (QT2)
create table if not exists uat_backup_20261115.ds_tables_20261116b as
  select d.id, d.tables, now() as at from docs d where d.tables ? 'ds';
create table if not exists uat_backup_20261115.proc_fields_20261116b as select * from proc_fields;

-- dữ liệu: mau_son → ma_mau, don_vi_tinh → cot_moi (QT0 + QT1)
set local session_replication_role = replica;
update docs d set tables = jsonb_set(d.tables, '{ds}', (
  select jsonb_agg((r - 'mau_son' - 'don_vi_tinh')
    || case when r ? 'mau_son' and coalesce(r->>'ma_mau', '') = '' then jsonb_build_object('ma_mau', r->'mau_son') else '{}' end
    || case when r ? 'don_vi_tinh' and coalesce(r->>'cot_moi', '') = '' then jsonb_build_object('cot_moi', r->'don_vi_tinh') else '{}' end order by i)
  from jsonb_array_elements(d.tables->'ds') with ordinality x(r, i)))
where jsonb_typeof(d.tables->'ds') = 'array' and exists (select 1 from jsonb_array_elements(d.tables->'ds') r where r ? 'mau_son' or r ? 'don_vi_tinh');
set local session_replication_role = origin;

-- cấu hình cột
update proc_fields set key = 'ma_mau' where area = 'col' and tbl = 'ds' and proc in ('QT0','QT1') and key = 'mau_son'
  and not exists (select 1 from proc_fields x where x.proc = proc_fields.proc and x.area = 'col' and x.tbl = 'ds' and x.key = 'ma_mau');
update proc_fields set key = 'cot_moi' where area = 'col' and tbl = 'ds' and proc = 'QT0' and key = 'don_vi_tinh'
  and not exists (select 1 from proc_fields x where x.proc = 'QT0' and x.area = 'col' and x.tbl = 'ds' and x.key = 'cot_moi');

with p as (select perms from proc_fields where proc = 'QT0' and area = 'col' and tbl = 'ds' and key = 'ma_tam' limit 1)
insert into proc_fields(proc, area, tbl, key, label, type, ord, active, sys, perms)
select 'QT0', 'col', 'ds', k, l, 'text', 0, true, false, coalesce((select perms from p), '{}') from (values ('mac_thep','Mác thép'), ('cot_moi','Đơn vị tính'), ('ma_don_hang','Mã đơn hàng')) v(k, l)
where not exists (select 1 from proc_fields x where x.proc = 'QT0' and x.area = 'col' and x.tbl = 'ds' and x.key = v.k);

update proc_fields f set label = v.l, ord = v.o, active = v.a, decimals = coalesce(v.d, f.decimals)
from (values ('vat_lieu','Tên hàng',0,true,null), ('day','Dày (mm)',1,true,1), ('dai','Dài (mm)',2,true,null), ('rong','Rộng (mm)',3,true,null),
             ('mac_thep','Mác thép',4,true,null), ('cot_moi','Đơn vị tính',5,true,null), ('so_tam','SL (tấm)',6,true,null), ('m2','DT (m²)',7,true,2),
             ('kg','TL (kg)',8,true,1), ('ma_mau','Mã màu',9,true,null), ('ma_don_hang','Mã đơn hàng',10,true,null), ('ma_tam','KH BV (mã tấm)',11,true,null),
             ('ghi_chu','Ghi chú',12,true,null),
             ('trai_rong','Rộng trải (mm)',50,true,null), ('trai_dai','Dài trải (mm)',51,true,null), ('m2_ht','m² hoàn thiện',52,true,2), ('loai_gc','Loại gia công',53,true,null),
             ('m2_tam','m²/tấm',54,false,4), ('duong_han','Đường hàn (m)',55,false,1), ('chan','Số lần chấn',56,false,null), ('m2_dot','m² đột',57,false,2),
             ('phoi_rong','Rộng phôi',58,false,null), ('phoi_dai','Dài phôi',59,false,null), ('phoi_sl','SL phôi',60,false,null), ('phoi_m2','m² phôi',61,false,2)) v(k, l, o, a, d)
where f.proc = 'QT0' and f.area = 'col' and f.tbl = 'ds' and f.key = v.k;
