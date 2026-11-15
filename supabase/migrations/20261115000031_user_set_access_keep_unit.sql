-- user_set_access: chỉ tự điền đơn vị khi trống/Khác/IT, không ghi đè lựa chọn của admin
create or replace function user_set_access(p_user uuid, p_admin boolean, p_cos jsonb) returns void language plpgsql security definer set search_path=public as $$
declare k text; un text[] := '{}';
begin
  if not has_role('admin_it') then raise exception 'Chỉ admin IT'; end if;
  if p_user = app_uid() and not p_admin then raise exception 'Không tự bỏ quyền admin IT của mình'; end if;
  delete from user_co_roles where user_id = p_user and not (p_cos ? company);
  for k in select jsonb_object_keys(p_cos) loop
    if k not in ('PN','IPC','HW') then raise exception 'Công ty không hợp lệ: %', k; end if;
    insert into user_co_roles(user_id, company, roles) values (p_user, k, array(select jsonb_array_elements_text(p_cos -> k)))
      on conflict (user_id, company) do update set roles = excluded.roles;
    un := un || array(select jsonb_array_elements_text(p_cos -> k));
  end loop;
  update profiles set roles = array(select distinct x from unnest(un || case when p_admin then array['admin_it'] else '{}'::text[] end) x),
    unit = case when coalesce(unit,'') in ('','IT','KHAC')
      then coalesce((select case j when 'PN' then 'CNC' when 'HW' then 'HANWA' else j end from jsonb_object_keys(p_cos) j order by case j when 'PN' then 1 when 'IPC' then 2 else 3 end limit 1), unit) else unit end
  where id = p_user;
end $$;
