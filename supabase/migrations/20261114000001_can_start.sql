-- Có được mở hồ sơ mới của quy trình p_proc cho công ty p_co không (để hiện nút "Tạo QT tiếp theo")
create or replace function public.can_start(p_proc text, p_co text) returns boolean language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or has_role('admin_cnc') or _is_person(p_proc, p_co, case when p_proc = 'QT0' then 'admin' else 'lap' end);
$$;
grant execute on function public.can_start(text, text) to authenticated;
