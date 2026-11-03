-- Quy trình theo swimlane (04/11/2026): 4 quy trình chạy riêng; QT1–QT3 mỗi hồ sơ đi qua 3 công ty PN → IPC → Hanwha.
-- batch = một hồ sơ của một quy trình (QT0 bóc tách lần n, QT1 XNĐH n, QT2 lệnh n, QT3 đợt giao n)
-- doc   = bản của một công ty trong hồ sơ đó; bảng dữ liệu lưu jsonb (ds = danh sách tấm, nl = nguyên liệu, tp = thành phẩm)
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  proc text not null check (proc in ('QT0','QT1','QT2','QT3')),
  seq int not null default 1,
  title text not null default '',
  status text not null default 'dang_lam' check (status in ('dang_lam','cho_ky','hoan_tat','fail','huy')),
  checklist jsonb not null default '{}',
  final_files jsonb not null default '[]',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id),
  company text not null check (company in ('PN','IPC','HW')),
  status text not null,
  header jsonb not null default '{}',
  tables jsonb not null default '{}',
  files jsonb not null default '[]',
  notes jsonb not null default '[]',
  signs jsonb not null default '[]',
  status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.chain_people (
  proc text not null, company text not null, role text not null,
  user_id uuid references public.profiles(id), group_id uuid references public.work_groups(id),
  primary key (proc, company, role)
);
alter table public.batches enable row level security;
alter table public.docs enable row level security;
alter table public.chain_people enable row level security;
create policy b_read on public.batches for select to authenticated using (true);
create policy d_read on public.docs for select to authenticated using (true);
create policy cp_read on public.chain_people for select to authenticated using (true);
create policy cp_ins on public.chain_people for insert to authenticated with check (has_role('admin_it'));
create policy cp_upd on public.chain_people for update to authenticated using (has_role('admin_it')) with check (has_role('admin_it'));
grant select on public.batches, public.docs to authenticated;
grant select, insert, update on public.chain_people to authenticated;

-- Thứ tự trạng thái và vai trò phụ trách
create or replace function public._flow(p_proc text) returns text[] language sql immutable as $$
  select case when p_proc = 'QT0' then array['tiep_nhan','boc_tach','tao_ds','kiem_tra','duyet','da_duyet']
              else array['lap','kiem_tra','duyet','da_duyet'] end $$;
create or replace function public._role_of(p_proc text, p_status text) returns text language sql immutable as $$
  select case when p_proc = 'QT0' then case p_status when 'tiep_nhan' then 'admin' when 'boc_tach' then 'ky_thuat'
                when 'tao_ds' then 'admin' when 'kiem_tra' then 'kiem_tra' when 'duyet' then 'duyet' end
              else case p_status when 'lap' then 'lap' when 'kiem_tra' then 'kiem_tra' when 'duyet' then 'duyet' end end $$;
create or replace function public._is_person(p_proc text, p_company text, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role('admin_it') or exists (select 1 from chain_people c where c.proc = p_proc and c.company = p_company and c.role = p_role
    and (c.user_id = auth.uid() or in_group(c.group_id))) $$;
create or replace function public.can_act(p_doc uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select _is_person(b.proc, d.company, _role_of(b.proc, d.status)) from docs d join batches b on b.id = d.batch_id
    where d.id = p_doc and b.status = 'dang_lam'), false) $$;
grant execute on function public.can_act(uuid) to authenticated;

create or replace function public._jarr_len(j jsonb) returns int language sql immutable as $$ select coalesce(jsonb_array_length(case when jsonb_typeof(j) = 'array' then j end), 0) $$;

-- Tạo hồ sơ mới của một quy trình (bản PN đầu tiên)
create or replace function public.batch_create(p_order uuid, p_proc text, p_title text default '', p_opts jsonb default '{}') returns uuid
language plpgsql security definer set search_path = public as $$
declare b uuid; n int; t jsonb := '{}'; q0 uuid; ck jsonb := coalesce(p_opts->'checklist', '{}');
begin
  if not _is_person(p_proc, 'PN', case when p_proc = 'QT0' then 'admin' else 'lap' end) then raise exception 'Bạn không phụ trách lập hồ sơ % của Phương Nam CNC', p_proc; end if;
  if p_proc = 'QT2' and (select count(*) from jsonb_each_text(ck) where value = 'true') < 5 then
    raise exception 'Chưa đủ 5 điều kiện: bóc tách đã duyệt, đủ vật tư, đủ công cụ, vấn đề kỹ thuật đã xử lý, đã công bố tiêu chuẩn QC'; end if;
  if p_proc = 'QT1' and coalesce((p_opts->>'use_qt0')::boolean, false) then
    select d.tables into t from docs d join batches x on x.id = d.batch_id
      where x.order_id = p_order and x.proc = 'QT0' and x.status = 'hoan_tat' order by x.done_at desc limit 1;
    if t is null then raise exception 'Chưa có danh sách tấm QT0 đã duyệt để lấy'; end if;
    t := jsonb_build_object('ds', coalesce(t->'ds', '[]'));
  end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = p_order and proc = p_proc;
  insert into batches(order_id, proc, seq, title, checklist) values (p_order, p_proc, n,
    coalesce(nullif(trim(p_title), ''), case p_proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end || n), ck)
    returning id into b;
  insert into docs(batch_id, company, status, tables) values (b, 'PN', (_flow(p_proc))[1], coalesce(t, '{}'));
  perform log_event(p_order, 'Mở ' || p_proc || ' · ' || (select title from batches where id = b));
  return b;
