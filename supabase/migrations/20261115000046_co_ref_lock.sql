-- Tham chiếu đơn giữa công ty: khoá đơn tự tạo; chỉ ref tới đơn công ty liền trước, cùng đơn gốc, đã duyệt, chưa bị liên kết
create or replace function public._co_auto(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(b.checklist->>'auto_from', '') is not null from docs d join batches b on b.id = d.batch_id where d.id = p_doc), false) $$;

create or replace function public._co_free(p_co co_orders) returns setof co_orders language sql stable security definer set search_path = public as $$
  select c.* from co_orders c join companies s on s.code = c.company and s.buyer = p_co.company
  where c.order_id = p_co.order_id
    and exists (select 1 from docs d where d.id = c.doc_id and d.status = 'da_duyet')
    and not exists (select 1 from co_orders x where x.ref_id = c.id and x.id <> p_co.id)
    and not exists (select 1 from batches b join docs d2 on d2.batch_id = b.id where b.checklist->>'auto_from' = c.doc_id::text and d2.id <> p_co.doc_id) $$;

create or replace function public.co_ref_info(p_doc uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare co co_orders;
begin
  select * into co from co_orders where doc_id = p_doc; if not found then return null; end if;
  return jsonb_build_object('auto', _co_auto(p_doc), 'ref_id', co.ref_id,
    'ref_code', (select code from co_orders where id = co.ref_id),
    'cands', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'code', f.code) order by f.created_at desc) from _co_free(co) f), '[]'::jsonb));
end $$;
grant execute on function public.co_ref_info(uuid) to authenticated;

create or replace function public.co_set_ref(p_doc uuid, p_ref uuid) returns void language plpgsql security definer set search_path = public as $function$
declare co co_orders; old text; nw text;
begin
  select * into co from co_orders where doc_id = p_doc; if not found then raise exception 'Không tìm thấy đơn công ty'; end if;
  if not (can_act(p_doc) or has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Bạn không có quyền'; end if;
  if _co_auto(p_doc) then raise exception 'Đơn được tạo tự động từ bước duyệt của công ty trước – không đổi được tham chiếu'; end if;
  if (select status from docs where id = p_doc) <> 'lap' then raise exception 'Chỉ đổi tham chiếu ở bước Lập'; end if;
  if p_ref is not null and not exists (select 1 from _co_free(co) f where f.id = p_ref) then
    raise exception 'Chỉ chọn được đơn của công ty liền trước, cùng đơn hàng, đã duyệt và chưa được liên kết'; end if;
  old := (select code from co_orders where id = co.ref_id); nw := (select code from co_orders where id = p_ref);
  update co_orders set ref_id = p_ref where id = co.id;
  perform log_event(co.order_id, 'Đổi tham chiếu đơn ' || co.company || ' ' || co.code || ': ' || coalesce(old, '—') || ' → ' || coalesce(nw, '—'));
end $function$;

-- Rà liên kết lệch (Admin IT)
create or replace function public.co_ref_audit() returns table(code text, company text, van_de text) language sql stable security definer set search_path = public as $$
  select c.code, c.company, 'Tham chiếu sang đơn khác đơn hàng gốc (' || r.code || ')' from co_orders c join co_orders r on r.id = c.ref_id where r.order_id is distinct from c.order_id and has_role('admin_it')
  union all
  select r.code, r.company, 'Bị ' || count(*) || ' đơn tham chiếu cùng lúc' from co_orders c join co_orders r on r.id = c.ref_id where has_role('admin_it') group by r.code, r.company having count(*) > 1
  union all
  select c.code, c.company, 'Đơn tự tạo nhưng tham chiếu ' || coalesce(r.code, '—') || ' khác đơn nguồn ' || coalesce(s.code, '—')
  from co_orders c join docs d on d.id = c.doc_id join batches b on b.id = d.batch_id
  left join co_orders s on s.doc_id::text = b.checklist->>'auto_from' left join co_orders r on r.id = c.ref_id
  where nullif(b.checklist->>'auto_from', '') is not null and s.id is distinct from c.ref_id and has_role('admin_it') $$;
grant execute on function public.co_ref_audit() to authenticated;
