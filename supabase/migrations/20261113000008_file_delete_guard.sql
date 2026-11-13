-- Gỡ file: admin toàn quyền; người khác chỉ gỡ file mình tải, trong đúng bước đã tải (đã áp dụng qua MCP)
create or replace function public._file_del_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare f jsonb;
begin
  if new.files is not distinct from old.files then return new; end if;
  if public.is_real_admin() or public.has_role('admin_it') or public.has_role('admin_cnc') or auth.uid() is null then return new; end if;
  for f in select * from jsonb_array_elements(coalesce(old.files, '[]')) loop
    if not exists (select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'path' = f->>'path') then
      if coalesce(f->>'by', '') <> public.app_uid()::text or coalesce(f->>'step', '') <> old.status then
        raise exception 'Không gỡ được file “%”: chỉ người tải file (trong bước đã tải) hoặc admin được gỡ. Nếu file sai, hãy Trả về cho người tải.', f->>'name';
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists docs_file_del_guard on public.docs;
create trigger docs_file_del_guard before update of files on public.docs for each row execute function public._file_del_guard();
