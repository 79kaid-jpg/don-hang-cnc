-- QT0: tách "Danh sách tấm" thành Bảng 1 – NVL (phôi, khoá tables.nl) + Bảng 2 – Thành phẩm (khoá tables.ds giữ nguyên để QT1 chép như cũ)
create table if not exists uat_backup_20261115.qt0_tables_20261116 as
  select d.id, d.tables, now() as at from docs d join batches b on b.id = d.batch_id where b.proc = 'QT0';

with p as (select perms from proc_fields where proc = 'QT0' and area = 'col' and tbl = 'ds' and key = 'ma_tam' limit 1)
insert into proc_fields(proc, area, tbl, key, label, type, decimals, ord, active, sys, perms)
select 'QT0', 'col', 'nl', k, l, t, d, o, true, s, coalesce((select perms from p), '{}'::jsonb)
from (values ('vat_lieu','Tên hàng / vật liệu','text',null,0,false), ('day','Dày (mm)','number',1,1,false), ('dai','Dài (mm)','number',null,2,false),
             ('rong','Rộng (mm)','number',null,3,false), ('mac_thep','Mác thép','text',null,4,false), ('so_tam','SL (tấm)','number',null,5,false),
             ('m2','DT (m²)','number',2,6,false), ('kg','TL (kg)','number',1,7,true), ('ma_mau','Mã màu','text',null,8,false),
             ('ma_tam','Dùng cho mã tấm','text',null,9,false), ('ghi_chu','Ghi chú','text',null,10,false)) v(k, l, t, d, o, s)
where not exists (select 1 from proc_fields x where x.proc = 'QT0' and x.area = 'col' and x.tbl = 'nl' and x.key = v.k);

-- cột phôi rời khỏi bảng Thành phẩm (dữ liệu cũ vẫn giữ trong dòng, chỉ ẩn)
update proc_fields set active = false where proc = 'QT0' and area = 'col' and tbl = 'ds' and key in ('phoi_rong','phoi_dai','phoi_sl','phoi_m2');

-- Phiếu QT0 đang có: dựng Bảng 1 (tắt trigger để không gửi Zalo / không đụng người được giao / phiếu đã duyệt)
set local session_replication_role = replica;
-- dựng Bảng 1 từ cột phôi, gom theo vật liệu + dày + khổ phôi
update docs d set tables = d.tables || jsonb_build_object('nl', g.nl)
from (
  select doc_id, jsonb_agg(jsonb_build_object('vat_lieu', vl, 'day', dy, 'rong', pr, 'dai', pd, 'so_tam', sl, 'm2', round(m2, 4), 'ma_tam', codes) order by vl, dy, pr, pd) nl
  from (
    select d.id doc_id, coalesce(trim(r->>'vat_lieu'), '') vl, r->>'day' dy, (r->>'phoi_rong')::numeric pr, (r->>'phoi_dai')::numeric pd,
           sum((r->>'phoi_sl')::numeric) sl,
           sum(coalesce(case when (r->>'phoi_m2') ~ '^[0-9.]+$' then (r->>'phoi_m2')::numeric end, (r->>'phoi_rong')::numeric * (r->>'phoi_dai')::numeric * (r->>'phoi_sl')::numeric / 1e6)) m2,
           string_agg(distinct r->>'ma_tam', ', ') codes
    from docs d join batches b on b.id = d.batch_id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) r
    where b.proc = 'QT0' and not (d.tables ? 'nl')
      and (r->>'phoi_rong') ~ '^[0-9.]+$' and (r->>'phoi_dai') ~ '^[0-9.]+$' and (r->>'phoi_sl') ~ '^[0-9.]+$' and (r->>'phoi_sl')::numeric > 0
    group by 1, 2, 3, 4, 5) x
  group by doc_id) g
where d.id = g.doc_id;
set local session_replication_role = origin;
