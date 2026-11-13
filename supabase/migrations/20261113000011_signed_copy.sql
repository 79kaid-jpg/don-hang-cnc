-- PN / IPC: sau khi duyệt XNĐH, người trong chuỗi của công ty đó (hoặc admin) tải bản in đã ký tay để lưu trữ. Không chặn bước nào.
create or replace function public.doc_signed_add(p_doc uuid, p_file jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare d docs; b batches; nf jsonb;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if b.proc <> 'QT1' or d.status <> 'da_duyet' then raise exception 'Chỉ tải bản ký khi XNĐH đã duyệt'; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person('QT1', d.company, 'lap') or _is_person('QT1', d.company, 'kiem_tra') or _is_person('QT1', d.company, 'duyet')) then
    raise exception 'Chỉ người trong chuỗi duyệt của % hoặc admin được tải bản ký', d.company; end if;
  if coalesce(p_file->>'path', '') = '' then raise exception 'Thiếu file'; end if;
  nf := coalesce(d.files, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('kind', 'ban_ky', 'name', p_file->>'name', 'path', p_file->>'path', 'at', now(), 'by', public.app_uid(), 'step', 'da_duyet'));
  update docs set files = nf where id = p_doc;
  perform log_event(b.order_id, 'QT1 · ' || b.title || ' · ' || d.company || ': tải bản ký lưu trữ');
  return nf;
end $$;
grant execute on function public.doc_signed_add(uuid, jsonb) to authenticated;
