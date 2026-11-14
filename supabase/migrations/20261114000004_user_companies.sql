-- Công ty một người tham gia: Đơn vị chính + mọi công ty có bước họ phụ trách (trực tiếp hoặc qua nhóm)
create or replace function public.user_cos(p_user uuid) returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct c order by c), '{}') from (
    select case upper(coalesce(unit, '')) when 'CNC' then 'PN' when 'PN' then 'PN' when 'IPC' then 'IPC' when 'HANWA' then 'HW' when 'HW' then 'HW' end c from profiles where id = p_user
    union select cp.company from chain_people cp left join work_groups g on g.id = cp.group_id
      where cp.user_id = p_user or (g.id is not null and p_user = any(g.member_ids))) x where c is not null;
$$;
create or replace function public.my_cos() returns text[] language sql stable security definer set search_path = public as $$ select public.user_cos(app_uid()); $$;
grant execute on function public.my_cos() to authenticated;
grant execute on function public.user_cos(uuid) to authenticated;
-- Cho phép kiêm nhiệm: người phụ trách bước có thể thuộc công ty khác
drop trigger if exists chain_same_co on public.chain_people;
create or replace function public.all_user_cos() returns table(id uuid, cos text[]) language sql stable security definer set search_path = public as $$
  select p.id, public.user_cos(p.id) from profiles p where public.has_role('admin_it') or public.has_role('admin_cnc');
$$;
grant execute on function public.all_user_cos() to authenticated;
