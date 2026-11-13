-- Phiếu đã chốt: không thêm ghi chú nối tiếp (đã áp dụng qua MCP)
create or replace function public.doc_note(p_doc uuid, p_text text) returns void language plpgsql security definer set search_path = public as $$
declare d docs; b batches;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if coalesce(trim(p_text), '') = '' then return; end if;
  if d.status in ('da_duyet', 'fail') then raise exception 'Phiếu đã chốt – không thêm ghi chú được.'; end if;
  if not (can_act(p_doc) or _is_person(b.proc, d.company, 'kiem_tra') or _is_person(b.proc, d.company, 'duyet')) then raise exception 'Không có quyền ghi chú'; end if;
  update docs set notes = notes || jsonb_build_array(jsonb_build_object('role', _role_of(b.proc, d.status), 'user', public.app_uid(), 'at', now(), 'text', trim(p_text))) where id = p_doc;
end $$;
