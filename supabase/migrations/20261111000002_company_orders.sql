-- Đợt 2: Đơn hàng theo công ty – mã theo quy tắc, cho sửa, tham chiếu đơn trước
create table public.companies (
  code text primary key check (code ~ '^[A-Z0-9]{2,6}$'),
  name text not null, buyer text references public.companies(code),   -- null = bán cho khách cuối
  rule text not null default '{YYYYMMDD}-{BAN}-{MUA}-{DA}/{STT:2}',
  allow_edit boolean not null default false, ord int not null default 0
);
insert into public.companies(code, name, buyer, ord) values ('HW','Hanwa',null,3),('IPC','IPC','HW',2),('PN','Phương Nam CNC','IPC',1);
alter table public.companies enable row level security;
create policy "xem công ty" on public.companies for select to authenticated using (true);
create policy "admin sửa công ty" on public.companies for update to authenticated using (has_role('admin_it') or has_role('admin_cnc')) with check (true);
grant select, update (rule, allow_edit, name) on public.companies to authenticated;

create table public.co_counters (company text references public.companies(code), day date, last int not null default 0, primary key (company, day));
alter table public.co_counters enable row level security;

create table public.co_orders (
  id uuid primary key default gen_random_uuid(),
  company text not null references public.companies(code),
  code text not null unique, code_auto text not null, edited boolean not null default false,
  buyer text, project_id uuid references public.projects(id),
  order_id uuid references public.orders(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete cascade,
  doc_id uuid unique references public.docs(id) on delete cascade,
  ref_id uuid references public.co_orders(id) on delete set null,
  created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
create index on public.co_orders(project_id); create index on public.co_orders(order_id);
alter table public.co_orders enable row level security;
create policy "xem đơn công ty" on public.co_orders for select to authenticated using (true);
grant select on public.co_orders to authenticated;

-- Ghép mã theo quy tắc: {YYYYMMDD} {YYMMDD} {BAN} {MUA} {DA} {STT:n}
create or replace function public._co_make_code(p_co text, p_order uuid) returns text language plpgsql security definer set search_path = public as $$
declare c companies; d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; n int; mua text; da text; s text; w int;
begin
  select * into c from companies where code = p_co; if not found then return null; end if;
  if c.buyer is not null then mua := c.buyer;
  else select coalesce(nullif(cu.code, ''), 'KH') into mua from orders o left join projects p on p.id = o.project_id left join customers cu on cu.id = coalesce(p.end_customer_id, o.customer_id) where o.id = p_order; end if;
  select p.code into da from orders o left join projects p on p.id = o.project_id where o.id = p_order;
  insert into co_counters(company, day, last) values (p_co, d, 1) on conflict (company, day) do update set last = co_counters.last + 1 returning last into n;
  s := c.rule;
  s := replace(s, '{YYYYMMDD}', to_char(d, 'YYYYMMDD')); s := replace(s, '{YYMMDD}', to_char(d, 'YYMMDD'));
  s := replace(s, '{BAN}', p_co); s := replace(s, '{MUA}', coalesce(mua, 'KH')); s := replace(s, '{DA}', coalesce(da, 'DA'));
  w := coalesce((regexp_match(s, '\{STT:(\d)\}'))[1]::int, 2);
  s := regexp_replace(s, '\{STT(:\d)?\}', lpad(n::text, w, '0'));
  while exists (select 1 from co_orders where code = s) loop s := s || '-' || n; end loop;  -- an toàn nếu mẫu không có STT
  return s;
end $$;

-- Tạo XNĐH (QT1) của một công ty → cấp mã, gắn đơn công ty
create or replace function public._co_doc_before() returns trigger language plpgsql security definer set search_path = public as $$
declare pr text; oid uuid;
begin
  select b.proc, b.order_id into pr, oid from batches b where b.id = new.batch_id;
  if pr = 'QT1' then new.header := coalesce(new.header, '{}'::jsonb) || jsonb_build_object('so_xn', _co_make_code(new.company, oid)); end if;
  return new;
end $$;
create or replace function public._co_doc_after() returns trigger language plpgsql security definer set search_path = public as $$
declare b batches; c companies; ref uuid;
begin
  select * into b from batches where id = new.batch_id; if b.proc <> 'QT1' then return null; end if;
  select * into c from companies where code = new.company;
  select co.id into ref from co_orders co join companies s on s.code = co.company where co.batch_id = new.batch_id and s.buyer = new.company limit 1;
  insert into co_orders(company, code, code_auto, buyer, project_id, order_id, batch_id, doc_id, ref_id)
    select new.company, new.header->>'so_xn', new.header->>'so_xn', c.buyer, o.project_id, o.id, b.id, new.id, ref from orders o where o.id = b.order_id;
  return null;
end $$;
create trigger co_doc_before before insert on public.docs for each row execute function public._co_doc_before();
create trigger co_doc_after after insert on public.docs for each row execute function public._co_doc_after();
-- Số XNĐH trên chứng từ luôn = mã đơn công ty (chỉ đổi qua co_set_code)
create or replace function public._co_doc_keep() returns trigger language plpgsql security definer set search_path = public as $$
declare k text;
begin
  select code into k from co_orders where doc_id = new.id;
  if k is not null and new.header->>'so_xn' is distinct from k then new.header := new.header || jsonb_build_object('so_xn', k); end if;
  return new;
end $$;
create trigger co_doc_keep before update of header on public.docs for each row execute function public._co_doc_keep();
revoke execute on function public._co_make_code(text, uuid), public._co_doc_before(), public._co_doc_after(), public._co_doc_keep() from public, anon, authenticated;

-- Sửa mã (khi công ty bật cho sửa) – người đang được làm hồ sơ hoặc admin
create or replace function public.co_set_code(p_doc uuid, p_code text) returns text language plpgsql security definer set search_path = public as $$
declare co co_orders; k text := upper(trim(p_code));
begin
  select * into co from co_orders where doc_id = p_doc; if not found then raise exception 'Không tìm thấy đơn công ty'; end if;
  if not (select allow_edit from companies where code = co.company) and not has_role('admin_it') then raise exception 'Công ty % không cho sửa mã đơn', co.company; end if;
  if not (can_act(p_doc) or has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Bạn không có quyền sửa mã đơn này'; end if;
  if k = '' or length(k) > 60 then raise exception 'Mã đơn không hợp lệ'; end if;
  if exists (select 1 from co_orders where code = k and id <> co.id) then raise exception 'Mã % đã có', k; end if;
  update co_orders set code = k, edited = (k <> code_auto) where id = co.id;
  update docs set header = header || jsonb_build_object('so_xn', k) where id = p_doc;
  return k;
end $$;
-- Chọn / bỏ tham chiếu đơn công ty trước (không bắt buộc)
create or replace function public.co_set_ref(p_doc uuid, p_ref uuid) returns void language plpgsql security definer set search_path = public as $$
declare co co_orders; r co_orders;
begin
  select * into co from co_orders where doc_id = p_doc; if not found then raise exception 'Không tìm thấy đơn công ty'; end if;
  if not (can_act(p_doc) or has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Bạn không có quyền'; end if;
  if p_ref is not null then select * into r from co_orders where id = p_ref;
    if not found or not exists (select 1 from companies where code = r.company and buyer = co.company) then raise exception 'Chỉ chọn được đơn của công ty bán cho %', co.company; end if; end if;
  update co_orders set ref_id = p_ref where id = co.id;
end $$;
-- Chép danh sách tấm từ đơn tham chiếu (bỏ giá – mỗi công ty tự nhập)
create or replace function public.co_copy_ref(p_doc uuid) returns int language plpgsql security definer set search_path = public as $$
declare co co_orders; t jsonb; rows jsonb;
begin
  select * into co from co_orders where doc_id = p_doc; if co.ref_id is null then raise exception 'Chưa chọn đơn tham chiếu'; end if;
  if not (can_act(p_doc) or has_role('admin_it')) then raise exception 'Bạn không có quyền'; end if;
  select d.tables into t from co_orders r join docs d on d.id = r.doc_id where r.id = co.ref_id;
  select coalesce(jsonb_agg(x - 'don_gia' - 'tt'), '[]') into rows from jsonb_array_elements(coalesce(t->'ds', '[]')) x;
  update docs set tables = coalesce(tables, '{}') || jsonb_build_object('ds', rows) where id = p_doc;
  return jsonb_array_length(rows);
end $$;
revoke execute on function public.co_set_code(uuid, text), public.co_set_ref(uuid, uuid), public.co_copy_ref(uuid) from public, anon;
grant execute on function public.co_set_code(uuid, text), public.co_set_ref(uuid, uuid), public.co_copy_ref(uuid) to authenticated;
-- Xem trước mã (Quản trị → Đánh số), không tăng bộ đếm
create or replace function public.co_preview(p_rule text, p_co text) returns text language sql stable security definer set search_path = public as $$
  select regexp_replace(replace(replace(replace(replace(replace(p_rule, '{YYYYMMDD}', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')), '{YYMMDD}', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD')),
    '{BAN}', p_co), '{MUA}', coalesce((select buyer from companies where code = p_co), 'KHCUOI')), '{DA}', 'SLUC'), '\{STT(:\d)?\}', '01')
$$;
grant execute on function public.co_preview(text, text) to authenticated;
