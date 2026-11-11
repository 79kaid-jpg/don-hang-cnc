-- Đợt 1: Danh mục dự án (mã dự án xuyên suốt, khách cuối, admin đóng dự án)
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{2,12}$'),
  name text not null check (length(trim(name)) > 0),
  end_customer_id uuid references public.customers(id),
  location text, note text,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid default auth.uid(), created_at timestamptz not null default now(),
  closed_by uuid, closed_at timestamptz
);
alter table public.projects enable row level security;
create policy "xem dự án" on public.projects for select to authenticated using (true);
create policy "tạo dự án" on public.projects for insert to authenticated
  with check ((has_role('kinh_doanh') or has_role('admin_cnc') or has_role('admin_it')) and status = 'open');
create policy "sửa dự án" on public.projects for update to authenticated
  using ((has_role('kinh_doanh') or has_role('admin_cnc') or has_role('admin_it')) and status = 'open')
  with check (status = 'open');
grant select, insert, update on public.projects to authenticated;

alter table public.orders add column project_id uuid references public.projects(id);
create index on public.orders(project_id);

-- Tên dự án trên đơn luôn theo danh mục (giữ cột orders.project cho các màn cũ)
create or replace function public._order_project_name() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.project_id is not null then select name into new.project from projects where id = new.project_id; end if;
  return new;
end $$;
create trigger order_project_name before insert or update of project_id, project on public.orders for each row execute function public._order_project_name();
create or replace function public._project_rename() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then update orders set project = new.name where project_id = new.id; end if;
  return new;
end $$;
create trigger project_rename after update of name on public.projects for each row execute function public._project_rename();
revoke execute on function public._order_project_name(), public._project_rename() from public, anon, authenticated;

-- Đóng / mở lại dự án: chỉ admin
create or replace function public.project_close(p uuid, close boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not (has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Chỉ admin được đóng/mở dự án'; end if;
  update projects set status = case when close then 'closed' else 'open' end,
    closed_by = case when close then auth.uid() end, closed_at = case when close then now() end where id = p;
end $$;
revoke execute on function public.project_close(uuid, boolean) from public, anon;
grant execute on function public.project_close(uuid, boolean) to authenticated;

-- Chuyển dữ liệu: mỗi tên dự án cũ → 1 dự án (mã = chữ đầu, bỏ dấu; trùng thì thêm số)
do $$
declare r record; base text; c text; i int; pid uuid;
begin
  for r in select distinct on (project) project, customer_id from orders where project is not null and trim(project) <> '' order by project, created_at loop
    base := upper(regexp_replace(translate(split_part(regexp_replace(r.project, '^\[MẪU\]\s*', ''), ' – ', 1), 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ', 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'), '[^A-Za-z0-9 ]', '', 'g'));
    base := coalesce(nullif(left(array_to_string(array(select left(w, 1) from regexp_split_to_table(base, '\s+') w where w <> ''), ''), 8), ''), 'DA');
    if r.project like '[MẪU]%' then base := left('M' || base, 10); end if;
    if length(base) < 2 then base := base || 'X'; end if;
    c := base; i := 1;
    while exists (select 1 from projects where code = c) loop i := i + 1; c := base || i; end loop;
    insert into projects(code, name, end_customer_id, created_by) values (c, r.project, r.customer_id, null) returning id into pid;
    update orders set project_id = pid where project = r.project;
  end loop;
end $$;