end $$;

-- Lưu nội dung bản đang làm (chỉ người phụ trách bước hiện tại)
create or replace function public.doc_save(p_doc uuid, p_header jsonb, p_tables jsonb, p_files jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  update docs set header = coalesce(p_header, header), tables = coalesce(p_tables, tables), files = coalesce(p_files, files) where id = p_doc;
end $$;

create or replace function public.doc_note(p_doc uuid, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare d docs; b batches;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if coalesce(trim(p_text), '') = '' then return; end if;
  if not (can_act(p_doc) or _is_person(b.proc, d.company, 'kiem_tra') or _is_person(b.proc, d.company, 'duyet')) then raise exception 'Không có quyền ghi chú'; end if;
  update docs set notes = notes || jsonb_build_array(jsonb_build_object('role', _role_of(b.proc, d.status), 'user', auth.uid(), 'at', now(), 'text', trim(p_text))) where id = p_doc;
end $$;

-- Chuyển bước: next (ký, sang bước sau) · back (trả về, bắt buộc lý do) · fail (chỉ QT0 ở bước Duyệt)
create or replace function public.doc_advance(p_doc uuid, p_action text, p_note text default '') returns text
language plpgsql security definer set search_path = public as $$
declare d docs; b batches; fl text[]; i int; nxt text; nc text; r text;
begin
  select * into d from docs where id = p_doc for update; select * into b from batches where id = d.batch_id;
  if not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  fl := _flow(b.proc); i := array_position(fl, d.status); r := _role_of(b.proc, d.status);
  if p_action = 'next' then
    -- điều kiện từng bước
    if b.proc = 'QT0' and d.status = 'boc_tach' and not exists (select 1 from jsonb_array_elements(d.files) f where f->>'kind' = 'excel') then
      raise exception 'Bắt buộc đính kèm file Excel bóc tách chi tiết'; end if;
    if b.proc = 'QT0' and d.status = 'tao_ds' and _jarr_len(d.tables->'ds') = 0 then raise exception 'Chưa có danh sách tấm'; end if;
    if b.proc = 'QT1' and d.status = 'lap' then
      if _jarr_len(d.tables->'ds') = 0 then raise exception 'Chưa có danh sách tấm'; end if;
      if exists (select 1 from jsonb_array_elements(d.tables->'ds') x where coalesce((x->>'don_gia')::numeric, 0) <= 0) then raise exception 'Còn dòng chưa có đơn giá'; end if;
    end if;
    if b.proc = 'QT2' and d.status = 'lap' then
      if coalesce(d.header->>'so_lenh', '') = '' then raise exception 'Nhập số lệnh gia công của công ty'; end if;
      if _jarr_len(d.tables->'nl') = 0 or _jarr_len(d.tables->'tp') = 0 then raise exception 'Cần đủ 2 bảng nguyên liệu và thành phẩm'; end if;
    end if;
    if b.proc = 'QT3' and d.status = 'lap' and _jarr_len(d.tables->'tp') = 0 then raise exception 'Chưa có danh sách thành phẩm của đợt giao'; end if;
    nxt := fl[i + 1];
    update docs set status = nxt, status_at = now(),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', auth.uid(), 'at', now(), 'action', 'ky', 'note', p_note))
      where id = p_doc;
    if coalesce(trim(p_note), '') <> '' then perform doc_note(p_doc, p_note); end if;
    if nxt = 'da_duyet' then
      if b.proc = 'QT0' then update batches set status = 'hoan_tat', done_at = now() where id = b.id;
      else
        nc := case d.company when 'PN' then 'IPC' when 'IPC' then 'HW' end;
        if nc is null then update batches set status = 'cho_ky' where id = b.id;
        else
          insert into docs(batch_id, company, status, header, tables)
          values (b.id, nc, 'lap', d.header - 'so_lenh' - 'so_hd' - 'so_phieu' - 'so_xn',
            case when b.proc = 'QT1' then jsonb_build_object('ds', coalesce((select jsonb_agg(x - 'don_gia') from jsonb_array_elements(d.tables->'ds') x), '[]'))
                 else d.tables end);
        end if;
      end if;
    end if;
    perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': ' || r || ' ký → ' || nxt);
    return nxt;
  elsif p_action = 'back' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả về'; end if;
    nxt := case when b.proc = 'QT0' then case d.status when 'boc_tach' then 'tiep_nhan' when 'tao_ds' then 'boc_tach'
                  when 'kiem_tra' then 'boc_tach' when 'duyet' then 'kiem_tra' end
                else case d.status when 'kiem_tra' then 'lap' when 'duyet' then 'lap' end end;
    if nxt is null then raise exception 'Bước đầu, không trả về được'; end if;
    update docs set status = nxt, status_at = now(),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', auth.uid(), 'at', now(), 'action', 'tra_ve', 'note', p_note))
      where id = p_doc;
    perform doc_note(p_doc, 'Trả về: ' || p_note);
    perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': trả về ' || nxt || ' – ' || p_note);
    return nxt;
  elsif p_action = 'fail' then
    if not (b.proc = 'QT0' and d.status = 'duyet') then raise exception 'Chỉ bước Duyệt bóc tách được đánh Fail'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do (hao hụt lớn, vượt dự toán, không sản xuất được…)'; end if;
    update docs set status = 'fail', status_at = now(),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', auth.uid(), 'at', now(), 'action', 'fail', 'note', p_note)) where id = p_doc;
    update batches set status = 'fail', done_at = now() where id = b.id;
    perform log_event(b.order_id, 'QT0 · ' || b.title || ': Fail – ' || p_note);
    return 'fail';
  end if;
  raise exception 'Thao tác không hợp lệ';
