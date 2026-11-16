-- Đổi khoá cột Đơn vị tính cot_moi → don_vi_tinh (QT0, QT2); QT0 Bảng 1 mặc định "tấm"
create table if not exists uat_backup_20261115.docs_dvt2 as select d.id, d.tables from docs d;
create table if not exists uat_backup_20261115.proc_fields_dvt2 as select * from proc_fields where key in ('cot_moi','don_vi_tinh');
update proc_fields set key = 'don_vi_tinh', type = 'text' where key = 'cot_moi' and area = 'col' and proc in ('QT0','QT2');
update docs d set tables = (select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
    (select coalesce(jsonb_agg(case when r ? 'cot_moi' then (r - 'cot_moi') || jsonb_build_object('don_vi_tinh', r->'cot_moi') else r end order by o), '[]'::jsonb) from jsonb_array_elements(v) with ordinality x(r, o))
    else v end) from jsonb_each(d.tables) t(k, v))
  from batches b where b.id = d.batch_id and b.proc in ('QT0','QT2') and d.tables::text like '%cot_moi%';
update docs d set tables = jsonb_set(d.tables, '{nl}', (select coalesce(jsonb_agg(case when coalesce(trim(r->>'don_vi_tinh'),'') = '' then r || '{"don_vi_tinh":"tấm"}' else r end order by o), '[]'::jsonb) from jsonb_array_elements(d.tables->'nl') with ordinality x(r, o)))
  from batches b where b.id = d.batch_id and b.proc = 'QT0' and jsonb_typeof(d.tables->'nl') = 'array';
