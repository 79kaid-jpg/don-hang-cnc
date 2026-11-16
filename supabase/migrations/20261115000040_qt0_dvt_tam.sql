-- QT0: Đơn vị tính = chữ, mặc định "tấm" cho dòng cũ đang trống
create table if not exists uat_backup_20261115.docs_qt0_dvt as
  select d.id, d.tables from docs d join batches b on b.id = d.batch_id where b.proc = 'QT0';
update proc_fields set type = 'text' where proc = 'QT0' and key = 'cot_moi' and area = 'col';
update docs d set tables = jsonb_set(d.tables, '{ds}', (
    select coalesce(jsonb_agg(case when coalesce(trim(r->>'cot_moi'), '') = '' then r || '{"cot_moi":"tấm"}' else r end order by o), '[]'::jsonb)
    from jsonb_array_elements(d.tables->'ds') with ordinality as x(r, o)))
  from batches b where b.id = d.batch_id and b.proc = 'QT0' and jsonb_typeof(d.tables->'ds') = 'array';
