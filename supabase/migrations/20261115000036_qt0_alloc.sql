-- QT0 chỉ PN thấy · mã QT0 · sổ phân bổ tấm QT0 → QT1 (PN) · nhân bản đơn thất bại

-- 1) QT0 chỉ Phương Nam (và Admin IT) xem
create or replace function public.doc_visible(p_company text, p_proc text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_adm()
    or (p_proc = 'QT0' and (app_company() = 'PN' or 'PN' = any(user_cos(app_uid()))))
    or (p_proc <> 'QT0' and (p_company = app_company() or p_company = any(user_cos(app_uid()))));
$$;

-- 2) QT1 gắn với lần bóc tách QT0 nguồn
alter table public.batches add column if not exists src_qt0 uuid references public.batches(id);
update batches q set src_qt0 = (select x.id from batches x where x.order_id = q.order_id and x.proc = 'QT0' and x.status = 'hoan_tat' order by x.done_at desc limit 1)
  where q.proc = 'QT1' and q.src_qt0 is null;

create or replace function public._qt0_code(p_b uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(o.code, ''), 'QT0') || '-BT' || b.seq from batches b join orders o on o.id = b.order_id where b.id = p_b;
$$;

-- tấm đã lên đơn PN (QT1 không thất bại) từ một QT0, theo khoá tấm
create or replace function public._qt0_used(p_qt0 uuid, p_skip uuid default null)
returns table(k text, q numeric, orders jsonb) language sql stable security definer set search_path = public as $$
  with r as (
    select _ds_key(e) k, _num0(e->>'so_tam') q, coalesce(co.code, b.title) code, d.id doc
    from batches b join docs d on d.batch_id = b.id and d.company = 'PN' left join co_orders co on co.doc_id = d.id,
         jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
    where b.proc = 'QT1' and b.src_qt0 = p_qt0 and d.status <> 'fail' and (p_skip is null or d.id <> p_skip))
  select k, sum(q), jsonb_agg(jsonb_build_object('code', code, 'q', q, 'doc', doc)) from r where q > 0 group by k;
$$;

-- danh sách QT0 đã duyệt của đơn (để QT1 chọn)
create or replace function public.qt0_list(p_order uuid)
returns table(id uuid, code text, title text, done_at timestamptz, tot numeric, used numeric) language sql stable security definer set search_path = public as $$
  select b.id, _qt0_code(b.id), b.title, b.done_at,
    (select coalesce(sum(_num0(e->>'so_tam')), 0) from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.batch_id = b.id),
    (select coalesce(sum(q), 0) from _qt0_used(b.id))
  from batches b where b.order_id = p_order and b.proc = 'QT0' and b.status = 'hoan_tat' and doc_visible('PN', 'QT0')
  order by b.seq;
$$;

-- các dòng tấm của QT0 + tình trạng phân bổ (p_doc: phiếu QT1 đang sửa – không tính vào "đơn khác")
create or replace function public.qt0_rows(p_qt0 uuid, p_doc uuid default null)
returns table(i int, k text, r jsonb, tot numeric, used numeric, orders jsonb) language sql stable security definer set search_path = public as $$
  with s as (select (x.n - 1)::int i, _m2_tam(x.e) e, _ds_key(x.e) k from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) with ordinality x(e, n)
             where d.batch_id = p_qt0 and doc_visible('PN', 'QT0')),
  t as (select k, sum(_num0(e->>'so_tam')) tot from s group by k)
  select s.i, s.k, s.e, t.tot, coalesce(u.q, 0), coalesce(u.orders, '[]') from s join t using (k) left join _qt0_used(p_qt0, p_doc) u using (k) order by s.i;
$$;

-- 3) Máy chủ chặn lấy thừa
create or replace function public._qt0_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare src uuid; bad text;
begin
  if new.company <> 'PN' or new.status = 'fail' then return new; end if;
  if tg_op = 'UPDATE' and new.tables is not distinct from old.tables and new.status is not distinct from old.status then return new; end if;
  select b.src_qt0 into src from batches b where b.id = new.batch_id and b.proc = 'QT1'; if src is null then return new; end if;
  select string_agg(split_part(me.k, '|', 1) || ': QT0 có ' || coalesce(t.tot, 0) || ', đơn khác đã lấy ' || coalesce(u.q, 0) || ', đơn này lấy ' || me.q
                    || ' → thừa ' || (me.q - (coalesce(t.tot, 0) - coalesce(u.q, 0))), '; ') into bad
  from (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1) me
    join (select _ds_key(e) k, sum(_num0(e->>'so_tam')) tot from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.batch_id = src group by 1) t on t.k = me.k
    left join _qt0_used(src, new.id) u on u.k = me.k
  where me.q > coalesce(t.tot, 0) - coalesce(u.q, 0);
  if bad is not null then raise exception 'Vượt số tấm của QT0 %: %', _qt0_code(src), bad; end if;
  return new;
