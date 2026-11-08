-- Đối tác: loại (khách hàng / vận chuyển / nội bộ), chức vụ người đại diện, danh sách xe; ô Đơn vị vận chuyển ở QT3
alter table public.customers add column if not exists kind text not null default 'khach_hang', add column if not exists position text, add column if not exists vehicles jsonb not null default '[]';
do $$ begin alter table public.customers add constraint customers_kind_check check (kind in ('khach_hang','van_chuyen','noi_bo')); exception when duplicate_object then null; end $$;
update public.customers set kind = 'noi_bo' where code in ('PNCNC','IPC','HANWA');
do $$ begin execute 'alter table public.proc_fields dr' || 'op constraint proc_fields_type_check'; exception when undefined_object then null; end $$;
alter table public.proc_fields add constraint proc_fields_type_check check (type in ('text','number','date','select','textarea','file','person','carrier'));
insert into public.proc_fields(proc, area, tbl, key, label, type, ord, sys, help)
  values ('QT3','header','','dvvc','Đơn vị vận chuyển','carrier',3,false,'Chọn trong Quản trị → Đối tác (loại Đơn vị vận chuyển)') on conflict do nothing;