end $$;

-- Bước cuối (ngoài BASE): khách ký XNĐH / ký bàn giao vật liệu / khách ký nhận hàng — tải bản ký
create or replace function public.batch_finish(p_batch uuid, p_files jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare b batches;
begin
  select * into b from batches where id = p_batch;
  if b.status <> 'cho_ky' then raise exception 'Hồ sơ chưa duyệt xong 3 công ty'; end if;
  if not (_is_person(b.proc, 'PN', 'hoan_tat') or _is_person(b.proc, 'PN', 'lap')) then raise exception 'Không có quyền'; end if;
  if _jarr_len(p_files) = 0 then raise exception 'Tải bản đã ký'; end if;
  update batches set status = 'hoan_tat', done_at = now(), final_files = p_files where id = p_batch;
  perform log_event(b.order_id, b.proc || ' · ' || b.title || ': hoàn tất (đã ký tay)');
end $$;
grant execute on function public.batch_create(uuid, text, text, jsonb), public.doc_save(uuid, jsonb, jsonb, jsonb), public.doc_note(uuid, text),
  public.doc_advance(uuid, text, text), public.batch_finish(uuid, jsonb) to authenticated;

-- Thông báo Zalo khi bản đến lượt người khác
create or replace function public.docs_zalo() returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare k text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return new; end if;
  perform net.http_post(url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=doc',
    body := jsonb_build_object('doc_id', new.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
  return new;
end $$;
create trigger docs_zalo after insert or update on public.docs for each row execute function public.docs_zalo();

-- Tắt máy móc của luồng cũ (giữ bảng để tra cứu)
alter table public.orders disable trigger orders_track_ins;
alter table public.orders disable trigger orders_track_upd;
select cron.unschedule('step-reminders');

-- Người phụ trách mặc định: tạm Kaka 10 (Admin IT sửa trong Quản trị)
insert into public.chain_people(proc, company, role, user_id)
select p, c, r, (select id from profiles where 'admin_it' = any(roles) and active order by full_name limit 1)
from (values ('QT0','PN','admin'),('QT0','PN','ky_thuat'),('QT0','PN','kiem_tra'),('QT0','PN','duyet')) v(p, c, r)
on conflict do nothing;
insert into public.chain_people(proc, company, role, user_id)
select p, c, r, (select id from profiles where 'admin_it' = any(roles) and active order by full_name limit 1)
from unnest(array['QT1','QT2','QT3']) p cross join unnest(array['PN','IPC','HW']) c cross join unnest(array['lap','kiem_tra','duyet']) r
on conflict do nothing;
insert into public.chain_people(proc, company, role, user_id)
select p, 'PN', 'hoan_tat', (select id from profiles where 'admin_it' = any(roles) and active order by full_name limit 1)
from unnest(array['QT1','QT2','QT3']) p on conflict do nothing;

-- Ghi chú: bản áp dụng qua MCP ghi ghi chú trực tiếp trong doc_advance (không gọi doc_note). Thêm my_docs():
-- việc đến lượt người dùng = bản đang ở bước có vai trò người đó (chain_people theo người / nhóm) + hồ sơ chờ tải bản ký tay.
-- Dữ liệu: đơn cũ chuyển 'huy' (lưu trữ); chain_people tạm gán nhóm "[MẪU] Thử quy trình mới".