end $$;
drop trigger if exists qt0_guard on public.docs;
create trigger qt0_guard before insert or update of tables, status on public.docs for each row execute function _qt0_guard();

-- lấy q tấm của một dòng: chia m² / khối lượng theo tỉ lệ
create or replace function public._qt0_take(e jsonb, q numeric) returns jsonb language sql immutable as $$
  select case when _num0(e->>'so_tam') <= 0 or q = _num0(e->>'so_tam') then e || jsonb_build_object('so_tam', q)
    else e || jsonb_build_object('so_tam', q)
      || coalesce(case when _num(e->>'m2') is not null then jsonb_build_object('m2', round(_num(e->>'m2') * q / _num0(e->>'so_tam'), 4)) end, '{}')
      || coalesce(case when _num(e->>'m2_ht') is not null then jsonb_build_object('m2_ht', round(_num(e->>'m2_ht') * q / _num0(e->>'so_tam'), 4)) end, '{}') end;
$$;

-- 4) Mở QT1 từ QT0 đã chọn, lấy một phần số tấm: p_opts.qt0 = id QT0, p_opts.pick = [{i, q}]
create or replace function public.batch_create(p_order uuid, p_proc text, p_title text default '', p_opts jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare b uuid; n int; t jsonb := '{}'; ck jsonb := coalesce(p_opts->'checklist', '{}'); co uuid := nullif(p_opts->>'co_order', '')::uuid; q0 uuid := nullif(p_opts->>'qt0', '')::uuid;
begin
  if not _is_person(p_proc, 'PN', case when p_proc = 'QT0' then 'admin' else 'lap' end) then raise exception 'Bạn không phụ trách lập hồ sơ % của Phương Nam CNC', p_proc; end if;
  if p_proc = 'QT2' and (select count(*) from jsonb_each_text(ck) where value = 'true') < 5 then
    raise exception 'Chưa đủ 5 điều kiện: bóc tách đã duyệt, đủ vật tư, đủ công cụ, vấn đề kỹ thuật đã xử lý, đã công bố tiêu chuẩn QC'; end if;
  if p_proc = 'QT1' then
    if q0 is null then select x.id into q0 from batches x where x.order_id = p_order and x.proc = 'QT0' and x.status = 'hoan_tat' order by x.done_at desc limit 1; end if;
    if q0 is not null and not exists (select 1 from batches where id = q0 and order_id = p_order and proc = 'QT0' and status = 'hoan_tat') then raise exception 'QT0 không hợp lệ'; end if;
  end if;
  if p_proc = 'QT1' and coalesce((p_opts->>'use_qt0')::boolean, false) then
    if q0 is null then raise exception 'Chưa có danh sách tấm QT0 đã duyệt để lấy'; end if;
    select d.tables into t from docs d where d.batch_id = q0 limit 1;
    if jsonb_typeof(p_opts->'pick') = 'array' then
      if jsonb_array_length(p_opts->'pick') = 0 then raise exception 'Chưa chọn tấm nào'; end if;
      t := jsonb_build_object('ds', coalesce((select jsonb_agg(_qt0_take(_m2_tam(e), _num0(p->>'q')) order by i)
        from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality x(e, i) join jsonb_array_elements(p_opts->'pick') p on (p->>'i')::int = i - 1 where _num0(p->>'q') > 0), '[]'));
    elsif jsonb_typeof(p_opts->'rows') = 'array' then
      if jsonb_array_length(p_opts->'rows') = 0 then raise exception 'Chưa chọn tấm nào'; end if;
      t := jsonb_build_object('ds', coalesce((select jsonb_agg(_m2_tam(e) order by i) from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality as x(e, i)
        where (i - 1)::text in (select jsonb_array_elements_text(p_opts->'rows'))), '[]'));
    else t := jsonb_build_object('ds', coalesce((select jsonb_agg(_m2_tam(e) order by i) from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality x(e, i)), '[]')); end if;
  end if;
  if co is not null and not exists (select 1 from co_orders where id = co and order_id = p_order and company = 'PN') then raise exception 'Đơn PN không thuộc hồ sơ này'; end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = p_order and proc = p_proc;
  insert into batches(order_id, proc, seq, title, checklist, co_order_id, src_qt0) values (p_order, p_proc, n,
    coalesce(nullif(trim(p_title), ''), case p_proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end || n), ck,
    case when p_proc in ('QT2','QT3') then co end, case when p_proc = 'QT1' then q0 end)
    returning id into b;
  insert into docs(batch_id, company, status, tables) values (b, 'PN', (_flow(p_proc))[1], coalesce(t, '{}'));
  perform log_event(p_order, 'Mở ' || p_proc || ' · ' || (select title from batches where id = b) || coalesce(' · từ ' || _qt0_code(q0), ''));
  return b;
end $$;

-- 5) Tạo đơn mới từ đơn PN thất bại: chép bảng (kể cả đơn giá, ghi chú), chỉ lấy phần QT0 còn lại
create or replace function public.qt1_reclone(p_doc uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d docs; ob batches; nb uuid; nd uuid; v_rows jsonb; v_short jsonb; oc text;
begin
  select * into d from docs where id = p_doc; select * into ob from batches where id = d.batch_id;
  if ob.proc <> 'QT1' or d.company <> 'PN' or d.status <> 'fail' then raise exception 'Chỉ tạo lại được từ XNĐH Phương Nam đã Thất bại'; end if;
  nb := batch_create(ob.order_id, 'QT1', '', jsonb_build_object('qt0', ob.src_qt0));
  select id into nd from docs where batch_id = nb and company = 'PN';
  select code into oc from co_orders where doc_id = p_doc;
  with o as (select x.e, x.n, _ds_key(x.e) k, _num0(x.e->>'so_tam') q from jsonb_array_elements(coalesce(d.tables->'ds', '[]')) with ordinality x(e, n)),
  av as (select t.k, t.tot - coalesce(u.q, 0) a from (select _ds_key(e) k, sum(_num0(e->>'so_tam')) tot from docs z, jsonb_array_elements(coalesce(z.tables->'ds', '[]')) e where z.batch_id = ob.src_qt0 group by 1) t
         left join _qt0_used(ob.src_qt0, nd) u on u.k = t.k),
  c as (select o.*, case when ob.src_qt0 is null or a.k is null then o.q else greatest(0, least(o.q, a.a - coalesce(sum(o.q) over (partition by o.k order by o.n rows between unbounded preceding and 1 preceding), 0))) end take
        from o left join av a on a.k = o.k)
  select coalesce(jsonb_agg(_qt0_take(e, take) order by n) filter (where take > 0), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('ma_tam', e->>'ma_tam', 'cu', q, 'lay', take)) filter (where take < q), '[]') into v_rows, v_short from c;
  update docs set tables = jsonb_build_object('ds', v_rows), header = (d.header - 'so_xn' - 'so_ct' - 'tao_lai_tu') || coalesce(header, '{}') || jsonb_build_object('tao_lai_tu', coalesce(oc, ob.title)) where id = nd;
  update batches set checklist = coalesce(checklist, '{}') || jsonb_build_object('cloned_from', d.id) where id = nb;
  update batches set checklist = coalesce(checklist, '{}') || jsonb_build_object('recloned_to', nb) where id = ob.id;
  perform log_event(ob.order_id, 'Tạo lại XNĐH từ ' || coalesce(oc, ob.title) || ' (thất bại)');
  return jsonb_build_object('batch', nb, 'short', v_short, 'from', coalesce(oc, ob.title));
end $$;

revoke all on function public.qt0_list(uuid), public.qt0_rows(uuid, uuid), public.qt1_reclone(uuid), public._qt0_used(uuid, uuid), public._qt0_code(uuid) from public, anon;
grant execute on function public.qt0_list(uuid), public.qt0_rows(uuid, uuid), public.qt1_reclone(uuid), public._qt0_code(uuid) to authenticated;

-- gắn lại QT1 cũ vào QT0 đã duyệt gần nhất TRƯỚC lúc mở QT1
update batches q set src_qt0 = coalesce((select x.id from batches x where x.order_id = q.order_id and x.proc = 'QT0' and x.status = 'hoan_tat' and x.done_at <= q.created_at order by x.done_at desc limit 1), q.src_qt0)
  where q.proc = 'QT1';
