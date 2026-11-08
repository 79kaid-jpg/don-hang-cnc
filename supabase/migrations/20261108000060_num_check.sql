-- Kiểm tra kiểu số khi ký: ô đầu phiếu và cột bảng có kiểu Số
create or replace function public._req_check(p_doc uuid) returns void language plpgsql stable security definer set search_path = public as $$
declare d docs; b batches; st text; miss text[] := '{}'; bad text[] := '{}'; f record; n int;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  st := case when d.status = 'duyet_them' then 'duyet' else d.status end;
  for f in select * from proc_fields where proc = b.proc and active and perms->d.company->>st = 'required' order by area, ord loop
    if f.area = 'header' and coalesce(trim(d.header->>f.key), '') = '' then miss := array_append(miss, f.label);
    elsif f.area = 'file' and not exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) x where x->>'kind' = f.key) then miss := array_append(miss, 'Tệp: ' || f.label);
    elsif f.area = 'col' and f.sys = false and exists (select 1 from jsonb_array_elements(coalesce(d.tables->f.tbl, '[]')) x where coalesce(trim(x->>f.key), '') = '')
      then miss := array_append(miss, 'Cột ' || f.label);
    end if;
  end loop;
  for f in select * from proc_fields where proc = b.proc and active and type = 'number' and not sys order by area, ord loop
    if f.area = 'header' and coalesce(trim(d.header->>f.key), '') <> '' and trim(d.header->>f.key) !~ '^\d+([.,]\d+)?$' then bad := array_append(bad, f.label);
    elsif f.area = 'col' then
      select count(*) into n from jsonb_array_elements(coalesce(d.tables->f.tbl, '[]')) x where coalesce(trim(x->>f.key), '') <> '' and trim(x->>f.key) !~ '^\d+([.,]\d+)?$';
      if n > 0 then bad := array_append(bad, f.label || ' (' || n || ' dòng)'); end if;
    end if;
  end loop;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
  if cardinality(bad) > 0 then raise exception 'Sai kiểu số: %', array_to_string(bad, ', '); end if;
end $$;
