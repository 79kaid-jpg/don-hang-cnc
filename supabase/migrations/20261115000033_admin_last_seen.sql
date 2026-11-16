-- Lần đăng nhập / hoạt động gần nhất – chỉ Admin IT
create or replace function public.admin_last_seen()
returns table(id uuid, last_sign_in timestamptz, last_active timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.last_sign_in_at,
         greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id))
  from auth.users u
  where public.has_role('admin_it');
$$;
revoke all on function public.admin_last_seen() from public, anon;
grant execute on function public.admin_last_seen() to authenticated;
