-- Tham chiếu nhiều lần: mỗi lần lập = 1 XNĐH riêng của công ty sau, chỉ lấy phần số tấm còn lại của đơn bên trước.
-- Khoá dòng tấm: mã tấm | vật liệu | dày.
create or replace function public._ds_key(r jsonb) returns text language sql immutable as $$
  select upper(trim(coalesce(r->>'ma_tam', ''))) || '|' || upper(trim(coalesce(r->>'vat_lieu', ''))) || '|' || coalesce(nullif(replace(r->>'day', ',', '.'), ''), '');
$$;
create or replace function public._num0(t text) returns numeric language sql immutable as $$
  select coalesce(nullif(regexp_replace(replace(coalesce(t, ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric, 0);
$$;

-- Số tấm đã dùng theo khoá, từ mọi XNĐH (chưa thất bại) tham chiếu tới co_order p_ref; bỏ qua phiếu p_skip
create or replace function public._ref_used(p_ref uuid, p_skip uuid default null) returns table(k text, q numeric) language sql stable security definer set search_path = public as $$
  select _ds_key(r), sum(_num0(r->>'so_tam'))
  from co_orders c join docs d on d.id = c.doc_id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) r
  where c.ref_id = p_ref and d.status <> 'fail' and (p_skip is null or d.id <> p_skip)
  group by 1;
$$;

-- Dòng của đơn tham chiếu kèm số còn lại
create or replace function public.ref_rows(p_code text, p_co text) returns table(i int, ma_tam text, vat_lieu text, day text, so_tam numeric, con_lai numeric) language plpgsql stable security definer set search_path = public as $$
declare c co_orders; pd docs; prev text := case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end;
begin
  select co.* into c from co_orders co where upper(trim(co.code)) = upper(trim(p_code)) and co.company = prev order by co.created_at desc limit 1;
  if c.id is null then return; end if;
  select x.* into pd from docs x where x.id = c.doc_id;
  return query
    with rows as (select (o - 1)::int i, r from jsonb_array_elements(coalesce(pd.tables->'ds', '[]')) with ordinality t(r, o)),
         need as (select _ds_key(r) k, sum(_num0(r->>'so_tam')) tot from rows group by 1),
         used as (select * from _ref_used(c.id)),
         -- phân bổ phần đã dùng theo thứ tự dòng
         alloc as (select rows.i, rows.r, _ds_key(rows.r) k, _num0(rows.r->>'so_tam') q,
           coalesce(sum(_num0(rows.r->>'so_tam')) over (partition by _ds_key(rows.r) order by rows.i rows between unbounded preceding and 1 preceding), 0) before from rows)
    select a.i, a.r->>'ma_tam', a.r->>'vat_lieu', a.r->>'day', a.q,
      greatest(0, a.q - greatest(0, least(a.q, coalesce(u.q, 0) - a.before)))
    from alloc a left join used u on u.k = a.k order by a.i;
end $$;

-- Danh sách mã tham chiếu còn tấm
create or replace function public.ref_candidates(p_order uuid, p_co text) returns table(code text, batch_id uuid, title text, used text) language sql stable security definer set search_path = public as $$
  select c.code, b.id, b.title,
    (select coalesce(sum(con_lai), 0)::text || '/' || coalesce(sum(so_tam), 0)::text from ref_rows(c.code, p_co))
  from co_orders c join docs pd on pd.id = c.doc_id join batches b on b.id = c.batch_id
  where c.order_id = p_order and b.proc = 'QT1' and pd.status = 'da_duyet'
    and c.company = case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end
    and (select coalesce(sum(con_lai), 0) from ref_rows(c.code, p_co)) > 0
  order by c.created_at;
$$;

-- Lập XNĐH mới từ tham chiếu; p_pick = [{i, so_tam}] (bỏ trống = lấy hết phần còn lại)
drop function if exists public.doc_from_ref(text, text);
create or replace function public.doc_from_ref(p_code text, p_co text, p_pick jsonb default null) returns uuid language plpgsql security definer set search_path = public as $$
declare c co_orders; pd docs; b0 batches; nb uuid; v_id uuid; prev text := case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end;
  hd jsonb; ds jsonb := '[]'; r record; want numeric; n int;
begin
  if prev is null then raise exception 'Công ty % không lập từ tham chiếu', p_co; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person('QT1', p_co, 'lap')) then raise exception 'Bạn không phải người Lập XNĐH của %', p_co; end if;
  select co.* into c from co_orders co where upper(trim(co.code)) = upper(trim(p_code)) and co.company = prev order by co.created_at desc limit 1;
  if c.id is null then raise exception 'Không tìm thấy mã đơn % của %', p_code, prev; end if;
  select x.* into pd from docs x where x.id = c.doc_id; select bb.* into b0 from batches bb where bb.id = c.batch_id;
  if pd.status = 'fail' or b0.status = 'fail' then raise exception 'Đơn % đã Thất bại, không dùng làm tham chiếu được.', p_code; end if;
  if pd.status <> 'da_duyet' then raise exception 'Đơn % chưa duyệt xong, chưa tham chiếu được.', p_code; end if;
  for r in select * from ref_rows(p_code, p_co) loop
    want := case when p_pick is null then r.con_lai else coalesce((select _num0(x->>'so_tam') from jsonb_array_elements(p_pick) x where (x->>'i')::int = r.i limit 1), 0) end;
    continue when want <= 0;
    if want > r.con_lai then raise exception 'Dòng % (%): chỉ còn % tấm, không lấy % được.', r.i + 1, r.ma_tam, r.con_lai, want; end if;
    ds := ds || jsonb_build_array(((pd.tables->'ds'->r.i) - 'don_gia' - 'tt') || jsonb_build_object('so_tam', want));
  end loop;
  if jsonb_array_length(ds) = 0 then raise exception 'Chưa chọn tấm nào (hoặc đơn % đã dùng hết).', p_code; end if;
  select count(*) + 1 into n from batches where order_id = b0.order_id and proc = 'QT1';
  insert into batches(order_id, proc, title, status) values (b0.order_id, 'QT1', 'XNĐH ' || n, 'dang_lam') returning id into nb;
  hd := jsonb_strip_nulls(jsonb_build_object('dk_giao', pd.header->'dk_giao', 'ngay', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'), 'ref', p_code));
  insert into docs(batch_id, company, status, header, tables) values (nb, p_co, 'lap', hd, _mask_t(jsonb_build_object('ds', ds), restricted_keys('QT1'))) returning docs.id into v_id;
  update co_orders set ref_id = c.id where doc_id = v_id;
  perform log_event(b0.order_id, 'QT1 · XNĐH ' || n || ' · ' || p_co || ': lập từ tham chiếu ' || p_code || ' (' || jsonb_array_length(ds) || ' dòng)');
  return nb;
end $$;
grant execute on function public.ref_rows(text, text), public.ref_candidates(uuid, text), public.doc_from_ref(text, text, jsonb) to authenticated;

-- Chặn vượt: XNĐH có tham chiếu không được lấy quá phần của đơn bên trước
create or replace function public._ref_over_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare c co_orders; pd docs; bad text;
begin
  if new.tables is not distinct from old.tables then return new; end if;
  select co.* into c from co_orders co where co.doc_id = new.id; if c.ref_id is null then return new; end if;
  select x.* into pd from co_orders r join docs x on x.id = r.doc_id where r.id = c.ref_id;
  select string_agg(split_part(m.k, '|', 1) || ' (còn ' || (m.tot - coalesce(u.q, 0)) || ', đang lấy ' || coalesce(me.q, 0) || ')', ', ') into bad
  from (select _ds_key(r) k, sum(_num0(r->>'so_tam')) tot from jsonb_array_elements(coalesce(pd.tables->'ds', '[]')) r group by 1) m
    full join (select _ds_key(r) k, sum(_num0(r->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) r group by 1) me on me.k = m.k
    left join _ref_used(c.ref_id, new.id) u on u.k = coalesce(m.k, me.k)
  where coalesce(me.q, 0) > coalesce(m.tot, 0) - coalesce(u.q, 0) and coalesce(me.q, 0) > 0;
  if bad is not null then raise exception 'Vượt số tấm của đơn tham chiếu: %', bad; end if;
  return new;
end $$;
drop trigger if exists docs_ref_over on public.docs;
create trigger docs_ref_over before update of tables on public.docs for each row execute function public._ref_over_guard();

-- Đóng XNĐH khi công ty của nó duyệt xong (mỗi XNĐH là của 1 công ty), thất bại thì đóng nếu không còn phiếu nào khác đang chạy
do $$ declare d text; begin
  d := pg_get_functiondef('public.doc_advance(uuid,text,text)'::regprocedure);
  d := replace(d, 'else perform public._notify_ref_ready(d.id, nc); end if;',
    'else perform public._notify_ref_ready(d.id, nc);
          if not exists (select 1 from docs x where x.batch_id = b.id and x.id <> d.id and x.status not in (''da_duyet'', ''fail'')) then update batches set status = ''hoan_tat'', done_at = now() where id = b.id; end if;
        end if;');
  d := replace(d, $q$if b.proc = 'QT0' or d.company = 'PN' then update batches set status = 'fail', done_at = now() where id = b.id; end if;$q$,
    $q$if b.proc = 'QT0' or not exists (select 1 from docs x where x.batch_id = b.id and x.id <> d.id and x.status <> 'fail') then update batches set status = 'fail', done_at = now() where id = b.id; end if;$q$);
  if position('hoan_tat'', done_at' in d) = 0 then raise exception 'không sửa được doc_advance'; end if;
  execute d;
end $$;
