-- Kế hoạch sản lượng theo tháng (tấn) – dùng cho trang Thống kê sản lượng
create table if not exists public.monthly_plans (
  month date primary key check (extract(day from month) = 1),
  tons numeric not null check (tons >= 0),
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.monthly_plans enable row level security;
create policy "xem kế hoạch tháng" on public.monthly_plans for select to authenticated using (true);
create policy "admin sửa kế hoạch tháng" on public.monthly_plans for all to authenticated
  using ((select public.is_real_admin())) with check ((select public.is_real_admin()));
