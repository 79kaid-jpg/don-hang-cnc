-- docs_v: tính quyền một lần cho mỗi (quy trình × công ty) thay vì từng dòng (3,4s → 0,04s)
create or replace view public.docs_v with (security_barrier = true) as
with k as materialized (
  select p.proc, c.co, doc_visible(c.co, p.proc) as vis,
         case when doc_visible(c.co, p.proc) then hidden_keys(p.proc, c.co) else '{}'::text[] end as hk
  from (values ('QT0'), ('QT1'), ('QT2'), ('QT3')) p(proc) cross join (values ('PN'), ('IPC'), ('HW')) c(co))
select d.id, d.batch_id, d.company, d.status, d.status_at, d.created_at, d.apv, d.assignee,
  case when v.vis then d.assign_note end as assign_note,
  case when v.vis then d.signs else coalesce((select jsonb_agg(s - 'note' order by i) from jsonb_array_elements(d.signs) with ordinality x(s, i)), '[]') end as signs,
  case when v.vis then _mask_h(d.header, v.hk) else '{}'::jsonb end as header,
  case when v.vis then _mask_t(d.tables, v.hk) else '{}'::jsonb end as tables,
  case when v.vis then d.files else '[]'::jsonb end as files,
  case when v.vis then d.notes else '[]'::jsonb end as notes,
  v.vis as can_view,
  case when v.vis then v.hk else '{}'::text[] end as hidden
from docs d join batches b on b.id = d.batch_id
join k v on v.proc = b.proc and v.co = d.company;
grant select on public.docs_v to authenticated;
