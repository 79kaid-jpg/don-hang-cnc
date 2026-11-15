-- Xem phiếu: mọi công ty người dùng có quyền (user_co_roles / được gán bước), không chỉ theo Đơn vị
create or replace function doc_visible(p_company text, p_proc text) returns boolean language sql stable security definer set search_path=public as $$
  select is_adm() or p_proc = 'QT0' or p_company = app_company() or p_company = any(user_cos(app_uid()));
$$;
