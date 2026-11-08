-- Bảng bắt buộc có ít nhất 1 dòng có dữ liệu (cấu hình theo bước × công ty ở Quản trị → Trường dữ liệu)
alter table public.proc_fields drop constraint if exists proc_fields_area_check;
alter table public.proc_fields add constraint proc_fields_area_check check (area in ('header','col','file','table'));
insert into public.proc_fields(proc, area, tbl, key, label, type, ord, sys, perms) values
 ('QT0','table','','ds','Danh sách tấm','text',0,true,'{"PN":{"tao_ds":"required"}}'),
 ('QT1','table','','ds','Danh sách tấm (XNĐH)','text',0,true,'{}'),
 ('QT2','table','','nl','Bảng 1 – Thông tin xuất hàng','text',0,true,'{}'),
 ('QT2','table','','tp','Bảng 2 – Thông tin nhập hàng','text',1,true,'{}'),
 ('QT3','table','','tp','Danh sách thành phẩm đợt giao','text',0,true,'{}')
on conflict (proc, area, tbl, key) do nothing;
create or replace function public._req_check(p_doc uuid) returns void language plpgsql stable security definer set search_path = public as $$
declare d docs; b batches; st text; miss text[] := '{}'; f record; hk text[];
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  st := case when d.status = 'duyet_them' then 'duyet' else d.status end;
  hk := hidden_keys(b.proc, d.company);
  for f in select * from proc_fields where proc = b.proc and active and perms->d.company->>st = 'required' order by area, ord loop
    if (case when f.area = 'header' then 'h:' || f.key else f.tbl || ':' || f.key end) = any(hk) then continue; end if;
    if f.area = 'table' and not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.tables->f.key) = 'array' then d.tables->f.key else '[]' end) x
                   where jsonb_typeof(x) = 'object' and exists (select 1 from jsonb_each_text(x) e where e.key <> '_id' and trim(coalesce(e.value, '')) <> ''))
      then miss := miss || ('Bảng ' || f.label || ' (chưa có dòng nào)');
    elsif f.area = 'header' and coalesce(trim(d.header->>f.key), '') = '' then miss := miss || f.label;
    elsif f.area = 'file' and not exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) x where x->>'kind' = f.key) then miss := miss || ('Tệp: ' || f.label);
    elsif f.area = 'col' and f.sys = false and exists (select 1 from jsonb_array_elements(coalesce(d.tables->f.tbl, '[]')) x where coalesce(trim(x->>f.key), '') = '')
      then miss := miss || ('Cột ' || f.label);
    end if;
  end loop;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
end $$;
revoke execute on function public._req_check(uuid) from public, anon, authenticated;
