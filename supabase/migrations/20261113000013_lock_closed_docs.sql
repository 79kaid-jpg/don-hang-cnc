-- Phiếu đã Duyệt / Thất bại: không sửa đầu phiếu, bảng; chỉ thêm Bản ký lưu trữ (đã áp dụng qua MCP)
create or replace function public._closed_doc_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status not in ('da_duyet', 'fail') or new.status <> old.status or auth.uid() is null then return new; end if;
  if new.header is distinct from old.header or new.tables is distinct from old.tables then
    raise exception 'Phiếu đã % – không sửa được. Cần sửa thì dùng Trả về để duyệt lại.', case old.status when 'fail' then 'Thất bại' else 'duyệt' end; end if;
  if new.files is distinct from old.files and exists (
      select 1 from jsonb_array_elements(coalesce(old.files, '[]')) f where not exists (select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'path' = f->>'path'))
    then raise exception 'Phiếu đã chốt – không gỡ file được.'; end if;
  if new.files is distinct from old.files and exists (
      select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'kind' <> 'ban_ky'
        and not exists (select 1 from jsonb_array_elements(coalesce(old.files, '[]')) f where f->>'path' = n->>'path'))
    then raise exception 'Phiếu đã chốt – chỉ thêm được Bản ký lưu trữ.'; end if;
  return new;
end $$;
drop trigger if exists docs_closed_guard on public.docs;
create trigger docs_closed_guard before update on public.docs for each row execute function public._closed_doc_guard();
