-- IPC/Hanwa: phiếu QT1–QT3 chỉ được tạo từ phiếu công ty trước đã duyệt (_auto_next đặt checklist.auto_from); QT1 không vượt số tấm phiếu nguồn
create or replace function public._co_chain_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare b batches; src uuid; bad text;
begin
  if new.company not in ('IPC', 'HW') then return new; end if;
  select * into b from batches where id = new.batch_id;
  if b.proc not in ('QT1', 'QT2', 'QT3') then return new; end if;
  src := nullif(b.checklist->>'auto_from', '')::uuid;
  if src is null then
    if tg_op = 'INSERT' then raise exception 'Đơn % phải tạo từ đơn % đã duyệt (có tham chiếu), không tạo riêng được', new.company, case new.company when 'IPC' then 'PN' else 'IPC' end; end if;
    if new.status is distinct from old.status and new.status not in ('fail') then raise exception 'Đơn % không có tham chiếu % – không chuyển bước được. Chuyển Thất bại hoặc tạo lại từ đơn % đã duyệt', new.company, case new.company when 'IPC' then 'PN' else 'IPC' end, case new.company when 'IPC' then 'PN' else 'IPC' end; end if;
    return new;
  end if;
  if b.proc = 'QT1' and new.status <> 'fail' and (tg_op = 'INSERT' or new.tables is distinct from old.tables) then
    with s as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.id = src group by 1),
         me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
    select string_agg(me.k || ': đơn nguồn ' || coalesce(s.q, 0) || ', đơn này ' || me.q, '; ') into bad
    from me left join s on s.k = me.k where me.k <> '' and me.q > coalesce(s.q, 0);
    if bad is not null then raise exception 'Vượt số tấm của đơn nguồn %: %', doc_code(src), bad; end if;
  end if;
  return new;
end $$;
drop trigger if exists co_chain_guard on docs;
create trigger co_chain_guard before insert or update on docs for each row execute function _co_chain_guard();
