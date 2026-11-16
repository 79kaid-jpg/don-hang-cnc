-- QT3: phiếu IPC/HW là đợt riêng, nối về phiếu nguồn qua batches.checklist.auto_from → tìm phiếu PN gốc theo chuỗi này
create or replace function public.qt3_root(p_doc uuid) returns uuid language plpgsql stable security definer set search_path = public as $$
declare cur uuid := p_doc; nx uuid; i int := 0;
begin
  loop
    select nullif(b.checklist->>'auto_from', '')::uuid into nx from docs d join batches b on b.id = d.batch_id where d.id = cur;
    exit when nx is null or i > 4 or not exists (select 1 from docs where id = nx);
    cur := nx; i := i + 1;
  end loop;
  return cur;
end $$;

create or replace function public.cccd_ok(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or has_role('admin_cnc') or has_role('kho_qc') or coalesce(can_act(p_doc), false)
    or exists (select 1 from docs x join batches b on b.id = x.batch_id where b.proc = 'QT3' and b.status = 'dang_lam'
      and b.order_id = (select b2.order_id from docs d2 join batches b2 on b2.id = d2.batch_id where d2.id = p_doc)
      and qt3_root(x.id) = qt3_root(p_doc) and coalesce(can_act(x.id), false)) $$;

create or replace function public.gh_src(p_doc uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me docs; pr text; s docs;
begin
  select * into me from docs where id = p_doc; select proc into pr from batches where id = me.batch_id;
  if me.id is null or pr <> 'QT3' or me.company = 'PN' or not doc_visible(me.company, pr) then return null; end if;
  select * into s from docs where id = qt3_root(p_doc) and company = 'PN';
  if s.id is null then return null; end if;
  return jsonb_build_object('doc_id', s.id, 'status', s.status,
    'files', coalesce((select jsonb_agg(f) from jsonb_array_elements(s.files) f where f->>'kind' like 'gh\_%'), '[]'::jsonb),
    'header', jsonb_build_object('tai_xe', s.header->'tai_xe', 'tx_cccd', s.header->'tx_cccd', 'tx_sdt', s.header->'tx_sdt', 'so_phieu', s.header->'so_phieu', '_bbgh_ai', s.header->'_bbgh_ai'));
end $$;

-- Kho file: ảnh giao PN mở cho người xem được phiếu QT3 IPC/HW nối từ phiếu PN đó
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
      if pr <> 'QT3' then return false; end if;
      select * into gh from docs where batch_id::text = seg[2] and company = seg[3]
        and exists (select 1 from jsonb_array_elements(files) f where f->>'path' = base and f->>'kind' like 'gh\_%') limit 1;
      if gh.id is null or not exists (select 1 from docs x join batches b on b.id = x.batch_id
          where b.proc = 'QT3' and b.order_id = (select order_id from batches where id = gh.batch_id) and x.company <> gh.company
            and doc_visible(x.company, 'QT3') and qt3_root(x.id) = gh.id) then return false; end if;
    end if;
    if p_name !~ '\.blur\.jpg$' then
      select id into cd from docs where batch_id::text = seg[2] and files @> jsonb_build_array(jsonb_build_object('path', p_name, 'kind', 'gh_cccd')) limit 1;
      if cd is not null then return cccd_ok(cd); end if;
    end if;
    return true;
  end if;
  return true;
end $function$;
