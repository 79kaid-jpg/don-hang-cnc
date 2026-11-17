-- Toàn vẹn số tấm QT0 → QT1 (PN): khoá theo mã tấm chuẩn hoá, tính trên toàn đơn hàng, kể cả XNĐH không gắn QT0
create or replace function public._ds_key(r jsonb) returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(nullif(trim(r->>'ma_tam'), ''), r->>'vat_lieu', ''), '\s+', '', 'g')) $$;

-- Số tấm đã lấy cho 1 QT0: XNĐH gắn QT0 đó + XNĐH không gắn QT0 nào của cùng đơn
create or replace function public._qt0_used(p_qt0 uuid, p_skip uuid default null) returns table(k text, q numeric, orders jsonb)
language sql stable security definer set search_path = public as $$
  with r as (
    select _ds_key(e) k, _num0(e->>'so_tam') q, coalesce(co.code, b.title) code, d.id doc
    from batches b join docs d on d.batch_id = b.id and d.company = 'PN' left join co_orders co on co.doc_id = d.id,
         jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
    where b.proc = 'QT1' and b.status <> 'fail' and d.status <> 'fail' and (p_skip is null or d.id <> p_skip)
      and (b.src_qt0 = p_qt0 or (b.src_qt0 is null and b.order_id = (select order_id from batches where id = p_qt0))))
  select k, sum(q), jsonb_agg(jsonb_build_object('code', code, 'q', q, 'doc', doc)) from r where q > 0 and k <> '' group by k $$;

create or replace function public._qt0_guard() returns trigger language plpgsql security definer set search_path = public as $function$
declare ord uuid; bad text;
begin
  if new.company <> 'PN' or new.status = 'fail' then return new; end if;
  if tg_op = 'UPDATE' and new.tables is not distinct from old.tables and new.status is not distinct from old.status then return new; end if;
  select b.order_id into ord from batches b where b.id = new.batch_id and b.proc = 'QT1'; if ord is null then return new; end if;
  with pool as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) tot from batches b join docs d on d.batch_id = b.id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
                where b.order_id = ord and b.proc = 'QT0' and b.status = 'hoan_tat' group by 1),
       other as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from batches b join docs d on d.batch_id = b.id and d.company = 'PN', jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
                 where b.order_id = ord and b.proc = 'QT1' and b.status <> 'fail' and d.status <> 'fail' and d.id <> new.id group by 1),
       me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
  select string_agg(me.k || ': bóc tách ' || p.tot || ', đơn khác đã lấy ' || coalesce(o.q, 0) || ', đơn này ' || me.q, '; ') into bad
  from me join pool p on p.k = me.k left join other o on o.k = me.k
  where me.k <> '' and me.q > p.tot - coalesce(o.q, 0);
  if bad is not null then raise exception 'Vượt số tấm bóc tách: %', bad; end if;
  return new;
end $function$;

-- Chặn tạo XNĐH từ lần bóc tách đã lấy hết
create or replace function public._qt0_new_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare tot numeric; used numeric;
begin
  if new.proc <> 'QT1' or new.src_qt0 is null then return new; end if;
  select coalesce(sum(_num0(e->>'so_tam')), 0) into tot from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.batch_id = new.src_qt0;
  select coalesce(sum(q), 0) into used from _qt0_used(new.src_qt0);
  if tot > 0 and used >= tot then raise exception '% đã lấy hết % tấm – không tạo thêm XNĐH từ lần bóc tách này', (select title from batches where id = new.src_qt0), tot; end if;
  return new;
end $$;
drop trigger if exists qt0_new_guard on batches;
create trigger qt0_new_guard before insert on batches for each row execute function _qt0_new_guard();
