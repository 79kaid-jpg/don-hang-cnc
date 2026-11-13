-- Thông báo chặn checklist: kèm tên các mục chưa tích
create or replace function public._checklist_gate() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare pr text; fl text[]; i_old int; i_new int; miss int; fwd boolean; lbl text;
begin
  if new.status = old.status then return new; end if;
  select proc into pr from batches where id = new.batch_id;
  fl := case pr when 'QT0' then array['tiep_nhan','boc_tach','tao_ds','kiem_tra','duyet'] else array['lap','kiem_tra','duyet'] end;
  i_old := array_position(fl, old.status); i_new := array_position(fl, new.status);
  fwd := new.status in ('da_duyet','duyet_them') or (i_old is not null and i_new is not null and i_new > i_old);
  if not fwd or old.status in ('da_duyet','fail') then return new; end if;
  select count(*), string_agg(x->>'label', ', ') into miss, lbl from jsonb_array_elements(_ck_merge(pr, old.status, old.checklist -> old.status)) x
   where x->>'level' = 'req' and coalesce((x->>'done')::boolean, false) = false;
  if miss > 0 then raise exception 'Còn % mục checklist bắt buộc chưa tích: %', miss, lbl; end if;
  return new;
end $function$;
