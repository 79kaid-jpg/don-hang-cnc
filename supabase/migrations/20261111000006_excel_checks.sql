-- Kiểm tra Excel bóc tách phía máy chủ (edge function excel-check ghi kết quả; không ai khác ghi được)
create table if not exists public.excel_checks (
  path text primary key, ok boolean not null, error text, codes text[] not null default '{}', qty numeric not null default 0, rows int not null default 0,
  checked_by uuid, at timestamptz not null default now());
alter table public.excel_checks enable row level security;
create policy "xem kết quả kiểm Excel" on public.excel_checks for select to authenticated using (true);
grant select on public.excel_checks to authenticated;

-- Chặn QT0 rời bước "Tạo DS" nếu Excel bóc tách chưa được máy chủ kiểm, không hợp lệ hoặc lệch danh sách tấm
create or replace function public._excel_gate() returns trigger language plpgsql security definer set search_path = public as $$
declare f jsonb; c excel_checks; ds_codes text[]; ds_qty numeric; n int := 0;
begin
  if old.status <> 'tao_ds' or new.status not in ('kiem_tra', 'duyet', 'da_duyet') then return new; end if;
  if (select proc from batches where id = new.batch_id) <> 'QT0' then return new; end if;
  select coalesce(array_agg(distinct upper(trim(r->>'ma_tam'))) filter (where coalesce(trim(r->>'ma_tam'), '') <> ''), '{}'),
         coalesce(sum(nullif(replace(r->>'so_tam', ',', '.'), '')::numeric), 0)
    into ds_codes, ds_qty from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) r;
  for f in select * from jsonb_array_elements(coalesce(new.files, '[]')) loop
    continue when f->>'kind' <> 'excel'; n := n + 1;
    select * into c from excel_checks where path = f->>'path';
    if not found then raise exception 'File Excel “%” chưa được máy chủ kiểm tra – tải lại file.', f->>'name'; end if;
    if not c.ok then raise exception 'File Excel “%” không hợp lệ: %', f->>'name', c.error; end if;
    if not (array(select distinct unnest(c.codes) order by 1) = array(select unnest(ds_codes) order by 1)) or c.qty <> ds_qty then
      raise exception 'File Excel “%” lệch danh sách tấm (file % mã/% tấm, danh sách % mã/% tấm).', f->>'name', cardinality(array(select distinct unnest(c.codes))), c.qty, cardinality(ds_codes), ds_qty; end if;
  end loop;
  if n = 0 then raise exception 'Chưa đính kèm Excel bóc tách chi tiết.'; end if;
  return new;
end $$;
drop trigger if exists excel_gate on public.docs;
create trigger excel_gate before update of status on public.docs for each row execute function public._excel_gate();
revoke execute on function public._excel_gate() from public, anon, authenticated;
