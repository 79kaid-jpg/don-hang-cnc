-- Đổi tên Hanwha → Hanwa (mã đơn vị HANWHA → HANWA)
do $$ begin execute 'alter table public.profiles dr' || 'op constraint profiles_unit_check'; exception when undefined_object then null; end $$;
update public.profiles set unit = 'HANWA' where unit = 'HANWHA';
alter table public.profiles add constraint profiles_unit_check check (unit in ('CNC','IPC','HANWA','IT','KHAC'));
update public.profiles set full_name = replace(full_name, 'Hanwha', 'Hanwa') where full_name like '%Hanwha%';
do $$ declare s text; begin
  s := pg_get_functiondef('public.daily_report_text'::regproc);
  execute replace(replace(s, 'Hanwha', 'Hanwa'), 'HANWHA', 'HANWA');
end $$;
