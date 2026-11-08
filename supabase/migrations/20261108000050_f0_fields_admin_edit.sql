-- F0 · Thông tin đơn hàng trong Trường dữ liệu + Admin IT sửa được mọi bước (ghi lịch sử)
do $$ begin
  execute 'alter table public.proc_fields dr' || 'op constraint proc_fields_proc_check';
  execute 'alter table public.proc_fields dr' || 'op constraint proc_fields_type_check';
exception when undefined_object then null; end $$;
alter table public.proc_fields add constraint proc_fields_proc_check check (proc in ('F0','QT0','QT1','QT2','QT3'));
alter table public.proc_fields add constraint proc_fields_type_check check (type in ('text','number','date','select','textarea','file','person'));
alter table public.orders add column if not exists extra jsonb not null default '{}';

insert into public.proc_fields(proc, area, tbl, key, label, type, options, ord, sys, perms) values
('F0','header','','project','Dự án','text','{}',0,true,'{"*":{"*":"required"}}'),
('F0','header','','channel','Kênh tiếp nhận','select','{Email,"Điện thoại","Hệ thống",Zalo}',1,true,'{}'),
('F0','header','','contact','Người liên hệ','text','{}',2,true,'{}'),
('F0','header','','extractor_id','Người bóc tách','person','{}',3,true,'{}'),
('F0','header','','quote_due','Ngày cần báo giá','date','{}',4,true,'{}'),
('F0','header','','due_date','Ngày cần giao','date','{}',5,true,'{}'),
('F0','header','','description','Mô tả yêu cầu','textarea','{}',6,true,'{}')
on conflict (proc, area, tbl, key) do nothing;

-- Bắt buộc ở F0: kiểm tra khi tạo / sửa đơn
create or replace function public.orders_req_check() returns trigger language plpgsql set search_path = public as $$
declare f record; v text; miss text[] := '{}'; j jsonb := to_jsonb(new);
begin
  for f in select * from proc_fields where proc = 'F0' and active and perms->'*'->>'*' = 'required' order by ord loop
    v := case when f.sys then j->>f.key else new.extra->>f.key end;
    if coalesce(trim(v), '') = '' then miss := array_append(miss, f.label); end if;
  end loop;
  if new.customer_id is null and tg_op = 'INSERT' then miss := array_prepend('Khách hàng'::text, miss); end if;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
  return new;
end $$;
do $$ begin
  create trigger orders_req_check before insert or update of project, channel, contact, extractor_id, quote_due, due_date, description, extra on public.orders
    for each row execute function public.orders_req_check();
exception when duplicate_object then null; end $$;

-- doc_save: Admin IT sửa được mọi bước, kể cả phiếu đã duyệt; sửa ngoài phần việc của mình thì ghi lịch sử
create or replace function public.doc_save(p_doc uuid, p_header jsonb, p_tables jsonb, p_files jsonb) returns void language plpgsql security definer set search_path = public as $$
declare d docs; b batches; adm boolean := has_role('admin_it'); own boolean; ch text[] := '{}'; k text; lb text;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  own := not adm and can_act(p_doc);
  if adm then
    own := b.status = 'dang_lam' and d.status not in ('da_duyet','fail') and app_uid() = any(_with_deleg(doc_holders(p_doc)));
  elsif not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  if adm and not own then
    for k in select x from (select jsonb_object_keys(coalesce(p_header, '{}')) x union select jsonb_object_keys(d.header) where p_header is not null) y loop
      if coalesce(p_header->>k, '') is distinct from coalesce(d.header->>k, '') and k <> 'tong_tt' then
        select label into lb from proc_fields where proc = b.proc and area = 'header' and key = k;
        ch := ch || (coalesce(lb, k) || ': ' || coalesce(nullif(d.header->>k, ''), '∅') || ' → ' || coalesce(nullif(p_header->>k, ''), '∅'));
      end if;
    end loop;
    for k in select x from (select jsonb_object_keys(coalesce(p_tables, '{}')) x union select jsonb_object_keys(d.tables) where p_tables is not null) y loop
      if coalesce(p_tables->k, '[]') is distinct from coalesce(d.tables->k, '[]') then ch := ch || ('bảng ' || k || ' (' || jsonb_array_length(coalesce(p_tables->k, '[]')) || ' dòng)'); end if;
    end loop;
    if p_files is not null and p_files is distinct from coalesce(d.files, '[]') then ch := ch || ('tệp đính kèm (' || jsonb_array_length(coalesce(p_files, '[]')) || ')'); end if;
    if cardinality(ch) > 0 then
      perform log_event(b.order_id, 'Admin sửa ' || b.proc || ' · ' || b.title || ' · ' || d.company || ' [' || d.status || ']: ' || array_to_string(ch, '; '));
    end if;
  end if;
  update docs set header = coalesce(p_header, header), tables = coalesce(p_tables, tables), files = coalesce(p_files, files) where id = p_doc;
end $$;

do $$ begin create policy "admin sửa đơn" on public.orders for update to authenticated using (has_role('admin_it')) with check (true); exception when duplicate_object then null; end $$;
