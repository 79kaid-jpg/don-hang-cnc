-- Bucket riêng tư cho bản vẽ, PDF đã ký, ảnh. Đường dẫn: <order_id>/<loại>/<tên file>
insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;

create policy "đọc file" on storage.objects for select to authenticated using (bucket_id = 'files');
create policy "tải file" on storage.objects for insert to authenticated with check (bucket_id = 'files');
create policy "IT xoá file" on storage.objects for delete to authenticated using (bucket_id = 'files' and public.has_role('admin_it'));
