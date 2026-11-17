-- Tách / clone đơn IPC–Hanwa: nhiều đơn con cùng tham chiếu 1 đơn nguồn, tổng số tấm từng mã ≤ đơn nguồn
create or replace function public._src_left(p_src uuid, p_skip uuid default null) returns table(k text, src numeric, used numeric)
language sql stable security definer set search_path = public as $$
  with s as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.id = p_src group by 1),
       u as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from batches b join docs d on d.batch_id = b.id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
             where b.checklist->>'auto_from' = p_src::text and b.status <> 'fail' and d.status <> 'fail' and (p_skip is null or d.id <> p_skip) group by 1)
  select s.k, s.q, coalesce(u.q, 0) from s left join u on u.k = s.k where s.k <> '' $$;

create or replace function public._co_chain_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare b batches; src uuid; bad text; nc text;
begin
  -- Đơn nguồn bị sửa giảm: không cho thấp hơn tổng các đơn con
  if tg_op = 'UPDATE' and new.tables is distinct from old.tables and exists (select 1 from batches x where x.checklist->>'auto_from' = new.id::text and x.status <> 'fail') then
    with me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
    select string_agg(l.k || ': đơn con đã lấy ' || l.used || ', còn ' || coalesce(me.q, 0), '; ') into bad
    from _src_left(new.id) l left join me on me.k = l.k where l.used > coalesce(me.q, 0);
    if bad is not null then raise exception 'Không giảm được dưới số các đơn công ty sau đã lấy: %', bad; end if;
  end if;
  if new.company not in ('IPC', 'HW') then return new; end if;
  select * into b from batches where id = new.batch_id;
  if b.proc not in ('QT1', 'QT2', 'QT3') then return new; end if;
  nc := case new.company when 'IPC' then 'PN' else 'IPC' end;
  src := nullif(b.checklist->>'auto_from', '')::uuid;
  if src is null then
    if tg_op = 'INSERT' then raise exception 'Đơn % phải có tham chiếu tới đơn % đã duyệt', new.company, nc; end if;
    if new.status is distinct from old.status and new.status <> 'fail' then raise exception 'Đơn % không có tham chiếu % – không chuyển bước được', new.company, nc; end if;
    return new;
  end if;
  if b.proc = 'QT1' and new.status <> 'fail' and (tg_op = 'INSERT' or new.tables is distinct from old.tables) then
    perform pg_advisory_xact_lock(hashtext('src:' || src::text));
    with me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
    select string_agg(me.k || case when l.k is null then ': không có trong đơn nguồn' else ': đơn nguồn ' || l.src || ', đơn khác đã lấy ' || l.used || ', đơn này ' || me.q end, '; ') into bad
    from me left join _src_left(src, new.id) l on l.k = me.k where me.k <> '' and me.q > 0 and (l.k is null or me.q > l.src - l.used);
    if bad is not null then raise exception 'Vượt đơn nguồn %: %', doc_code(src), bad; end if;
  end if;
  return new;
end $$;

-- Đơn nguồn còn tấm chưa chia → được chọn làm tham chiếu
create or replace function public._co_free(p_co co_orders) returns setof co_orders language sql stable security definer set search_path = public as $$
  select c.* from co_orders c join companies s on s.code = c.company and s.buyer = p_co.company
  where c.order_id = p_co.order_id
    and exists (select 1 from docs d where d.id = c.doc_id and d.status = 'da_duyet')
    and (c.id = p_co.ref_id or exists (select 1 from _src_left(c.doc_id, p_co.doc_id) l where l.src > l.used)) $$;

-- Clone: IPC/HW giữ tham chiếu đơn nguồn, chỉ chép số tấm còn lại
create or replace function public.doc_clone(p_doc uuid) returns uuid language plpgsql security definer set search_path = public as $function$
declare d docs; b batches; nb uuid; v_id uuid; n int; fl text[]; src uuid; ck jsonb; tb jsonb; rr uuid;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if d.status not in ('da_duyet','fail') then raise exception 'Chỉ clone phiếu đã Thành công hoặc Thất bại'; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person(b.proc, d.company, case when b.proc = 'QT0' then 'admin' else 'lap' end)) then
    raise exception 'Bạn không phải Admin / người Lập của % ở %', d.company, b.proc; end if;
  fl := _flow(b.proc); ck := jsonb_build_object('clone_from', d.id::text); tb := d.tables;
  if d.company in ('IPC', 'HW') and b.proc <> 'QT0' then
    src := nullif(b.checklist->>'auto_from', '')::uuid;
    if src is null then raise exception 'Đơn này không có tham chiếu – không clone được'; end if;
    ck := ck || jsonb_build_object('auto_from', src::text);
    if b.proc = 'QT1' then
      perform pg_advisory_xact_lock(hashtext('src:' || src::text));
      select coalesce(jsonb_agg(e || jsonb_build_object('so_tam', (l.src - l.used)::text)), '[]'::jsonb) into tb
      from jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e join _src_left(src) l on l.k = _ds_key(e) where l.src - l.used > 0;
      if jsonb_array_length(tb) = 0 then raise exception 'Đơn nguồn % đã chia hết tấm – không clone được', doc_code(src); end if;
      tb := jsonb_set(coalesce(d.tables, '{}'::jsonb), '{ds}', tb);
    end if;
  end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = b.order_id and proc = b.proc;
  insert into batches(order_id, proc, seq, title, status, co_order_id, checklist)
    values (b.order_id, b.proc, n, (case b.proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end) || n,
            'dang_lam', b.co_order_id, ck) returning id into nb;
  insert into docs(batch_id, company, status, header, tables)
    values (nb, d.company, fl[1], (d.header - 'so_xn') || jsonb_build_object('clone_from', doc_code(d.id)), tb) returning docs.id into v_id;
  if src is not null then select ref_id into rr from co_orders where doc_id = d.id; if rr is not null then update co_orders set ref_id = rr where doc_id = v_id; end if; end if;
  perform log_event(b.order_id, b.proc || ': clone ' || doc_code(d.id) || ' → ' || b.proc || ' mới (' || d.company || ')' || case when src is not null then ', tham chiếu ' || doc_code(src) else '' end);
  return nb;
end $function$;
