-- 1) Người tạo chứng từ luôn xem được chứng từ của mình (sửa lỗi INSERT…RETURNING bị chặn khi duyệt)
drop policy if exists doc_records_read on doc_records;
create policy doc_records_read on doc_records for select using (by_user = app_uid() or rec_visible2(doc_id, kind, proc, company, has_secret));

-- 2) Nhật ký lỗi ứng dụng – Admin IT xem
create table if not exists app_errors (
  id bigserial primary key, at timestamptz not null default now(), user_id uuid default app_uid(), real_user uuid default auth.uid(),
  kind text, message text, detail text, url text, ua text, app_ver text);
create index if not exists app_errors_at on app_errors(at desc);
alter table app_errors enable row level security;
drop policy if exists app_errors_read on app_errors;
create policy app_errors_read on app_errors for select using (has_role('admin_it'));
drop policy if exists app_errors_del on app_errors;
create policy app_errors_del on app_errors for delete using (has_role('admin_it'));

create or replace function public.log_error(p_kind text, p_message text, p_detail text, p_url text, p_ua text, p_ver text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- chống spam: tối đa 30 lỗi / người / phút
  if (select count(*) from app_errors where real_user = auth.uid() and at > now() - interval '1 minute') >= 30 then return; end if;
  insert into app_errors(kind, message, detail, url, ua, app_ver) values (left(p_kind, 40), left(p_message, 1000), left(p_detail, 4000), left(p_url, 500), left(p_ua, 300), left(p_ver, 40));
  delete from app_errors where at < now() - interval '90 days';
end $$;
revoke all on function public.log_error(text, text, text, text, text, text) from public, anon;
grant execute on function public.log_error(text, text, text, text, text, text) to authenticated;
