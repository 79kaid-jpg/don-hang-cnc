-- Mẫu in Excel (applied via MCP)
create table if not exists print_templates (
  id uuid primary key default gen_random_uuid(), proc text not null, company text, name text not null, path text not null, file_name text,
  version int not null default 1, vars text[] default '{}', active boolean not null default true, created_by uuid default app_uid(), created_at timestamptz default now());
alter table print_templates enable row level security;
create policy "đọc mẫu in" on print_templates for select to authenticated using (true);
create policy "IT sửa mẫu in" on print_templates for all to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));
