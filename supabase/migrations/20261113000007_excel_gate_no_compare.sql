-- Excel bóc tách: chỉ kiểm file hợp lệ, không so với danh sách tấm (đã áp dụng qua MCP)
create or replace function public._excel_gate() returns trigger language plpgsql security definer set search_path = public as $$
declare f jsonb; c excel_checks; n int := 0;
begin
  if old.status <> 'tao_ds' or new.status not in ('kiem_tra', 'duyet', 'da_duyet') then return new; end if;
  if (select proc from batches where id = new.batch_id) <> 'QT0' then return new; end if;
  for f in select * from jsonb_array_elements(coalesce(new.files, '[]')) loop
    continue when f->>'kind' <> 'excel'; n := n + 1;
    select * into c from excel_checks where path = f->>'path';
    if not found then raise exception 'File Excel “%” chưa được máy chủ kiểm tra – tải lại file.', f->>'name'; end if;
    if not c.ok then raise exception 'File Excel “%” không hợp lệ: %', f->>'name', c.error; end if;
  end loop;
  if n = 0 then raise exception 'Chưa đính kèm Excel bóc tách chi tiết.'; end if;
  return new;
end $$;
