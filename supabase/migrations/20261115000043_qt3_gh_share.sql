-- QT3: ảnh giao hàng của PN hiện (chỉ xem) ở phiếu IPC/HW cùng đợt giao; IPC/HW vẫn chụp thêm ảnh riêng
-- Quyền CCCD: theo người đang làm bất kỳ phiếu QT3 nào trong cùng đợt + vai trò admin_it/admin_cnc/kho_qc
create or replace function public.cccd_ok(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or has_role('admin_cnc') or has_role('kho_qc')
    or exists (select 1 from docs x where x.batch_id = (select batch_id from docs where id = p_doc) and coalesce(can_act(x.id), false)) $$;

-- Ảnh giao của PN cho phiếu IPC/HW cùng đợt (người gọi phải xem được phiếu của mình)
create or replace function public.gh_src(p_doc uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me docs; b batches; s docs;
begin
  select * into me from docs where id = p_doc; select * into b from batches where id = me.batch_id;
  if me.id is null or b.proc <> 'QT3' or me.company = 'PN' or not doc_visible(me.company, b.proc) then return null; end if;
  select * into s from docs where batch_id = me.batch_id and company = 'PN' order by created_at desc limit 1;
  if s.id is null then return null; end if;
  return jsonb_build_object('doc_id', s.id, 'status', s.status,
    'files', coalesce((select jsonb_agg(f) from jsonb_array_elements(s.files) f where f->>'kind' like 'gh\_%'), '[]'::jsonb),
    'header', jsonb_build_object('tai_xe', s.header->'tai_xe', 'tx_cccd', s.header->'tx_cccd', 'tx_sdt', s.header->'tx_sdt', 'so_phieu', s.header->'so_phieu', '_bbgh_ai', s.header->'_bbgh_ai'));
end $$;
grant execute on function public.gh_src(uuid) to authenticated;

-- Kho file: ảnh giao (gh_*) của phiếu PN xem được bởi người xem được phiếu QT3 khác công ty trong cùng đợt
create or replace function public.file_visible(p_name text) returns boolean language plpgsql stable security definer set search_path = public as $function$
declare seg text[] := string_to_array(p_name, '/'); r doc_records; pr text; cd uuid; base text := regexp_replace(p_name, '\.blur\.jpg$', ''); gh docs;
begin
  if is_adm() then return true; end if;
  if seg[1] = 'records' then
    select * into r from doc_records where path = p_name limit 1;
    return r.id is null or rec_visible2(r.doc_id, r.kind, r.proc, r.company, r.has_secret);
  end if;
  if cardinality(seg) >= 4 and seg[3] in ('PN', 'IPC', 'HW') then
    select proc into pr from batches where id::text = seg[2];
    if pr is not null and not doc_visible(seg[3], pr) then
      -- ảnh giao PN dùng chung cho IPC/HW cùng đợt
      if pr <> 'QT3' then return false; end if;
      select * into gh from docs where batch_id::text = seg[2] and company = seg[3]
        and exists (select 1 from jsonb_array_elements(files) f where f->>'path' = base and f->>'kind' like 'gh\_%') limit 1;
      if gh.id is null or not exists (select 1 from docs x where x.batch_id = gh.batch_id and x.company <> gh.company and doc_visible(x.company, pr)) then return false; end if;
    end if;
    if p_name !~ '\.blur\.jpg$' then
      select id into cd from docs where batch_id::text = seg[2] and files @> jsonb_build_array(jsonb_build_object('path', p_name, 'kind', 'gh_cccd')) limit 1;
      if cd is not null then return cccd_ok(cd); end if;
    end if;
    return true;
  end if;
  return true;
end $function$;
