-- PMS baseline schema (sinh tự động từ DB thật)
set check_function_bodies = off;
set client_min_messages = warning;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists private;

create sequence if not exists public.app_errors_id_seq;
create sequence if not exists public.audit_log_id_seq;
create sequence if not exists public.cccd_views_id_seq;
create sequence if not exists public.perf_spins_id_seq;
create sequence if not exists public.sim_log_id_seq;
create sequence if not exists public.stock_moves_id_seq;
create sequence if not exists public.wf_events_id_seq;
create sequence if not exists public.zalo_raw_id_seq;
create table if not exists public.profiles (
  id uuid,
  full_name text,
  unit text,
  roles text[],
  active boolean,
  created_at timestamp with time zone,
  impersonating uuid,
  zalo_chat_id text,
  zalo_name text,
  "position" text,
  manager_id uuid,
  daily_report boolean,
  msgs_seen_at timestamp with time zone,
  active_co text
);
create table if not exists public.customers (
  id uuid,
  code text,
  name text,
  created_at timestamp with time zone,
  tax_code text,
  address text,
  contact text,
  phone text,
  email text,
  note text,
  active boolean,
  logo_path text,
  ship_addresses text[],
  kind text,
  "position" text,
  vehicles jsonb
);
create table if not exists public.orders (
  id uuid,
  code text,
  kh1_id uuid,
  kh2_id uuid,
  project text,
  channel text,
  contact text,
  description text,
  quote_due date,
  due_date date,
  extractor_id uuid,
  supplement_note text,
  status text,
  f1_result text,
  f1_checked_by uuid,
  nvl_status text,
  gc_status text,
  gh_status text,
  created_by uuid,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  customer_id uuid,
  extra jsonb,
  project_id uuid
);
create table if not exists public.order_counters (
  period text,
  last_no integer
);
create table if not exists public.order_lines (
  id uuid,
  order_id uuid,
  line_no integer,
  product_code text,
  material text,
  thickness_mm numeric(8,2),
  length_mm numeric(10,1),
  width_mm numeric(10,1),
  qty integer,
  area_m2 numeric(14,3) generated always as (round((((length_mm * width_mm) * (qty)::numeric) / 1000000.0), 3)) stored,
  weight_kg numeric(14,2) generated always as (round((((((length_mm * width_mm) * thickness_mm) * (qty)::numeric) * 7.85) / 1000000.0), 2)) stored,
  spec text
);
create table if not exists public.order_prices (
  line_id uuid,
  order_id uuid,
  unit_price numeric(16,0),
  price_unit text
);
create table if not exists public.confirmations (
  order_id uuid,
  vat_rate numeric(5,2),
  terms text,
  kh1_confirmed_at timestamp with time zone,
  kh1_channel text,
  kh2_confirmed_at timestamp with time zone,
  kh2_channel text,
  signed_pdf_path text
);
create table if not exists public.approval_steps (
  id uuid,
  doc_type text,
  step_no integer,
  label text,
  approver_id uuid,
  hours integer
);
create table if not exists public.approvals (
  id uuid,
  order_id uuid,
  doc_type text,
  round integer,
  step_no integer,
  label text,
  approver_id uuid,
  status text,
  note text,
  due_at timestamp with time zone,
  decided_at timestamp with time zone,
  created_at timestamp with time zone
);
create table if not exists public.audit_log (
  id bigint generated always as identity,
  at timestamp with time zone,
  actor uuid,
  order_id uuid,
  table_name text,
  action text,
  detail jsonb,
  acting_as uuid
);
create table if not exists public.stock_moves (
  id bigint generated always as identity,
  at timestamp with time zone,
  material text,
  thickness_mm numeric(8,2),
  warehouse text,
  qty_kg numeric(14,2),
  kind text,
  order_id uuid,
  ref text,
  actor uuid
);
create table if not exists public.material_plans (
  order_id uuid,
  waste_pct numeric(5,2),
  note text
);
create table if not exists public.material_plan_lines (
  id uuid,
  order_id uuid,
  material text,
  thickness_mm numeric(8,2),
  f1_kg numeric(14,2),
  need_kg numeric(14,2),
  stock_kg numeric(14,2),
  buy_kg numeric(14,2) generated always as (GREATEST((need_kg - stock_kg), (0)::numeric)) stored
);
create table if not exists public.purchase_orders (
  order_id uuid,
  po_no text,
  supplier text,
  eta date,
  unit_price numeric(16,0),
  note text
);
create table if not exists public.receipts (
  order_id uuid,
  received_at date,
  qc_result text,
  qc_note text,
  report_path text
);
create table if not exists public.receipt_lines (
  id uuid,
  order_id uuid,
  material text,
  thickness_mm numeric(8,2),
  expected_kg numeric(14,2),
  received_kg numeric(14,2),
  bad_kg numeric(14,2),
  ok_kg numeric(14,2) generated always as ((COALESCE(received_kg, (0)::numeric) - bad_kg)) stored,
  diff_kg numeric(14,2) generated always as (((COALESCE(received_kg, (0)::numeric) - bad_kg) - expected_kg)) stored
);
create table if not exists public.wo_counters (
  period text,
  last_no integer
);
create table if not exists public.work_orders (
  order_id uuid,
  code text,
  reserve_pct numeric(5,2),
  wh_from text,
  wh_to text,
  start_date date,
  finish_date date,
  note text
);
create table if not exists public.work_order_lines (
  id uuid,
  order_id uuid,
  material text,
  thickness_mm numeric(8,2),
  qty integer,
  f1_kg numeric(14,2),
  issue_kg numeric(14,2)
);
create table if not exists public.handovers (
  order_id uuid,
  lot_no integer,
  delivered_by text,
  received_by text,
  signed_pdf_path text,
  done_at timestamp with time zone
);
create table if not exists public.handover_lines (
  id uuid,
  order_id uuid,
  material text,
  thickness_mm numeric(8,2),
  planned_kg numeric(14,2),
  actual_kg numeric(14,2),
  diff_kg numeric(14,2) generated always as ((COALESCE(actual_kg, (0)::numeric) - planned_kg)) stored
);
create table if not exists public.issues (
  id uuid,
  order_id uuid,
  source text,
  kind text,
  description text,
  action text,
  due_date date,
  status text,
  created_by uuid,
  created_at timestamp with time zone,
  closed_at timestamp with time zone
);
create table if not exists public.qc_finished (
  order_id uuid,
  result text,
  pallets integer,
  note text,
  checked_at timestamp with time zone
);
create table if not exists public.app_secrets (
  name text,
  value text,
  updated_at timestamp with time zone,
  label text,
  provider text,
  note text,
  updated_by uuid,
  prev_value text,
  prev_updated_at timestamp with time zone,
  last_test_at timestamp with time zone,
  last_test_ok boolean,
  last_test_msg text
);
create table if not exists public.zalo_link_codes (
  code text,
  user_id uuid,
  expires_at timestamp with time zone
);
create table if not exists public.packing_lists (
  order_id uuid,
  planned_date date,
  place text,
  note text,
  sent_at timestamp with time zone
);
create table if not exists public.packing_lines (
  id uuid,
  order_id uuid,
  pallet_no integer,
  content text,
  qty integer,
  kg numeric(14,2)
);
create table if not exists public.deliveries (
  order_id uuid,
  pmkt_code text,
  vehicle text,
  driver text,
  planned_at timestamp with time zone,
  delivered_at timestamp with time zone,
  photo_paths text[],
  bbgh_path text,
  note text
);
create table if not exists public.checklist_items (
  id uuid,
  step text,
  label text,
  required boolean,
  sort integer,
  active boolean,
  created_at timestamp with time zone
);
create table if not exists public.checklist_done (
  order_id uuid,
  item_id uuid,
  done boolean,
  done_by uuid,
  done_at timestamp with time zone
);
create table if not exists public.step_defaults (
  step text,
  role text,
  approval boolean,
  doer_id uuid,
  supervisor_ids uuid[],
  sla_hours numeric,
  doer_group_id uuid,
  supervisor_group_ids uuid[]
);
create table if not exists public.order_steps (
  order_id uuid,
  step text,
  doer_id uuid,
  supervisor_ids uuid[],
  started_at timestamp with time zone,
  due_at timestamp with time zone,
  done_at timestamp with time zone,
  done_by uuid,
  doer_group_id uuid,
  supervisor_group_ids uuid[],
  claimed_at timestamp with time zone,
  half_sent boolean,
  over_sent boolean,
  return_note text,
  returned_at timestamp with time zone
);
create table if not exists public.work_groups (
  id uuid,
  name text,
  note text,
  member_ids uuid[],
  active boolean,
  created_at timestamp with time zone
);
create table if not exists public.batches (
  id uuid,
  order_id uuid,
  proc text,
  seq integer,
  title text,
  status text,
  checklist jsonb,
  final_files jsonb,
  created_by uuid,
  created_at timestamp with time zone,
  done_at timestamp with time zone,
  co_order_id uuid,
  src_qt0 uuid
);
create table if not exists public.docs (
  id uuid,
  batch_id uuid,
  company text,
  status text,
  header jsonb,
  tables jsonb,
  files jsonb,
  notes jsonb,
  signs jsonb,
  status_at timestamp with time zone,
  created_at timestamp with time zone,
  apv jsonb,
  assignee uuid,
  assign_note text,
  checklist jsonb,
  ret_snap jsonb
);
create table if not exists public.chain_people (
  proc text,
  company text,
  role text,
  user_id uuid,
  group_id uuid,
  sla_h integer
);
create table if not exists public.wf_processes (
  id uuid,
  code text,
  name text,
  description text,
  category text,
  is_template boolean,
  created_by uuid,
  created_at timestamp with time zone,
  deleted_at timestamp with time zone,
  deleted_by uuid
);
create table if not exists public.wf_versions (
  id uuid,
  process_id uuid,
  version integer,
  status text,
  def jsonb,
  note text,
  updated_by uuid,
  updated_at timestamp with time zone,
  published_at timestamp with time zone
);
create table if not exists public.wf_instances (
  id uuid,
  version_id uuid,
  title text,
  status text,
  is_test boolean,
  step_idx integer,
  data jsonb,
  started_by uuid,
  started_at timestamp with time zone,
  done_at timestamp with time zone,
  order_id uuid,
  parent_task uuid
);
create table if not exists public.wf_tasks (
  id uuid,
  instance_id uuid,
  step_id text,
  step_name text,
  status text,
  due_at timestamp with time zone,
  checklist jsonb,
  done_by uuid,
  note text,
  created_at timestamp with time zone,
  done_at timestamp with time zone,
  assigned_to uuid,
  files jsonb,
  appr_state text,
  half_sent boolean,
  over_sent boolean,
  esc_sent boolean,
  kind text,
  prev_task uuid,
  join_from jsonb
);
create table if not exists public.wf_events (
  id bigint generated always as identity,
  instance_id uuid,
  process_id uuid,
  actor uuid,
  real_actor uuid,
  action text,
  detail text,
  at timestamp with time zone
);
create table if not exists public.wf_approvals (
  id uuid,
  task_id uuid,
  round integer,
  level integer,
  level_id text,
  level_name text,
  approver uuid,
  status text,
  note text,
  due_at timestamp with time zone,
  created_at timestamp with time zone,
  decided_at timestamp with time zone,
  over_sent boolean
);
create table if not exists public.perf_config (
  id integer,
  cfg jsonb,
  updated_at timestamp with time zone,
  updated_by uuid
);
create table if not exists public.perf_spins (
  id bigint,
  user_id uuid,
  cost integer,
  prize text,
  bonus integer,
  at timestamp with time zone,
  kind text
);
create table if not exists public.approval_levels (
  id uuid,
  proc text,
  company text,
  ord integer,
  name text,
  cond_field text,
  cond_op text,
  cond_value numeric,
  user_id uuid,
  group_id uuid,
  sla_h integer,
  active boolean,
  created_at timestamp with time zone
);
create table if not exists public.delegations (
  id uuid,
  user_id uuid,
  to_user uuid,
  from_date date,
  to_date date,
  note text,
  created_at timestamp with time zone
);
create table if not exists public.print_templates (
  id uuid,
  proc text,
  company text,
  name text,
  path text,
  file_name text,
  version integer,
  vars text[],
  active boolean,
  created_by uuid,
  created_at timestamp with time zone
);
create table if not exists public.order_msgs (
  id uuid,
  order_id uuid,
  doc_id uuid,
  kind text,
  from_user uuid,
  to_users uuid[],
  text text,
  via text,
  meta jsonb,
  at timestamp with time zone,
  replied_at timestamp with time zone
);
create table if not exists public.proc_fields (
  id uuid,
  proc text,
  area text,
  tbl text,
  key text,
  label text,
  type text,
  options text[],
  help text,
  decimals integer,
  ord integer,
  active boolean,
  sys boolean,
  perms jsonb,
  updated_at timestamp with time zone,
  restricted boolean,
  view_roles text[],
  view_users uuid[],
  view_approver boolean,
  import_names text[]
);
create table if not exists public.doc_records (
  id uuid,
  order_id uuid,
  doc_id uuid,
  proc text,
  company text,
  batch_title text,
  kind text,
  level_name text,
  result text,
  path text,
  note text,
  by_user uuid,
  at timestamp with time zone,
  has_secret boolean
);
create table if not exists public.sim_log (
  id bigint,
  at timestamp with time zone,
  order_code text,
  proc text,
  batch text,
  company text,
  step text,
  actor text,
  ok boolean,
  note text
);
create table if not exists public.step_checks (
  id uuid,
  proc text,
  step text,
  label text,
  level text,
  ord integer,
  active boolean,
  created_at timestamp with time zone,
  auto text
);
create table if not exists public.step_guides (
  key text,
  title text,
  purpose text,
  todo text,
  notes text,
  links text,
  ord integer,
  updated_by uuid,
  updated_at timestamp with time zone,
  prev jsonb
);
create table if not exists public.projects (
  id uuid,
  code text,
  name text,
  end_customer_id uuid,
  location text,
  note text,
  status text,
  created_by uuid,
  created_at timestamp with time zone,
  closed_by uuid,
  closed_at timestamp with time zone
);
create table if not exists public.companies (
  code text,
  name text,
  buyer text,
  rule text,
  allow_edit boolean,
  ord integer,
  ct_rule text,
  ct_last integer,
  ct_yearly boolean,
  ct_year integer
);
create table if not exists public.co_counters (
  company text,
  day date,
  last integer
);
create table if not exists public.co_orders (
  id uuid,
  company text,
  code text,
  code_auto text,
  edited boolean,
  buyer text,
  project_id uuid,
  order_id uuid,
  batch_id uuid,
  doc_id uuid,
  ref_id uuid,
  created_by uuid,
  created_at timestamp with time zone
);
create table if not exists public.excel_checks (
  path text,
  ok boolean,
  error text,
  codes text[],
  qty numeric,
  rows integer,
  checked_by uuid,
  at timestamp with time zone
);
create table if not exists public.monthly_plans (
  month date,
  tons numeric,
  note text,
  updated_by uuid,
  updated_at timestamp with time zone
);
create table if not exists public.zalo_out (
  req_id bigint,
  chat_id text,
  doc_id uuid,
  message_id text,
  at timestamp with time zone
);
create table if not exists public.zalo_raw (
  id bigint,
  at timestamp with time zone,
  payload jsonb
);
create table if not exists public.act_grants (
  id uuid,
  admin_id uuid,
  target_id uuid,
  from_at timestamp with time zone,
  to_at timestamp with time zone,
  reason text,
  created_by uuid,
  created_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid
);
create table if not exists public.materials (
  id uuid,
  name text,
  density numeric,
  keywords text[],
  is_default boolean,
  active boolean,
  ord integer,
  updated_at timestamp with time zone
);
create table if not exists public.app_settings (
  key text,
  value text,
  updated_at timestamp with time zone
);
create table if not exists public.zalo_groups (
  chat_id text,
  name text,
  company text,
  events text[],
  active boolean,
  linked_by uuid,
  at timestamp with time zone,
  projects uuid[],
  rule_customers uuid[],
  rule_prefix text[],
  all_projects boolean
);
create table if not exists public.user_co_roles (
  user_id uuid,
  company text,
  roles text[]
);
create table if not exists public.co_counters2 (
  k text,
  last integer
);
create table if not exists public.ratings (
  id uuid,
  doc_id uuid,
  rater uuid,
  ratee uuid,
  stars smallint,
  tags text[],
  comment text,
  acting boolean,
  ack_at timestamp with time zone,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
create table if not exists public.doc_cccd (
  doc_id uuid,
  enc bytea,
  masked text,
  updated_at timestamp with time zone
);
create table if not exists public.cccd_views (
  id bigint,
  doc_id uuid,
  viewer uuid,
  at timestamp with time zone
);
create table if not exists public.app_errors (
  id bigint,
  at timestamp with time zone,
  user_id uuid,
  real_user uuid,
  kind text,
  message text,
  detail text,
  url text,
  ua text,
  app_ver text
);
create table if not exists private.kv (
  k text,
  v text,
  at timestamp with time zone
);
alter sequence public.cccd_views_id_seq owned by public.cccd_views.id;
alter sequence public.zalo_raw_id_seq owned by public.zalo_raw.id;
alter sequence public.perf_spins_id_seq owned by public.perf_spins.id;
alter sequence public.app_errors_id_seq owned by public.app_errors.id;
alter sequence public.sim_log_id_seq owned by public.sim_log.id;

-- ===== functions =====
CREATE OR REPLACE FUNCTION public._act_grant(p_target uuid)
 RETURNS act_grants
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from act_grants where admin_id = auth.uid() and revoked_at is null and now() between from_at and to_at
    and (target_id is null or target_id = p_target) order by (target_id is null), to_at desc limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public._act_guard_batches()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if _act_locked() and not _order_is_sample(new.order_id) then raise exception 'Đang xem với tư cách người khác: muốn thao tác trên đơn thật cần Uỷ quyền làm thay (Quản trị › Uỷ quyền làm thay). Hoặc Thoát để làm với quyền Admin.'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._act_guard_docs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oid uuid; n int;
begin
  if not _is_acting() then return new; end if;
  select b.order_id into oid from batches b where b.id = new.batch_id;
  if not _order_is_sample(oid) and (public._act_grant(public.app_uid())).id is null then raise exception 'Đang xem với tư cách người khác: muốn thao tác trên đơn thật cần Uỷ quyền làm thay (Quản trị › Uỷ quyền làm thay). Hoặc Thoát để làm với quyền Admin.'; end if;
  -- gắn "thay mặt" vào chữ ký / ghi chú mới
  n := case when tg_op = 'UPDATE' then coalesce(jsonb_array_length(old.signs), 0) else 0 end;
  if new.signs is not null and jsonb_array_length(new.signs) > n then
    select jsonb_agg(case when ord > n and not (e ? 'by') then e || jsonb_build_object('by', auth.uid()) else e end order by ord)
      into new.signs from jsonb_array_elements(new.signs) with ordinality t(e, ord);
  end if;
  n := case when tg_op = 'UPDATE' then coalesce(jsonb_array_length(old.notes), 0) else 0 end;
  if new.notes is not null and jsonb_array_length(new.notes) > n then
    select jsonb_agg(case when ord > n and not (e ? 'by') then e || jsonb_build_object('by', auth.uid()) else e end order by ord)
      into new.notes from jsonb_array_elements(new.notes) with ordinality t(e, ord);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._act_guard_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if _act_locked() and not (new.project ~* '^\s*\[(MẪU|MAU|TEST)\]' and (tg_op = 'INSERT' or old.project ~* '^\s*\[(MẪU|MAU|TEST)\]')) then
    raise exception 'Đang xem với tư cách người khác: muốn thao tác trên đơn thật cần Uỷ quyền làm thay (Quản trị › Uỷ quyền làm thay). Hoặc Thoát để làm với quyền Admin.'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._act_locked()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._is_acting() and (public._act_grant(public.app_uid())).id is null;
$function$
;

CREATE OR REPLACE FUNCTION public._act_ok(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.app_uid() = auth.uid() or (public._act_grant(public.app_uid())).id is not null
    or exists (select 1 from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
               where d.id = p_doc and o.project ~* '^\s*\[(MẪU|MAU|TEST)\]');
$function$
;

CREATE OR REPLACE FUNCTION public._auto_next(p_doc uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; nc text; nb uuid; v_id uuid; hd jsonb; tb jsonb; n int; co_prev uuid; co_next uuid;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  nc := case d.company when 'PN' then 'IPC' when 'IPC' then 'HW' end;
  if nc is null or b.proc = 'QT0' then return null; end if;
  -- đã tạo rồi thì thôi
  if exists (select 1 from batches x join docs y on y.batch_id = x.id where x.order_id = b.order_id and x.proc = b.proc and y.company = nc and (x.checklist->>'auto_from') = d.id::text) then return null; end if;
  hd := d.header - 'vat' - 'dk_tt' - 'tong_tt' - 'so_xn' - 'ref' - 'ngay'
        || jsonb_build_object('ngay', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'));
  if b.proc = 'QT1' then hd := hd || jsonb_build_object('ref', doc_code(d.id)); end if;
  select coalesce(jsonb_object_agg(k, (select coalesce(jsonb_agg(r - 'don_gia' - 'tt' - 'thanh_tien'), '[]') from jsonb_array_elements(case when jsonb_typeof(v) = 'array' then v else '[]' end) r)), '{}')
    into tb from jsonb_each(coalesce(d.tables, '{}')) e(k, v);
  -- QT2/QT3: gắn với XNĐH của công ty kế tiếp (đơn được tạo từ XNĐH của công ty trước)
  if b.proc in ('QT2','QT3') and b.co_order_id is not null then
    select id into co_next from co_orders where ref_id = b.co_order_id and company = nc order by created_at desc limit 1;
  end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = b.order_id and proc = b.proc;
  insert into batches(order_id, proc, seq, title, status, co_order_id, checklist)
    values (b.order_id, b.proc, n, b.title, 'dang_lam', co_next, jsonb_build_object('auto_from', d.id::text)) returning id into nb;
  insert into docs(batch_id, company, status, header, tables) values (nb, nc, 'lap', hd, _mask_t(tb, restricted_keys(b.proc))) returning docs.id into v_id;
  if b.proc = 'QT1' then
    select id into co_prev from co_orders where doc_id = d.id order by created_at desc limit 1;
    update co_orders set ref_id = co_prev where doc_id = v_id;
  end if;
  perform log_event(b.order_id, b.proc || ' · ' || b.title || ': ' || d.company || ' duyệt xong → tự tạo phiếu ' || nc);
  perform public._notify_auto(v_id);
  return nb;
end $function$
;

CREATE OR REPLACE FUNCTION public._cccd_key()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r text; begin select x.v into r from private.kv x where x.k = 'CCCD_KEY'; if r is null then raise exception 'Thiếu khoá mã hoá CCCD – báo Admin IT'; end if; return r; end $function$
;

CREATE OR REPLACE FUNCTION public._cfg_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end; ch jsonb := '{}'; k text; nm text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k not in ('updated_at','msgs_seen_at','impersonating','active_co') and (o->k) is distinct from (n->k) then ch := ch || jsonb_build_object(k, jsonb_build_array(o->k, n->k)); end if;
    end loop;
    if ch = '{}' then return new; end if;
  end if;
  nm := coalesce(n->>'label', n->>'name', n->>'full_name', n->>'key', o->>'label', o->>'name', o->>'full_name', o->>'key',
    coalesce(n->>'proc', o->>'proc') || '/' || coalesce(n->>'company', o->>'company', '') || '/' || coalesce(n->>'role', o->>'role', ''));
  insert into audit_log(actor, table_name, action, detail)
  values (auth.uid(), tg_table_name, 'cfg:' || lower(tg_op),
    jsonb_build_object('name', nm, 'ctx', coalesce(n->>'proc', o->>'proc', n->>'code', o->>'code'), 'changes', ch, 'row', case when tg_op = 'UPDATE' then null else coalesce(n, o) end));
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public._chain_same_co()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare u text;
begin
  if new.user_id is null then return new; end if;
  select unit into u from profiles where id = new.user_id;
  if u is distinct from (case new.company when 'PN' then 'CNC' when 'IPC' then 'IPC' when 'HW' then 'HANWA' end) then
    raise exception 'Người phụ trách phải thuộc đúng công ty % (không gán chéo công ty)', new.company;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._check_dk4(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _set_in_fn();
  update orders set gc_status = 'ban_giao' where id = p_order and gc_status = 'cho_nvl' and nvl_status = 'san_sang';
  if found then
    insert into handovers(order_id) values (p_order) on conflict do nothing;
    delete from handover_lines where order_id = p_order;
    insert into handover_lines(order_id, material, thickness_mm, planned_kg)
      select order_id, material, thickness_mm, issue_kg from work_order_lines where order_id = p_order;
    perform log_event(p_order, 'ĐK3 đạt: LGC đã duyệt + NVL sẵn sàng → B5 bàn giao NVL');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._checklist_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr text; fl text[]; i_old int; i_new int; miss int; fwd boolean; lbl text;
begin
  if new.status = old.status then return new; end if;
  select proc into pr from batches where id = new.batch_id;
  fl := case pr when 'QT0' then array['tiep_nhan','boc_tach','tao_ds','kiem_tra','duyet'] else array['lap','kiem_tra','duyet'] end;
  i_old := array_position(fl, old.status); i_new := array_position(fl, new.status);
  fwd := new.status in ('da_duyet','duyet_them') or (i_old is not null and i_new is not null and i_new > i_old);
  if not fwd or old.status in ('da_duyet','fail') then return new; end if;
  select count(*), string_agg(x->>'label', ', ') into miss, lbl from jsonb_array_elements(_ck_merge(pr, old.status, old.checklist -> old.status)) x
   where x->>'level' = 'req' and coalesce((x->>'done')::boolean, false) = false;
  if miss > 0 then raise exception 'Còn % mục checklist bắt buộc chưa tích: %', miss, lbl; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._ck_merge(p_proc text, p_step text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with sv as (select x from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]' end) x),
  t as (select jsonb_build_object('id', s.id::text, 'label', s.label, 'level', s.level, 'auto', s.auto)
           || coalesce((select jsonb_strip_nulls(jsonb_build_object('done', (x->>'done')::boolean, 'by', x->'by', 'at', x->'at', 'note', x->'note'))
                        from sv where x->>'id' = s.id::text limit 1), '{}') j, s.ord o
        from step_checks s where s.proc = p_proc and s.step = p_step and s.active),
  c as (select (x - 'level') || jsonb_build_object('level', case when x->>'level' = 'note' then 'note' else 'rec' end, 'custom', true) j, 100000 + row_number() over () o
        from sv where coalesce((x->>'custom')::boolean, false)
          and not exists (select 1 from step_checks s where s.id::text = x->>'id'))
  select coalesce(jsonb_agg(j order by o), '[]') from (select * from t union all select * from c) z
$function$
;

CREATE OR REPLACE FUNCTION public._closed_co_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if (new.code is distinct from old.code or new.ref_id is distinct from old.ref_id)
     and exists (select 1 from docs d where d.id = old.doc_id and d.status in ('da_duyet', 'fail')) then
    raise exception 'Phiếu đã chốt – không sửa mã đơn / tham chiếu được.'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._closed_doc_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status not in ('da_duyet', 'fail') or new.status <> old.status or auth.uid() is null then return new; end if;
  if new.header is distinct from old.header or new.tables is distinct from old.tables then
    raise exception 'Phiếu đã % – không sửa được. Cần sửa thì dùng Trả về để duyệt lại.', case old.status when 'fail' then 'Thất bại' else 'duyệt' end; end if;
  if new.files is distinct from old.files and exists (
      select 1 from jsonb_array_elements(coalesce(old.files, '[]')) f where not exists (select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'path' = f->>'path'))
    then raise exception 'Phiếu đã chốt – không gỡ file được.'; end if;
  if new.files is distinct from old.files and exists (
      select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'kind' <> 'ban_ky'
        and not exists (select 1 from jsonb_array_elements(coalesce(old.files, '[]')) f where f->>'path' = n->>'path'))
    then raise exception 'Phiếu đã chốt – chỉ thêm được Bản ký lưu trữ.'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_auto(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select nullif(b.checklist->>'auto_from', '') is not null from docs d join batches b on b.id = d.batch_id where d.id = p_doc), false) $function$
;

CREATE OR REPLACE FUNCTION public._co_b1(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select upper(left(p,1)) $function$
;

CREATE OR REPLACE FUNCTION public._co_chain_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; src uuid; bad text; nc text;
begin
  if tg_op = 'UPDATE' and new.tables is distinct from old.tables and exists (select 1 from batches x where x.checklist->>'auto_from' = new.id::text and x.status <> 'fail') then
    with me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
    select string_agg(l.k || ': đơn con đã lấy ' || l.used || ', còn ' || coalesce(me.q, 0), '; ') into bad
    from _src_left(new.id) l left join me on me.k = l.k where l.used > coalesce(me.q, 0);
    if bad is not null then raise exception 'Không giảm được dưới số các đơn công ty sau đã lấy: %', bad; end if;
  end if;
  if new.company not in ('IPC', 'HW') then return new; end if;
  select * into b from batches where id = new.batch_id;
  if b.proc not in ('QT1', 'QT2', 'QT3') then return new; end if;
  nc := case new.company when 'IPC' then 'PN' else 'IPC' end;
  src := nullif(b.checklist->>'auto_from', '')::uuid;
  if src is null then
    if tg_op = 'INSERT' then raise exception 'Đơn % phải có tham chiếu tới đơn % đã duyệt', new.company, nc; end if;
    if new.status is distinct from old.status and new.status <> 'fail' then raise exception 'Đơn % không có tham chiếu % – không chuyển bước được', new.company, nc; end if;
    return new;
  end if;
  if b.proc = 'QT1' and new.status <> 'fail' and (tg_op = 'INSERT' or new.tables is distinct from old.tables) then
    perform pg_advisory_xact_lock(hashtext('src:' || src::text));
    with me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
    select string_agg(me.k || case when l.k is null then ': không có trong đơn nguồn' else ': đơn nguồn ' || l.src || ', đơn khác đã lấy ' || l.used || ', đơn này ' || me.q end, '; ') into bad
    from me left join _src_left(src, new.id) l on l.k = me.k where me.k <> '' and me.q > 0 and (l.k is null or me.q > l.src - l.used);
    if bad is not null then raise exception 'Vượt đơn nguồn %: %', doc_code(src), bad; end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_doc_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; c companies; ref uuid;
begin
  select * into b from batches where id = new.batch_id; if b.proc <> 'QT1' then return null; end if;
  select * into c from companies where code = new.company;
  select co.id into ref from co_orders co join companies s on s.code = co.company where co.batch_id = new.batch_id and s.buyer = new.company limit 1;
  insert into co_orders(company, code, code_auto, buyer, project_id, order_id, batch_id, doc_id, ref_id)
    select new.company, new.header->>'so_xn', new.header->>'so_xn', c.buyer, o.project_id, o.id, b.id, new.id, ref from orders o where o.id = b.order_id;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_doc_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr text; oid uuid;
begin
  select b.proc, b.order_id into pr, oid from batches b where b.id = new.batch_id;
  new.header := coalesce(new.header, '{}'::jsonb) - 'so_ct';
  if pr = 'QT1' then new.header := new.header || jsonb_build_object('so_xn', _co_make_code(new.company, oid)); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_doc_keep()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text;
begin
  select code into k from co_orders where doc_id = new.id;
  if k is not null and new.header->>'so_xn' is distinct from k then new.header := new.header || jsonb_build_object('so_xn', k); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_free(p_co co_orders)
 RETURNS SETOF co_orders
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.* from co_orders c join companies s on s.code = c.company and s.buyer = p_co.company
  where c.order_id = p_co.order_id
    and exists (select 1 from docs d where d.id = c.doc_id and d.status = 'da_duyet')
    and (c.id = p_co.ref_id or exists (select 1 from _src_left(c.doc_id, p_co.doc_id) l where l.src > l.used)) $function$
;

CREATE OR REPLACE FUNCTION public._co_make_code(p_co text, p_order uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c companies; d date := (now() at time zone 'Asia/Ho_Chi_Minh')::date; n int; mua text; da text; s text; w int; per text; kk text;
begin
  select * into c from companies where code = p_co; if not found then return null; end if;
  if c.buyer is not null then mua := c.buyer;
  else select coalesce(nullif(cu.code, ''), 'KH') into mua from orders o left join projects p on p.id = o.project_id left join customers cu on cu.id = coalesce(p.end_customer_id, o.customer_id) where o.id = p_order; end if;
  select p.code into da from orders o left join projects p on p.id = o.project_id where o.id = p_order;
  per := case when c.rule ~ '\{(YYYYMMDD|YYMMDD)\}' then to_char(d,'YYYYMMDD') when c.rule ~ '\{YYMM\}' then to_char(d,'YYYYMM') else 'all' end;
  kk := p_co || '|' || per || case when c.rule like '%{DA}%' then '|' || coalesce(da,'DA') else '' end;
  insert into co_counters2(k, last) values (kk, 1) on conflict (k) do update set last = co_counters2.last + 1 returning last into n;
  s := c.rule;
  s := replace(s, '{YYYYMMDD}', to_char(d, 'YYYYMMDD')); s := replace(s, '{YYMMDD}', to_char(d, 'YYMMDD')); s := replace(s, '{YYMM}', to_char(d, 'YYMM'));
  s := replace(s, '{BAN}', p_co); s := replace(s, '{B1}', _co_b1(p_co)); s := replace(s, '{MUA}', coalesce(mua, 'KH')); s := replace(s, '{DA}', coalesce(da, 'DA'));
  w := coalesce((regexp_match(s, '\{STT:(\d)\}'))[1]::int, 2);
  s := regexp_replace(s, '\{STT(:\d)?\}', lpad(n::text, w, '0'));
  while exists (select 1 from co_orders where code = s) loop s := s || '-' || n; end loop;
  return s;
end $function$
;

CREATE OR REPLACE FUNCTION public._co_ok(p_company text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select case when p.active_co is null then true
                               when not has_role('admin_it') and cardinality(user_cos(p.id)) <= 1 then true
                               else p.active_co = p_company end
                   from profiles p where p.id = app_uid()), true);
$function$
;

CREATE OR REPLACE FUNCTION public._ct_fmt(p_rule text, p_co text, p_n integer, p_y integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(replace(replace(replace(p_rule,'{YYYY}',p_y::text),'{YY}',right(p_y::text,2)),'{BAN}',p_co),
    '\{SEQ:(\d)\}', lpad(p_n::text, coalesce((regexp_match(p_rule,'\{SEQ:(\d)\}'))[1],'4')::int,'0'))
$function$
;

CREATE OR REPLACE FUNCTION public._doc_line(p_doc uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text;
begin
  perform set_config('pms.zdoc', p_doc::text, true);
  select public.doc_code(p_doc) || ' · ' || coalesce(o.project, '') || E'\n' || b.proc || ' · ' || d.company || ' · ' ||
    coalesce(case d.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm'
      when 'lap' then 'Lập' when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'duyet_them' then 'Duyệt thêm' end, d.status)
    || E'\n' || 'https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || o.id || '?tab=' || b.proc
  into t from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
  return t;
end $function$
;

CREATE OR REPLACE FUNCTION public._doc_value(d docs, f text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case f when 'total' then coalesce(nullif(d.header->>'tong_tt','')::numeric, 0) else 0 end;
$function$
;

CREATE OR REPLACE FUNCTION public._docs_cccd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := regexp_replace(coalesce(new.header->>'tx_cccd', ''), '\s', '', 'g');
begin
  if v ~ '^[0-9]{6,15}$' then
    insert into doc_cccd(doc_id, enc, masked) values (new.id, extensions.pgp_sym_encrypt(v, _cccd_key()), cccd_mask(v))
      on conflict (doc_id) do update set enc = excluded.enc, masked = excluded.masked, updated_at = now();
    new.header := jsonb_set(new.header, '{tx_cccd}', to_jsonb(cccd_mask(v)));
  elsif v = '' and tg_op = 'UPDATE' and coalesce(old.header->>'tx_cccd', '') <> '' then
    delete from doc_cccd where doc_id = new.id;
  end if;
  if new.ret_snap ? 'header' and coalesce(new.ret_snap->'header'->>'tx_cccd', '') ~ '[0-9]{6}' then
    new.ret_snap := jsonb_set(new.ret_snap, '{header,tx_cccd}', to_jsonb(cccd_mask(regexp_replace(new.ret_snap->'header'->>'tx_cccd', '\s', '', 'g'))));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._ds_key(r jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select upper(regexp_replace(coalesce(nullif(trim(r->>'ma_tam'), ''), r->>'vat_lieu', ''), '\s+', '', 'g')) $function$
;

CREATE OR REPLACE FUNCTION public._excel_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f jsonb; c excel_checks; n int := 0;
begin
  if old.status <> 'tao_ds' or new.status not in ('kiem_tra', 'duyet', 'da_duyet') then return new; end if;
  if (select proc from batches where id = new.batch_id) <> 'QT0' then return new; end if;
  -- Chỉ kiểm file Excel bóc tách hợp lệ; KHÔNG so với danh sách tấm (2 thứ khác nhau)
  for f in select * from jsonb_array_elements(coalesce(new.files, '[]')) loop
    continue when f->>'kind' <> 'excel'; n := n + 1;
    select * into c from excel_checks where path = f->>'path';
    if not found then raise exception 'File Excel “%” chưa được máy chủ kiểm tra – tải lại file.', f->>'name'; end if;
    if not c.ok then raise exception 'File Excel “%” không hợp lệ: %', f->>'name', c.error; end if;
  end loop;
  if n = 0 then raise exception 'Chưa đính kèm Excel bóc tách chi tiết.'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._file_del_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f jsonb;
begin
  if new.files is not distinct from old.files then return new; end if;
  if public.is_real_admin() or public.has_role('admin_it') or public.has_role('admin_cnc') or auth.uid() is null then return new; end if;
  for f in select * from jsonb_array_elements(coalesce(old.files, '[]')) loop
    if not exists (select 1 from jsonb_array_elements(coalesce(new.files, '[]')) n where n->>'path' = f->>'path') then
      if coalesce(f->>'by', '') <> public.app_uid()::text or coalesce(f->>'step', '') <> old.status then
        raise exception 'Không gỡ được file “%”: chỉ người tải file (trong bước đã tải) hoặc admin được gỡ. Nếu file sai, hãy Trả về cho người tải.', f->>'name';
      end if;
    end if;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._fin_co(p_proc text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select company from chain_people where proc = p_proc and role = 'hoan_tat' limit 1), 'HW') $function$
;

CREATE OR REPLACE FUNCTION public._flow(p_proc text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_proc = 'QT0' then array['tiep_nhan','boc_tach','tao_ds','kiem_tra','duyet','da_duyet']
              when p_proc = 'QT3' then array['lap','kiem_tra','duyet','anh_giao','da_duyet']
              else array['lap','kiem_tra','duyet','da_duyet'] end $function$
;

CREATE OR REPLACE FUNCTION public._is_acting()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select auth.uid() is not null and app_uid() is distinct from auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public._is_person(p_proc text, p_company text, p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or exists (select 1 from chain_people c where c.proc = p_proc and c.company = p_company and c.role = p_role and in_any(c.user_id, c.group_id));
$function$
;

CREATE OR REPLACE FUNCTION public._jarr_len(j jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select coalesce(jsonb_array_length(case when jsonb_typeof(j) = 'array' then j end), 0) $function$
;

CREATE OR REPLACE FUNCTION public._lock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oid uuid;
begin
  if tg_table_name = 'orders' then oid := coalesce(new.id, old.id);
  elsif tg_table_name = 'batches' then oid := coalesce(new.order_id, old.order_id);
  else select b.order_id into oid from batches b where b.id = coalesce(new.batch_id, old.batch_id); end if;
  if _project_locked(oid) then raise exception 'Dự án đã đóng – không sửa được. Admin mở lại dự án nếu cần.'; end if;
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public._lv_match(l approval_levels, d docs)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select l.cond_field = 'none' or case l.cond_op when '>' then _doc_value(d, l.cond_field) > l.cond_value when '>=' then _doc_value(d, l.cond_field) >= l.cond_value
    when '<' then _doc_value(d, l.cond_field) < l.cond_value else false end;
$function$
;

CREATE OR REPLACE FUNCTION public._m2_tam(e jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when coalesce(trim(e->>'m2_tam'), '') <> '' then e else e || jsonb_build_object('m2_tam', coalesce(
    round(_num(e->>'rong') * _num(e->>'dai') / 1000000, 4)::text,
    case when _num(e->>'so_tam') > 0 then round(_num(e->>'m2_ht') / _num(e->>'so_tam'), 4)::text end,
    case when _num(e->>'so_tam') > 0 then round(_num(e->>'m2') / _num(e->>'so_tam'), 4)::text end, '')) end $function$
;

CREATE OR REPLACE FUNCTION public._mask_h(h jsonb, hk text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(h, '{}') - coalesce((select array_agg(substr(x, 3)) from unnest(hk) x where x like 'h:%'), '{}');
$function$
;

CREATE OR REPLACE FUNCTION public._mask_t(t jsonb, hk text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when cardinality(hk) = 0 or t is null or jsonb_typeof(t) <> 'object' then t else
    coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
        coalesce((select jsonb_agg(r - coalesce((select array_agg(split_part(x, ':', 2)) from unnest(hk) x where split_part(x, ':', 1) = k), '{}') order by i)
                  from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
      from jsonb_each(t) e(k, v)), '{}') end;
$function$
;

CREATE OR REPLACE FUNCTION public._merge_hidden(p_new jsonb, p_old jsonb, hk text[])
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
      coalesce((select jsonb_agg(
          (r - coalesce((select array_agg(split_part(x, ':', 2)) from unnest(hk) x where split_part(x, ':', 1) = k), '{}'))
          || coalesce((select jsonb_object_agg(kk, o->kk) from jsonb_array_elements(coalesce(p_old->k, '[]')) o, unnest(hk) x,
                         lateral (select split_part(x, ':', 2) kk) z
                       where split_part(x, ':', 1) = k and o->>'_id' = r->>'_id' and o ? kk), '{}')
          order by i) from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
    from jsonb_each(p_new) e(k, v)), '{}');
$function$
;

CREATE OR REPLACE FUNCTION public._notify_auto(p_doc uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; d docs; ids uuid[]; nm text;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  nm := case d.company when 'HW' then 'Hanwa' when 'PN' then 'Phương Nam CNC' else d.company end;
  select array_agg(distinct u) into ids from (
    select cp.user_id u from chain_people cp where cp.proc = b.proc and cp.company = d.company and cp.role = 'lap' and cp.user_id is not null
    union select unnest(g.member_ids) from chain_people cp join work_groups g on g.id = cp.group_id and g.active where cp.proc = b.proc and cp.company = d.company and cp.role = 'lap') x;
  if ids is null then return; end if;
  perform _zsend(_with_deleg(ids), public._doc_line(p_doc) || E'\n📥 Phiếu mới cho ' || nm || ' (tự tạo từ bên trước, chưa có giá). Mời Lập.');
end $function$
;

CREATE OR REPLACE FUNCTION public._notify_ref_ready(p_doc uuid, p_co text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; ids uuid[]; code text; nm text := case p_co when 'HW' then 'Hanwa' else p_co end;
begin
  select bb.* into b from docs dd join batches bb on bb.id = dd.batch_id where dd.id = p_doc;
  select array_agg(distinct u) into ids from (
    select cp.user_id u from chain_people cp where cp.proc = b.proc and cp.company = p_co and cp.role = 'lap' and cp.user_id is not null
    union select unnest(g.member_ids) from chain_people cp join work_groups g on g.id = cp.group_id and g.active where cp.proc = b.proc and cp.company = p_co and cp.role = 'lap') x;
  if ids is null then return; end if;
  code := doc_code(p_doc);
  perform _zsend(_with_deleg(ids), '📥 Đơn ' || code || ' đã duyệt' || E'\n' || nm || ': có thể lập XNĐH của mình bằng tham chiếu mã này.' || E'\n'
    || 'https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || b.order_id || '?tab=' || b.proc);
end $function$
;

CREATE OR REPLACE FUNCTION public._num(t text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$ select case when replace(coalesce(t, ''), ',', '.') ~ '^\s*-?\d+(\.\d+)?\s*$' then replace(t, ',', '.')::numeric end $function$
;

CREATE OR REPLACE FUNCTION public._num0(t text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(regexp_replace(replace(coalesce(t, ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric, 0);
$function$
;

CREATE OR REPLACE FUNCTION public._on_doc_decided(p_order uuid, p_doc text, p_ok boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _set_in_fn();
  if p_doc = 'F2' then
    update orders set status = case when p_ok then 'cho_khach' else 'xndh' end where id = p_order;
  elsif p_doc = 'F3' then
    update orders set nvl_status = case when p_ok then 'mua_hang' else 'du_toan' end where id = p_order;
    if p_ok then insert into purchase_orders(order_id) values (p_order) on conflict do nothing; end if;
  elsif p_doc = 'PO' then
    update orders set nvl_status = case when p_ok then 'nhap_kho' else 'mua_hang' end where id = p_order;
    if p_ok then
      insert into receipts(order_id) values (p_order) on conflict do nothing;
      insert into receipt_lines(order_id, material, thickness_mm, expected_kg)
        select order_id, material, thickness_mm, buy_kg from material_plan_lines
        where order_id = p_order and buy_kg > 0 and not exists (select 1 from receipt_lines r where r.order_id = p_order);
    end if;
  elsif p_doc = 'LGH1' then
    if p_ok then
      insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
      select p_order, 'LGH2', coalesce((select max(round) from approvals where order_id = p_order and doc_type = 'LGH2'), 0) + 1,
             s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours)
      from approval_steps s where s.doc_type = 'LGH2' order by s.step_no limit 1;
      perform log_event(p_order, 'LGH chặng 1 (CNC → IPC) đã duyệt → gửi chặng 2 (IPC → Hanwa)');
    else
      update orders set gh_status = 'lap_lgh' where id = p_order;
    end if;
  elsif p_doc = 'LGH2' then
    update orders set gh_status = case when p_ok then 'giao_hang' else 'lap_lgh' end where id = p_order;
    if p_ok then perform log_event(p_order, 'Lệnh giao hàng đã duyệt đủ 2 chặng → giao hàng'); end if;
  elsif p_doc = 'F5' then
    if p_ok then
      if exists (select 1 from material_plan_lines where order_id = p_order and buy_kg > 0) then
        update orders set gc_status = 'cho_nvl', nvl_status = 'mua_hang' where id = p_order;
        insert into purchase_orders(order_id) values (p_order) on conflict do nothing;
      else
        update orders set gc_status = 'cho_nvl', nvl_status = 'san_sang' where id = p_order;
        perform log_event(p_order, 'Tồn kho đủ – không cần mua NVL');
      end if;
      perform _check_dk4(p_order);
    else
      update orders set gc_status = 'lap_lgc', nvl_status = 'du_toan' where id = p_order;
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._order(p_order uuid)
 RETURNS orders
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select * from orders where id = p_order $function$
;

CREATE OR REPLACE FUNCTION public._order_is_sample(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select coalesce((select project ~* '^\s*\[(MẪU|MAU|TEST)\]' from orders where id = p_order), false) $function$
;

CREATE OR REPLACE FUNCTION public._order_project_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.project_id is not null then select name into new.project from projects where id = new.project_id; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._project_locked(p_order uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from orders o join projects p on p.id = o.project_id where o.id = p_order and p.status = 'closed')
$function$
;

CREATE OR REPLACE FUNCTION public._project_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.name is distinct from old.name then update orders set project = new.name where project_id = new.id; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._qt0_code(p_b uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(o.code, ''), 'QT0') || '-BT' || b.seq from batches b join orders o on o.id = b.order_id where b.id = p_b;
$function$
;

CREATE OR REPLACE FUNCTION public._qt0_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ord uuid; bad text;
begin
  if new.company <> 'PN' or new.status = 'fail' then return new; end if;
  if tg_op = 'UPDATE' and new.tables is not distinct from old.tables and new.status is not distinct from old.status then return new; end if;
  select b.order_id into ord from batches b where b.id = new.batch_id and b.proc = 'QT1'; if ord is null then return new; end if;
  with pool as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) tot from batches b join docs d on d.batch_id = b.id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
                where b.order_id = ord and b.proc = 'QT0' and b.status = 'hoan_tat' group by 1),
       other as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from batches b join docs d on d.batch_id = b.id and d.company = 'PN', jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
                 where b.order_id = ord and b.proc = 'QT1' and b.status <> 'fail' and d.status <> 'fail' and d.id <> new.id group by 1),
       me as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) e group by 1)
  select string_agg(me.k || ': bóc tách ' || p.tot || ', đơn khác đã lấy ' || coalesce(o.q, 0) || ', đơn này ' || me.q, '; ') into bad
  from me join pool p on p.k = me.k left join other o on o.k = me.k
  where me.k <> '' and me.q > p.tot - coalesce(o.q, 0);
  if bad is not null then raise exception 'Vượt số tấm bóc tách: %', bad; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._qt0_new_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tot numeric; used numeric;
begin
  if new.proc <> 'QT1' or new.src_qt0 is null then return new; end if;
  select coalesce(sum(_num0(e->>'so_tam')), 0) into tot from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.batch_id = new.src_qt0;
  select coalesce(sum(q), 0) into used from _qt0_used(new.src_qt0);
  if tot > 0 and used >= tot then raise exception '% đã lấy hết % tấm – không tạo thêm XNĐH từ lần bóc tách này', (select title from batches where id = new.src_qt0), tot; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._qt0_take(e jsonb, q numeric)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when _num0(e->>'so_tam') <= 0 or q = _num0(e->>'so_tam') then e || jsonb_build_object('so_tam', q)
    else e || jsonb_build_object('so_tam', q)
      || coalesce(case when _num(e->>'m2') is not null then jsonb_build_object('m2', round(_num(e->>'m2') * q / _num0(e->>'so_tam'), 4)) end, '{}')
      || coalesce(case when _num(e->>'m2_ht') is not null then jsonb_build_object('m2_ht', round(_num(e->>'m2_ht') * q / _num0(e->>'so_tam'), 4)) end, '{}') end;
$function$
;

CREATE OR REPLACE FUNCTION public._qt0_used(p_qt0 uuid, p_skip uuid DEFAULT NULL::uuid)
 RETURNS TABLE(k text, q numeric, orders jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with r as (
    select _ds_key(e) k, _num0(e->>'so_tam') q, coalesce(co.code, b.title) code, d.id doc
    from batches b join docs d on d.batch_id = b.id and d.company = 'PN' left join co_orders co on co.doc_id = d.id,
         jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
    where b.proc = 'QT1' and b.status <> 'fail' and d.status <> 'fail' and (p_skip is null or d.id <> p_skip)
      and (b.src_qt0 = p_qt0 or (b.src_qt0 is null and b.order_id = (select order_id from batches where id = p_qt0))))
  select k, sum(q), jsonb_agg(jsonb_build_object('code', code, 'q', q, 'doc', doc)) from r where q > 0 and k <> '' group by k $function$
;

CREATE OR REPLACE FUNCTION public._rec_secret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.has_secret := exists (select 1 from proc_fields where proc = new.proc and restricted and active)
                    and cardinality(hidden_keys(new.proc, new.company)) = 0;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._ref_over_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c co_orders; pd docs; bad text;
begin
  if new.tables is not distinct from old.tables then return new; end if;
  select co.* into c from co_orders co where co.doc_id = new.id; if c.ref_id is null then return new; end if;
  select x.* into pd from co_orders r join docs x on x.id = r.doc_id where r.id = c.ref_id;
  select string_agg(split_part(coalesce(m.k, me.k), '|', 1) || ' (còn ' || (coalesce(m.tot, 0) - coalesce(u.q, 0)) || ', đang lấy ' || coalesce(me.q, 0) || ')', ', ') into bad
  from (select _ds_key(r) k, sum(_num0(r->>'so_tam')) tot from jsonb_array_elements(coalesce(pd.tables->'ds', '[]')) r group by 1) m
    full join (select _ds_key(r) k, sum(_num0(r->>'so_tam')) q from jsonb_array_elements(coalesce(new.tables->'ds', '[]')) r group by 1) me on me.k = m.k
    left join _ref_used(c.ref_id, new.id) u on u.k = coalesce(m.k, me.k)
  where coalesce(me.q, 0) > coalesce(m.tot, 0) - coalesce(u.q, 0) and coalesce(me.q, 0) > 0;
  if bad is not null then raise exception 'Vượt số tấm của đơn tham chiếu: %', bad; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._ref_used(p_ref uuid, p_skip uuid DEFAULT NULL::uuid)
 RETURNS TABLE(k text, q numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _ds_key(r), sum(_num0(r->>'so_tam'))
  from co_orders c join docs d on d.id = c.doc_id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) r
  where c.ref_id = p_ref and d.status <> 'fail' and (p_skip is null or d.id <> p_skip)
  group by 1;
$function$
;

CREATE OR REPLACE FUNCTION public._reply(p_uid uuid, p_doc uuid, p_text text, p_via text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n order_msgs; oid uuid; nm text; rid uuid; hs uuid[]; rc uuid[]; lastfrom uuid;
begin
  select * into n from order_msgs where doc_id = p_doc and kind in ('nudge','reassign') and replied_at is null and p_uid = any(_with_deleg(to_users)) order by at desc limit 1;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc;
  hs := doc_holders(p_doc);
  if n.id is not null then rc := array[n.from_user];
  elsif p_uid = any(_with_deleg(hs)) then
    -- người làm nhắn: gửi người nhắc/giao gần nhất, không có thì quản lý trực tiếp
    select from_user into lastfrom from order_msgs where doc_id = p_doc and kind in ('nudge','reassign','reply') and from_user is not null and from_user <> p_uid order by at desc limit 1;
    rc := case when lastfrom is not null then array[lastfrom] else (select coalesce(array_agg(manager_id), '{}') from profiles where id = p_uid and manager_id is not null) end;
  else rc := hs;
  end if;
  rc := array(select x from unnest(rc) x where x is not null and x <> p_uid);
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, via, meta)
    values (oid, p_doc, 'reply', p_uid, rc, trim(p_text), p_via,
      case when n.id is null then '{}'::jsonb else jsonb_build_object('nudge', n.id) end) returning id into rid;
  if n.id is not null then update order_msgs set replied_at = now() where id = n.id; end if;
  if cardinality(rc) > 0 then
    select full_name into nm from profiles where id = p_uid;
    perform _zsend(case when rc = hs then _with_deleg(rc) else rc end, '💬 ' || coalesce(nm, '') || ':' || E'\n“' || trim(p_text) || E'”\n' || _doc_line(p_doc)
      || _reply_hint(p_doc));
  end if;
  return rid;
end $function$
;

CREATE OR REPLACE FUNCTION public._reply_hint(p_doc uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select E'\n\n↩ Trả lời: nhắn thẳng (vào phiếu này) hoặc gõ mã trước nội dung\n' || _short_code(p_doc);
$function$
;

CREATE OR REPLACE FUNCTION public._req_check(p_doc uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public._restart_approval(p_order uuid, p_doc text, p_restart boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s approval_steps; r int;
begin
  update approvals set status = 'huy', decided_at = now(), note = coalesce(nullif(note, ''), 'Huỷ do trả về bước')
    where order_id = p_order and doc_type = p_doc and status in ('cho', 'dat');
  if p_restart then
    select * into s from approval_steps where doc_type = p_doc order by step_no limit 1;
    if s.id is null or s.approver_id is null then raise exception 'Chuỗi duyệt % chưa cấu hình đủ', p_doc; end if;
    select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
    insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
      values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._role_of(p_proc text, p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_proc = 'QT0' then case p_status when 'tiep_nhan' then 'admin' when 'boc_tach' then 'ky_thuat'
                when 'tao_ds' then 'admin' when 'kiem_tra' then 'kiem_tra' when 'duyet' then 'duyet' end
              else case p_status when 'lap' then 'lap' when 'kiem_tra' then 'kiem_tra' when 'duyet' then 'duyet' when 'anh_giao' then 'thu_kho' end end $function$
;

CREATE OR REPLACE FUNCTION public._row_ids(t jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  select case when t is null or jsonb_typeof(t) <> 'object' then t else
    coalesce((select jsonb_object_agg(k, case when jsonb_typeof(v) = 'array' then
        coalesce((select jsonb_agg(case when jsonb_typeof(r) = 'object' and coalesce(r->>'_id', '') = '' then r || jsonb_build_object('_id', gen_random_uuid()::text) else r end order by i)
                  from jsonb_array_elements(v) with ordinality a(r, i)), '[]') else v end)
      from jsonb_each(t) e(k, v)), '{}') end;
$function$
;

CREATE OR REPLACE FUNCTION public._secret_system(p text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select p in ('NOTIFY_KEY','WEBHOOK_KEY') $function$
;

CREATE OR REPLACE FUNCTION public._set_in_fn()
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$ select set_config('app.in_fn','on', true); $function$
;

CREATE OR REPLACE FUNCTION public._short_code(p_doc uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select regexp_replace(public.doc_code(p_doc), '^.*-', '');
$function$
;

CREATE OR REPLACE FUNCTION public._so_ct_assign()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pr text; c companies; y int := extract(year from now())::int; n int;
begin
  -- giữ nguyên Số CT đã cấp
  if old.header ? 'so_ct' and coalesce(old.header->>'so_ct','') <> '' then
    if new.header->>'so_ct' is distinct from old.header->>'so_ct' then new.header := new.header || jsonb_build_object('so_ct', old.header->>'so_ct'); end if;
    return new;
  end if;
  if new.header ? 'so_ct' then new.header := new.header - 'so_ct'; end if;
  if new.status = 'da_duyet' and old.status is distinct from 'da_duyet' then
    select b.proc into pr from batches b where b.id = new.batch_id;
    if pr = 'QT1' then
      select * into c from companies where code = new.company for update;
      if c.ct_yearly and coalesce(c.ct_year,0) <> y then n := 1; else n := c.ct_last + 1; end if;
      update companies set ct_last = n, ct_year = y where code = c.code;
      new.header := coalesce(new.header,'{}'::jsonb) || jsonb_build_object('so_ct', _ct_fmt(c.ct_rule, c.code, n, y));
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._src_left(p_src uuid, p_skip uuid DEFAULT NULL::uuid)
 RETURNS TABLE(k text, src numeric, used numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.id = p_src group by 1),
       u as (select _ds_key(e) k, sum(_num0(e->>'so_tam')) q from batches b join docs d on d.batch_id = b.id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
             where b.checklist->>'auto_from' = p_src::text and b.status <> 'fail' and d.status <> 'fail' and (p_skip is null or d.id <> p_skip) group by 1)
  select s.k, s.q, coalesce(u.q, 0) from s left join u on u.k = s.k where s.k <> '' $function$
;

CREATE OR REPLACE FUNCTION public._step_rank(k text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array_position(array['qt0.tiep_nhan','qt0.boc_tach','qt0.kiem_tra_f1','qt1.xndh','qt1.cho_duyet_xndh','qt1.cho_khach',
    'qt2.b1','qt2.b2','qt2.b3','qt2.b4','qt2.b5','qt2.b6','qt3.thong_bao','qt3.lap_lgh','qt3.cho_duyet_lgh','qt3.giao_hang','qt3.ky_bbgh'], k) $function$
;

CREATE OR REPLACE FUNCTION public._steps(s text, n text, g text, h text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select array_remove(array[
    case when s in ('tiep_nhan','boc_tach','kiem_tra_f1') then 'qt0.' || s end,
    case when s in ('xndh','cho_duyet_xndh','cho_khach') then 'qt1.' || s end,
    case when s = 'san_xuat' then case g when 'lap_lgc' then 'qt2.b1' when 'cho_duyet_lgc' then 'qt2.b2'
      when 'cho_nvl' then case when n = 'nhap_kho' then 'qt2.b4' else 'qt2.b3' end
      when 'ban_giao' then 'qt2.b5' when 'gia_cong' then 'qt2.b6' end end,
    case when h in ('thong_bao','lap_lgh','cho_duyet_lgh','giao_hang','ky_bbgh') then 'qt3.' || h end], null) $function$
;

CREATE OR REPLACE FUNCTION public._stock(p_mat text, p_thk numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(sum(qty_kg), 0) from stock_moves where material = p_mat and thickness_mm = p_thk and warehouse = 'Kho NVL IPC'
$function$
;

CREATE OR REPLACE FUNCTION public._tol(kg numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select greatest(abs(coalesce(kg,0)) * 0.005, 5) $function$
;

CREATE OR REPLACE FUNCTION public._user_sees_doc(p_user uuid, p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from docs d join batches b on b.id = d.batch_id join profiles p on p.id = p_user and p.active
    where d.id = p_doc and ('admin_it' = any(p.roles) or b.proc = 'QT0'
      or d.company = case upper(coalesce(p.unit, '')) when 'CNC' then 'PN' when 'PN' then 'PN' when 'IPC' then 'IPC' when 'HANWA' then 'HW' when 'HW' then 'HW' end
      or d.company = any(user_cos(p_user))));
$function$
;

CREATE OR REPLACE FUNCTION public._vn(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lower(translate(coalesce(p, ''),
    'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'));
$function$
;

CREATE OR REPLACE FUNCTION public._wf_any(arr jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(arr) = 'array' then arr else '[]' end) x where _wf_match(x)) $function$
;

CREATE OR REPLACE FUNCTION public._wf_appr_zalo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tok text; chat text; t wf_tasks; ins wf_instances; pn text; txt text;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  select zalo_chat_id into chat from profiles where id = new.approver;
  if tok is null or coalesce(chat, '') = '' or new.approver = app_uid() then return new; end if;
  select * into t from wf_tasks where id = new.task_id; select * into ins from wf_instances where id = t.instance_id;
  select p.name into pn from wf_versions v join wf_processes p on p.id = v.process_id where v.id = ins.version_id;
  txt := '✅ Cần bạn duyệt: ' || t.step_name || ' · ' || new.level_name ||
    case when new.due_at is not null then E'\nHạn: ' || to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') else '' end ||
    E'\n' || pn || ' · ' || ins.title || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/quy-trinh-moi/chay/' || ins.id;
  perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  return new;
exception when others then return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_can_design(p_process uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or (exists (select 1 from profiles where id = app_uid() and active and 'thiet_ke_qt' = any(roles))
    and (p_process is null or exists (select 1 from wf_processes where id = p_process and created_by = app_uid()))) $function$
;

CREATE OR REPLACE FUNCTION public._wf_cancel_open(p_inst uuid, p_except uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c uuid;
begin
  update wf_approvals set status = 'bo_qua' where status = 'cho' and task_id in (select id from wf_tasks where instance_id = p_inst and status = 'cho' and id is distinct from p_except);
  for c in select i.id from wf_instances i join wf_tasks t on t.id = i.parent_task where t.instance_id = p_inst and t.status = 'cho' and t.id is distinct from p_except and i.status = 'dang_chay' loop
    perform _wf_cancel_open(c, null);
    update wf_instances set status = 'huy', done_at = now() where id = c;
  end loop;
  update wf_tasks set status = 'huy', done_at = now() where instance_id = p_inst and status = 'cho' and id is distinct from p_except;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_create_instance(p_version uuid, p_title text, p_test boolean, p_order uuid, p_parent uuid, p_init jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i uuid; v wf_versions; d jsonb := '{}'; f jsonb; val jsonb; o record;
begin
  select * into v from wf_versions where id = p_version;
  insert into wf_instances(version_id, title, is_test, order_id, parent_task)
  values (v.id, coalesce(nullif(trim(p_title), ''), (select code || coalesce(' · ' || nullif(project, ''), '') from orders where id = p_order), 'Hồ sơ'),
    p_test, p_order, p_parent) returning id into i;
  if p_order is not null then
    for f in select * from jsonb_array_elements(coalesce(v.def->'fields', '[]')) loop
      if coalesce((f->>'inherit')::boolean, false) then
        select x.data->(f->>'id') into val from wf_instances x where x.order_id = p_order and x.id <> i and x.status in ('hoan_tat', 'dang_chay')
          and _wf_filled(x.data->(f->>'id')) order by (x.status = 'hoan_tat') desc, coalesce(x.done_at, x.started_at) desc limit 1;
        if val is not null then d := d || jsonb_build_object(f->>'id', val); end if;
      end if;
    end loop;
    select code, project into o from orders where id = p_order;
    if exists (select 1 from jsonb_array_elements(coalesce(v.def->'fields', '[]')) ff where ff->>'id' = 'ma_don') and not (d ? 'ma_don') then d := d || jsonb_build_object('ma_don', o.code); end if;
    if exists (select 1 from jsonb_array_elements(coalesce(v.def->'fields', '[]')) ff where ff->>'id' = 'du_an') and not (d ? 'du_an') then d := d || jsonb_build_object('du_an', o.project); end if;
  end if;
  d := d || coalesce(p_init, '{}');
  update wf_instances set data = d where id = i;
  insert into wf_events(instance_id, process_id, action, detail) values (i, v.process_id, 'bat_dau', 'Bắt đầu: ' || (select title from wf_instances where id = i));
  perform _wf_enter(i, v.def->'steps'->0->>'id', null, 0);
  perform _wf_settle(i);
  return i;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_ctx(p_task uuid, OUT t wf_tasks, OUT ins wf_instances, OUT v wf_versions, OUT st jsonb)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.id is null then raise exception 'Không tìm thấy việc'; end if;
  select * into ins from wf_instances where id = t.instance_id;
  select * into v from wf_versions where id = ins.version_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = t.step_id limit 1);
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_enter(p_inst uuid, p_node text, p_from uuid, p_depth integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; v wf_versions; st jsonb; ty text; j wf_tasks; tid uuid; pv wf_versions; child uuid; msg text;
begin
  if p_depth > 60 then raise exception 'Quy trình lặp vô hạn giữa các nút tự động – kiểm tra lại các mũi tên'; end if;
  if p_node is null or p_node = '__end' then return; end if;
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.status <> 'dang_chay' then return; end if;
  st := _wf_node(v.def, p_node);
  if st is null then return; end if;
  ty := _wf_type(st);
  if ty = 'task' then
    perform _wf_open_task2(p_inst, st, p_from, 'task');
  elsif ty = 'action' then
    msg := _wf_run_actions(p_inst, st);
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'hanh_dong', coalesce(st->>'name', 'Hành động') || ': ' || msg);
    perform _wf_leave(p_inst, st, p_from, p_depth + 1);
  elsif ty = 'parallel' then
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'song_song', coalesce(st->>'name', 'Tách song song') || ' → ' || coalesce(jsonb_array_length(st->'branches'), 0) || ' nhánh');
    perform _wf_leave(p_inst, st, p_from, p_depth + 1);
  elsif ty = 'join' then
    select * into j from wf_tasks where instance_id = p_inst and step_id = st->>'id' and status = 'cho' and kind = 'join' limit 1;
    if j.id is null then
      tid := _wf_open_task2(p_inst, st, p_from, 'join');
      update wf_tasks set join_from = jsonb_build_array(p_from) where id = tid;
    else update wf_tasks set join_from = join_from || jsonb_build_array(p_from), prev_task = p_from where id = j.id; tid := j.id;
    end if;
    if coalesce(st->>'join_mode', 'all') = 'any' then
      perform _wf_cancel_open(p_inst, tid);
      update wf_tasks set status = 'xong', done_at = now() where id = tid;
      insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'gop', coalesce(st->>'name', 'Gộp') || ': một nhánh đã xong, huỷ các nhánh còn lại');
      perform _wf_leave(p_inst, st, tid, p_depth + 1);
    end if; -- 'all': _wf_settle quyết định khi nào đi tiếp
  elsif ty = 'subprocess' then
    tid := _wf_open_task2(p_inst, st, p_from, 'sub');
    select pv2.* into pv from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
      where pv2.process_id = nullif(st->>'process_id', '')::uuid and pv2.status = 'phat_hanh' and p.deleted_at is null limit 1;
    if pv.id is null then raise exception 'Quy trình con của "%" chưa phát hành', st->>'name'; end if;
    child := _wf_create_instance(pv.id, ins.title || ' · ' || (select name from wf_processes where id = pv.process_id), ins.is_test, ins.order_id,
      case when coalesce((st->>'wait')::boolean, true) then tid end, _wf_pick(ins.data, pv.def, st->'copy_in'));
    insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'quy_trinh_con', coalesce(st->>'name', 'Quy trình con') || ' → mở ' || (select name from wf_processes where id = pv.process_id));
    if not coalesce((st->>'wait')::boolean, true) then
      update wf_tasks set status = 'xong', done_at = now() where id = tid;
      perform _wf_leave(p_inst, st, tid, p_depth + 1);
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_fail(p_inst uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; pt wf_tasks;
begin
  select * into ins from wf_instances where id = p_inst;
  perform _wf_cancel_open(p_inst, null);
  update wf_instances set status = 'fail', done_at = now() where id = p_inst;
  if ins.parent_task is not null then
    select * into pt from wf_tasks where id = ins.parent_task;
    if pt.status = 'cho' then
      update wf_tasks set status = 'fail', done_at = now(), note = 'Quy trình con Fail: ' || p_note where id = pt.id;
      perform _wf_fail(pt.instance_id, 'Quy trình con Fail: ' || p_note);
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_filled(v jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select v is not null and jsonb_typeof(v) <> 'null' and case jsonb_typeof(v)
    when 'string' then trim(v #>> '{}') <> '' when 'array' then jsonb_array_length(v) > 0 else true end $function$
;

CREATE OR REPLACE FUNCTION public._wf_guard_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if exists (select 1 from wf_versions v join wf_processes p on p.id = v.process_id where v.id = new.version_id and p.deleted_at is not null) then
    raise exception 'Quy trình đã bị xoá'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_guard_required()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; v wf_versions; st jsonb; miss text;
begin
  if new.status = 'xong' and old.status = 'cho' then
    select * into ins from wf_instances where id = new.instance_id;
    select * into v from wf_versions where id = ins.version_id;
    st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = new.step_id limit 1);
    miss := _wf_required_missing(v.def, st, ins.data);
    if miss is not null then raise exception 'Chưa nhập trường bắt buộc: %', miss; end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_has_appr(st jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_array_length(st->'approval'->'levels'), 0) > 0 $function$
;

CREATE OR REPLACE FUNCTION public._wf_idx(p_def jsonb, p_id text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (o - 1)::int from jsonb_array_elements(p_def->'steps') with ordinality e(s, o) where s->>'id' = p_id $function$
;

CREATE OR REPLACE FUNCTION public._wf_items(p_step jsonb)
 RETURNS TABLE(key text, text text, kind text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(x->>'id', x#>>'{}'), coalesce(x->>'text', x#>>'{}'), coalesce(x->>'kind', 'check')
  from jsonb_array_elements(coalesce(p_step->'checklist', '[]')) x $function$
;

CREATE OR REPLACE FUNCTION public._wf_leave(p_inst uuid, st jsonb, p_from uuid, p_depth integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; v wf_versions; b text;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.status <> 'dang_chay' then return; end if;
  if _wf_type(st) = 'parallel' then
    for b in select jsonb_array_elements_text(coalesce(st->'branches', '[]')) loop perform _wf_enter(p_inst, b, p_from, p_depth + 1); end loop;
  else
    perform _wf_enter(p_inst, _wf_route(v.def, _wf_idx(v.def, st->>'id'), ins.data), p_from, p_depth + 1);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_match(a jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(a->>'id', '') <> '' and case a->>'type'
    when 'user'  then (a->>'id')::uuid = app_uid()
    when 'group' then exists (select 1 from work_groups g where g.id = (a->>'id')::uuid and g.active and app_uid() = any(g.member_ids))
    when 'role'  then exists (select 1 from profiles where id = app_uid() and active and (a->>'id') = any(roles))
    when 'creator' then true
    else false end $function$
;

CREATE OR REPLACE FUNCTION public._wf_node(p_def jsonb, p_id text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select x from jsonb_array_elements(p_def->'steps') x where x->>'id' = p_id limit 1 $function$
;

CREATE OR REPLACE FUNCTION public._wf_num(v jsonb)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
              when (v #>> '{}') ~ '^\s*-?[0-9]+([.,][0-9]+)?\s*$' then replace(trim(v #>> '{}'), ',', '.')::numeric end $function$
;

CREATE OR REPLACE FUNCTION public._wf_on_done(p_inst uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; v wf_versions; pt wf_tasks; pins wf_instances; pv wf_versions; st jsonb; r record;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  if ins.parent_task is not null then
    select * into pt from wf_tasks where id = ins.parent_task;
    if pt.status = 'cho' then
      select * into pins from wf_instances where id = pt.instance_id; select * into pv from wf_versions where id = pins.version_id;
      st := _wf_node(pv.def, pt.step_id);
      update wf_instances set data = data || _wf_pick(ins.data, pv.def, st->'copy_out') where id = pins.id;
      update wf_tasks set status = 'xong', done_at = now() where id = pt.id;
      insert into wf_events(instance_id, process_id, action, detail) values (pins.id, pv.process_id, 'quy_trinh_con', pt.step_name || ': quy trình con hoàn tất');
      perform _wf_leave(pins.id, st, pt.id, 0);
      perform _wf_settle(pins.id);
    end if;
  end if;
  if not ins.is_test then
    for r in select pv2.id vid from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
        where pv2.status = 'phat_hanh' and p.deleted_at is null and pv2.def->'trigger'->>'on' = 'process_done' and pv2.def->'trigger'->>'process_id' = v.process_id::text loop
      perform _wf_create_instance(r.vid, ins.title, false, ins.order_id, null, '{}');
    end loop;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_open_level(p_task uuid, p_from integer, p_round integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; lv jsonb; k int; n int; ids uuid[];
begin
  select * into t from wf_tasks where id = p_task; select * into ins from wf_instances where id = t.instance_id; select * into v from wf_versions where id = ins.version_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = t.step_id limit 1);
  n := coalesce(jsonb_array_length(st->'approval'->'levels'), 0);
  k := p_from;
  while k < n loop
    lv := st->'approval'->'levels'->k;
    if lv->'when' is null or coalesce(lv->'when'->>'field', '') = '' or coalesce(_wf_test(ins.data, lv->'when'), false) then
      select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(lv->'approvers', '[]')) a, _wf_people_i(a, ins.id) x
        join profiles p on p.id = x and p.active;
      if coalesce(array_length(ids, 1), 0) > 0 then
        insert into wf_approvals(task_id, round, level, level_id, level_name, approver, due_at)
        select t.id, p_round, k, lv->>'id', coalesce(nullif(lv->>'name', ''), 'Cấp ' || (k + 1)), u,
          case when coalesce((lv->>'sla_hours')::numeric, 0) > 0 then now() + ((lv->>'sla_hours')::numeric * interval '1 hour') end
        from unnest(ids) u;
        update wf_tasks set appr_state = 'dang_duyet' where id = t.id;
        insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'mo_duyet',
          (st->>'name') || ' · ' || coalesce(nullif(lv->>'name', ''), 'Cấp ' || (k + 1)) || ' (' || array_length(ids, 1) || ' người)');
        return true;
      end if;
    end if;
    k := k + 1;
  end loop;
  return false;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_open_task(p_inst uuid, p_step jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin perform _wf_open_task2(p_inst, p_step, null, 'task'); end $function$
;

CREATE OR REPLACE FUNCTION public._wf_open_task2(p_inst uuid, p_step jsonb, p_prev uuid, p_kind text DEFAULT 'task'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who uuid; tid uuid; v wf_versions;
begin
  if p_kind = 'task' then
    if p_step->'assignee'->>'type' = 'user' and coalesce(p_step->'assignee'->>'id', '') <> '' then who := (p_step->'assignee'->>'id')::uuid;
    elsif p_step->'assignee'->>'type' in ('creator', 'manager') then select x into who from _wf_people_i(p_step->'assignee', p_inst) x limit 1;
    end if;
  end if;
  insert into wf_tasks(instance_id, step_id, step_name, due_at, assigned_to, kind, prev_task)
  values (p_inst, p_step->>'id', p_step->>'name',
    case when p_kind = 'task' and coalesce((p_step->>'sla_hours')::numeric, 0) > 0 then now() + ((p_step->>'sla_hours')::numeric * interval '1 hour') end,
    who, p_kind, p_prev) returning id into tid;
  select v2.* into v from wf_instances i join wf_versions v2 on v2.id = i.version_id where i.id = p_inst;
  update wf_instances set step_idx = coalesce(_wf_idx(v.def, p_step->>'id'), step_idx) where id = p_inst;
  return tid;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_people(a jsonb)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (a->>'id')::uuid where a->>'type' = 'user' and coalesce(a->>'id','') <> ''
  union select unnest(g.member_ids) from work_groups g where a->>'type' = 'group' and g.active and g.id::text = a->>'id'
  union select p.id from profiles p where a->>'type' = 'role' and p.active and (a->>'id') = any(p.roles) $function$
;

CREATE OR REPLACE FUNCTION public._wf_people_i(a jsonb, p_inst uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select x from _wf_people(a) x where a->>'type' in ('user','group','role')
  union select i.started_by from wf_instances i where a->>'type' = 'creator' and i.id = p_inst
  union select p.manager_id from wf_instances i join profiles p on p.id = i.started_by where a->>'type' = 'manager' and i.id = p_inst and p.manager_id is not null $function$
;

CREATE OR REPLACE FUNCTION public._wf_pick(p_data jsonb, p_def_to jsonb, p_list jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  with keys as (
    select x #>> '{}' k from jsonb_array_elements(case when jsonb_typeof(p_list) = 'array' then p_list else '[]' end) x
    union
    select f->>'id' from jsonb_array_elements(coalesce(p_def_to->'fields', '[]')) f
      where coalesce(jsonb_array_length(case when jsonb_typeof(p_list) = 'array' then p_list end), 0) = 0)
  select coalesce(jsonb_object_agg(k, p_data->k), '{}') from keys where k is not null and coalesce(p_data, '{}') ? k $function$
;

CREATE OR REPLACE FUNCTION public._wf_required_missing(p_def jsonb, p_step jsonb, p_data jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select string_agg(coalesce(f->>'label', f->>'id'), ', ')
  from jsonb_array_elements(coalesce(p_def->'fields', '[]')) f
  where p_step->'perms'->>(f->>'id') = 'required' and not _wf_filled(p_data->(f->>'id')) $function$
;

CREATE OR REPLACE FUNCTION public._wf_route(p_def jsonb, p_idx integer, p_data jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare st jsonb := p_def->'steps'->p_idx; r jsonb; n int := jsonb_array_length(p_def->'steps');
begin
  for r in select * from jsonb_array_elements(coalesce(st->'routes', '[]')) loop
    if coalesce(r->>'goto', '') <> '' and coalesce(_wf_test(p_data, r), false) then return r->>'goto'; end if;
  end loop;
  if coalesce(st->>'next', '') <> '' then return st->>'next'; end if;
  if p_idx + 1 >= n then return '__end'; end if;
  return p_def->'steps'->(p_idx + 1)->>'id';
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_run_actions(p_inst uuid, st jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a jsonb; ins wf_instances; v wf_versions; ids uuid[]; out text := ''; pv wf_versions; nv jsonb; txt text;
begin
  select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
  for a in select * from jsonb_array_elements(coalesce(st->'actions', '[]')) loop
    if a->>'kind' = 'zalo' then
      select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(a->'to', '[]')) t, _wf_people_i(t, p_inst) x;
      txt := replace(replace(coalesce(a->>'text', ''), '{ho_so}', ins.title), '{quy_trinh}', coalesce((select name from wf_processes where id = v.process_id), ''));
      perform _wf_zalo_send(ids, '🔔 ' || txt || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/quy-trinh-moi/chay/' || p_inst);
      out := out || 'Gửi Zalo (' || coalesce(array_length(ids, 1), 0) || ' người); ';
    elsif a->>'kind' = 'set' and coalesce(a->>'field', '') <> '' then
      nv := case when (a->>'value') ~ '^-?[0-9]+([.][0-9]+)?$' then to_jsonb((a->>'value')::numeric)
                 when a->>'value' = '{hom_nay}' then to_jsonb(to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'))
                 else to_jsonb(coalesce(a->>'value', '')) end;
      update wf_instances set data = jsonb_set(data, array[a->>'field'], nv, true) where id = p_inst;
      out := out || 'Gán ' || (a->>'field') || '; ';
    elsif a->>'kind' = 'start' and coalesce(a->>'process_id', '') <> '' then
      select pv2.* into pv from wf_versions pv2 join wf_processes p on p.id = pv2.process_id
        where pv2.process_id = (a->>'process_id')::uuid and pv2.status = 'phat_hanh' and p.deleted_at is null limit 1;
      if pv.id is not null then
        perform _wf_create_instance(pv.id, ins.title, ins.is_test, ins.order_id, null, _wf_pick((select data from wf_instances where id = p_inst), pv.def, a->'copy'));
        out := out || 'Mở quy trình ' || (select name from wf_processes where id = pv.process_id) || '; ';
      else out := out || 'Bỏ qua mở quy trình (chưa phát hành); ';
      end if;
    end if;
  end loop;
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_settle(p_inst uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ins wf_instances; v wf_versions; j wf_tasks; k int := 0;
begin
  loop
    k := k + 1; exit when k > 30;
    select * into ins from wf_instances where id = p_inst; select * into v from wf_versions where id = ins.version_id;
    exit when ins.status <> 'dang_chay';
    if not exists (select 1 from wf_tasks where instance_id = p_inst and status = 'cho' and kind <> 'join') then
      select * into j from wf_tasks where instance_id = p_inst and status = 'cho' and kind = 'join' order by created_at limit 1;
      if j.id is not null then
        update wf_tasks set status = 'xong', done_at = now() where id = j.id;
        insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'gop', j.step_name || ': đủ ' || jsonb_array_length(j.join_from) || ' nhánh');
        perform _wf_leave(p_inst, _wf_node(v.def, j.step_id), j.id, 0);
        continue;
      end if;
      update wf_instances set status = 'hoan_tat', done_at = now() where id = p_inst;
      insert into wf_events(instance_id, process_id, action, detail) values (p_inst, v.process_id, 'hoan_tat', 'Hoàn tất');
      perform _wf_on_done(p_inst);
    end if;
    exit;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_tasks_zalo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tok text; ins wf_instances; v wf_versions; pn text; st jsonb; ids uuid[]; txt text; r record; head text;
begin
  if new.status <> 'cho' or coalesce(new.kind, 'task') <> 'task' then return new; end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if tok is null then return new; end if;
  select * into ins from wf_instances where id = new.instance_id;
  select * into v from wf_versions where id = ins.version_id;
  select name into pn from wf_processes where id = v.process_id;
  st := (select x from jsonb_array_elements(v.def->'steps') x where x->>'id' = new.step_id limit 1);
  head := pn || ' · ' || ins.title || case when ins.is_test then ' (chạy thử)' else '' end;
  if new.assigned_to is not null then
    ids := array[new.assigned_to]; txt := '📌 Đến lượt bạn: ' || new.step_name;
  elsif coalesce(st->'assignee'->>'id', '') <> '' then
    select array_agg(distinct x) into ids from _wf_people(st->'assignee') x; txt := '📌 Đến lượt bạn: ' || new.step_name;
  else
    select array_agg(distinct x) into ids from jsonb_array_elements(coalesce(st->'managers', '[]')) m, _wf_people(m) x;
    txt := '👥 Cần phân công người làm: ' || new.step_name;
  end if;
  if new.due_at is not null then txt := txt || E'\nHạn: ' || to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM'); end if;
  txt := txt || E'\n' || head || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/quy-trinh-moi/chay/' || ins.id;
  for r in select zalo_chat_id from profiles where id = any(coalesce(ids, '{}')) and id is distinct from app_uid() and coalesce(zalo_chat_id, '') <> '' loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  end loop;
  return new;
exception when others then return new;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_test(p_data jsonb, r jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v jsonb := _wf_val(p_data, r->>'field'); a numeric := _wf_num(v); b numeric := _wf_num(r->'value'); s text := lower(coalesce(v #>> '{}', '')); t text := lower(coalesce(r->>'value', ''));
begin
  return case r->>'op'
    when 'gt' then a > b when 'ge' then a >= b when 'lt' then a < b when 'le' then a <= b
    when 'eq' then case when a is not null and b is not null then a = b else s = t end
    when 'ne' then case when a is not null and b is not null then a <> b else s <> t end
    when 'contains' then position(t in s) > 0
    when 'empty' then not _wf_filled(v) when 'filled' then _wf_filled(v)
    else false end;
end $function$
;

CREATE OR REPLACE FUNCTION public._wf_type(st jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select coalesce(nullif(st->>'type', ''), 'task') $function$
;

CREATE OR REPLACE FUNCTION public._wf_val(p_data jsonb, p_field text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when position('.' in p_field) > 0 then
      (select to_jsonb(coalesce(sum(case when jsonb_typeof(r->split_part(p_field, '.', 2)) = 'number' then (r->>split_part(p_field, '.', 2))::numeric
                                           when (r->>split_part(p_field, '.', 2)) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(r->>split_part(p_field, '.', 2), ',', '.')::numeric end), 0))
       from jsonb_array_elements(case when jsonb_typeof(p_data->split_part(p_field, '.', 1)) = 'array' then p_data->split_part(p_field, '.', 1) else '[]' end) r)
    else p_data->p_field end $function$
;

CREATE OR REPLACE FUNCTION public._wf_zalo_send(p_users uuid[], p_text text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tok text; r record; n int := 0;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if tok is null then return 0; end if;
  for r in select distinct zalo_chat_id from profiles where id = any(p_users) and coalesce(zalo_chat_id, '') <> '' loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(p_text, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
    n := n + 1;
  end loop;
  return n;
exception when others then return n;
end $function$
;

CREATE OR REPLACE FUNCTION public._with_deleg(p_ids uuid[])
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct u), '{}') from (select unnest(p_ids) u
    union select dl.to_user from delegations dl where dl.user_id = any(p_ids) and current_date between dl.from_date and dl.to_date) x where u is not null;
$function$
;

CREATE OR REPLACE FUNCTION public._zalo_mentions(p_uid uuid, p_doc uuid, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text := _vn(p_text); seg text; pos int := 0; tags uuid[] := '{}'; warn text[] := '{}'; c record; best uuid; bl int; n int; w text; names text;
begin
  for seg in select (regexp_matches(t, '@([^@]{1,40})', 'g'))[1] loop
    if seg ~ '^\?' then continue; end if;
    best := null; bl := 0;
    -- khớp cả tên dài nhất ở đầu đoạn sau @
    for c in select p.id, _vn(p.full_name) nm from profiles p where p.active and p.id <> p_uid and _user_sees_doc(p.id, p_doc) loop
      if seg like c.nm || '%' and length(c.nm) > bl then best := c.id; bl := length(c.nm); end if;
    end loop;
    if best is null then
      w := (regexp_match(seg, '^([a-z0-9]+)'))[1];
      if w is null then continue; end if;
      select count(*), (array_agg(p.id))[1], string_agg(p.full_name, ' / ') into n, best, names from profiles p
        where p.active and p.id <> p_uid and _user_sees_doc(p.id, p_doc) and (' ' || _vn(p.full_name) || ' ') like '% ' || w || '%';
      if n = 0 then warn := warn || ('Không có ai tên “@' || w || '” xem được phiếu này'); best := null;
      elsif n > 1 then warn := warn || ('Không rõ @' || w || ': ' || names || ' – gõ rõ hơn'); best := null; end if;
    end if;
    if best is not null and not best = any(tags) then tags := tags || best; end if;
  end loop;
  if cardinality(tags) > 5 then warn := warn || 'Chỉ nhắc 5 người đầu'; tags := tags[1:5]; end if;
  return jsonb_build_object('tags', to_jsonb(tags), 'warn', to_jsonb(warn));
end $function$
;

CREATE OR REPLACE FUNCTION public._zalo_out_resolve()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
  update zalo_out z set message_id = coalesce(r.content::jsonb -> 'result' ->> 'message_id', r.content::jsonb ->> 'message_id')
  from net._http_response r where z.message_id is null and r.id = z.req_id and r.content is not null and r.content ~ '^\s*\{';
  delete from zalo_out where at < now() - interval '60 days';
  delete from zalo_raw where at < now() - interval '14 days';
$function$
;

CREATE OR REPLACE FUNCTION public._zalo_step(p_order uuid, p_step text, p_event text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k text;
begin
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return; end if;
  perform net.http_post(url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=step',
    body := jsonb_build_object('order_id', p_order, 'step', p_step, 'event', p_event, 'actor', p_actor),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
end $function$
;

CREATE OR REPLACE FUNCTION public._zg_docs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p text; s jsonb; who text;
begin
  select b.proc into p from batches b where b.id = new.batch_id;
  if new.status = 'da_duyet' and old.status is distinct from 'da_duyet' then
    perform _zgroup(new.company, 'approved', '✅ Đã duyệt ' || p || E'\n' || _doc_line(new.id));
  elsif jsonb_typeof(new.signs) = 'array' and jsonb_array_length(new.signs) > coalesce(jsonb_array_length(case when jsonb_typeof(old.signs) = 'array' then old.signs end), 0) then
    s := new.signs -> -1;
    if s ->> 'action' = 'tra_ve' then select full_name into who from profiles where id = (s ->> 'user')::uuid;
      perform _zgroup(new.company, 'returned', '↩️ Phiếu bị trả về · ' || coalesce(who, '') || E'\nLý do: ' || coalesce(s ->> 'note', '') || E'\n' || _doc_line(new.id)); end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public._zg_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform _zgroup('PN', 'new_order', '🆕 Đơn mới ' || coalesce(new.code, '') || ' · ' || coalesce(new.project, '') || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || new.id, new.project_id);
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public._zg_projects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update zalo_groups g set projects = array(select distinct x from unnest(g.projects || new.id) x)
  where not g.all_projects and not (new.id = any(g.projects)) and (
    (new.end_customer_id is not null and new.end_customer_id = any(g.rule_customers))
    or exists (select 1 from unnest(g.rule_prefix) p where p <> '' and upper(new.code) like upper(p) || '%'));
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public._zgroup(p_company text, p_event text, p_text text, p_project uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tk text; g record; n int := 0; dc uuid := nullif(current_setting('pms.zdoc', true), '')::uuid; pj uuid := p_project;
begin
  if p_text ilike '%[MẪU]%' or p_text ilike '%[MAU]%' or (dc is not null and exists (select 1 from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = dc and o.project ~* '^\s*\[(MẪU|MAU)\]')) then
    perform set_config('pms.zdoc', '', true); return 0; end if;
  if pj is null and dc is not null then select o.project_id into pj from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = dc; end if;
  select value into tk from app_secrets where name = 'ZALO_BOT_TOKEN'; if tk is null then return 0; end if;
  for g in select chat_id from zalo_groups where active and p_event = any(events) and (company is null or company = p_company)
      and (all_projects or pj = any(projects)) loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tk || '/sendMessage',
      body := jsonb_build_object('chat_id', g.chat_id, 'text', left(p_text, 2000)), headers := '{"Content-Type":"application/json"}'::jsonb);
    n := n + 1; end loop;
  perform set_config('pms.zdoc', '', true); return n;
end $function$
;

CREATE OR REPLACE FUNCTION public._zsend(p_ids uuid[], p_text text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tk text; p record; n int := 0; rid bigint; dc uuid := nullif(current_setting('pms.zdoc', true), '')::uuid;
begin
  if p_text ilike '%[MẪU]%' or p_text ilike '%[MAU]%' or (dc is not null and exists (select 1 from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = dc and o.project ~* '^\s*\[(MẪU|MAU)\]')) then
    perform set_config('pms.zdoc', '', true); return 0; end if;
  select value into tk from app_secrets where name = 'ZALO_BOT_TOKEN'; if tk is null then return 0; end if;
  for p in select zalo_chat_id from profiles where id = any(p_ids) and zalo_chat_id is not null and active loop
    rid := net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tk || '/sendMessage',
      body := jsonb_build_object('chat_id', p.zalo_chat_id, 'text', left(p_text, 2000)), headers := '{"Content-Type":"application/json"}'::jsonb);
    if dc is not null then insert into zalo_out(req_id, chat_id, doc_id) values (rid, p.zalo_chat_id, dc) on conflict do nothing; end if;
    n := n + 1;
  end loop;
  perform set_config('pms.zdoc', '', true);
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.act_grant_add(p_admin uuid, p_target uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare id uuid; an text;
begin
  if not is_real_admin() then raise exception 'Chỉ IT quản trị được cấp uỷ quyền'; end if;
  if p_to <= p_from then raise exception 'Thời gian kết thúc phải sau thời gian bắt đầu'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Ghi lý do uỷ quyền'; end if;
  if not exists (select 1 from profiles where profiles.id = p_admin and active and roles && array['admin_it','admin_cnc']) then raise exception 'Người được uỷ quyền phải là admin'; end if;
  if p_target = p_admin then raise exception 'Không uỷ quyền làm thay chính mình'; end if;
  insert into act_grants(admin_id, target_id, from_at, to_at, reason) values (p_admin, p_target, p_from, p_to, trim(p_reason)) returning act_grants.id into id;
  select full_name into an from profiles where profiles.id = p_admin;
  insert into audit_log(actor, table_name, action, detail) values (auth.uid(), 'act_grants', 'Cấp uỷ quyền làm thay',
    jsonb_build_object('grant', id, 'admin', p_admin, 'target', p_target, 'from', p_from, 'to', p_to, 'reason', p_reason));
  if p_target is not null then
    perform _zsend(array[p_target], '🔐 Uỷ quyền làm thay' || E'\n' || an || ' được làm thay bạn trong app PMS' || E'\nTừ ' ||
      to_char(p_from at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' đến ' || to_char(p_to at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || E'\nLý do: ' || trim(p_reason));
  end if;
  return id;
end $function$
;

CREATE OR REPLACE FUNCTION public.act_grant_revoke(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_real_admin() then raise exception 'Chỉ IT quản trị được huỷ uỷ quyền'; end if;
  update act_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_id and revoked_at is null;
  insert into audit_log(actor, table_name, action, detail) values (auth.uid(), 'act_grants', 'Huỷ uỷ quyền làm thay', jsonb_build_object('grant', p_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.act_status()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when p.impersonating is null then null else jsonb_build_object('target', p.impersonating,
    'until', (public._act_grant(p.impersonating)).to_at, 'reason', (public._act_grant(p.impersonating)).reason) end
  from profiles p where p.id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.admin_health(p_days integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare req record; miss jsonb := '[]'; lockd jsonb; zl jsonb; st jsonb;
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT'; end if;
  for req in select v.p, v.c, v.ro from (values ('QT0','PN','admin'),('QT0','PN','ky_thuat'),('QT0','PN','kiem_tra'),('QT0','PN','duyet')) v(p,c,ro)
    union all select p, c, ro from unnest(array['QT1','QT2','QT3']) p, unnest(array['PN','IPC','HW']) c, unnest(array['lap','kiem_tra','duyet']) ro
    union all select 'QT3', c, 'thu_kho' from unnest(array['PN','IPC','HW']) c loop
    if not exists (select 1 from chain_people cp where cp.proc = req.p and cp.company = req.c and cp.role = req.ro and (
        exists (select 1 from profiles pr where pr.id = cp.user_id and pr.active)
        or exists (select 1 from work_groups g join profiles pr on pr.id = any(g.member_ids) and pr.active where g.id = cp.group_id and g.active))) then
      miss := miss || jsonb_build_object('proc', req.p, 'company', req.c, 'role', req.ro);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('proc', cp.proc, 'company', cp.company, 'role', cp.role, 'user', pr.full_name, 'user_id', pr.id, 'via', g.name)), '[]') into lockd
    from chain_people cp left join work_groups g on g.id = cp.group_id
    join profiles pr on (pr.id = cp.user_id or pr.id = any(coalesce(g.member_ids, '{}'))) where not pr.active;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'unit', unit) order by full_name), '[]') into zl from profiles where active and coalesce(zalo_chat_id, '') = '';
  select coalesce(jsonb_agg(jsonb_build_object('doc', d.id, 'order', o.id, 'code', doc_code(d.id), 'project', o.project, 'proc', b.proc, 'company', d.company, 'status', d.status, 'since', d.status_at) order by d.status_at), '[]') into st
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    where d.status not in ('da_duyet', 'fail') and b.status = 'dang_lam' and d.status_at < now() - make_interval(days => p_days) and coalesce(o.project, '') not like '[MẪU]%';
  return jsonb_build_object('missing', miss, 'locked', lockd, 'no_zalo', zl, 'stuck', st, 'days', p_days, 'at', now());
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_last_seen()
 RETURNS TABLE(id uuid, last_sign_in timestamp with time zone, last_active timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select u.id, u.last_sign_in_at,
         greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id))
  from auth.users u
  where public.has_role('admin_it');
$function$
;

CREATE OR REPLACE FUNCTION public.all_user_cos()
 RETURNS TABLE(id uuid, cos text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, public.user_cos(p.id) from profiles p where public.has_role('admin_it') or public.has_role('admin_cnc');
$function$
;

CREATE OR REPLACE FUNCTION public.app_company()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case unit when 'CNC' then 'PN' when 'IPC' then 'IPC' when 'HANWA' then 'HW' end from profiles where id = app_uid();
$function$
;

CREATE OR REPLACE FUNCTION public.app_uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select p.impersonating from profiles p where p.id = auth.uid() and p.active and p.impersonating is not null
       and ('admin_it' = any(p.roles) or (public._act_grant(p.impersonating)).id is not null)),
    auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.audit_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oid uuid; rec jsonb;
begin
  rec := to_jsonb(coalesce(new, old));
  oid := case when tg_table_name = 'orders' then (rec->>'id')::uuid else (rec->>'order_id')::uuid end;
  insert into audit_log(order_id, table_name, action, detail)
  values (oid, tg_table_name, lower(tg_op),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else rec end);
  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.batch_code(p_batch uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select c.code from co_orders c where c.batch_id = b.id order by c.created_at desc limit 1), o.code)
  from batches b join orders o on o.id = b.order_id where b.id = p_batch;
$function$
;

CREATE OR REPLACE FUNCTION public.batch_create(p_order uuid, p_proc text, p_title text DEFAULT ''::text, p_opts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b uuid; n int; t jsonb := '{}'; ck jsonb := coalesce(p_opts->'checklist', '{}'); co uuid := nullif(p_opts->>'co_order', '')::uuid; q0 uuid := nullif(p_opts->>'qt0', '')::uuid;
begin
  if not _is_person(p_proc, 'PN', case when p_proc = 'QT0' then 'admin' else 'lap' end) then raise exception 'Bạn không phụ trách lập hồ sơ % của Phương Nam CNC', p_proc; end if;
  if p_proc = 'QT2' and (select count(*) from jsonb_each_text(ck) where value = 'true') < 5 then
    raise exception 'Chưa đủ 5 điều kiện: bóc tách đã duyệt, đủ vật tư, đủ công cụ, vấn đề kỹ thuật đã xử lý, đã công bố tiêu chuẩn QC'; end if;
  if p_proc = 'QT1' then
    if q0 is null then select x.id into q0 from batches x where x.order_id = p_order and x.proc = 'QT0' and x.status = 'hoan_tat' order by x.done_at desc limit 1; end if;
    if q0 is not null and not exists (select 1 from batches where id = q0 and order_id = p_order and proc = 'QT0' and status = 'hoan_tat') then raise exception 'QT0 không hợp lệ'; end if;
  end if;
  if p_proc = 'QT1' and coalesce((p_opts->>'use_qt0')::boolean, false) then
    if q0 is null then raise exception 'Chưa có danh sách tấm QT0 đã duyệt để lấy'; end if;
    select d.tables into t from docs d where d.batch_id = q0 limit 1;
    if jsonb_typeof(p_opts->'pick') = 'array' then
      if jsonb_array_length(p_opts->'pick') = 0 then raise exception 'Chưa chọn tấm nào'; end if;
      t := jsonb_build_object('ds', coalesce((select jsonb_agg(_qt0_take(_m2_tam(e), _num0(p->>'q')) order by i)
        from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality x(e, i) join jsonb_array_elements(p_opts->'pick') p on (p->>'i')::int = i - 1 where _num0(p->>'q') > 0), '[]'));
    elsif jsonb_typeof(p_opts->'rows') = 'array' then
      if jsonb_array_length(p_opts->'rows') = 0 then raise exception 'Chưa chọn tấm nào'; end if;
      t := jsonb_build_object('ds', coalesce((select jsonb_agg(_m2_tam(e) order by i) from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality as x(e, i)
        where (i - 1)::text in (select jsonb_array_elements_text(p_opts->'rows'))), '[]'));
    else t := jsonb_build_object('ds', coalesce((select jsonb_agg(_m2_tam(e) order by i) from jsonb_array_elements(coalesce(t->'ds', '[]')) with ordinality x(e, i)), '[]')); end if;
  end if;
  if co is not null and not exists (select 1 from co_orders where id = co and order_id = p_order and company = 'PN') then raise exception 'Đơn PN không thuộc hồ sơ này'; end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = p_order and proc = p_proc;
  insert into batches(order_id, proc, seq, title, checklist, co_order_id, src_qt0) values (p_order, p_proc, n,
    coalesce(nullif(trim(p_title), ''), case p_proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end || n), ck,
    case when p_proc in ('QT2','QT3') then co end, case when p_proc = 'QT1' then q0 end)
    returning id into b;
  insert into docs(batch_id, company, status, tables) values (b, 'PN', (_flow(p_proc))[1], coalesce(t, '{}'));
  perform log_event(p_order, 'Mở ' || p_proc || ' · ' || (select title from batches where id = b) || coalesce(' · từ ' || _qt0_code(q0), ''));
  return b;
end $function$
;

CREATE OR REPLACE FUNCTION public.batch_delete(p_batch uuid, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; d docs; n int;
begin
  select * into b from batches where id = p_batch for update;
  if b.id is null then raise exception 'Không tìm thấy hồ sơ'; end if;
  select count(*) into n from docs where batch_id = p_batch;
  select * into d from docs where batch_id = p_batch order by created_at limit 1;
  if n <> 1 or d.status <> (case when b.proc = 'QT0' then 'tiep_nhan' else 'lap' end) or b.status <> 'dang_lam' then
    raise exception 'Chỉ xoá được khi hồ sơ còn ở bước đầu (Lập / Tiếp nhận) và chưa ai duyệt'; end if;
  if not (is_adm() or can_act(d.id)) then raise exception 'Bạn không phụ trách bước này'; end if;
  delete from doc_records where doc_id = d.id;
  delete from docs where id = d.id;
  delete from batches where id = p_batch;
  perform log_event(b.order_id, 'Xoá ' || b.proc || ' · ' || b.title || case when coalesce(trim(p_note), '') <> '' then ' – ' || p_note else '' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.batch_finish(p_batch uuid, p_files jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; co text;
begin
  select * into b from batches where id = p_batch;
  if b.status <> 'cho_ky' then raise exception 'Hồ sơ chưa duyệt xong 3 công ty'; end if;
  co := _fin_co(b.proc);
  if not (_is_person(b.proc, co, 'hoan_tat') or _is_person(b.proc, co, 'lap') or is_adm()) then raise exception 'Không có quyền'; end if;
  if _jarr_len(p_files) = 0 then raise exception 'Tải bản đã ký'; end if;
  update batches set status = 'hoan_tat', done_at = now(), final_files = p_files where id = p_batch;
  perform log_event(b.order_id, b.proc || ' · ' || b.title || ': hoàn tất (đã ký tay)');
end $function$
;

CREATE OR REPLACE FUNCTION public.can_act(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public._act_ok(p_doc) and public._co_ok((select company from docs where id = p_doc)) and coalesce((select case
      when has_role('admin_it') then true
      when d.assignee is not null then d.assignee = any(my_ids())
      when d.status = 'duyet_them' then exists (select 1 from approval_levels l
        where l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid and in_any(l.user_id, l.group_id))
      else _is_person(b.proc, d.company, _role_of(b.proc, d.status)) end
    from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.status = 'dang_lam'), false);
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_doc(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or exists (select 1 from profiles p where p.id = any(doc_holders(p_doc)) and p.manager_id = app_uid());
$function$
;

CREATE OR REPLACE FUNCTION public.can_start(p_proc text, p_co text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or has_role('admin_cnc') or _is_person(p_proc, p_co, case when p_proc = 'QT0' then 'admin' else 'lap' end);
$function$
;

CREATE OR REPLACE FUNCTION public.cccd_mask(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when length(p) > 7 then left(p, 3) || repeat('•', length(p) - 7) || right(p, 4) else repeat('•', length(p)) end $function$
;

CREATE OR REPLACE FUNCTION public.cccd_ok(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or has_role('admin_cnc') or has_role('kho_qc') or coalesce(can_act(p_doc), false)
    or exists (select 1 from docs x join batches b on b.id = x.batch_id where b.proc = 'QT3' and b.status = 'dang_lam'
      and b.order_id = (select b2.order_id from docs d2 join batches b2 on b2.id = d2.batch_id where d2.id = p_doc)
      and qt3_root(x.id) = qt3_root(p_doc) and coalesce(can_act(x.id), false)) $function$
;

CREATE OR REPLACE FUNCTION public.check_f1(p_order uuid, p_ok boolean, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('kiem_tra_f1') then raise exception 'Không có quyền kiểm tra F1'; end if;
  perform _set_in_fn();
  if p_ok then
    update orders set f1_result = 'dat', f1_checked_by = app_uid(), status = 'xndh' where id = p_order and status = 'kiem_tra_f1';
  else
    if coalesce(trim(p_note),'') = '' then raise exception 'Cần ghi nội dung cần bổ sung'; end if;
    update orders set f1_result = 'khong_dat', f1_checked_by = app_uid(), status = 'boc_tach', supplement_note = p_note
      where id = p_order and status = 'kiem_tra_f1';
  end if;
  if not found then raise exception 'Đơn không ở bước kiểm tra F1'; end if;
  insert into confirmations(order_id) values (p_order) on conflict do nothing;
  perform log_event(p_order, case when p_ok then 'ĐK1 đạt: F1 đạt' else 'F1 không đạt: ' || p_note end);
end $function$
;

CREATE OR REPLACE FUNCTION public.checklist_missing(p_order uuid, p_step text)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(i.label order by i.sort), '{}') from checklist_items i
  where i.step = p_step and i.active and i.required
    and not exists (select 1 from checklist_done d where d.order_id = p_order and d.item_id = i.id and d.done) $function$
;

CREATE OR REPLACE FUNCTION public.claim_step(p_order uuid, p_step text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r order_steps;
begin
  select * into r from order_steps where order_id = p_order and step = p_step and done_at is null;
  if not found then raise exception 'Bước này không còn mở'; end if;
  if r.doer_group_id is null then raise exception 'Bước này giao cho một người, không cần nhận'; end if;
  if not (in_group(r.doer_group_id) or has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Bạn không thuộc nhóm được giao'; end if;
  update order_steps set doer_id = public.app_uid(), claimed_at = now() where order_id = p_order and step = p_step;
  perform log_event(p_order, 'Nhận việc bước ' || p_step);
  perform _zalo_step(p_order, p_step, 'claimed', public.app_uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.close_qt1(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c confirmations;
begin
  if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  select * into c from confirmations where order_id = p_order;
  if c.kh1_confirmed_at is null or c.kh2_confirmed_at is null then raise exception 'Chưa đủ xác nhận KH1 và KH2'; end if;
  if coalesce(c.signed_pdf_path,'') = '' then raise exception 'Chưa tải PDF XNĐH đã ký'; end if;
  perform _set_in_fn();
  update orders set status = 'san_xuat', nvl_status = 'du_toan', gc_status = 'lap_lgc' where id = p_order and status = 'cho_khach';
  if not found then raise exception 'Đơn không ở bước chờ khách'; end if;
  perform log_event(p_order, 'ĐK2 đạt: mở QT2 Lệnh gia công & bàn giao NVL');
end $function$
;

CREATE OR REPLACE FUNCTION public.co_copy_ref(p_doc uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co co_orders; t jsonb; rows jsonb;
begin
  select * into co from co_orders where doc_id = p_doc; if co.ref_id is null then raise exception 'Chưa chọn đơn tham chiếu'; end if;
  if not (can_act(p_doc) or has_role('admin_it')) then raise exception 'Bạn không có quyền'; end if;
  select d.tables into t from co_orders r join docs d on d.id = r.doc_id where r.id = co.ref_id;
  select coalesce(jsonb_agg(x - 'don_gia' - 'tt'), '[]') into rows from jsonb_array_elements(coalesce(t->'ds', '[]')) x;
  update docs set tables = coalesce(tables, '{}') || jsonb_build_object('ds', rows) where id = p_doc;
  return jsonb_array_length(rows);
end $function$
;

CREATE OR REPLACE FUNCTION public.co_preview(p_rule text, p_co text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select regexp_replace(replace(replace(replace(replace(replace(replace(replace(p_rule,
    '{YYYYMMDD}', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD')), '{YYMMDD}', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMMDD')),
    '{YYMM}', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM')), '{B1}', _co_b1(p_co)),
    '{BAN}', p_co), '{MUA}', coalesce((select buyer from companies where code = p_co), 'KHCUOI')), '{DA}', 'SLUCOL'), '\{STT(:\d)?\}', '01')
$function$
;

CREATE OR REPLACE FUNCTION public.co_ref_audit()
 RETURNS TABLE(code text, company text, van_de text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.code, c.company, 'Tham chiếu sang đơn khác đơn hàng gốc (' || r.code || ')' from co_orders c join co_orders r on r.id = c.ref_id where r.order_id is distinct from c.order_id and has_role('admin_it')
  union all
  select r.code, r.company, 'Bị ' || count(*) || ' đơn tham chiếu cùng lúc' from co_orders c join co_orders r on r.id = c.ref_id where has_role('admin_it') group by r.code, r.company having count(*) > 1
  union all
  select c.code, c.company, 'Đơn tự tạo nhưng tham chiếu ' || coalesce(r.code, '—') || ' khác đơn nguồn ' || coalesce(s.code, '—')
  from co_orders c join docs d on d.id = c.doc_id join batches b on b.id = d.batch_id
  left join co_orders s on s.doc_id::text = b.checklist->>'auto_from' left join co_orders r on r.id = c.ref_id
  where nullif(b.checklist->>'auto_from', '') is not null and s.id is distinct from c.ref_id and has_role('admin_it') $function$
;

CREATE OR REPLACE FUNCTION public.co_ref_info(p_doc uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co co_orders;
begin
  select * into co from co_orders where doc_id = p_doc; if not found then return null; end if;
  return jsonb_build_object('auto', _co_auto(p_doc), 'ref_id', co.ref_id,
    'ref_code', (select code from co_orders where id = co.ref_id),
    'cands', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'code', f.code) order by f.created_at desc) from _co_free(co) f), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.co_set_code(p_doc uuid, p_code text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.co_set_ref(p_doc uuid, p_ref uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare co co_orders; old text; nw text;
begin
  select * into co from co_orders where doc_id = p_doc; if not found then raise exception 'Không tìm thấy đơn công ty'; end if;
  if not (can_act(p_doc) or has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Bạn không có quyền'; end if;
  if _co_auto(p_doc) then raise exception 'Đơn được tạo tự động từ bước duyệt của công ty trước – không đổi được tham chiếu'; end if;
  if (select status from docs where id = p_doc) <> 'lap' then raise exception 'Chỉ đổi tham chiếu ở bước Lập'; end if;
  if p_ref is not null and not exists (select 1 from _co_free(co) f where f.id = p_ref) then
    raise exception 'Chỉ chọn được đơn của công ty liền trước, cùng đơn hàng, đã duyệt và chưa được liên kết'; end if;
  old := (select code from co_orders where id = co.ref_id); nw := (select code from co_orders where id = p_ref);
  update co_orders set ref_id = p_ref where id = co.id;
  perform log_event(co.order_id, 'Đổi tham chiếu đơn ' || co.company || ' ' || co.code || ': ' || coalesce(old, '—') || ' → ' || coalesce(nw, '—'));
end $function$
;

CREATE OR REPLACE FUNCTION public.confirm_customer(p_order uuid, p_which integer, p_channel text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from orders where id = p_order and status = 'cho_khach') then raise exception 'XNĐH chưa được duyệt nội bộ'; end if;
  if p_which = 1 then
    update confirmations set kh1_confirmed_at = now(), kh1_channel = p_channel where order_id = p_order;
  elsif p_which = 2 then
    if not exists (select 1 from confirmations where order_id = p_order and kh1_confirmed_at is not null) then
      raise exception 'KH1 (IPC) xác nhận trước, rồi mới tới KH2 (Hanwa)';
    end if;
    update confirmations set kh2_confirmed_at = now(), kh2_channel = p_channel where order_id = p_order;
  else raise exception 'p_which phải là 1 hoặc 2'; end if;
  perform log_event(p_order, 'KH' || p_which || ' xác nhận XNĐH qua ' || p_channel);
end $function$
;

CREATE OR REPLACE FUNCTION public.ct_preview(p_co text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _ct_fmt(ct_rule, code, case when ct_yearly and coalesce(ct_year,0) <> extract(year from now())::int then 1 else ct_last+1 end, extract(year from now())::int) from companies where code=p_co
$function$
;

CREATE OR REPLACE FUNCTION public.daily_report_text()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare run int; done1 int; stuck int; late int; newb int; bn text; t text; r record;
begin
  select count(*) into run from batches where status in ('dang_lam','cho_ky');
  select count(*) into done1 from batches where status = 'hoan_tat' and done_at >= now() - interval '1 day';
  select count(*) into newb from batches where status <> 'huy' and created_at >= now() - interval '1 day';
  select count(*) into stuck from batches b where b.status in ('dang_lam','cho_ky')
    and coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at) < now() - interval '2 days';
  select count(*) into late from orders o where o.due_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date
    and exists (select 1 from batches b where b.order_id = o.id and b.status in ('dang_lam','cho_ky'));
  select b.proc || ' · ' || coalesce(case when b.proc <> 'QT0' then (case d.company when 'HW' then 'Hanwa' else d.company end) || ' · ' end, '') || (case d.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm' when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'lap' then 'Lập' else d.status end) || ' (' || count(*) || ')' into bn
    from batches b join lateral (select * from docs x where x.batch_id = b.id order by x.status_at desc limit 1) d on true
    where b.status = 'dang_lam' group by b.proc, d.company, d.status order by count(*) desc limit 1;
  t := '📊 Báo cáo sáng ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY') || E'\n'
    || '▶️ Đang chạy: ' || run || ' hồ sơ' || E'\n'
    || '✅ Hoàn tất hôm qua: ' || done1 || '  ·  🆕 Mở mới: ' || newb || E'\n'
    || case when stuck > 0 then '⏳ Kẹt ≥ 2 ngày: ' || stuck else '⏳ Không có hồ sơ kẹt' end || E'\n'
    || case when late > 0 then '⚠️ Đơn quá hạn giao: ' || late else '👍 Không có đơn quá hạn' end;
  if bn is not null then t := t || E'\n🔥 Nghẽn nhiều nhất: ' || bn; end if;
  for r in select public.batch_code(b.id) as code, b.title, b.proc, extract(day from now() - coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at))::int as dd
      from batches b join orders o on o.id = b.order_id where b.status in ('dang_lam','cho_ky')
      order by coalesce((select max(d.status_at) from docs d where d.batch_id = b.id), b.created_at) limit 3 loop
    if r.dd >= 1 then t := t || E'\n  • ' || r.code || ' ' || r.proc || ' – chờ ' || r.dd || ' ngày'; end if;
  end loop;
  return t || E'\n\nXem chi tiết: https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/thong-ke';
end $function$
;

CREATE OR REPLACE FUNCTION public.dash_data(p_scope text DEFAULT 'ALL'::text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with since as (select now() - make_interval(days => greatest(p_days, 56)) t),
  bb as (select b.* from batches b, since where b.status <> 'huy' and not exists (select 1 from orders o where o.id = b.order_id and o.project ~* '^\s*\[(MẪU|MAU)\]')
           and (b.status in ('dang_lam','cho_ky') or coalesce(b.done_at, b.created_at) >= since.t or b.created_at >= since.t)
           and (p_scope = 'ALL' or (b.proc = 'QT0' and p_scope = 'PN') or exists (select 1 from docs x where x.batch_id = b.id and x.company = p_scope))),
  dd as (select d.id, d.batch_id, d.company, d.status, d.status_at, d.created_at,
           coalesce((select jsonb_agg(jsonb_build_object('action', s->>'action', 'at', s->>'at', 'user', s->>'user', 'role', s->>'role', 'level', s->>'level', 'by', s->>'by'))
                     from jsonb_array_elements(d.signs) s), '[]') signs
         from docs d join bb on bb.id = d.batch_id
         where (p_scope = 'ALL' or d.company = p_scope) and doc_visible(d.company, bb.proc))
  select jsonb_build_object(
    'orders', coalesce((select jsonb_agg(to_jsonb(o)) from orders o where o.status <> 'huy' and o.id in (select order_id from bb)), '[]'),
    'batches', coalesce((select jsonb_agg(to_jsonb(bb)) from bb), '[]'),
    'docs', coalesce((select jsonb_agg(to_jsonb(dd)) from dd), '[]'));
$function$
;

CREATE OR REPLACE FUNCTION public.decide_approval(p_approval uuid, p_ok boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a approvals; nxt approval_steps;
begin
  select * into a from approvals where id = p_approval for update;
  if a.id is null then raise exception 'Không tìm thấy lượt duyệt'; end if;
  if a.status <> 'cho' then raise exception 'Lượt duyệt đã xử lý'; end if;
  if a.approver_id is distinct from app_uid() and not has_role('admin_it') then raise exception 'Không phải người duyệt của cấp này'; end if;
  if not p_ok and coalesce(trim(p_note),'') = '' then raise exception 'Cần ghi lý do từ chối'; end if;
  update approvals set status = case when p_ok then 'dat' else 'tu_choi' end, note = p_note, decided_at = now() where id = a.id;
  if p_ok then
    select * into nxt from approval_steps where doc_type = a.doc_type and step_no > a.step_no order by step_no limit 1;
    if nxt.id is not null then
      insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
      values (a.order_id, a.doc_type, a.round, nxt.step_no, nxt.label, nxt.approver_id, now() + make_interval(hours => nxt.hours));
    else
      perform _on_doc_decided(a.order_id, a.doc_type, true);
    end if;
  else
    perform _on_doc_decided(a.order_id, a.doc_type, false);
  end if;
  perform log_event(a.order_id, a.doc_type || ' cấp ' || a.step_no || ': ' || case when p_ok then 'đạt' else 'từ chối – ' || p_note end);
end $function$
;

CREATE OR REPLACE FUNCTION public.del_group(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n1 int; n2 int; n3 int; n4 int; parts text[] := '{}';
begin
  if not has_role('admin_it') then return 'Chỉ Admin IT được xoá nhóm'; end if;
  select count(*) into n1 from step_defaults where doer_group_id=p_id;
  select count(*) into n2 from order_steps where doer_group_id=p_id;
  select count(*) into n3 from chain_people where group_id=p_id;
  select count(*) into n4 from approval_levels where group_id=p_id;
  if n1>0 then parts := parts || (n1||' bước mặc định'); end if;
  if n2>0 then parts := parts || (n2||' bước của đơn'); end if;
  if n3>0 then parts := parts || (n3||' chỗ Phụ trách quy trình'); end if;
  if n4>0 then parts := parts || (n4||' cấp duyệt'); end if;
  if array_length(parts,1) > 0 then return 'Nhóm đang dùng ở ' || array_to_string(parts, ', ') || '. Hãy bấm "Ẩn nhóm".'; end if;
  delete from work_groups where id=p_id;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_advance(p_doc uuid, p_action text, p_note text DEFAULT ''::text, p_to text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; fl text[]; i int; nxt text; nc text; r text; q uuid[]; lv approval_levels; pi int;
begin
  select * into d from docs where id = p_doc for update; select * into b from batches where id = d.batch_id;
  if d.status in ('da_duyet', 'fail') or b.status in ('hoan_tat', 'fail') then raise exception 'Phiếu đã chốt (%), không thao tác được nữa', case when d.status = 'fail' or b.status = 'fail' then 'thất bại' else 'đã duyệt' end; end if;
  if not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  fl := _flow(b.proc); i := array_position(fl, d.status); r := coalesce(_role_of(b.proc, d.status), d.status);
  if d.status = 'duyet_them' then select * into lv from approval_levels where id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid; end if;
  if p_action = 'next' then
    perform _req_check(p_doc);
    if public.seq_block(p_doc) is not null then raise exception '%', public.seq_block(p_doc)->>'msg' || ' trước khi làm bước này'; end if;
    if b.proc = 'QT3' and d.status = 'anh_giao' and d.company = 'PN' then
      if coalesce(trim(d.header->>'tx_cccd'), '') = '' or coalesce(trim(d.header->>'tx_sdt'), '') = '' then raise exception 'Nhập số CCCD và số điện thoại tài xế'; end if;
      if exists (select 1 from unnest(array['gh_cccd','gh_truoc','gh_sau','gh_xe','gh_bbgh']) k
                 where not exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) f where f->>'kind' = k)) then
        raise exception 'Chưa đủ 5 loại ảnh giao hàng (CCCD, trước khi lên hàng, sau khi load, nguyên xe, BBGH đã ký)'; end if;
    end if;
    if b.proc = 'QT0' and d.status = 'boc_tach' and not exists (select 1 from jsonb_array_elements(d.files) f where f->>'kind' = 'excel') then
      raise exception 'Bắt buộc đính kèm file Excel bóc tách chi tiết'; end if;
    if b.proc = 'QT0' and d.status = 'tao_ds' and _jarr_len(d.tables->'ds') = 0 then raise exception 'Chưa có danh sách tấm'; end if;
    if b.proc = 'QT1' and d.status = 'lap' then
      if _jarr_len(d.tables->'ds') = 0 then raise exception 'Chưa có danh sách tấm'; end if;
    end if;
    if b.proc = 'QT1' and d.status in ('lap', 'duyet') and not ('ds:don_gia' = any(hidden_keys('QT1', d.company)))
       and exists (select 1 from jsonb_array_elements(d.tables->'ds') x where coalesce(nullif(x->>'don_gia', '')::numeric, 0) <= 0)
      then raise exception 'Còn dòng chưa có đơn giá'; end if;
    if b.proc = 'QT2' and d.status = 'lap' then
      if coalesce(d.header->>'so_lenh', '') = '' then raise exception 'Nhập số lệnh gia công của công ty'; end if;
      if _jarr_len(d.tables->'nl') = 0 or _jarr_len(d.tables->'tp') = 0 then raise exception 'Cần đủ 2 bảng nguyên liệu và thành phẩm'; end if;
    end if;
    if b.proc = 'QT3' and d.status = 'lap' and _jarr_len(d.tables->'tp') = 0 then raise exception 'Chưa có danh sách thành phẩm của đợt giao'; end if;
    if d.status = 'duyet' then
      select array_agg(l.id order by l.ord) into q from approval_levels l where l.active and l.proc = b.proc and l.company = d.company and _lv_match(l, d);
      if coalesce(array_length(q, 1), 0) > 0 then
        update docs set status = 'duyet_them', status_at = now(), apv = jsonb_build_object('queue', to_jsonb(q), 'idx', 0),
          signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', public.app_uid(), 'at', now(), 'action', 'ky', 'note', p_note)) where id = p_doc;
        perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': duyệt → chờ ' || (select name from approval_levels where id = q[1]));
        return 'duyet_them';
      end if;
    end if;
    if d.status = 'duyet_them' then
      if (d.apv->>'idx')::int + 1 < jsonb_array_length(d.apv->'queue') then
        update docs set status_at = now(), apv = jsonb_set(apv, '{idx}', to_jsonb((d.apv->>'idx')::int + 1)),
          signs = signs || jsonb_build_array(jsonb_build_object('role', 'duyet_them', 'level', lv.name, 'user', public.app_uid(), 'at', now(), 'action', 'ky', 'note', p_note)) where id = p_doc;
        perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': ' || lv.name || ' ký');
        return 'duyet_them';
      end if;
      nxt := case when b.proc = 'QT3' then 'anh_giao' else 'da_duyet' end; r := 'duyet_them';
    else
      nxt := fl[i + 1];
    end if;
    update docs set status = nxt, status_at = now(),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'level', lv.name, 'user', public.app_uid(), 'at', now(), 'action', 'ky', 'note', p_note))
      where id = p_doc;
    if coalesce(trim(p_note), '') <> '' then
      update docs set notes = notes || jsonb_build_array(jsonb_build_object('role', r, 'user', public.app_uid(), 'at', now(), 'text', trim(p_note))) where id = p_doc; end if;
    if nxt = 'da_duyet' then
      if b.proc = 'QT0' then update batches set status = 'hoan_tat', done_at = now() where id = b.id;
      else
        nc := case d.company when 'PN' then 'IPC' when 'IPC' then 'HW' end;
        if nc is null then update batches set status = 'cho_ky' where id = b.id;
        else perform public._auto_next(d.id);
          if not exists (select 1 from docs x where x.batch_id = b.id and x.id <> d.id and x.status not in ('da_duyet', 'fail')) then update batches set status = 'hoan_tat', done_at = now() where id = b.id; end if;
        end if;
      end if;
    end if;
    perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': ' || r || ' ký → ' || nxt);
    return nxt;
  elsif p_action = 'back' then
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả về'; end if;
    nxt := case when b.proc = 'QT0' then case d.status when 'boc_tach' then 'tiep_nhan' when 'tao_ds' then 'boc_tach'
                  when 'kiem_tra' then 'boc_tach' when 'duyet' then 'kiem_tra' when 'duyet_them' then 'kiem_tra' end
                else case d.status when 'kiem_tra' then 'lap' when 'duyet' then 'lap' when 'duyet_them' then 'lap' when 'anh_giao' then 'duyet' end end;
    if nxt is null then raise exception 'Bước đầu, không trả về được'; end if;
    -- Người trả về được chọn bước nhận (chỉ bước trước bước hiện tại)
    if coalesce(p_to, '') <> '' then
      pi := coalesce(i, array_position(fl, 'duyet') + 1);
      if array_position(fl, p_to) is null or array_position(fl, p_to) >= pi then raise exception 'Bước trả về không hợp lệ'; end if;
      nxt := p_to;
    end if;
    update docs set status = nxt, status_at = now(), apv = null,
      ret_snap = jsonb_build_object('header', d.header, 'tables', d.tables, 'at', now(), 'note', p_note, 'from', d.status, 'to', nxt, 'by', public.app_uid()),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', public.app_uid(), 'at', now(), 'action', 'tra_ve', 'note', p_note, 'to', nxt))
      where id = p_doc;
    perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': trả về ' || nxt || ' – ' || p_note);
    return nxt;
  elsif p_action = 'fail' then
    if d.status not in ('duyet', 'duyet_them') then raise exception 'Chỉ bước Duyệt mới đánh Thất bại được'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do (hao hụt lớn, vượt dự toán, không sản xuất được…)'; end if;
    update docs set status = 'fail', status_at = now(),
      signs = signs || jsonb_build_array(jsonb_build_object('role', r, 'user', public.app_uid(), 'at', now(), 'action', 'fail', 'note', p_note)) where id = p_doc;
    if b.proc = 'QT0' or not exists (select 1 from docs x where x.batch_id = b.id and x.id <> d.id and x.status <> 'fail') then update batches set status = 'fail', done_at = now() where id = b.id; end if;
    perform log_event(b.order_id, b.proc || ' · ' || b.title || ' · ' || d.company || ': Thất bại – ' || p_note);
    return 'fail';
  end if;
  raise exception 'Thao tác không hợp lệ';
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_check(p_doc uuid, p_step text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; pr text;
begin
  select * into d from docs where id = p_doc;
  if d.id is null then raise exception 'Không tìm thấy hồ sơ'; end if;
  if not (is_adm() or (can_act(p_doc) and d.status = p_step)) then raise exception 'Bạn không phụ trách bước này'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Dữ liệu checklist không hợp lệ'; end if;
  select proc into pr from batches where id = d.batch_id;
  update docs set checklist = jsonb_set(coalesce(checklist,'{}'), array[p_step], _ck_merge(pr, p_step, p_items)) where id = p_doc;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_clone(p_doc uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; nb uuid; v_id uuid; n int; fl text[]; src uuid; ck jsonb; tb jsonb; rr uuid;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if d.status not in ('da_duyet','fail') then raise exception 'Chỉ clone phiếu đã Thành công hoặc Thất bại'; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person(b.proc, d.company, case when b.proc = 'QT0' then 'admin' else 'lap' end)) then
    raise exception 'Bạn không phải Admin / người Lập của % ở %', d.company, b.proc; end if;
  fl := _flow(b.proc); ck := jsonb_build_object('clone_from', d.id::text); tb := d.tables;
  if d.company in ('IPC', 'HW') and b.proc <> 'QT0' then
    src := nullif(b.checklist->>'auto_from', '')::uuid;
    if src is null then raise exception 'Đơn này không có tham chiếu – không clone được'; end if;
    ck := ck || jsonb_build_object('auto_from', src::text);
    if b.proc = 'QT1' then
      perform pg_advisory_xact_lock(hashtext('src:' || src::text));
      select coalesce(jsonb_agg(e || jsonb_build_object('so_tam', (l.src - l.used)::text)), '[]'::jsonb) into tb
      from jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e join _src_left(src) l on l.k = _ds_key(e) where l.src - l.used > 0;
      if jsonb_array_length(tb) = 0 then raise exception 'Đơn nguồn % đã chia hết tấm – không clone được', doc_code(src); end if;
      tb := jsonb_set(coalesce(d.tables, '{}'::jsonb), '{ds}', tb);
    end if;
  end if;
  select coalesce(max(seq), 0) + 1 into n from batches where order_id = b.order_id and proc = b.proc;
  insert into batches(order_id, proc, seq, title, status, co_order_id, checklist)
    values (b.order_id, b.proc, n, (case b.proc when 'QT0' then 'Bóc tách lần ' when 'QT1' then 'XNĐH ' when 'QT2' then 'Lệnh gia công ' else 'Đợt giao ' end) || n,
            'dang_lam', b.co_order_id, ck) returning id into nb;
  insert into docs(batch_id, company, status, header, tables)
    values (nb, d.company, fl[1], (d.header - 'so_xn') || jsonb_build_object('clone_from', doc_code(d.id)), tb) returning docs.id into v_id;
  if src is not null then select ref_id into rr from co_orders where doc_id = d.id; if rr is not null then update co_orders set ref_id = rr where doc_id = v_id; end if; end if;
  perform log_event(b.order_id, b.proc || ': clone ' || doc_code(d.id) || ' → ' || b.proc || ' mới (' || d.company || ')' || case when src is not null then ', tham chiếu ' || doc_code(src) else '' end);
  return nb;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_clone_pick(p_doc uuid, p_pick jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare nb uuid; v_id uuid; tb jsonb;
begin
  nb := doc_clone(p_doc);
  select d.id into v_id from docs d where d.batch_id = nb;
  select coalesce(jsonb_agg(e || jsonb_build_object('so_tam', (p->>'q'))), '[]'::jsonb) into tb
  from jsonb_array_elements((select tables->'ds' from docs where id = v_id)) e
  join jsonb_array_elements(p_pick) p on upper(regexp_replace(p->>'k', '\s+', '', 'g')) = _ds_key(e) where _num0(p->>'q') > 0;
  if jsonb_array_length(tb) = 0 then raise exception 'Chưa chọn tấm nào'; end if;
  update docs set tables = jsonb_set(tables, '{ds}', tb) where id = v_id;
  return nb;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_code(p_doc uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select c.code from co_orders c where c.batch_id = d.batch_id and c.company = d.company order by c.created_at desc limit 1),
    (select c.code from co_orders c where c.batch_id = d.batch_id order by c.created_at desc limit 1),
    o.code)
  from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
$function$
;

CREATE OR REPLACE FUNCTION public.doc_from_prev(p_src uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; nc text; r uuid; u text;
begin
  perform pg_advisory_xact_lock(hashtext('prev:' || p_src::text));
  select * into d from docs where id = p_src; if d.id is null then raise exception 'Không tìm thấy phiếu nguồn'; end if;
  select * into b from batches where id = d.batch_id;
  nc := case d.company when 'PN' then 'IPC' when 'IPC' then 'HW' end;
  if nc is null or b.proc = 'QT0' then raise exception 'Phiếu này không có công ty kế tiếp'; end if;
  if d.status <> 'da_duyet' then raise exception 'Phiếu % chưa được duyệt', doc_code(d.id); end if;
  if not (has_role('admin_it') or _is_person(b.proc, nc, 'lap')) then raise exception 'Bạn không phụ trách Lập % của %', b.proc, nc; end if;
  select doc_code(y.id) into u from batches x join docs y on y.batch_id = x.id where x.order_id = b.order_id and x.proc = b.proc and y.company = nc and (x.checklist->>'auto_from') = d.id::text limit 1;
  if u is not null then raise exception 'Phiếu % đã được lấy cho % (%)', doc_code(d.id), nc, u; end if;
  r := _auto_next(p_src);
  if r is null then raise exception 'Không tạo được phiếu từ %', doc_code(d.id); end if;
  perform log_event(b.order_id, 'Tạo thủ công phiếu ' || nc || ' từ ' || doc_code(d.id));
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_from_ref(p_code text, p_co text, p_pick jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c co_orders; pd docs; b0 batches; nb uuid; v_id uuid; prev text := case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end;
  hd jsonb; ds jsonb := '[]'; r record; want numeric; n int;
begin
  if prev is null then raise exception 'Công ty % không lập từ tham chiếu', p_co; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person('QT1', p_co, 'lap')) then raise exception 'Bạn không phải người Lập XNĐH của %', p_co; end if;
  select co.* into c from co_orders co where upper(trim(co.code)) = upper(trim(p_code)) and co.company = prev order by co.created_at desc limit 1;
  if c.id is null then raise exception 'Không tìm thấy mã đơn % của %', p_code, prev; end if;
  select x.* into pd from docs x where x.id = c.doc_id; select bb.* into b0 from batches bb where bb.id = c.batch_id;
  if pd.status = 'fail' or b0.status = 'fail' then raise exception 'Đơn % đã Thất bại, không dùng làm tham chiếu được.', p_code; end if;
  if pd.status <> 'da_duyet' then raise exception 'Đơn % chưa duyệt xong, chưa tham chiếu được.', p_code; end if;
  for r in select * from ref_rows(p_code, p_co) loop
    want := case when p_pick is null then r.con_lai else coalesce((select _num0(x->>'so_tam') from jsonb_array_elements(p_pick) x where (x->>'i')::int = r.i limit 1), 0) end;
    continue when want <= 0;
    if want > r.con_lai then raise exception 'Dòng % (%): chỉ còn % tấm, không lấy % được.', r.i + 1, r.ma_tam, r.con_lai, want; end if;
    ds := ds || jsonb_build_array(((pd.tables->'ds'->r.i) - 'don_gia' - 'tt') || jsonb_build_object('so_tam', want));
  end loop;
  if jsonb_array_length(ds) = 0 then raise exception 'Chưa chọn tấm nào (hoặc đơn % đã dùng hết).', p_code; end if;
  select count(*) + 1 into n from batches bx where bx.order_id = b0.order_id and bx.proc = 'QT1';
  insert into batches(order_id, proc, title, status) values (b0.order_id, 'QT1', 'XNĐH ' || n, 'dang_lam') returning batches.id into nb;
  hd := jsonb_strip_nulls(jsonb_build_object('dk_giao', pd.header->'dk_giao', 'ngay', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD'), 'ref', p_code));
  insert into docs(batch_id, company, status, header, tables) values (nb, p_co, 'lap', hd, _mask_t(jsonb_build_object('ds', ds), restricted_keys('QT1'))) returning docs.id into v_id;
  update co_orders set ref_id = c.id where doc_id = v_id;
  perform log_event(b0.order_id, 'QT1 · XNĐH ' || n || ' · ' || p_co || ': lập từ tham chiếu ' || p_code || ' (' || jsonb_array_length(ds) || ' dòng)');
  return nb;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_holders(p_doc uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select case
    when d.assignee is not null then array[d.assignee]
    when d.status = 'duyet_them' then (select array_remove(array[l.user_id], null) || coalesce(g.member_ids, '{}')
        from approval_levels l left join work_groups g on g.id = l.group_id
        where l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid)
    else (select array_agg(distinct u) from (
        select c.user_id u from chain_people c where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status)
        union select unnest(g.member_ids) from chain_people c join work_groups g on g.id = c.group_id
          where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status)) x where u is not null)
    end from docs d join batches b on b.id = d.batch_id where d.id = p_doc), '{}');
$function$
;

CREATE OR REPLACE FUNCTION public.doc_note(p_doc uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if coalesce(trim(p_text), '') = '' then return; end if;
  if d.status in ('da_duyet', 'fail') then raise exception 'Phiếu đã chốt – không thêm ghi chú được.'; end if;
  if not (can_act(p_doc) or _is_person(b.proc, d.company, 'kiem_tra') or _is_person(b.proc, d.company, 'duyet')) then raise exception 'Không có quyền ghi chú'; end if;
  update docs set notes = notes || jsonb_build_array(jsonb_build_object('role', _role_of(b.proc, d.status), 'user', public.app_uid(), 'at', now(), 'text', trim(p_text))) where id = p_doc;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_save(p_doc uuid, p_header jsonb, p_tables jsonb, p_files jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; adm boolean := has_role('admin_it'); own boolean; ch text[] := '{}'; k text; lb text; hk text[];
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if not doc_visible(d.company, b.proc) then raise exception 'Không có quyền với hồ sơ này'; end if;
  own := not adm and can_act(p_doc);
  if adm then
    own := b.status = 'dang_lam' and d.status not in ('da_duyet','fail') and app_uid() = any(_with_deleg(doc_holders(p_doc)));
  elsif not can_act(p_doc) then raise exception 'Bạn không phụ trách bước này'; end if;
  if p_tables is not null and p_tables is distinct from d.tables and public.seq_block(p_doc) is not null then
    raise exception '% – bảng hàng đang khoá, chỉ sửa được thông tin chung và ảnh', public.seq_block(p_doc)->>'msg'; end if;
  hk := hidden_keys(b.proc, d.company);
  if cardinality(hk) > 0 then
    if p_header is not null then
      p_header := _mask_h(p_header, hk) || coalesce((select jsonb_object_agg(substr(x, 3), d.header->substr(x, 3)) from unnest(hk) x where x like 'h:%' and d.header ? substr(x, 3)), '{}');
    end if;
    if p_tables is not null then p_tables := _merge_hidden(p_tables, d.tables, hk); end if;
  end if;
  if p_tables is not null then p_tables := _row_ids(p_tables); end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_signed_add(p_doc uuid, p_file jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; nf jsonb;
begin
  select * into d from docs where id = p_doc; select * into b from batches where id = d.batch_id;
  if d.id is null then raise exception 'Không tìm thấy phiếu'; end if;
  if b.proc <> 'QT1' or d.status <> 'da_duyet' then raise exception 'Chỉ tải bản ký khi XNĐH đã duyệt'; end if;
  if not (has_role('admin_it') or has_role('admin_cnc') or _is_person('QT1', d.company, 'lap') or _is_person('QT1', d.company, 'kiem_tra') or _is_person('QT1', d.company, 'duyet')) then
    raise exception 'Chỉ người trong chuỗi duyệt của % hoặc admin được tải bản ký', d.company; end if;
  if coalesce(p_file->>'path', '') = '' then raise exception 'Thiếu file'; end if;
  nf := coalesce(d.files, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('kind', 'ban_ky', 'name', p_file->>'name', 'path', p_file->>'path', 'at', now(), 'by', public.app_uid(), 'step', 'da_duyet'));
  update docs set files = nf where id = p_doc;
  perform log_event(b.order_id, 'QT1 · ' || b.title || ' · ' || d.company || ': tải bản ký lưu trữ');
  return nf;
end $function$
;

CREATE OR REPLACE FUNCTION public.doc_visible(p_company text, p_proc text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select is_adm()
    or (p_proc = 'QT0' and (app_company() = 'PN' or 'PN' = any(user_cos(app_uid()))))
    or (p_proc <> 'QT0' and (p_company = app_company() or p_company = any(user_cos(app_uid()))));
$function$
;

CREATE OR REPLACE FUNCTION public.docs_clear_assignee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status or new.apv is distinct from old.apv then
    new.assignee := null; new.assign_note := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.docs_seq_unlock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare b batches; co uuid; r record; k text; nm text; pj uuid;
begin
  if new.status <> 'da_duyet' or old.status = 'da_duyet' or new.company = 'PN' then return new; end if;
  select * into b from batches where id = new.batch_id; if b.proc not in ('QT1','QT2') then return new; end if;
  if b.proc = 'QT1' then select id into co from co_orders where batch_id = b.id limit 1; else co := b.co_order_id; end if;
  if co is null then return new; end if;
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  nm := case new.company when 'HW' then 'Hanwa' else new.company end;
  select o.project_id into pj from orders o where o.id = b.order_id;
  for r in select d.id, x.proc, x.title, x.order_id from batches x join docs d on d.batch_id = x.id and d.company = new.company
      where x.co_order_id = co and x.id <> b.id and x.proc in ('QT2','QT3') and x.proc > b.proc and x.status in ('dang_lam','cho_ky')
        and d.status not in ('da_duyet','fail') loop
    -- hồ sơ vừa duyệt chưa được commit vào bảng batches.status → seq_block có thể còn thấy QT1 "đang làm"; bỏ qua kiểm khi chính batch này là điều kiện duy nhất
    if r.proc = 'QT3' and not exists (select 1 from batches q where q.proc = 'QT2' and q.co_order_id = co and (q.status = 'hoan_tat' or q.id = b.id)) then continue; end if;
    if r.proc = 'QT3' and b.proc = 'QT1' and not exists (select 1 from batches q where q.proc = 'QT2' and q.co_order_id = co and q.status = 'hoan_tat') then continue; end if;
    insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text)
      values (r.order_id, r.id, 'turn', app_uid(), coalesce(_with_deleg(doc_holders(r.id)), '{}'), '🔓 Đã mở khoá – đến lượt bạn làm ' || r.proc || ' · ' || r.title);
    if k is not null then perform net.http_post(url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=doc',
      body := jsonb_build_object('doc_id', r.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k)); end if;
    perform set_config('pms.zdoc', r.id::text, true);
    perform _zgroup(new.company, 'approved', '🔓 ' || public._doc_line(r.id) || E'\n' || nm || ' đã duyệt ' || case b.proc when 'QT1' then 'XNĐH' else 'Lệnh GC' end
      || ' → mở khoá ' || r.proc || ' · ' || r.title || '. Đến lượt Lập.' || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || r.order_id || '?tab=' || r.proc, pj);
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.docs_turn_msg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare b batches; ids uuid[]; lb text;
begin
  if new.status is not distinct from old.status and new.apv is not distinct from old.apv then return new; end if;
  select * into b from batches where id = new.batch_id;
  if new.status in ('da_duyet', 'fail') then
    insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, meta)
      select b.order_id, new.id, 'result', app_uid(), coalesce(array_agg(distinct (s->>'user')::uuid) filter (where (s->>'user') is not null), '{}'),
        case when new.status = 'fail' then 'Thất bại: ' || coalesce((new.signs->-1)->>'note', '') else 'Đã duyệt – hồ sơ thành công' end, '{}'
      from jsonb_array_elements(new.signs) s;
    return new;
  end if;
  ids := doc_holders(new.id); if cardinality(ids) = 0 then return new; end if;
  lb := case new.status when 'tiep_nhan' then 'Tiếp nhận' when 'boc_tach' then 'Bóc tách' when 'tao_ds' then 'Tạo DS tấm' when 'lap' then 'Lập'
    when 'kiem_tra' then 'Kiểm tra' when 'duyet' then 'Duyệt' when 'duyet_them' then 'Duyệt thêm' when 'anh_giao' then 'Tải ảnh giao hàng' else new.status end;
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text) values (b.order_id, new.id, 'turn', app_uid(), _with_deleg(ids),
    case when (new.signs->-1)->>'action' = 'tra_ve' then 'Bị trả về – ' || lb || ': ' || coalesce((new.signs->-1)->>'note', '') else 'Đến lượt bạn: ' || lb end);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.docs_zalo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.apv is not distinct from old.apv then return new; end if;
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return new; end if;
  perform net.http_post(url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=doc',
    body := jsonb_build_object('doc_id', new.id), headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.f3_build(p_order uuid, p_waste numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w numeric;
begin
  if not (has_role('ke_hoach') or has_role('admin_cnc')) then raise exception 'Không có quyền lập dự toán'; end if;
  if (_order(p_order)).nvl_status <> 'du_toan' or (_order(p_order)).gc_status <> 'lap_lgc' then raise exception 'Chỉ lập dự toán NVL ở bước B1 (lập LGC)'; end if;
  insert into material_plans(order_id) values (p_order) on conflict do nothing;
  if p_waste is not null then update material_plans set waste_pct = p_waste where order_id = p_order; end if;
  select waste_pct into w from material_plans where order_id = p_order;
  delete from material_plan_lines where order_id = p_order;
  insert into material_plan_lines(order_id, material, thickness_mm, f1_kg, need_kg, stock_kg)
  select p_order, material, thickness_mm, sum(weight_kg), round(sum(weight_kg) * (1 + w/100), 2), greatest(_stock(material, thickness_mm), 0)
  from order_lines where order_id = p_order group by material, thickness_mm;
  perform log_event(p_order, 'Lập dự toán NVL (hao hụt ' || w || '%)');
end $function$
;

CREATE OR REPLACE FUNCTION public.f3_skip_purchase(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('mua_hang') then raise exception 'Không có quyền'; end if;
  if exists (select 1 from material_plan_lines where order_id = p_order and buy_kg > 0) then raise exception 'Còn NVL cần mua'; end if;
  perform _set_in_fn();
  update orders set nvl_status = 'san_sang' where id = p_order and nvl_status = 'mua_hang';
  if not found then raise exception 'Nhánh NVL không ở bước mua hàng'; end if;
  perform log_event(p_order, 'Tồn kho đủ – không cần mua. ĐK3 đạt');
  perform _check_dk4(p_order);
end $function$
;

CREATE OR REPLACE FUNCTION public.f4_submit(p_order uuid, p_ok boolean, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare bad boolean;
begin
  if not has_role('kho_qc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).nvl_status <> 'nhap_kho' then raise exception 'Nhánh NVL không ở bước nhập kho'; end if;
  if exists (select 1 from receipt_lines where order_id = p_order and received_kg is null) then raise exception 'Chưa nhập đủ số thực nhận'; end if;
  bad := not p_ok or exists (select 1 from receipt_lines where order_id = p_order and (bad_kg > 0 or diff_kg < -_tol(expected_kg)));
  if bad and coalesce(trim(p_note),'') = '' then raise exception 'Ghi rõ lỗi / thiếu để lập phiếu F7'; end if;
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, ok_kg, 'nhap', order_id, 'F4' from receipt_lines where order_id = p_order and ok_kg > 0;
  update receipts set qc_result = case when bad then 'khong_dat' else 'dat' end, qc_note = p_note, received_at = coalesce(received_at, current_date) where order_id = p_order;
  perform _set_in_fn();
  if bad then
    insert into issues(order_id, source, kind, description) values (p_order, 'F4', case when not p_ok then 'loi_nvl' else 'sai_lech_nvl' end, p_note);
    update orders set nvl_status = 'mua_hang' where id = p_order;
    -- lượt nhập sau chỉ chờ phần còn thiếu; dòng đã đủ giữ lại với 0 kg
    update receipt_lines set expected_kg = greatest(-diff_kg, 0),
      received_kg = case when greatest(-diff_kg, 0) = 0 then 0 else null end, bad_kg = 0 where order_id = p_order;
    perform log_event(p_order, 'F4 không đạt → F7, mua bổ sung: ' || p_note);
  else
    update orders set nvl_status = 'san_sang' where id = p_order;
    perform log_event(p_order, 'NVL đạt QC, đã nhập kho (B4)');
    perform _check_dk4(p_order);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.f5_build(p_order uuid, p_reserve numeric DEFAULT NULL::numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rs numeric; per text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM'); n int;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'lap_lgc' then raise exception 'Nhánh gia công không ở bước lập LGC'; end if;
  if not exists (select 1 from work_orders where order_id = p_order) then
    insert into wo_counters(period, last_no) values (per, 1) on conflict (period) do update set last_no = wo_counters.last_no + 1 returning last_no into n;
    insert into work_orders(order_id, code) values (p_order, 'LGC-' || per || '-' || lpad(n::text, 3, '0'));
  end if;
  if p_reserve is not null then update work_orders set reserve_pct = p_reserve where order_id = p_order; end if;
  select reserve_pct into rs from work_orders where order_id = p_order;
  delete from work_order_lines where order_id = p_order;
  insert into work_order_lines(order_id, material, thickness_mm, qty, f1_kg, issue_kg)
  select p_order, material, thickness_mm, sum(qty), sum(weight_kg), round(sum(weight_kg) * (1 + rs/100), 2)
  from order_lines where order_id = p_order group by material, thickness_mm;
  perform log_event(p_order, 'Lập LGC (dự phòng ' || rs || '%)');
end $function$
;

CREATE OR REPLACE FUNCTION public.f6_submit(p_order uuid, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare lech boolean;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'ban_giao' then raise exception 'Chưa đủ ĐK3 để bàn giao'; end if;
  if exists (select 1 from handover_lines where order_id = p_order and actual_kg is null) then raise exception 'Chưa nhập đủ số thực giao'; end if;
  if exists (select 1 from handovers where order_id = p_order and (delivered_by = '' or received_by = '')) then raise exception 'Ghi bên giao và bên nhận'; end if;
  if exists (select 1 from handovers where order_id = p_order and coalesce(signed_pdf_path,'') = '') then raise exception 'Tải biên bản F6 đã ký'; end if;
  lech := exists (select 1 from handover_lines where order_id = p_order and abs(diff_kg) > _tol(planned_kg));
  if lech and coalesce(trim(p_note),'') = '' then raise exception 'Chênh lệch vượt 0,5%% / 5 kg: ghi lý do để lập F7'; end if;
  insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
    select material, thickness_mm, -actual_kg, 'xuat', order_id, 'F6' from handover_lines where order_id = p_order;
  if lech then insert into issues(order_id, source, kind, description) values (p_order, 'F6', 'sai_lech_nvl', p_note); end if;
  update handovers set done_at = now() where order_id = p_order;
  perform _set_in_fn();
  update orders set gc_status = 'gia_cong' where id = p_order;
  perform log_event(p_order, 'Bàn giao NVL xong' || case when lech then ' (có chênh lệch → F7)' else '' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.f7_close(p_issue uuid, p_status text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i issues;
begin
  if not (has_role('admin_cnc') or has_role('kho_qc') or has_role('mua_hang') or has_role('ke_hoach')) then raise exception 'Không có quyền'; end if;
  if p_status not in ('da_xu_ly','chuyen_cap_tren') then raise exception 'Kết quả không hợp lệ'; end if;
  if coalesce(trim(p_action),'') = '' then raise exception 'Ghi hướng xử lý'; end if;
  update issues set status = p_status, action = p_action, closed_at = now() where id = p_issue and status = 'mo' returning * into i;
  if i.id is null then raise exception 'Phiếu không còn mở'; end if;
  perform log_event(i.order_id, 'F7 ' || case when p_status = 'da_xu_ly' then 'đã xử lý' else 'chuyển cấp trên' end || ': ' || p_action);
end $function$
;

CREATE OR REPLACE FUNCTION public.f8_build(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int; t_qty int; t_kg numeric;
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gh_status <> 'thong_bao' then raise exception 'Đơn không ở bước thông báo giao'; end if;
  if exists (select 1 from packing_lines where order_id = p_order) then raise exception 'Packing list đã có – sửa từng pallet'; end if;
  select coalesce(pallets, 0) into n from qc_finished where order_id = p_order;
  if coalesce(n, 0) <= 0 then raise exception 'Chưa có số pallet từ QC thành phẩm'; end if;
  select coalesce(sum(qty), 0), coalesce(sum(weight_kg), 0) into t_qty, t_kg from order_lines where order_id = p_order;
  insert into packing_lists(order_id) values (p_order) on conflict do nothing;
  insert into packing_lines(order_id, pallet_no, content, qty, kg)
  select p_order, g, 'Thành phẩm theo F1', (t_qty / n) + case when g <= t_qty % n then 1 else 0 end, round(t_kg / n, 2)
  from generate_series(1, n) g;
  perform log_event(p_order, 'Lập packing list F8: ' || n || ' pallet');
end $function$
;

CREATE OR REPLACE FUNCTION public.f8_submit(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from packing_lines where order_id = p_order) then raise exception 'Chưa lập packing list'; end if;
  if exists (select 1 from packing_lists where order_id = p_order and (planned_date is null or place = '')) then raise exception 'Ghi ngày giao dự kiến và địa điểm giao'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'lap_lgh' where id = p_order and gh_status = 'thong_bao';
  if not found then raise exception 'Đơn không ở bước thông báo giao'; end if;
  update packing_lists set sent_at = now() where order_id = p_order;
  insert into deliveries(order_id) values (p_order) on conflict do nothing;
  perform log_event(p_order, 'Đã thông báo giao hàng kèm packing list F8');
end $function$
;

CREATE OR REPLACE FUNCTION public.f9_close(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from deliveries where order_id = p_order and coalesce(bbgh_path, '') <> '') then raise exception 'Tải bộ LGH / BBGH đã ký'; end if;
  if exists (select 1 from issues where order_id = p_order and status = 'mo') then raise exception 'Còn phiếu F7 đang mở – xử lý trước khi hoàn tất'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'hoan_tat', status = 'hoan_tat' where id = p_order and gh_status = 'ky_bbgh';
  if not found then raise exception 'Đơn chưa ở bước ký BBGH'; end if;
  perform log_event(p_order, 'Hoàn tất đơn: đã ký và lưu bộ LGH / BBGH');
end $function$
;

CREATE OR REPLACE FUNCTION public.f9_delivered(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from deliveries where order_id = p_order and cardinality(photo_paths) > 0) then raise exception 'Tải ít nhất 1 ảnh giao hàng'; end if;
  perform _set_in_fn();
  update orders set gh_status = 'ky_bbgh' where id = p_order and gh_status = 'giao_hang';
  if not found then raise exception 'Lệnh giao hàng chưa duyệt đủ 2 chặng'; end if;
  update deliveries set delivered_at = coalesce(delivered_at, now()) where order_id = p_order;
  perform log_event(p_order, 'Đã giao hàng, có ảnh giao');
end $function$
;

CREATE OR REPLACE FUNCTION public.field_delete(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f proc_fields; n int;
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT'; end if;
  select * into f from proc_fields where id = p_id; if f.id is null then return; end if;
  if f.sys then raise exception 'Trường gốc của hệ thống không xoá được, chỉ ẩn được'; end if;
  n := field_usage(p_id);
  if n > 0 then raise exception 'Trường “%” đang có dữ liệu ở % phiếu – chỉ ẩn được, không xoá', f.label, n; end if;
  delete from proc_fields where id = p_id or (area = 'col' and proc = f.proc and tbl = f.tbl || '.' || f.key);
end $function$
;

CREATE OR REPLACE FUNCTION public.field_usage(p_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f proc_fields; n int;
begin
  select * into f from proc_fields where id = p_id; if f.id is null then return 0; end if;
  if f.proc = 'F0' then select count(*) into n from orders where coalesce(trim(extra->>f.key), '') <> ''; return n; end if;
  select count(*) into n from docs d join batches b on b.id = d.batch_id where b.proc = f.proc and (
    (f.area = 'header' and coalesce(trim(d.header->>f.key), '') <> '')
    or (f.area = 'file' and exists (select 1 from jsonb_array_elements(coalesce(d.files, '[]')) x where x->>'kind' = f.key))
    or (f.area = 'col' and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.tables->split_part(f.tbl, '.', 1)) = 'array' then d.tables->split_part(f.tbl, '.', 1) else '[]' end) x
          where coalesce(trim(x->>(case when f.tbl like '%.%' then split_part(f.tbl, '.', 2) else f.key end)), '') not in ('', '[]'))));
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.field_usages(p_proc text)
 RETURNS TABLE(id uuid, n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.id, field_usage(f.id) from proc_fields f where f.proc = p_proc and not f.sys and has_role('admin_it');
$function$
;

CREATE OR REPLACE FUNCTION public.file_visible(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare seg text[] := string_to_array(p_name, '/'); r doc_records; pr text; cd uuid; base text := regexp_replace(p_name, '\.blur\.jpg$', ''); gh docs;
begin
  if is_adm() then return true; end if;
  if seg[1] = 'records' then
    select * into r from doc_records where path = p_name limit 1;
    return r.id is null or rec_visible2(r.doc_id, r.kind, r.proc, r.company, r.has_secret);
  end if;
  if cardinality(seg) >= 4 and seg[3] in ('PN', 'IPC', 'HW') then
    select proc into pr from batches where id::text = seg[2];
    if pr is not null and not doc_visible(seg[3], pr) then
      if pr <> 'QT3' then return false; end if;
      select * into gh from docs where batch_id::text = seg[2] and company = seg[3]
        and exists (select 1 from jsonb_array_elements(files) f where f->>'path' = base and f->>'kind' like 'gh\_%') limit 1;
      if gh.id is null or not exists (select 1 from docs x join batches b on b.id = x.batch_id
          where b.proc = 'QT3' and b.order_id = (select order_id from batches where id = gh.batch_id) and x.company <> gh.company
            and doc_visible(x.company, 'QT3') and qt3_root(x.id) = gh.id) then return false; end if;
    end if;
    if p_name !~ '\.blur\.jpg$' then
      select id into cd from docs where batch_id::text = seg[2] and files @> jsonb_build_array(jsonb_build_object('path', p_name, 'kind', 'gh_cccd')) limit 1;
      if cd is not null then return cccd_ok(cd); end if;
    end if;
    return true;
  end if;
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.fill_acting_as()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.acting_as is null and public.app_uid() is distinct from auth.uid() then new.acting_as := public.app_uid(); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.gh_src(p_doc uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me docs; pr text; s docs;
begin
  select * into me from docs where id = p_doc; select proc into pr from batches where id = me.batch_id;
  if me.id is null or pr <> 'QT3' or me.company = 'PN' or not doc_visible(me.company, pr) then return null; end if;
  select * into s from docs where id = qt3_root(p_doc) and company = 'PN';
  if s.id is null then return null; end if;
  return jsonb_build_object('doc_id', s.id, 'status', s.status,
    'files', coalesce((select jsonb_agg(f) from jsonb_array_elements(s.files) f where f->>'kind' like 'gh\_%'), '[]'::jsonb),
    'header', jsonb_build_object('tai_xe', s.header->'tai_xe', 'tx_cccd', s.header->'tx_cccd', 'tx_sdt', s.header->'tx_sdt', 'so_phieu', s.header->'so_phieu', '_bbgh_ai', s.header->'_bbgh_ai'));
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_checklist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; nk text; miss text[]; olds text[]; news text[]; r order_steps;
begin
  if new.status = 'huy' then return new; end if;
  olds := _steps(old.status, old.nvl_status, old.gc_status, old.gh_status);
  news := _steps(new.status, new.nvl_status, new.gc_status, new.gh_status);
  foreach k in array olds loop
    continue when k = any(news);
    nk := null;
    select x into nk from unnest(news) x where split_part(x, '.', 1) = split_part(k, '.', 1) limit 1;
    if nk is not null and _step_rank(nk) < _step_rank(k) then continue; end if;
    if not coalesce((select approval from step_defaults where step = k), false) then
      r := null; select * into r from order_steps where order_id = new.id and step = k;
      if r.doer_id is null and r.doer_group_id is null then
        raise exception 'Bước này chưa có người / nhóm thực hiện: giao trước khi chuyển'; end if;
      if r.doer_id is null then
        raise exception 'Bước giao cho nhóm nhưng chưa ai bấm "Nhận việc"'; end if;
    end if;
    miss := checklist_missing(new.id, k);
    if array_length(miss, 1) > 0 then
      raise exception 'Chưa xong checklist bắt buộc: %', array_to_string(miss, '; ');
    end if;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_hl()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user = 'authenticated' and (new.planned_kg, new.material, new.thickness_mm) is distinct from (old.planned_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được số thực giao'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_mpl()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user = 'authenticated' and (new.need_kg, new.f1_kg, new.material, new.thickness_mm) is distinct from (old.need_kg, old.f1_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được tồn kho'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('app.in_fn', true), '') <> 'on' and (
     new.status is distinct from old.status or new.f1_result is distinct from old.f1_result
     or new.nvl_status is distinct from old.nvl_status or new.gc_status is distinct from old.gc_status
     or new.gh_status is distinct from old.gh_status or new.code is distinct from old.code) then
    raise exception 'Trạng thái đơn chỉ đổi qua thao tác nghiệp vụ';
  end if;
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_order_steps()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(current_setting('app.in_fn', true), '') <> 'on' then
    new.started_at := old.started_at; new.done_at := old.done_at; new.done_by := old.done_by;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.impersonating is distinct from old.impersonating and current_user in ('authenticated','anon') then
    raise exception 'Dùng chức năng Đăng nhập với tư cách';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guard_rl()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user = 'authenticated' and (new.expected_kg, new.material, new.thickness_mm) is distinct from (old.expected_kg, old.material, old.thickness_mm)
    then raise exception 'Chỉ sửa được số thực nhận / lỗi'; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.guide_restore(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g step_guides;
begin
  if not is_adm() then raise exception 'Chỉ Admin được sửa hướng dẫn'; end if;
  select * into g from step_guides where key = p_key; if g.prev is null then raise exception 'Chưa có bản trước'; end if;
  perform guide_save(p_key, g.prev->>'purpose', g.prev->>'todo', g.prev->>'notes', g.prev->>'links');
end $function$
;

CREATE OR REPLACE FUNCTION public.guide_save(p_key text, p_purpose text, p_todo text, p_notes text, p_links text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare base step_guides;
begin
  if not is_adm() then raise exception 'Chỉ Admin được sửa hướng dẫn'; end if;
  update step_guides set prev = jsonb_build_object('purpose',purpose,'todo',todo,'notes',notes,'links',links,'updated_by',updated_by,'updated_at',updated_at),
    purpose = coalesce(p_purpose,''), todo = coalesce(p_todo,''), notes = coalesce(p_notes,''), links = coalesce(p_links,''),
    updated_by = app_uid(), updated_at = now() where key = p_key;
  if found then return; end if;
  if p_key !~ '^QT[1-3]\.(PN|IPC|HW)\.(lap|kiem_tra|duyet)$' then raise exception 'Không có bước %', p_key; end if;
  select * into base from step_guides where key = regexp_replace(p_key, '\.(PN|IPC|HW)\.', '.*.');
  insert into step_guides(key, title, purpose, todo, notes, links, ord, updated_by)
  values (p_key, base.title || ' · ' || split_part(p_key,'.',2), coalesce(p_purpose,''), coalesce(p_todo,''), coalesce(p_notes,''), coalesce(p_links,''), base.ord, app_uid());
end $function$
;

CREATE OR REPLACE FUNCTION public.guide_unset(p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not is_adm() then raise exception 'Chỉ Admin được sửa hướng dẫn'; end if;
  if p_key !~ '^QT[1-3]\.(PN|IPC|HW)\.' then raise exception 'Chỉ bỏ được hướng dẫn riêng của công ty'; end if;
  execute 'del'||'ete from step_guides where key = $1' using p_key;
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.has_role(r text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles p where p.id = public.app_uid() and p.active and (
    'admin_it' = any(p.roles)
    or (not exists (select 1 from user_co_roles u where u.user_id = p.id) and r = any(p.roles))
    or exists (select 1 from user_co_roles u where u.user_id = p.id and r = any(u.roles)
               and (coalesce(p.active_co, 'ALL') not in ('PN','IPC','HW') or u.company = p.active_co))));
$function$
;

CREATE OR REPLACE FUNCTION public.hidden_keys(p_proc text, p_company text)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare me profiles; out text[] := '{}'; f record; appr boolean;
begin
  if is_adm() then return out; end if;
  select * into me from profiles where id = app_uid();
  for f in select * from proc_fields where proc = p_proc and restricted and active loop
    if app_uid() = any(f.view_users) then continue; end if;
    if p_company = app_company() and me.roles && f.view_roles then continue; end if;
    if f.view_approver and p_company = app_company() then
      if appr is null then appr := is_approver(p_proc, p_company); end if;
      if appr then continue; end if;
    end if;
    out := out || (case when f.area = 'header' then 'h:' || f.key else f.tbl || ':' || f.key end);
  end loop;
  if p_proc = 'QT1' and cardinality(out) > 0 then out := out || array['h:tong_tt']; end if;
  return out;
end $function$
;

CREATE OR REPLACE FUNCTION public.in_any(p_user uuid, p_group uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (p_user is not null and p_user = any(my_ids()))
      or (p_group is not null and exists (select 1 from work_groups g where g.id = p_group and g.member_ids && my_ids()));
$function$
;

CREATE OR REPLACE FUNCTION public.in_any_group(gs uuid[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from work_groups where id = any(gs) and active and public.app_uid() = any(member_ids)) $function$
;

CREATE OR REPLACE FUNCTION public.in_group(g uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from work_groups where id = g and active and public.app_uid() = any(member_ids)) $function$
;

CREATE OR REPLACE FUNCTION public.integration_remove(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT'; end if;
  if _secret_system(p_name) then raise exception 'Khoá hệ thống, không xoá được'; end if;
  execute 'del'||'ete from app_secrets where name = $1' using p_name;
end $function$
;

CREATE OR REPLACE FUNCTION public.integration_restore(p_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT'; end if;
  if _secret_system(p_name) then raise exception 'Khoá hệ thống'; end if;
  update app_secrets set value = prev_value, prev_value = value, updated_at = now(), prev_updated_at = updated_at, updated_by = app_uid(),
    last_test_at = null, last_test_ok = null, last_test_msg = null where name = p_name and prev_value is not null;
  if not found then raise exception 'Không có bản trước để khôi phục'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.integration_status()
 RETURNS TABLE(name text, label text, provider text, note text, is_set boolean, hint text, updated_at timestamp with time zone, updated_by text, has_prev boolean, prev_updated_at timestamp with time zone, last_test_at timestamp with time zone, last_test_ok boolean, last_test_msg text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.name, s.label, s.provider, s.note, s.value is not null and s.value <> '',
    case when s.name like '%DOMAIN%' then s.value when length(s.value) > 8 then left(s.value, 3) || '…' || right(s.value, 4) else '••••' end,
    s.updated_at, (select full_name from profiles where id = s.updated_by), s.prev_value is not null, s.prev_updated_at, s.last_test_at, s.last_test_ok, s.last_test_msg
  from app_secrets s where not _secret_system(s.name) and has_role('admin_it') order by s.provider nulls last, s.name $function$
;

CREATE OR REPLACE FUNCTION public.is_adm()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles where id = app_uid() and active and 'admin_it' = any(roles));
$function$
;

CREATE OR REPLACE FUNCTION public.is_approver(p_proc text, p_company text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from chain_people c left join work_groups g on g.id = c.group_id
                 where c.proc = p_proc and c.company = p_company and c.role = 'duyet' and (c.user_id = app_uid() or app_uid() = any(coalesce(g.member_ids, '{}'))))
      or exists (select 1 from approval_levels l left join work_groups g on g.id = l.group_id
                 where l.proc = p_proc and l.company = p_company and l.active and (l.user_id = app_uid() or app_uid() = any(coalesce(g.member_ids, '{}'))));
$function$
;

CREATE OR REPLACE FUNCTION public.is_real_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from profiles where id = auth.uid() and active and 'admin_it' = any(roles));
$function$
;

CREATE OR REPLACE FUNCTION public.log_error(p_kind text, p_message text, p_detail text, p_url text, p_ua text, p_ver text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from app_errors where real_user = auth.uid() and at > now() - interval '1 minute') >= 30 then return; end if;
  insert into app_errors(kind, message, detail, url, ua, app_ver) values (left(p_kind, 40), left(p_message, 1000), left(p_detail, 4000), left(p_url, 500), left(p_ua, 300), left(p_ver, 40));
  delete from app_errors where at < now() - interval '90 days';
end $function$
;

CREATE OR REPLACE FUNCTION public.log_event(p_order uuid, p_action text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into audit_log(order_id, table_name, action, detail) values (p_order, 'event', p_action, p_detail);
$function$
;

CREATE OR REPLACE FUNCTION public.mention_candidates(p_doc uuid)
 RETURNS TABLE(uid uuid, name text, pos text, unit text, zalo boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name, p.position, p.unit, coalesce(p.zalo_chat_id, '') <> ''
  from profiles p where msg_visible(p_doc) and p.active and p.id <> app_uid() and _user_sees_doc(p.id, p_doc) order by p.full_name;
$function$
;

CREATE OR REPLACE FUNCTION public.msg_visible(p_doc uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_doc is null or exists (select 1 from docs d join batches b on b.id = d.batch_id where d.id = p_doc and doc_visible(d.company, b.proc));
$function$
;

CREATE OR REPLACE FUNCTION public.my_cos()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select public.user_cos(app_uid()); $function$
;

CREATE OR REPLACE FUNCTION public.my_docs()
 RETURNS TABLE(doc_id uuid, batch_id uuid, order_id uuid, proc text, company text, status text, title text, code text, project text, since timestamp with time zone, kind text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at as since, 'doc'::text as kind
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    where b.status = 'dang_lam' and d.assignee is null and d.status not in ('da_duyet','fail','duyet_them') and exists (select 1 from chain_people c
      where c.proc = b.proc and c.company = d.company and c.role = _role_of(b.proc, d.status) and in_any(c.user_id, c.group_id))
  union all
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at, 'doc'::text
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    join approval_levels l on l.id = ((d.apv->'queue')->>((d.apv->>'idx')::int))::uuid
    where b.status = 'dang_lam' and d.assignee is null and d.status = 'duyet_them' and in_any(l.user_id, l.group_id)
  union all
  select d.id, b.id, b.order_id, b.proc, d.company, d.status, b.title, o.code, o.project, d.status_at, 'doc'::text
    from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id
    where b.status = 'dang_lam' and d.assignee = any(my_ids()) and d.status not in ('da_duyet','fail')
  union all
  select null, b.id, b.order_id, b.proc, 'PN', 'ky', b.title, o.code, o.project, coalesce(b.done_at, b.created_at), 'final'
    from batches b join orders o on o.id = b.order_id
    where b.status = 'cho_ky' and exists (select 1 from chain_people c where c.proc = b.proc and c.company = _fin_co(b.proc) and c.role in ('hoan_tat','lap')
      and in_any(c.user_id, c.group_id))) x order by since
$function$
;

CREATE OR REPLACE FUNCTION public.my_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select array[app_uid()] || coalesce((select array_agg(user_id) from delegations where to_user = app_uid() and current_date between from_date and to_date), '{}');
$function$
;

CREATE OR REPLACE FUNCTION public.my_msgs(p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, order_id uuid, code text, project text, proc text, company text, kind text, from_name text, text text, via text, at timestamp with time zone, unread boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.order_id, o.code, o.project, b.proc, d.company, m.kind, coalesce(p.full_name, 'Hệ thống'), m.text, m.via, m.at,
    m.at > coalesce((select msgs_seen_at from profiles where id = app_uid()), '-infinity')
  from order_msgs m join orders o on o.id = m.order_id left join docs d on d.id = m.doc_id left join batches b on b.id = d.batch_id
  left join profiles p on p.id = m.from_user
  where m.to_users && my_ids() and m.from_user is distinct from app_uid()
  order by m.at desc limit least(coalesce(p_limit, 30), 100);
$function$
;

CREATE OR REPLACE FUNCTION public.my_points()
 RETURNS TABLE(earned integer, spent integer, bonus integer, balance integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from perf_points(app_uid());
$function$
;

CREATE OR REPLACE FUNCTION public.my_tickets()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (select * from perf_ticket_days(app_uid())), c as (select cfg from perf_config where id = 1),
  used as (select count(*)::int n from perf_spins where user_id = app_uid() and kind = 'ticket' and at >= now() - ((select (cfg->>'tk_valid_days')::int from c) || ' days')::interval)
  select jsonb_build_object('earned', coalesce((select sum(tickets) from d), 0), 'used', (select n from used),
    'balance', greatest(0, coalesce((select sum(tickets) from d), 0) - (select n from used)),
    'today', coalesce((select to_jsonb(d) from d where day = (now() at time zone 'Asia/Ho_Chi_Minh')::date), '{}'::jsonb),
    'days', coalesce((select jsonb_agg(to_jsonb(d)) from (select * from d limit 7) d), '[]'::jsonb));
$function$
;

CREATE OR REPLACE FUNCTION public.nudge(p_doc uuid, p_text text, p_tags uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ids uuid[]; tg uuid[]; oid uuid; last timestamptz; me text; mid uuid; bad int;
begin
  if not can_manage_doc(p_doc) then raise exception 'Chỉ quản lý trực tiếp của người làm hoặc admin mới nhắc được'; end if;
  if coalesce(trim(p_text), '') = '' then raise exception 'Nhập nội dung nhắc'; end if;
  select max(at) into last from order_msgs where doc_id = p_doc and kind = 'nudge';
  if last > now() - interval '2 hours' and not has_role('admin_it') then
    raise exception 'Phiếu này vừa được nhắc lúc %. Chờ 2 giờ rồi nhắc lại.', to_char(last at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI'); end if;
  tg := array(select distinct x from unnest(coalesce(p_tags, '{}')) x where x is not null and x <> app_uid());
  if cardinality(tg) > 5 then raise exception 'Mỗi tin chỉ nhắc tối đa 5 người'; end if;
  select count(*) into bad from unnest(tg) x where not _user_sees_doc(x, p_doc);
  if bad > 0 then raise exception 'Có người được nhắc không có quyền xem phiếu / công ty này'; end if;
  ids := doc_holders(p_doc);
  if cardinality(ids) = 0 and cardinality(tg) = 0 then raise exception 'Bước này chưa có người phụ trách'; end if;
  ids := array(select distinct x from unnest(coalesce(ids, '{}') || tg) x);
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc;
  select full_name into me from profiles where id = app_uid();
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, meta) values (oid, p_doc, 'nudge', app_uid(), ids, trim(p_text),
    case when cardinality(tg) > 0 then jsonb_build_object('tags', to_jsonb(tg)) else '{}'::jsonb end) returning id into mid;
  return _zsend(_with_deleg(ids), '🔔 Nhắc việc từ ' || coalesce(me, 'quản lý') || E'\n' || _doc_line(p_doc) || E'\n\n“' || trim(p_text) || '”'
    || _reply_hint(p_doc));
end $function$
;

CREATE OR REPLACE FUNCTION public.order_steps_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.done_at is null and (tg_op = 'INSERT' or new.started_at is distinct from old.started_at) then
    if tg_op = 'UPDATE' then new.half_sent := false; new.over_sent := false; new.claimed_at := null;
      if new.doer_group_id is not null then new.doer_id := null; end if; end if;
    perform _zalo_step(new.order_id, new.step, 'start');
  elsif tg_op = 'UPDATE' and new.done_at is null and new.claimed_at is not distinct from old.claimed_at
    and (new.doer_group_id is distinct from old.doer_group_id or new.doer_id is distinct from old.doer_id)
    and (new.doer_id is not null or new.doer_group_id is not null) then
    if new.doer_group_id is distinct from old.doer_group_id and new.doer_group_id is not null then new.doer_id := null; new.claimed_at := null; end if;
    perform _zalo_step(new.order_id, new.step, 'assigned', auth.uid());
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.orders_req_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare f record; v text; miss text[] := '{}'; j jsonb := to_jsonb(new);
begin
  for f in select * from proc_fields where proc = 'F0' and active and perms->'*'->>'*' = 'required' order by ord loop
    v := case when f.sys then j->>f.key else new.extra->>f.key end;
    if coalesce(trim(v), '') = '' then miss := array_append(miss, f.label); end if;
  end loop;
  if new.customer_id is null and tg_op = 'INSERT' then miss := array_prepend('Khách hàng'::text, miss); end if;
  if cardinality(miss) > 0 then raise exception 'Chưa nhập đủ thông tin bắt buộc: %', array_to_string(miss, ', '); end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.perf_points(p_user uuid)
 RETURNS TABLE(earned integer, spent integer, bonus integer, balance integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (select cfg from perf_config where id = 1),
  s as (
    select d.id, g->>'action' act, (g->>'user')::uuid u, (g->>'at')::timestamptz at,
      lag((g->>'at')::timestamptz) over (partition by d.id order by (g->>'at')) prev, d.created_at, lead(g->>'action') over (partition by d.id order by (g->>'at')) nxt
    from docs d, jsonb_array_elements(coalesce(d.signs,'[]')) g),
  mine as (select *, extract(epoch from at - coalesce(prev, created_at)) / 3600 h from s where u = p_user),
  e as (select coalesce(sum(
      case when act = 'ky' then
        (case when h <= (c.cfg->>'sla_h')::numeric then (c.cfg->>'pts_ontime')::int else (c.cfg->>'pts_late')::int end)
        + (case when h <= (c.cfg->>'fast_h')::numeric then (c.cfg->>'pts_fast')::int else 0 end)
        + (case when nxt = 'tra_ve' then (c.cfg->>'pts_returned')::int else 0 end)
      else 0 end), 0)::int v from mine, c),
  sp as (select coalesce(sum(cost), 0)::int cost, coalesce(sum(bonus), 0)::int bonus from perf_spins where user_id = p_user)
  select e.v, sp.cost, sp.bonus, (e.v + sp.bonus - sp.cost) from e, sp;
$function$
;

CREATE OR REPLACE FUNCTION public.perf_ticket_days(p_user uuid)
 RETURNS TABLE(day date, steps integer, ontime integer, returned integer, top_rank integer, tickets integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (select cfg from perf_config where id = 1),
  s as (select (g->>'user')::uuid u, g->>'action' act, (g->>'at')::timestamptz at,
          lag((g->>'at')::timestamptz) over (partition by d.id order by g->>'at') prev, d.created_at, lead(g->>'action') over (partition by d.id order by g->>'at') nxt
        from docs d, jsonb_array_elements(coalesce(d.signs,'[]')) g),
  k as (select u, (at at time zone 'Asia/Ho_Chi_Minh')::date dd, extract(epoch from at - coalesce(prev, created_at))/3600 h, nxt from s, c
        where act = 'ky' and at >= now() - ((c.cfg->>'tk_valid_days')::int || ' days')::interval),
  agg as (select u, dd, count(*)::int n, count(*) filter (where h <= (select (cfg->>'sla_h')::numeric from c))::int ok, count(*) filter (where nxt = 'tra_ve')::int ret from k group by u, dd),
  rk as (select *, rank() over (partition by dd order by ok desc, n desc)::int r from agg where n >= (select (cfg->>'tk_min_steps')::int from c))
  select a.dd, a.n, a.ok, a.ret, coalesce(rk.r, 0),
    case when not coalesce((c.cfg->>'tk_on')::boolean, true) then 0
         when a.n < (c.cfg->>'tk_min_steps')::int or a.ok * 100 < (c.cfg->>'tk_min_ontime')::int * a.n then 0
         else least((c.cfg->>'tk_max_day')::int, (c.cfg->>'tk_base')::int
           + case when a.ret = 0 then (c.cfg->>'tk_clean_bonus')::int else 0 end
           + case when rk.r between 1 and (c.cfg->>'tk_top_n')::int then (c.cfg->>'tk_top_bonus')::int else 0 end) end
  from agg a left join rk on rk.u = a.u and rk.dd = a.dd, c where a.u = p_user order by a.dd desc;
$function$
;

CREATE OR REPLACE FUNCTION public.prev_candidates(p_order uuid, p_proc text, p_co text)
 RETURNS TABLE(doc_id uuid, code text, title text, at timestamp with time zone, used_doc uuid, used_code text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d.id, doc_code(d.id), b.title, d.status_at, y.id, case when y.id is not null then doc_code(y.id) end
  from docs d join batches b on b.id = d.batch_id
  left join lateral (select y.id from batches x join docs y on y.batch_id = x.id where x.order_id = b.order_id and x.proc = b.proc and y.company = p_co and (x.checklist->>'auto_from') = d.id::text limit 1) y on true
  where b.order_id = p_order and b.proc = p_proc and d.status = 'da_duyet'
    and d.company = case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end
  order by d.status_at desc
$function$
;

CREATE OR REPLACE FUNCTION public.prod_stats(p_co text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with b1 as (select b.id, b.order_id, b.created_at, b.title, d.tables from batches b join docs_v d on d.batch_id = b.id and d.company = p_co
            where b.proc = 'QT1' and b.status not in ('fail','huy') and d.status <> 'fail'),
r1 as (select s.id bid, upper(trim(coalesce(r->>'ma_tam',''))) mt, coalesce(_num(r->>'so_tam'),0) tam,
         coalesce(case when _num(r->>'rong') is not null and _num(r->>'dai') is not null and _num(r->>'so_tam') is not null then round(_num(r->>'rong')*_num(r->>'dai')/1e6*_num(r->>'so_tam'),3) end,
                  case when _num(r->>'m2_tam') is not null and _num(r->>'so_tam') is not null then round(_num(r->>'m2_tam')*_num(r->>'so_tam'),3) end, _num(r->>'m2'), 0) m2,
         _num(r->>'don_gia') g, _num(r->>'kg') kg0, _num(r->>'day') dd
       from b1 s, jsonb_array_elements(coalesce(s.tables->'ds','[]')) r),
og as (select bid, mt, sum(tam) tam, sum(m2) m2, sum(coalesce(kg0, round(m2*coalesce(dd,0)*2.71,1), 0)) kg, sum(m2*coalesce(g,0)) val, max(g) g from r1 group by 1, 2),
b3 as (select b.id, b.order_id, coalesce(b.done_at, d.status_at, now()) done_at, b.title, c.batch_id q1, d.tables from batches b join docs_v d on d.batch_id = b.id and d.company = p_co
         left join co_orders c on c.id = b.co_order_id
       where b.proc = 'QT3' and b.status not in ('fail','huy') and d.status = 'da_duyet'),
r3 as (select s.id bid, s.q1, s.done_at, upper(trim(coalesce(r->>'ma_tam',''))) mt, coalesce(_num(r->>'so_tam'),0) tam,
         coalesce(case when _num(r->>'rong') is not null and coalesce(_num(r->>'dai_mm'),_num(r->>'dai')) is not null then round(_num(r->>'rong')*coalesce(_num(r->>'dai_mm'),_num(r->>'dai'))/1e6*coalesce(_num(r->>'so_tam'),0),3) end, _num(r->>'m2'), 0) m2,
         _num(r->>'kg') kg0, _num(r->>'day') dd
       from b3 s, jsonb_array_elements(coalesce(s.tables->'tp','[]')) r),
-- gom theo đợt + mã, rồi giới hạn theo số đặt còn lại (cộng dồn theo thời gian giao)
g3 as (select bid, q1, done_at, mt, sum(tam) tam, sum(m2) m2, sum(coalesce(kg0, round(m2*coalesce(dd,0)*2.71,1), 0)) kg from r3 group by 1,2,3,4),
c3 as (select g3.*, og.tam otam, og.g, (og.bid is not null) known,
          coalesce(sum(g3.tam) over (partition by g3.q1, g3.mt order by g3.done_at, g3.bid rows between unbounded preceding and 1 preceding), 0) before
       from g3 left join og on og.bid = g3.q1 and og.mt = g3.mt),
k3 as (select *, case when not known then 0 else least(tam, greatest(otam - before, 0)) end ok from c3),
t3 as (select bid, sum(ok) tam,
         sum(case when tam > 0 then m2 * ok / tam else 0 end) m2, sum(case when tam > 0 then kg * ok / tam else 0 end) kg,
         sum(case when tam > 0 then m2 * ok / tam * coalesce(g,0) else 0 end) val,
         sum(case when not known then tam else 0 end) lt, sum(case when known then tam - ok else 0 end) xt,
         sum(case when known and tam > 0 then m2 * (tam - ok) / tam * coalesce(g,0) else 0 end) xv
       from k3 group by 1),
dg as (select q1, mt, sum(ok) tam from k3 where q1 is not null group by 1, 2),
rem as (select og.bid, sum(greatest(og.tam - coalesce(dg.tam,0),0)) tam,
          sum(case when og.tam > 0 then greatest(og.tam - coalesce(dg.tam,0),0)/og.tam else 0 end * og.m2) m2,
          sum(case when og.tam > 0 then greatest(og.tam - coalesce(dg.tam,0),0)/og.tam else 0 end * og.kg) kg,
          sum(case when og.tam > 0 then greatest(og.tam - coalesce(dg.tam,0),0)/og.tam else 0 end * og.val) val
        from og left join dg on dg.q1 = og.bid and dg.mt = og.mt group by 1),
o1 as (select bid, sum(tam) tam, sum(m2) m2, sum(kg) kg, sum(val) val from og group by 1)
select jsonb_build_object(
  'q1', coalesce((select jsonb_agg(jsonb_build_object('id', b1.id, 'order_id', b1.order_id, 'title', b1.title, 'created_at', b1.created_at,
          'o', jsonb_build_array(coalesce(o1.kg,0), coalesce(o1.m2,0), coalesce(o1.tam,0), round(coalesce(o1.val,0))),
          'r', jsonb_build_array(round(coalesce(rem.kg,0),1), round(coalesce(rem.m2,0),3), coalesce(rem.tam,0), round(coalesce(rem.val,0))))) from b1 left join o1 on o1.bid = b1.id left join rem on rem.bid = b1.id), '[]'),
  'q3', coalesce((select jsonb_agg(jsonb_build_object('id', b3.id, 'order_id', b3.order_id, 'done_at', b3.done_at, 'title', b3.title, 'q1', b3.q1,
          'd', jsonb_build_array(round(coalesce(t3.kg,0),1), round(coalesce(t3.m2,0),3), coalesce(t3.tam,0), round(coalesce(t3.val,0))),
          'x', jsonb_build_array(coalesce(t3.lt,0), coalesce(t3.xt,0), round(coalesce(t3.xv,0))))) from b3 left join t3 on t3.bid = b3.id), '[]'),
  'hasVal', exists (select 1 from og where g is not null)) $function$
;

CREATE OR REPLACE FUNCTION public.project_close(p uuid, close boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('admin_it') or has_role('admin_cnc')) then raise exception 'Chỉ admin được đóng/mở dự án'; end if;
  update projects set status = case when close then 'closed' else 'open' end,
    closed_by = case when close then auth.uid() end, closed_at = case when close then now() end where id = p;
end $function$
;

CREATE OR REPLACE FUNCTION public.project_set_zgroups(p_project uuid, p_chats text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('admin_it') or has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  update zalo_groups set projects = array(select distinct x from unnest(projects || p_project) x) where not all_projects and chat_id = any(coalesce(p_chats, '{}')) and not (p_project = any(projects));
  update zalo_groups set projects = array_remove(projects, p_project) where not all_projects and not (chat_id = any(coalesce(p_chats, '{}'))) and p_project = any(projects);
end $function$
;

CREATE OR REPLACE FUNCTION public.q1_codes(p_doc uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('code', (select c.code from co_orders c where c.id = b.co_order_id),
    'codes', coalesce((select jsonb_object_agg(mt, tam) from (select upper(trim(r->>'ma_tam')) mt, sum(coalesce(_num(r->>'so_tam'),0)) tam
       from co_orders c join docs q on q.batch_id = c.batch_id and q.company = d.company, jsonb_array_elements(coalesce(q.tables->'ds','[]')) r
       where c.id = b.co_order_id and coalesce(trim(r->>'ma_tam'),'') <> '' group by 1) z), '{}'),
    'used', case when b.proc = 'QT3' then coalesce((select jsonb_object_agg(mt, tam) from (select upper(trim(r->>'ma_tam')) mt, sum(coalesce(_num(r->>'so_tam'),0)) tam
       from batches x join docs y on y.batch_id = x.id and y.company = d.company, jsonb_array_elements(coalesce(y.tables->'tp','[]')) r
       where x.proc = 'QT3' and x.co_order_id = b.co_order_id and x.id <> b.id and x.status not in ('fail','huy') and y.status <> 'fail' and coalesce(trim(r->>'ma_tam'),'') <> '' group by 1) z), '{}') else '{}' end)
  from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.proc in ('QT2','QT3') and b.co_order_id is not null $function$
;

CREATE OR REPLACE FUNCTION public.qc_tp_submit(p_order uuid, p_ok boolean, p_pallets integer, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('kho_qc') or has_role('admin_cnc')) then raise exception 'Không có quyền'; end if;
  if (_order(p_order)).gc_status <> 'gia_cong' then raise exception 'Đơn chưa ở bước gia công'; end if;
  if not p_ok and coalesce(trim(p_note),'') = '' then raise exception 'Ghi lỗi để lập F7'; end if;
  if p_ok and coalesce(p_pallets, 0) <= 0 then raise exception 'Nhập số pallet'; end if;
  insert into qc_finished(order_id) values (p_order) on conflict do nothing;
  update qc_finished set result = case when p_ok then 'dat' else 'khong_dat' end, pallets = p_pallets, note = p_note, checked_at = now() where order_id = p_order;
  if p_ok then
    perform _set_in_fn();
    update orders set gc_status = 'qc_dat', status = 'giao_hang', gh_status = 'thong_bao' where id = p_order;
    perform log_event(p_order, 'ĐK4 đạt: QC thành phẩm đạt, ' || p_pallets || ' pallet → QT3 giao hàng');
  else
    insert into issues(order_id, source, kind, description) values (p_order, 'QC_TP', 'loi_gia_cong', p_note);
    perform log_event(p_order, 'QC thành phẩm không đạt → F7: ' || p_note);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.qt0_done_zalo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare tk text; o orders; ids uuid[]; txt text; p record;
begin
  if new.proc <> 'QT0' or new.status <> 'hoan_tat' or old.status = 'hoan_tat' then return new; end if;
  select value into tk from app_secrets where name = 'ZALO_BOT_TOKEN'; if tk is null then return new; end if;
  select * into o from orders where id = new.order_id;
  select array_agg(distinct u) into ids from (
    select cp.user_id u from chain_people cp where cp.proc = 'QT1' and cp.company = 'PN' and cp.role = 'lap' and cp.user_id is not null
    union select unnest(g.member_ids) from chain_people cp join work_groups g on g.id = cp.group_id and g.active where cp.proc = 'QT1' and cp.company = 'PN' and cp.role = 'lap') x;
  select array_agg(distinct u) into ids from (select unnest(ids) u union select d.to_user from delegations d where d.user_id = any(ids) and current_date between d.from_date and d.to_date) y;
  txt := '✅ QT0 đã duyệt – mở XNĐH' || E'\n' || o.code || ' · ' || o.project || E'\n' || new.title || ' xong. Vào tab QT1 → "Mở XNĐH mới" → lấy danh sách tấm QT0.' || E'\n'
    || 'https://79kaid-jpg.github.io/don-hang-cnc/?z=1#/don/' || o.id || '?tab=QT1';
  for p in select zalo_chat_id from profiles where id = any(ids) and zalo_chat_id is not null and active loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tk || '/sendMessage',
      body := jsonb_build_object('chat_id', p.zalo_chat_id, 'text', txt), headers := '{"Content-Type":"application/json"}'::jsonb);
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.qt0_list(p_order uuid)
 RETURNS TABLE(id uuid, code text, title text, done_at timestamp with time zone, tot numeric, used numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, _qt0_code(b.id), b.title, b.done_at,
    (select coalesce(sum(_num0(e->>'so_tam')), 0) from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e where d.batch_id = b.id),
    (select coalesce(sum(q), 0) from _qt0_used(b.id))
  from batches b where b.order_id = p_order and b.proc = 'QT0' and b.status = 'hoan_tat' and doc_visible('PN', 'QT0')
  order by b.seq;
$function$
;

CREATE OR REPLACE FUNCTION public.qt0_rows(p_qt0 uuid, p_doc uuid DEFAULT NULL::uuid)
 RETURNS TABLE(i integer, k text, r jsonb, tot numeric, used numeric, orders jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select (x.n - 1)::int i, _m2_tam(x.e) e, _ds_key(x.e) k from docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) with ordinality x(e, n)
             where d.batch_id = p_qt0 and doc_visible('PN', 'QT0')),
  t as (select k, sum(_num0(e->>'so_tam')) tot from s group by k)
  select s.i, s.k, s.e, t.tot, coalesce(u.q, 0), coalesce(u.orders, '[]') from s join t using (k) left join _qt0_used(p_qt0, p_doc) u using (k) order by s.i;
$function$
;

CREATE OR REPLACE FUNCTION public.qt1_reclone(p_doc uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; ob batches; nb uuid; nd uuid; v_rows jsonb; v_short jsonb; oc text;
begin
  select * into d from docs where id = p_doc; select * into ob from batches where id = d.batch_id;
  if ob.proc <> 'QT1' or d.company <> 'PN' or d.status <> 'fail' then raise exception 'Chỉ tạo lại được từ XNĐH Phương Nam đã Thất bại'; end if;
  nb := batch_create(ob.order_id, 'QT1', '', jsonb_build_object('qt0', ob.src_qt0));
  select id into nd from docs where batch_id = nb and company = 'PN';
  select code into oc from co_orders where doc_id = p_doc;
  with o as (select x.e, x.n, _ds_key(x.e) k, _num0(x.e->>'so_tam') q from jsonb_array_elements(coalesce(d.tables->'ds', '[]')) with ordinality x(e, n)),
  av as (select t.k, t.tot - coalesce(u.q, 0) a from (select _ds_key(e) k, sum(_num0(e->>'so_tam')) tot from docs z, jsonb_array_elements(coalesce(z.tables->'ds', '[]')) e where z.batch_id = ob.src_qt0 group by 1) t
         left join _qt0_used(ob.src_qt0, nd) u on u.k = t.k),
  c as (select o.*, case when ob.src_qt0 is null or a.k is null then o.q else greatest(0, least(o.q, a.a - coalesce(sum(o.q) over (partition by o.k order by o.n rows between unbounded preceding and 1 preceding), 0))) end take
        from o left join av a on a.k = o.k)
  select coalesce(jsonb_agg(_qt0_take(e, take) order by n) filter (where take > 0), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('ma_tam', e->>'ma_tam', 'cu', q, 'lay', take)) filter (where take < q), '[]') into v_rows, v_short from c;
  update docs set tables = jsonb_build_object('ds', v_rows), header = (d.header - 'so_xn' - 'so_ct' - 'tao_lai_tu') || coalesce(header, '{}') || jsonb_build_object('tao_lai_tu', coalesce(oc, ob.title)) where id = nd;
  update batches set checklist = coalesce(checklist, '{}') || jsonb_build_object('cloned_from', d.id) where id = nb;
  update batches set checklist = coalesce(checklist, '{}') || jsonb_build_object('recloned_to', nb) where id = ob.id;
  perform log_event(ob.order_id, 'Tạo lại XNĐH từ ' || coalesce(oc, ob.title) || ' (thất bại)');
  return jsonb_build_object('batch', nb, 'short', v_short, 'from', coalesce(oc, ob.title));
end $function$
;

CREATE OR REPLACE FUNCTION public.qt3_root(p_doc uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cur uuid := p_doc; nx uuid; i int := 0;
begin
  loop
    select nullif(b.checklist->>'auto_from', '')::uuid into nx from docs d join batches b on b.id = d.batch_id where d.id = cur;
    exit when nx is null or i > 4 or not exists (select 1 from docs where id = nx);
    cur := nx; i := i + 1;
  end loop;
  return cur;
end $function$
;

CREATE OR REPLACE FUNCTION public.rating_ack(p_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update ratings set ack_at = now() where id = p_id and ratee = app_uid();
$function$
;

CREATE OR REPLACE FUNCTION public.rating_list_stats()
 RETURNS TABLE(ratee uuid, day date, sum integer, n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select ratee, (created_at at time zone 'Asia/Ho_Chi_Minh')::date, sum(stars)::int, count(*)::int from ratings
  where not acting and created_at > now() - interval '400 days' group by 1, 2;
$function$
;

CREATE OR REPLACE FUNCTION public.rating_save(p_doc uuid, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare it jsonb; n int := 0; tg record; who text; code text; old ratings;
begin
  select coalesce(nullif(d.header->>'so_xn', ''), o.code, '') into code from docs d join batches b on b.id = d.batch_id join orders o on o.id = b.order_id where d.id = p_doc;
  select full_name into who from profiles where id = app_uid();
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'stars')::int, 0) = 0 then continue; end if;
    select * into tg from rating_targets(p_doc) where user_id = (it->>'ratee')::uuid;
    if not found then raise exception 'Bạn không đánh giá được người này cho phiếu này'; end if;
    if not tg.editable then raise exception 'Đã quá 24 giờ, không sửa được đánh giá'; end if;
    select * into old from ratings where doc_id = p_doc and rater = app_uid() and ratee = (it->>'ratee')::uuid;
    insert into ratings(doc_id, rater, ratee, stars, tags, comment, acting)
      values (p_doc, app_uid(), (it->>'ratee')::uuid, (it->>'stars')::int,
              coalesce(array(select jsonb_array_elements_text(it->'tags')), '{}'), left(coalesce(it->>'comment', ''), 1000), auth.uid() <> app_uid())
      on conflict (doc_id, rater, ratee) do update set stars = excluded.stars, tags = excluded.tags, comment = excluded.comment, acting = excluded.acting, updated_at = now(), ack_at = null;
    if old.id is null then
      perform _zsend(array[(it->>'ratee')::uuid], 'Bạn nhận đánh giá ' || repeat('★', (it->>'stars')::int) || ' từ ' || coalesce(who, '') || ' · ' || code
        || case when coalesce(it->>'comment', '') <> '' then E'\n“' || left(it->>'comment', 300) || '”' else '' end || E'\nXem: app PMS → Phản hồi cho tôi');
    end if;
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.rating_targets(p_doc uuid)
 RETURNS TABLE(user_id uuid, role text, mine smallint, tags text[], comment text, editable boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (select signs from docs where id = p_doc),
  me as (select max((s->>'at')::timestamptz) at from d, jsonb_array_elements(d.signs) s
         where s->>'action' = 'ky' and s->>'role' = 'duyet' and (s->>'user')::uuid = app_uid()),
  t as (select (s->>'user')::uuid u, (array_agg(s->>'role' order by s->>'at' desc))[1] r
        from d, me, jsonb_array_elements(d.signs) s
        where me.at is not null and s->>'action' = 'ky' and (s->>'user')::uuid <> app_uid() and (s->>'at')::timestamptz < me.at
        group by 1)
  select t.u, t.r, x.stars, x.tags, x.comment, (x.id is null or x.created_at > now() - interval '24 hours')
  from t left join ratings x on x.doc_id = p_doc and x.rater = app_uid() and x.ratee = t.u;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_doc(p_doc uuid, p_user uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare oid uuid; me text; who text;
begin
  if not can_manage_doc(p_doc) then raise exception 'Chỉ quản lý trực tiếp của người làm hoặc admin mới giao lại được'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Nhập lý do giao lại'; end if;
  select full_name into who from profiles where id = p_user and active; if who is null then raise exception 'Người nhận không hợp lệ'; end if;
  select b.order_id into oid from docs d join batches b on b.id = d.batch_id where d.id = p_doc and b.status = 'dang_lam' and d.status not in ('da_duyet','fail');
  if oid is null then raise exception 'Phiếu không còn mở'; end if;
  update docs set assignee = p_user, assign_note = trim(p_note) where id = p_doc;
  select full_name into me from profiles where id = app_uid();
  insert into order_msgs(order_id, doc_id, kind, from_user, to_users, text, meta)
    values (oid, p_doc, 'reassign', app_uid(), array[p_user], trim(p_note), jsonb_build_object('to_name', who));
  perform _zsend(_with_deleg(array[p_user]), '📌 ' || coalesce(me, 'Quản lý') || ' giao việc cho bạn' || E'\n' || _doc_line(p_doc) || E'\nLý do: ' || trim(p_note) || _reply_hint(p_doc));
end $function$
;

CREATE OR REPLACE FUNCTION public.reassign_open(p_proc text, p_company text, p_role text, p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d record; n int := 0;
begin
  if not has_role('admin_it') then raise exception 'Chỉ admin'; end if;
  for d in select dd.id from docs dd join batches b on b.id = dd.batch_id where b.status = 'dang_lam' and b.proc = p_proc and dd.company = p_company
      and dd.status not in ('da_duyet','fail','duyet_them') and _role_of(b.proc, dd.status) = p_role loop
    perform reassign_doc(d.id, p_user, 'Đổi người phụ trách quy trình'); n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.rec_visible(p_proc text, p_company text, p_secret boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select doc_visible(p_company, p_proc) and (not p_secret or cardinality(hidden_keys(p_proc, p_company)) = 0);
$function$
;

CREATE OR REPLACE FUNCTION public.rec_visible2(p_doc uuid, p_kind text, p_proc text, p_company text, p_secret boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    -- người đã ký phiếu này luôn xem được chứng từ của phiếu
    exists (select 1 from docs d where d.id = p_doc and d.signs @> jsonb_build_array(jsonb_build_object('user', app_uid()::text)))
    or (
      rec_visible(p_proc, p_company, p_secret)
      -- vai trò chỉ "xem": không xem bản trình duyệt
      and (p_kind <> 'trinh_duyet' or exists (select 1 from profiles p where p.id = app_uid() and exists (select 1 from unnest(p.roles) r where r <> 'xem')))
    );
$function$
;

CREATE OR REPLACE FUNCTION public.ref_candidates(p_order uuid, p_co text)
 RETURNS TABLE(code text, batch_id uuid, title text, used text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.code, b.id, b.title,
    (select coalesce(sum(rr.con_lai), 0)::text || '/' || coalesce(sum(rr.so_tam), 0)::text from ref_rows(c.code, p_co) rr)
  from co_orders c join docs pd on pd.id = c.doc_id join batches b on b.id = c.batch_id
  where c.order_id = p_order and b.proc = 'QT1' and pd.status = 'da_duyet'
    and c.company = case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end
    and (select coalesce(sum(rr.con_lai), 0) from ref_rows(c.code, p_co) rr) > 0
  order by c.created_at;
$function$
;

CREATE OR REPLACE FUNCTION public.ref_rows(p_code text, p_co text)
 RETURNS TABLE(i integer, ma_tam text, vat_lieu text, day text, so_tam numeric, con_lai numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c co_orders; pd docs; prev text := case p_co when 'IPC' then 'PN' when 'HW' then 'IPC' end;
begin
  select co.* into c from co_orders co where upper(trim(co.code)) = upper(trim(p_code)) and co.company = prev order by co.created_at desc limit 1;
  if c.id is null then return; end if;
  select x.* into pd from docs x where x.id = c.doc_id;
  return query
    with rws as (select (o - 1)::int ix, r from jsonb_array_elements(coalesce(pd.tables->'ds', '[]')) with ordinality t(r, o)),
         usd as (select uu.k, uu.q from _ref_used(c.id) uu),
         alloc as (select rws.ix, rws.r, _ds_key(rws.r) kk, _num0(rws.r->>'so_tam') qq,
           coalesce(sum(_num0(rws.r->>'so_tam')) over (partition by _ds_key(rws.r) order by rws.ix rows between unbounded preceding and 1 preceding), 0) bf from rws)
    select a.ix, a.r->>'ma_tam', a.r->>'vat_lieu', a.r->>'day', a.qq,
      greatest(0, a.qq - greatest(0, least(a.qq, coalesce(u.q, 0) - a.bf)))
    from alloc a left join usd u on u.k = a.kk order by a.ix;
end $function$
;

CREATE OR REPLACE FUNCTION public.reply_msg(p_doc uuid, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(trim(p_text), '') = '' then raise exception 'Nhập nội dung'; end if;
  perform _reply(app_uid(), p_doc, p_text, 'app');
end $function$
;

CREATE OR REPLACE FUNCTION public.reply_msg_tag(p_doc uuid, p_text text, p_tags uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare rid uuid; tg uuid[]; rc uuid[]; bad int; me text; nz int := 0; noz text[];
begin
  if coalesce(trim(p_text), '') = '' then raise exception 'Nhập nội dung'; end if;
  if not msg_visible(p_doc) then raise exception 'Bạn không xem được phiếu này'; end if;
  tg := array(select distinct x from unnest(coalesce(p_tags, '{}')) x where x is not null and x <> app_uid());
  if cardinality(tg) > 5 then raise exception 'Mỗi tin chỉ nhắc tối đa 5 người'; end if;
  select count(*) into bad from unnest(tg) x where not _user_sees_doc(x, p_doc);
  if bad > 0 then raise exception 'Có người được nhắc không có quyền xem phiếu / công ty này'; end if;
  rid := _reply(app_uid(), p_doc, p_text, 'app');
  if cardinality(tg) = 0 then return jsonb_build_object('zalo', 0, 'no_zalo', '[]'::jsonb); end if;
  select to_users into rc from order_msgs where id = rid;
  update order_msgs set to_users = array(select distinct x from unnest(coalesce(to_users, '{}') || tg) x), meta = meta || jsonb_build_object('tags', to_jsonb(tg)) where id = rid;
  select full_name into me from profiles where id = app_uid();
  -- người đã nhận Zalo của tin trả lời thường thì không gửi lần 2
  nz := _zsend(array(select x from unnest(tg) x where not (x = any(coalesce(rc, '{}')))), '📣 ' || coalesce(me, '') || ' nhắc bạn:' || E'\n“' || trim(p_text) || E'”\n' || _doc_line(p_doc)
    || _reply_hint(p_doc));
  select coalesce(array_agg(full_name), '{}') into noz from profiles where id = any(tg) and coalesce(zalo_chat_id, '') = '';
  return jsonb_build_object('zalo', nz, 'no_zalo', to_jsonb(noz));
end $function$
;

CREATE OR REPLACE FUNCTION public.restricted_keys(p_proc text)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(case when area = 'header' then 'h:' || key else tbl || ':' || key end), '{}') || case when p_proc = 'QT1' then array['h:tong_tt'] else '{}'::text[] end
  from proc_fields where proc = p_proc and restricted and active;
$function$
;

CREATE OR REPLACE FUNCTION public.return_step(p_order uuid, p_step text, p_reason text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders := _order(p_order); st order_steps; tgt text; bought boolean;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Ghi lý do trả về'; end if;
  if not (p_step = any(_steps(o.status, o.nvl_status, o.gc_status, o.gh_status))) then raise exception 'Đơn không còn ở bước này'; end if;
  select * into st from order_steps where order_id = p_order and step = p_step;
  if not (has_role('admin_it') or has_role('admin_cnc') or public.app_uid() = st.doer_id or public.app_uid() = any(st.supervisor_ids)
          or in_group(st.doer_group_id) or in_any_group(st.supervisor_group_ids)) then
    raise exception 'Chỉ người thực hiện, người giám sát hoặc Admin được trả về'; end if;
  perform _set_in_fn();
  case p_step
    when 'qt0.boc_tach' then tgt := 'qt0.tiep_nhan'; update orders set status = 'tiep_nhan' where id = p_order;
    when 'qt0.kiem_tra_f1' then tgt := 'qt0.boc_tach'; update orders set status = 'boc_tach', f1_result = 'chua' where id = p_order;
    when 'qt1.cho_duyet_xndh' then tgt := 'qt1.xndh'; perform _restart_approval(p_order, 'F2', false); update orders set status = 'xndh' where id = p_order;
    when 'qt1.cho_khach' then tgt := 'qt1.cho_duyet_xndh';
      update confirmations set kh1_confirmed_at = null, kh2_confirmed_at = null where order_id = p_order;
      perform _restart_approval(p_order, 'F2', true); update orders set status = 'cho_duyet_xndh' where id = p_order;
    when 'qt2.b2' then tgt := 'qt2.b1'; perform _restart_approval(p_order, 'F5', false);
      update orders set gc_status = 'lap_lgc', nvl_status = 'du_toan' where id = p_order;
    when 'qt2.b3' then tgt := 'qt2.b2'; perform _restart_approval(p_order, 'PO', false); perform _restart_approval(p_order, 'F5', true);
      update orders set gc_status = 'cho_duyet_lgc', nvl_status = 'cho_duyet_f3' where id = p_order;
    when 'qt2.b4' then tgt := 'qt2.b3'; perform _restart_approval(p_order, 'PO', false);
      update orders set nvl_status = 'mua_hang' where id = p_order;
    when 'qt2.b5' then
      bought := exists (select 1 from receipts where order_id = p_order and qc_result is not null);
      if bought then tgt := 'qt2.b4';
        insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
          select material, thickness_mm, -qty_kg, 'dieu_chinh', order_id, 'Trả về B4: huỷ nhập F4' from stock_moves where order_id = p_order and ref = 'F4' and kind = 'nhap';
        update receipts set qc_result = null where order_id = p_order;
        update orders set gc_status = 'cho_nvl', nvl_status = 'nhap_kho' where id = p_order;
      else tgt := 'qt2.b2'; perform _restart_approval(p_order, 'F5', true);
        update orders set gc_status = 'cho_duyet_lgc', nvl_status = 'cho_duyet_f3' where id = p_order;
      end if;
    when 'qt2.b6' then tgt := 'qt2.b5';
      insert into stock_moves(material, thickness_mm, qty_kg, kind, order_id, ref)
        select material, thickness_mm, -qty_kg, 'dieu_chinh', order_id, 'Trả về B5: huỷ xuất F6' from stock_moves where order_id = p_order and ref = 'F6' and kind = 'xuat';
      update handovers set done_at = null where order_id = p_order;
      update orders set gc_status = 'ban_giao' where id = p_order;
    when 'qt3.lap_lgh' then tgt := 'qt3.thong_bao'; update orders set gh_status = 'thong_bao' where id = p_order;
    when 'qt3.cho_duyet_lgh' then tgt := 'qt3.lap_lgh'; perform _restart_approval(p_order, 'LGH1', false); perform _restart_approval(p_order, 'LGH2', false);
      update orders set gh_status = 'lap_lgh' where id = p_order;
    when 'qt3.giao_hang' then tgt := 'qt3.cho_duyet_lgh'; perform _restart_approval(p_order, 'LGH2', false); perform _restart_approval(p_order, 'LGH1', true);
      update orders set gh_status = 'cho_duyet_lgh' where id = p_order;
    when 'qt3.ky_bbgh' then tgt := 'qt3.giao_hang'; update deliveries set delivered_at = null where order_id = p_order;
      update orders set gh_status = 'giao_hang' where id = p_order;
    else raise exception 'Bước đầu của quy trình, không trả về được (muốn sửa phần trước hãy lập phiếu F7)';
  end case;
  update order_steps set return_note = p_reason, returned_at = now() where order_id = p_order and step = tgt;
  perform log_event(p_order, 'Trả về ' || p_step || ' → ' || tgt || ': ' || p_reason);
  perform _zalo_step(p_order, tgt, 'returned', public.app_uid());
  return tgt;
end $function$
;

CREATE OR REPLACE FUNCTION public.reveal_cccd(p_doc uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r doc_cccd;
begin
  if not cccd_ok(p_doc) then raise exception 'Bạn không có quyền xem số CCCD'; end if;
  select * into r from doc_cccd where doc_id = p_doc; if r.doc_id is null then return null; end if;
  insert into cccd_views(doc_id, viewer) values (p_doc, app_uid());
  begin return extensions.pgp_sym_decrypt(r.enc, _cccd_key());
  exception when others then return null; end;
end $function$
;

CREATE OR REPLACE FUNCTION public.seen_msgs()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update profiles set msgs_seen_at = now() where id = app_uid();
$function$
;

CREATE OR REPLACE FUNCTION public.send_daily_report()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tok text; txt text; r record; n int := 0;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  if coalesce(tok, '') = '' then return 0; end if;
  txt := daily_report_text();
  for r in select zalo_chat_id from profiles where active and coalesce(zalo_chat_id, '') <> ''
      and coalesce(daily_report, roles && array['duyet','admin_it']) loop
    perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
      body := jsonb_build_object('chat_id', r.zalo_chat_id, 'text', left(txt, 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
    n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.send_daily_report_me()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare tok text; cid text;
begin
  select value into tok from app_secrets where name = 'ZALO_BOT_TOKEN';
  select zalo_chat_id into cid from profiles where id = app_uid();
  if coalesce(tok, '') = '' or coalesce(cid, '') = '' then return false; end if;
  perform net.http_post(url := 'https://bot-api.zaloplatforms.com/bot' || tok || '/sendMessage',
    body := jsonb_build_object('chat_id', cid, 'text', left(daily_report_text(), 2000)), headers := jsonb_build_object('Content-Type', 'application/json'));
  return true;
end $function$
;

CREATE OR REPLACE FUNCTION public.seq_block(p_doc uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d docs; b batches; q1 batches; q1ok boolean; q2d int; nm text;
begin
  select * into d from docs where id = p_doc; if not found or d.company = 'PN' then return null; end if;
  select * into b from batches where id = d.batch_id; if b.proc not in ('QT2','QT3') or b.co_order_id is null then return null; end if;
  nm := case d.company when 'HW' then 'Hanwa' else d.company end;
  select x.* into q1 from co_orders c join batches x on x.id = c.batch_id where c.id = b.co_order_id;
  if q1.id is not null then
    q1ok := q1.status in ('hoan_tat','cho_ky') or exists (select 1 from docs y where y.batch_id = q1.id and y.company = d.company and y.status = 'da_duyet');
    if not q1ok then return jsonb_build_object('need','QT1','batch_id',q1.id,'msg','Chờ XNĐH ' || nm || ' duyệt'); end if;
  end if;
  if b.proc = 'QT3' then
    select count(*) into q2d from batches q where q.proc = 'QT2' and q.co_order_id = b.co_order_id
      and (q.status in ('hoan_tat','cho_ky') or exists (select 1 from docs y where y.batch_id = q.id and y.company = d.company and y.status = 'da_duyet'));
    if q2d = 0 then return jsonb_build_object('need','QT2','batch_id',(select id from batches where proc='QT2' and co_order_id=b.co_order_id and status not in ('fail','huy') order by created_at limit 1),
      'msg','Chờ Lệnh GC ' || nm || ' duyệt'); end if;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.seq_blocked()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(b.id, x->>'need'), '{}') from batches b join docs d on d.batch_id = b.id
  cross join lateral (select public.seq_block(d.id) x) s
  where b.proc in ('QT2','QT3') and b.status in ('dang_lam','cho_ky') and d.company <> 'PN' and x is not null $function$
;

CREATE OR REPLACE FUNCTION public.set_active_co(p_co text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_co not in ('ALL','PN','IPC','HW') then raise exception 'Công ty không hợp lệ'; end if;
  if p_co <> 'ALL' and not (has_role('admin_it') or p_co = any(user_cos(app_uid()))) then raise exception 'Bạn không thuộc công ty %', p_co; end if;
  update profiles set active_co = p_co where id = app_uid();
end $function$
;

CREATE OR REPLACE FUNCTION public.set_daily_report(p_on boolean)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update profiles set daily_report = p_on where id = app_uid();
$function$
;

CREATE OR REPLACE FUNCTION public.set_integration_secret(p_name text, p_value text, p_label text DEFAULT NULL::text, p_provider text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text := nullif(trim(coalesce(p_value, '')), '');
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT'; end if;
  p_name := upper(trim(p_name));
  if p_name !~ '^[A-Z][A-Z0-9_]{2,48}$' then raise exception 'Tên khoá chỉ gồm chữ in hoa, số, dấu _ (VD: GOOGLE_API_KEY)'; end if;
  if _secret_system(p_name) then raise exception 'Khoá hệ thống, không sửa từ đây'; end if;
  if v is null and not exists (select 1 from app_secrets where name = p_name) then raise exception 'Chưa nhập giá trị'; end if;
  insert into app_secrets(name, value, updated_at, updated_by, label, provider, note)
    values (p_name, v, now(), app_uid(), p_label, p_provider, p_note)
  on conflict (name) do update set
    prev_value = case when v is not null and v <> app_secrets.value then app_secrets.value else app_secrets.prev_value end,
    prev_updated_at = case when v is not null and v <> app_secrets.value then app_secrets.updated_at else app_secrets.prev_updated_at end,
    value = coalesce(v, app_secrets.value),
    updated_at = case when v is not null then now() else app_secrets.updated_at end,
    updated_by = case when v is not null then app_uid() else app_secrets.updated_by end,
    label = coalesce(p_label, app_secrets.label), provider = coalesce(p_provider, app_secrets.provider), note = coalesce(p_note, app_secrets.note),
    last_test_at = case when v is not null then null else app_secrets.last_test_at end,
    last_test_ok = case when v is not null then null else app_secrets.last_test_ok end,
    last_test_msg = case when v is not null then null else app_secrets.last_test_msg end;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_order_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYMM'); n int; kh text; s text;
begin
  if new.code is null then
    select upper(regexp_replace(cu.code, '[^A-Za-z0-9]', '', 'g')) into kh from customers cu
      where cu.id = coalesce((select end_customer_id from projects where id = new.project_id), new.customer_id);
    kh := coalesce(nullif(kh, ''), 'KH');
    insert into co_counters2(k, last) values ('ORD|' || kh || '|' || p, 1)
      on conflict (k) do update set last = co_counters2.last + 1 returning last into n;
    s := kh || '-' || p || '-' || lpad(n::text, 2, '0');
    while exists (select 1 from orders where code = s) loop n := n + 1; s := kh || '-' || p || '-' || lpad(n::text, 2, '0'); end loop;
    new.code := s;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_order_customer(p_order uuid, p_customer uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('kinh_doanh') or has_role('admin_cnc') or has_role('admin_it')) then raise exception 'Không có quyền đổi khách hàng'; end if;
  update orders set customer_id = p_customer where id = p_order;
  perform log_event(p_order, 'Đổi khách hàng: ' || coalesce((select name from customers where id = p_customer), '—'));
end $function$
;

CREATE OR REPLACE FUNCTION public.set_perf_config(p_cfg jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('admin_it') then raise exception 'Chỉ Admin IT được sửa cấu hình'; end if;
  update perf_config set cfg = p_cfg, updated_at = now(), updated_by = app_uid() where id = 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.sla_scan()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; ids uuid[]; mg uuid[]; n int := 0; cnt int; last timestamptz; el numeric;
begin
  for r in select d.id, d.status_at, b.order_id, d.company, coalesce((select max(c.sla_h) from chain_people c where c.proc = b.proc and c.company = d.company
        and c.role = _role_of(b.proc, d.status)), 48) sla
      from docs d join batches b on b.id = d.batch_id where b.status = 'dang_lam' and d.status not in ('da_duyet','fail')
        and d.status_at >= '2026-11-07' loop
    el := extract(epoch from now() - r.status_at) / 3600;
    ids := doc_holders(r.id); if cardinality(ids) = 0 then continue; end if;
    if el >= r.sla * 0.75 and el < r.sla then
      if not exists (select 1 from order_msgs where doc_id = r.id and kind = 'auto' and meta->>'k' = '75' and at >= r.status_at) then
        insert into order_msgs(order_id, doc_id, kind, to_users, text, meta) values (r.order_id, r.id, 'auto', ids,
          'Sắp đến hạn: còn ' || ceil(r.sla - el) || 'h', jsonb_build_object('k', '75'));
        perform _zsend(_with_deleg(ids), '⏰ Sắp đến hạn (còn ~' || ceil(r.sla - el) || 'h)' || E'\n' || _doc_line(r.id)); n := n + 1;
      end if;
    elsif el >= r.sla then
      select count(*), max(at) into cnt, last from order_msgs where doc_id = r.id and kind = 'auto' and meta->>'k' = 'over' and at >= r.status_at;
      if cnt < 3 and (last is null or last < now() - interval '24 hours') then
        select coalesce(array_agg(distinct manager_id), '{}') into mg from profiles where id = any(ids) and manager_id is not null;
        insert into order_msgs(order_id, doc_id, kind, to_users, text, meta) values (r.order_id, r.id, 'auto', ids || mg,
          'Trễ hạn ' || floor(el - r.sla) || 'h (lần ' || (cnt + 1) || '/3)', jsonb_build_object('k', 'over', 'n', cnt + 1));
        perform _zsend(_with_deleg(ids), '🚨 Trễ hạn ' || floor(el - r.sla) || 'h – cần xử lý ngay' || E'\n' || _doc_line(r.id));
        if cnt = 0 then perform _zgroup(r.company, 'late', '🚨 Trễ hạn ' || floor(el - r.sla) || 'h · ' || (select string_agg(full_name, ', ') from profiles where id = any(ids)) || E'\n' || _doc_line(r.id)); end if;
        if cardinality(mg) > 0 then
          perform _zsend(mg, '🚨 Nhân viên của bạn đang trễ hạn ' || floor(el - r.sla) || 'h' || E'\n' || _doc_line(r.id)
            || E'\nMở đơn để Nhắc việc hoặc Giao lại.');
        end if;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.spin_wheel(p_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c jsonb; cost int; bal int; tk int; tot numeric; r numeric; acc numeric := 0; p jsonb; idx int := 0; pick int := 0; bonus int := 0; kind text;
begin
  select cfg into c from perf_config where id = 1; cost := (c->>'spin_cost')::int;
  if p_test then
    if not has_role('admin_it') then raise exception 'Chỉ Admin IT được quay thử'; end if; kind := 'test'; cost := 0;
  else
    if coalesce((c->>'wheel_on')::boolean, true) = false then raise exception 'Vòng quay đang tạm tắt'; end if;
    tk := (my_tickets()->>'balance')::int;
    if tk > 0 then kind := 'ticket'; cost := 0;
    elsif coalesce((c->>'points_spin')::boolean, true) then
      select balance into bal from perf_points(app_uid());
      if bal < cost then raise exception 'Chưa có phiếu quay và chưa đủ điểm (cần %)', cost; end if; kind := 'points';
    else raise exception 'Chưa có phiếu quay – làm đúng hạn hôm nay để nhận phiếu'; end if;
  end if;
  select sum((x->>'weight')::numeric) into tot from jsonb_array_elements(c->'prizes') x;
  r := random() * tot;
  for p in select * from jsonb_array_elements(c->'prizes') loop
    acc := acc + (p->>'weight')::numeric; if r < acc then pick := idx; exit; end if; idx := idx + 1;
  end loop;
  p := c->'prizes'->pick;
  if kind <> 'test' then
    if coalesce((p->>'points')::int, 0) <> 0 then bonus := (p->>'points')::int;
    elsif (p->>'label') ilike 'quay lại%' then bonus := case when kind = 'points' then cost else 0 end; end if;
  end if;
  insert into perf_spins(user_id, cost, prize, bonus, kind) values (app_uid(), cost, p->>'label', bonus, kind);
  -- "Quay lại" khi dùng phiếu: hoàn phiếu bằng cách đổi lượt này thành lượt thử
  if kind = 'ticket' and (p->>'label') ilike 'quay lại%' then update perf_spins set kind = 'free' where id = currval(pg_get_serial_sequence('perf_spins','id')); end if;
  return jsonb_build_object('index', pick, 'prize', p->>'label', 'bonus', bonus, 'kind', kind,
    'balance', (select balance from perf_points(app_uid())), 'tickets', (my_tickets()->>'balance')::int);
end $function$
;

CREATE OR REPLACE FUNCTION public.src_rows(p_doc uuid)
 RETURNS TABLE(i integer, k text, r jsonb, tot numeric, used numeric, orders jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select nullif(b.checklist->>'auto_from', '')::uuid src from docs d join batches b on b.id = d.batch_id where d.id = p_doc and doc_visible(d.company, b.proc)),
  rows as (select (o - 1)::int i, _ds_key(e) k, e r from s, docs d, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) with ordinality x(e, o) where d.id = s.src),
  u as (select _ds_key(e) k, _num0(e->>'so_tam') q, doc_code(d.id) code, d.id doc from s, batches b join docs d on d.batch_id = b.id, jsonb_array_elements(coalesce(d.tables->'ds', '[]')) e
        where b.checklist->>'auto_from' = s.src::text and b.status <> 'fail' and d.status <> 'fail')
  select rows.i, rows.k, rows.r, _num0(rows.r->>'so_tam'),
    coalesce((select sum(q) from u where u.k = rows.k), 0),
    coalesce((select jsonb_agg(jsonb_build_object('code', code, 'q', q, 'doc', doc)) from u where u.k = rows.k and q > 0), '[]'::jsonb)
  from rows where rows.k <> '' order by rows.i $function$
;

CREATE OR REPLACE FUNCTION public.src_split(p_doc uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('tot', coalesce(sum(src), 0), 'used', coalesce(sum(least(used, src)), 0),
    'kids', (select count(distinct d.id) from batches b join docs d on d.batch_id = b.id where b.checklist->>'auto_from' = p_doc::text and b.status <> 'fail' and d.status <> 'fail'))
  from _src_left(p_doc) $function$
;

CREATE OR REPLACE FUNCTION public.start_extraction(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('kinh_doanh') or has_role('ky_thuat')) then raise exception 'Không có quyền'; end if;
  perform _set_in_fn();
  update orders set status = 'boc_tach' where id = p_order and status in ('tiep_nhan','kiem_tra_f1');
  if not found then raise exception 'Đơn không ở bước tiếp nhận'; end if;
  perform log_event(p_order, 'Bắt đầu bóc tách F1');
end $function$
;

CREATE OR REPLACE FUNCTION public.start_impersonation(p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare g act_grants;
begin
  g := _act_grant(p_user);
  if not is_real_admin() and g.id is null then raise exception 'Bạn chưa được uỷ quyền làm thay người này (hoặc đã hết hạn)'; end if;
  if p_user = auth.uid() then raise exception 'Không thể đóng vai chính mình'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'Người dùng không tồn tại hoặc đã khoá'; end if;
  update profiles set impersonating = p_user where id = auth.uid();
  insert into audit_log(actor, acting_as, table_name, action, detail) values (auth.uid(), p_user, 'event',
    case when g.id is null then 'Bắt đầu đăng nhập với tư cách (chỉ xem đơn thật)' else 'Bắt đầu làm thay theo uỷ quyền' end,
    jsonb_build_object('grant', g.id, 'until', g.to_at));
end $function$
;

CREATE OR REPLACE FUNCTION public.step_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in select * from order_steps where done_at is null and due_at is not null loop
    if not r.over_sent and now() > r.due_at then
      perform _zalo_step(r.order_id, r.step, 'overdue');
      update order_steps set over_sent = true where order_id = r.order_id and step = r.step; n := n + 1;
    elsif not r.half_sent and r.doer_group_id is not null and r.doer_id is null
          and now() > r.started_at + (r.due_at - r.started_at) / 2 then
      perform _zalo_step(r.order_id, r.step, 'remind_half');
      update order_steps set half_sent = true where order_id = r.order_id and step = r.step; n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.stop_impersonation()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t uuid;
begin
  select impersonating into t from profiles where id = auth.uid();
  update profiles set impersonating = null where id = auth.uid();
  if t is not null then
    insert into audit_log(actor, acting_as, table_name, action, detail) values (auth.uid(), t, 'event', 'Kết thúc đăng nhập với tư cách', '{}');
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_f1(p_order uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (has_role('ky_thuat') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
  if not exists (select 1 from order_lines where order_id = p_order) then raise exception 'F1 chưa có dòng nào'; end if;
  perform _set_in_fn();
  update orders set status = 'kiem_tra_f1', f1_result = 'chua' where id = p_order and status = 'boc_tach';
  if not found then raise exception 'Đơn không ở bước bóc tách'; end if;
  perform log_event(p_order, 'Gửi kiểm tra F1');
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_for_approval(p_order uuid, p_doc text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s approval_steps; r int; o orders := _order(p_order);
begin
  if p_doc not in ('F2','F3','PO','F5','LGH1') then raise exception 'Phiếu % chưa mở ở phiên bản này', p_doc; end if;
  if exists (select 1 from approvals where order_id = p_order and doc_type = p_doc and status = 'cho') then raise exception 'Phiếu đang chờ duyệt'; end if;
  select * into s from approval_steps where doc_type = p_doc order by step_no limit 1;
  if s.id is null then raise exception 'Chưa cấu hình chuỗi duyệt cho %', p_doc; end if;
  if exists (select 1 from approval_steps where doc_type = p_doc and approver_id is null) then
    raise exception 'Chuỗi duyệt % còn cấp chưa gán người (Quản trị → Chuỗi duyệt)', p_doc; end if;
  perform _set_in_fn();
  if p_doc = 'F2' then
    if not (has_role('admin_cnc') or has_role('kinh_doanh')) then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from order_prices p join order_lines l on l.id = p.line_id where l.order_id = p_order and p.unit_price > 0) then raise exception 'Chưa nhập đơn giá'; end if;
    update orders set status = 'cho_duyet_xndh' where id = p_order and status = 'xndh';
  elsif p_doc = 'F3' then
    raise exception 'Dự toán NVL nay duyệt chung trong LGC (QT2-B2). Gửi duyệt LGC.';
  elsif p_doc = 'PO' then
    if not has_role('mua_hang') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from purchase_orders where order_id = p_order and po_no <> '' and supplier <> '' and eta is not null and unit_price > 0)
      then raise exception 'PO cần số PO, nhà cung cấp, ngày về, đơn giá'; end if;
    update orders set nvl_status = 'cho_duyet_po' where id = p_order and nvl_status = 'mua_hang';
  elsif p_doc = 'F5' then
    if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
    if not exists (select 1 from work_order_lines where order_id = p_order) then raise exception 'Chưa lập LGC'; end if;
    if not exists (select 1 from work_orders where order_id = p_order and start_date is not null and finish_date is not null) then raise exception 'LGC cần ngày bắt đầu và hoàn thành'; end if;
    if not exists (select 1 from material_plan_lines where order_id = p_order) then raise exception 'Chưa tính dự toán NVL (B1)'; end if;
    update orders set gc_status = 'cho_duyet_lgc', nvl_status = 'cho_duyet_f3' where id = p_order and gc_status = 'lap_lgc' and nvl_status = 'du_toan';
  elsif p_doc = 'LGH1' then
    if not has_role('admin_cnc') then raise exception 'Không có quyền'; end if;
    if exists (select 1 from approval_steps where doc_type = 'LGH2' and approver_id is null) then
      raise exception 'Chuỗi duyệt LGH2 còn cấp chưa gán người (Quản trị → Chuỗi duyệt)'; end if;
    if not exists (select 1 from deliveries where order_id = p_order and pmkt_code <> '' and vehicle <> '' and driver <> '' and planned_at is not null)
      then raise exception 'Lệnh giao hàng cần mã lệnh PMKT, xe, tài xế, ngày giờ giao'; end if;
    update orders set gh_status = 'cho_duyet_lgh' where id = p_order and gh_status = 'lap_lgh';
  end if;
  if not found then raise exception 'Đơn không ở đúng bước để gửi duyệt %', p_doc; end if;
  select coalesce(max(round), 0) + 1 into r from approvals where order_id = p_order and doc_type = p_doc;
  insert into approvals(order_id, doc_type, round, step_no, label, approver_id, due_at)
  values (p_order, p_doc, r, s.step_no, s.label, s.approver_id, now() + make_interval(hours => s.hours));
  perform log_event(p_order, 'Gửi duyệt ' || p_doc || ' (lượt ' || r || ')');
end $function$
;

CREATE OR REPLACE FUNCTION public.track_steps()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; olds text[] := '{}'; news text[]; d step_defaults;
begin
  news := _steps(new.status, new.nvl_status, new.gc_status, new.gh_status);
  if tg_op = 'UPDATE' then olds := _steps(old.status, old.nvl_status, old.gc_status, old.gh_status); end if;
  perform set_config('app.in_fn', 'on', true);
  foreach k in array olds loop
    if not (k = any(news)) then
      update order_steps set done_at = now(), done_by = auth.uid() where order_id = new.id and step = k;
    end if;
  end loop;
  foreach k in array news loop
    if not (k = any(olds)) then
      d := null;
      select * into d from step_defaults where step = k;
      insert into order_steps(order_id, step, doer_id, doer_group_id, supervisor_ids, supervisor_group_ids, started_at, due_at)
        values (new.id, k, case when d.doer_group_id is null then d.doer_id end, d.doer_group_id, coalesce(d.supervisor_ids, '{}'), coalesce(d.supervisor_group_ids, '{}'), now(),
                now() + make_interval(mins => (coalesce(d.sla_hours, 24) * 60)::int))
      on conflict (order_id, step) do update set started_at = now(), done_at = null, done_by = null, due_at = excluded.due_at,
        doer_id = case when coalesce(order_steps.doer_group_id, excluded.doer_group_id) is null then coalesce(order_steps.doer_id, excluded.doer_id) end,
        doer_group_id = coalesce(order_steps.doer_group_id, excluded.doer_group_id);
    end if;
  end loop;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.user_cos(p_user uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct c order by c), '{}') from (
    select case upper(coalesce(unit, '')) when 'CNC' then 'PN' when 'PN' then 'PN' when 'IPC' then 'IPC' when 'HANWA' then 'HW' when 'HW' then 'HW' end c from profiles where id = p_user
      and not exists (select 1 from user_co_roles u where u.user_id = p_user)
    union select company from user_co_roles where user_id = p_user
    union select cp.company from chain_people cp left join work_groups g on g.id = cp.group_id
      where cp.user_id = p_user or (g.id is not null and p_user = any(g.member_ids))) x where c is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.user_set_access(p_user uuid, p_admin boolean, p_cos jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; un text[] := '{}';
begin
  if not has_role('admin_it') then raise exception 'Chỉ admin IT'; end if;
  if p_user = app_uid() and not p_admin then raise exception 'Không tự bỏ quyền admin IT của mình'; end if;
  delete from user_co_roles where user_id = p_user and not (p_cos ? company);
  for k in select jsonb_object_keys(p_cos) loop
    if k not in ('PN','IPC','HW') then raise exception 'Công ty không hợp lệ: %', k; end if;
    insert into user_co_roles(user_id, company, roles) values (p_user, k, array(select jsonb_array_elements_text(p_cos -> k)))
      on conflict (user_id, company) do update set roles = excluded.roles;
    un := un || array(select jsonb_array_elements_text(p_cos -> k));
  end loop;
  -- Chỉ tự điền đơn vị khi đang trống / Khác / IT; không ghi đè lựa chọn của admin
  update profiles set roles = array(select distinct x from unnest(un || case when p_admin then array['admin_it'] else '{}'::text[] end) x),
    unit = case when coalesce(unit,'') in ('','IT','KHAC')
      then coalesce((select case j when 'PN' then 'CNC' when 'HW' then 'HANWA' else j end from jsonb_object_keys(p_cos) j order by case j when 'PN' then 1 when 'IPC' then 2 else 3 end limit 1), unit) else unit end
  where id = p_user;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_act(p_task uuid, p_action text, p_note text DEFAULT ''::text, p_checklist jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t wf_tasks; ins wf_instances; v wf_versions; st jsonb; it record; label text; prev wf_tasks; nt uuid; sys boolean := coalesce(current_setting('wf.sys', true), '') = 'on';
begin
  select * into t from wf_tasks where id = p_task for update;
  if t.id is null then raise exception 'Không tìm thấy việc'; end if;
  if t.status <> 'cho' then raise exception 'Việc này đã được xử lý'; end if;
  if t.kind <> 'task' then raise exception 'Nút này do hệ thống xử lý'; end if;
  select * into ins from wf_instances where id = t.instance_id for update;
  if ins.status <> 'dang_chay' then raise exception 'Hồ sơ không còn chạy'; end if;
  select * into v from wf_versions where id = ins.version_id;
  st := _wf_node(v.def, t.step_id);
  if st is null then raise exception 'Bước không còn trong định nghĩa'; end if;
  if not sys then
    if t.assigned_to is null and not _wf_match(st->'assignee') and not has_role('admin_it') then
      raise exception 'Bước "%" chưa có người làm – chờ người quản trị giai đoạn phân công', st->>'name'; end if;
    if not (wf_can_do(t.assigned_to, st) or wf_is_manager(st)) then raise exception 'Bạn không phụ trách bước "%"', st->>'name'; end if;
    if p_action = 'next' and _wf_has_appr(st) then raise exception 'Bước này cần đi qua luồng duyệt – bấm "Gửi duyệt"'; end if;
    if t.appr_state = 'dang_duyet' and p_action in ('back', 'fail') and not wf_is_manager(st) then raise exception 'Đang trong luồng duyệt'; end if;
  end if;
  if p_action = 'next' then
    if not sys then
      for it in select * from _wf_items(st) loop
        if it.kind = 'file' then
          if not exists (select 1 from jsonb_array_elements(t.files) f where f->>'item' = it.key) then raise exception 'Chưa tải file: %', it.text; end if;
        elsif coalesce((p_checklist->>it.key)::boolean, false) is not true then raise exception 'Chưa tích: %', it.text; end if;
      end loop;
      if coalesce((st->>'require_note')::boolean, false) and coalesce(trim(p_note), '') = '' then raise exception 'Bước này bắt buộc ghi chú'; end if;
    end if;
    update wf_tasks set status = 'xong', done_by = coalesce(done_by, app_uid()), done_at = now(),
      note = case when sys then note else coalesce(p_note, '') end, checklist = coalesce(p_checklist, '{}') where id = t.id;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'ky', (st->>'name') || ' xong');
    perform _wf_leave(ins.id, st, t.id, 0);
  elsif p_action = 'back' then
    if not sys and not coalesce((st->>'allow_back')::boolean, false) then raise exception 'Bước này không cho trả lại'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do trả lại'; end if;
    -- về đúng việc đã dẫn tới việc này (bỏ qua nút hệ thống)
    select * into prev from wf_tasks where id = t.prev_task;
    while prev.id is not null and prev.kind <> 'task' loop select * into prev from wf_tasks where id = prev.prev_task; end loop;
    if prev.id is null then
      if sys then update wf_tasks set appr_state = 'cho_sua' where id = t.id; return 'cho_sua'; end if;
      raise exception 'Không có bước trước để trả lại';
    end if;
    update wf_tasks set status = 'tra_lai', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    nt := _wf_open_task2(ins.id, _wf_node(v.def, prev.step_id), prev.prev_task, 'task');
    update wf_tasks set assigned_to = coalesce(assigned_to, prev.done_by) where id = nt;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'tra_lai', (st->>'name') || ' → ' || prev.step_name || ': ' || p_note);
  elsif p_action = 'fail' then
    if not sys and not coalesce((st->>'allow_fail')::boolean, false) then raise exception 'Bước này không cho từ chối (Fail)'; end if;
    if coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
    update wf_tasks set status = 'fail', done_by = app_uid(), done_at = now(), note = p_note where id = t.id;
    insert into wf_events(instance_id, process_id, action, detail) values (ins.id, v.process_id, 'fail', (st->>'name') || ': ' || p_note);
    perform _wf_fail(ins.id, p_note);
    return 'fail';
  else raise exception 'Thao tác không hợp lệ';
  end if;
  update wf_approvals set status = 'bo_qua' where task_id = t.id and status = 'cho';
  perform _wf_settle(ins.id);
  select case when status = 'hoan_tat' then 'hoan_tat' when status = 'fail' then 'fail' end into label from wf_instances where id = ins.id;
  if label is null then
    select coalesce(string_agg(step_name, ', '), 'đang chờ nhánh khác') into label from wf_tasks where instance_id = ins.id and status = 'cho' and kind = 'task' and created_at = now();
  end if;
  return label;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_approve(p_appr uuid, p_ok boolean, p_note text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a wf_approvals; c record; lv jsonb; need int; tot int; yes int; pend int; res text := 'cho'; rej text;
begin
  select * into a from wf_approvals where id = p_appr for update;
  if a.id is null or a.status <> 'cho' then raise exception 'Phiếu duyệt đã được xử lý'; end if;
  if a.approver <> app_uid() and not has_role('admin_it') then raise exception 'Bạn không phải người duyệt của cấp này'; end if;
  if not p_ok and coalesce(trim(p_note), '') = '' then raise exception 'Ghi lý do từ chối'; end if;
  select * into c from _wf_ctx(a.task_id);
  if (c.t).status <> 'cho' then raise exception 'Bước đã kết thúc'; end if;
  update wf_approvals set status = case when p_ok then 'dong_y' else 'tu_choi' end, note = coalesce(p_note, ''), decided_at = now() where id = a.id;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, case when p_ok then 'dong_y' else 'tu_choi' end,
    (c.st->>'name') || ' · ' || a.level_name || coalesce(': ' || nullif(trim(p_note), ''), ''));
  lv := c.st->'approval'->'levels'->a.level;
  select count(*), count(*) filter (where status = 'dong_y'), count(*) filter (where status = 'cho')
    into tot, yes, pend from wf_approvals where task_id = a.task_id and round = a.round and level = a.level;
  need := case coalesce(lv->>'rule', 'all') when 'any' then 1 when 'min' then least(greatest(coalesce((lv->>'min')::int, 1), 1), tot) else tot end;
  if yes >= need then
    update wf_approvals set status = 'bo_qua' where task_id = a.task_id and round = a.round and level = a.level and status = 'cho';
    if _wf_open_level(a.task_id, a.level + 1, a.round) then res := 'cap_sau';
    else
      update wf_tasks set appr_state = null where id = a.task_id;
      perform set_config('wf.sys', 'on', true);
      perform wf_act(a.task_id, 'next', 'Đã duyệt đủ các cấp', (c.t).checklist);
      perform set_config('wf.sys', 'off', true);
      res := 'dat';
    end if;
  elsif yes + pend < need then
    update wf_approvals set status = 'bo_qua' where task_id = a.task_id and round = a.round and status = 'cho';
    rej := coalesce(c.st->'approval'->>'on_reject', 'restart');
    perform set_config('wf.sys', 'on', true);
    if rej = 'fail' then perform wf_act(a.task_id, 'fail', a.level_name || ' từ chối: ' || p_note);
    elsif rej = 'back' then perform wf_act(a.task_id, 'back', a.level_name || ' từ chối: ' || p_note);
    else update wf_tasks set appr_state = 'cho_sua' where id = a.task_id;
    end if;
    perform set_config('wf.sys', 'off', true);
    res := 'tu_choi';
  end if;
  return res;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_assign(p_task uuid, p_user uuid, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' then raise exception 'Việc đã xử lý xong'; end if;
  if not wf_is_manager(c.st) then raise exception 'Chỉ người quản trị giai đoạn được phân công'; end if;
  if not exists (select 1 from profiles where id = p_user and active) then raise exception 'Người nhận không hợp lệ'; end if;
  update wf_tasks set assigned_to = p_user where id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, 'phan_cong',
    (c.st->>'name') || ' → ' || (select full_name from profiles where id = p_user) || coalesce(': ' || nullif(trim(p_note), ''), ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_can_do(p_assigned uuid, p_step jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or case when p_assigned is not null then p_assigned = app_uid() else _wf_match(p_step->'assignee') end $function$
;

CREATE OR REPLACE FUNCTION public.wf_cancel(p_inst uuid, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not has_role('admin_it') and not exists (select 1 from wf_instances where id = p_inst and started_by = app_uid()) then raise exception 'Không có quyền huỷ'; end if;
  perform _wf_cancel_open(p_inst, null);
  update wf_instances set status = 'huy', done_at = now() where id = p_inst and status = 'dang_chay';
  insert into wf_events(instance_id, action, detail) values (p_inst, 'huy', coalesce(p_note, ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_inbox()
 RETURNS TABLE(task_id uuid, instance_id uuid, title text, process_name text, step_name text, due_at timestamp with time zone, is_test boolean, created_at timestamp with time zone, assigned_to uuid, vai text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from (
    select t.id, i.id, i.title, p.name, t.step_name, t.due_at, i.is_test, t.created_at, t.assigned_to,
      case when t.appr_state = 'dang_duyet' then null
           when t.assigned_to is null and coalesce(st->'assignee'->>'id', '') = '' and wf_is_manager(st) then 'phan_cong'
           when (t.assigned_to = app_uid()) or (t.assigned_to is null and _wf_match(st->'assignee')) then 'lam'
           when _wf_any(st->'managers') then 'quan_tri'
           when wf_is_watcher(st) then 'theo_doi' end as vai
    from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    cross join lateral (select _wf_node(v.def, t.step_id) as st) s
    where t.status = 'cho' and t.kind = 'task' and i.status = 'dang_chay'
    union all
    select t.id, i.id, i.title, p.name, t.step_name || ' · ' || a.level_name, a.due_at, i.is_test, a.created_at, a.approver, 'duyet'
    from wf_approvals a join wf_tasks t on t.id = a.task_id join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
    where a.status = 'cho' and a.approver = app_uid() and t.status = 'cho' and i.status = 'dang_chay') q
  where vai is not null order by due_at nulls last, created_at $function$
;

CREATE OR REPLACE FUNCTION public.wf_is_assignee(p_step jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or case p_step->'assignee'->>'type'
    when 'user'  then (p_step->'assignee'->>'id')::uuid = app_uid()
    when 'group' then exists (select 1 from work_groups g where g.id = (p_step->'assignee'->>'id')::uuid and g.active and app_uid() = any(g.member_ids))
    when 'role'  then has_role(p_step->'assignee'->>'id')
    else false end $function$
;

CREATE OR REPLACE FUNCTION public.wf_is_manager(p_step jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select has_role('admin_it') or _wf_any(p_step->'managers') $function$
;

CREATE OR REPLACE FUNCTION public.wf_is_watcher(p_step jsonb)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select _wf_any(p_step->'watchers') $function$
;

CREATE OR REPLACE FUNCTION public.wf_my_rights(p_inst uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select wf_task_rights((select id from wf_tasks where instance_id = p_inst and status = 'cho' and kind = 'task' order by created_at limit 1)) $function$
;

CREATE OR REPLACE FUNCTION public.wf_my_tasks()
 RETURNS TABLE(task_id uuid, instance_id uuid, title text, process_name text, step_name text, due_at timestamp with time zone, is_test boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.id, i.id, i.title, p.name, t.step_name, t.due_at, i.is_test, t.created_at
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
  where t.status = 'cho' and i.status = 'dang_chay' and wf_is_assignee(wf_step(v.def, i.step_idx))
  order by t.due_at nulls last, t.created_at $function$
;

CREATE OR REPLACE FUNCTION public.wf_process_create(p_name text, p_from_version uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p uuid; d jsonb := '{"lanes":[],"steps":[]}'; c text;
begin
  if not _wf_can_design(null) then raise exception 'Bạn chưa có quyền Thiết kế quy trình'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Nhập tên quy trình'; end if;
  if p_from_version is not null then select def into d from wf_versions where id = p_from_version; end if;
  c := 'WF' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  insert into wf_processes(code, name) values (c, trim(p_name)) returning id into p;
  insert into wf_versions(process_id, version, def) values (p, 1, coalesce(d, '{"lanes":[],"steps":[]}'));
  insert into wf_events(process_id, action, detail) values (p, 'tao', case when p_from_version is null then 'Tạo mới' else 'Nhân bản từ mẫu' end);
  return p;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_process_delete(p_process uuid, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p wf_processes; n int; i uuid;
begin
  select * into p from wf_processes where id = p_process for update;
  if p.id is null or p.deleted_at is not null then raise exception 'Không tìm thấy quy trình'; end if;
  if p.is_template then raise exception 'Không xoá được mẫu trong thư viện'; end if;
  select count(*) into n from wf_instances x join wf_versions v on v.id = x.version_id where v.process_id = p_process;
  if n > 0 then
    if not has_role('admin_it') then raise exception 'Quy trình đã có % công việc – chỉ quản trị (IT) mới xoá được', n; end if;
  elsif not (has_role('admin_it') or p.created_by = app_uid()) then
    raise exception 'Chỉ người tạo quy trình hoặc IT mới xoá được';
  end if;
  for i in select x.id from wf_instances x join wf_versions v on v.id = x.version_id where v.process_id = p_process and x.status = 'dang_chay' loop
    update wf_approvals set status = 'bo_qua' where status = 'cho' and task_id in (select id from wf_tasks where instance_id = i);
    update wf_tasks set status = 'huy', done_at = now() where instance_id = i and status = 'cho';
    update wf_instances set status = 'huy', done_at = now() where id = i;
    insert into wf_events(instance_id, process_id, action, detail) values (i, p_process, 'huy', 'Huỷ do xoá quy trình');
  end loop;
  update wf_processes set deleted_at = now(), deleted_by = app_uid() where id = p_process;
  insert into wf_events(process_id, action, detail) values (p_process, 'xoa', 'Xoá quy trình' || case when n > 0 then ' (' || n || ' công việc)' else '' end || coalesce(': ' || nullif(trim(p_note), ''), ''));
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_process_usage(p_process uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('total', count(*), 'running', count(*) filter (where i.status = 'dang_chay'))
  from wf_instances i join wf_versions v on v.id = i.version_id where v.process_id = p_process $function$
;

CREATE OR REPLACE FUNCTION public.wf_publish(p_version uuid, p_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v wf_versions; e text[];
begin
  if not _wf_can_design((select process_id from wf_versions where id = p_version)) then raise exception 'Chỉ người tạo quy trình hoặc IT được phát hành'; end if;
  select * into v from wf_versions where id = p_version for update;
  if v.status <> 'nhap' then raise exception 'Chỉ phát hành được bản nháp'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Chưa phát hành được: %', array_to_string(e, '; '); end if;
  update wf_versions set status = 'luu_tru' where process_id = v.process_id and status = 'phat_hanh' and id <> v.id;
  update wf_versions set status = 'phat_hanh', published_at = now(), note = coalesce(p_note, '') where id = v.id;
  insert into wf_events(process_id, action, detail) values (v.process_id, 'phat_hanh', 'Phát hành phiên bản ' || v.version);
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_remind()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; st jsonb; ids uuid[]; link text; n int := 0; total interval;
begin
  for r in select t.*, i.title, i.is_test, v.def, p.name pname from wf_tasks t join wf_instances i on i.id = t.instance_id
      join wf_versions v on v.id = i.version_id join wf_processes p on p.id = v.process_id
      where t.status = 'cho' and t.kind = 'task' and i.status = 'dang_chay' and t.due_at is not null and coalesce(t.appr_state, '') <> 'dang_duyet'
        and (not t.half_sent or not t.over_sent or not t.esc_sent) loop
    st := (select x from jsonb_array_elements(r.def->'steps') x where x->>'id' = r.step_id limit 1);
    link := E'\n' || r.pname || ' · ' || r.title || E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/quy-trinh-moi/chay/' || r.instance_id;
    if r.assigned_to is not null then ids := array[r.assigned_to]; else select array_agg(distinct x) into ids from _wf_people_i(st->'assignee', r.instance_id) x; end if;
    total := r.due_at - r.created_at;
    if not r.half_sent and now() >= r.created_at + total / 2 and now() < r.due_at then
      perform _wf_zalo_send(ids, '⏳ Đã dùng nửa thời hạn: ' || r.step_name || E'\nHạn: ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || link);
      update wf_tasks set half_sent = true where id = r.id; n := n + 1;
    end if;
    if not r.over_sent and now() >= r.due_at then
      select array_agg(distinct x) into ids from (select unnest(ids) x union select y from jsonb_array_elements(coalesce(st->'managers', '[]')) m, _wf_people_i(m, r.instance_id) y) q;
      perform _wf_zalo_send(ids, '🔴 Quá hạn: ' || r.step_name || ' (hạn ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ')' || link);
      update wf_tasks set over_sent = true, half_sent = true where id = r.id; n := n + 1;
    end if;
    if not r.esc_sent and now() >= r.due_at + total then
      select array_agg(distinct p.manager_id) into ids from profiles p where p.manager_id is not null
        and p.id = any(coalesce(case when r.assigned_to is not null then array[r.assigned_to] end, (select array_agg(x) from _wf_people_i(st->'assignee', r.instance_id) x)));
      if ids is not null then perform _wf_zalo_send(ids, '⚠️ Leo thang – việc của nhân viên quá hạn lâu: ' || r.step_name || link); end if;
      update wf_tasks set esc_sent = true, over_sent = true, half_sent = true where id = r.id; n := n + 1;
    end if;
  end loop;
  for r in select a.*, t.step_name, t.instance_id, i.title from wf_approvals a join wf_tasks t on t.id = a.task_id join wf_instances i on i.id = t.instance_id
      where a.status = 'cho' and not a.over_sent and a.due_at is not null and a.due_at <= now() and i.status = 'dang_chay' loop
    perform _wf_zalo_send(array[r.approver], '🔴 Phiếu duyệt quá hạn: ' || r.step_name || ' · ' || r.level_name || E'\n' || r.title ||
      E'\nhttps://79kaid-jpg.github.io/don-hang-cnc/?z=1#/quy-trinh-moi/chay/' || r.instance_id);
    update wf_approvals set over_sent = true where id = r.id; n := n + 1;
  end loop;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_save_data(p_task uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; d jsonb; k text; pm text;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' or (c.ins).status <> 'dang_chay' then raise exception 'Việc đã xử lý xong, không sửa được'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không được sửa nội dung bước này'; end if;
  d := (c.ins).data;
  for k in select jsonb_object_keys(coalesce(p_data, '{}')) loop
    pm := coalesce(c.st->'perms'->>k, 'view');
    if pm in ('edit', 'required') then d := jsonb_set(d, array[k], p_data->k, true); end if;
  end loop;
  update wf_instances set data = d where id = (c.ins).id;
  return d;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_save_draft(p_process uuid, p_def jsonb, p_name text DEFAULT NULL::text, p_desc text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v wf_versions;
begin
  if not _wf_can_design(p_process) then raise exception 'Chỉ người tạo quy trình (có quyền Thiết kế quy trình) hoặc IT được sửa'; end if;
  if exists (select 1 from wf_processes where id = p_process and is_template) then raise exception 'Mẫu chỉ đọc – hãy nhân bản để sửa'; end if;
  update wf_processes set name = coalesce(nullif(trim(p_name), ''), name), description = coalesce(p_desc, description) where id = p_process;
  select * into v from wf_versions where process_id = p_process order by version desc limit 1;
  if v.status = 'nhap' then
    update wf_versions set def = p_def, updated_by = app_uid(), updated_at = now() where id = v.id;
    return v.id;
  end if;
  insert into wf_versions(process_id, version, def) values (p_process, coalesce(v.version, 0) + 1, p_def) returning id into v.id;
  return v.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_start(p_version uuid, p_title text, p_test boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v wf_versions; s0 jsonb; e text[];
begin
  select * into v from wf_versions where id = p_version;
  if v.id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  if v.status <> 'phat_hanh' and not (p_test and _wf_can_design(v.process_id)) then raise exception 'Phiên bản chưa phát hành'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Quy trình còn lỗi: %', array_to_string(e, '; '); end if;
  s0 := wf_step(v.def, 0);
  if not wf_can_do(null, s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  return _wf_create_instance(v.id, p_title, p_test or v.status <> 'phat_hanh', null, null, '{}');
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_start_order(p_version uuid, p_title text, p_test boolean, p_order uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v wf_versions; s0 jsonb; e text[];
begin
  select * into v from wf_versions where id = p_version;
  if v.id is null then raise exception 'Không tìm thấy phiên bản'; end if;
  if v.status <> 'phat_hanh' and not (p_test and _wf_can_design(v.process_id)) then raise exception 'Phiên bản chưa phát hành'; end if;
  e := wf_validate(v.def);
  if array_length(e, 1) > 0 then raise exception 'Quy trình còn lỗi: %', array_to_string(e, '; '); end if;
  s0 := wf_step(v.def, 0);
  if not wf_can_do(null, s0) then raise exception 'Bạn không phụ trách bước đầu "%"', s0->>'name'; end if;
  return _wf_create_instance(v.id, p_title, p_test or v.status <> 'phat_hanh', p_order, null, '{}');
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_stats(p_process uuid)
 RETURNS TABLE(step_id text, step_name text, open_n integer, late_n integer, done_n integer, avg_hours numeric, back_n integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.step_id, max(t.step_name), count(*) filter (where t.status = 'cho' and i.status = 'dang_chay')::int,
    count(*) filter (where t.status = 'cho' and i.status = 'dang_chay' and t.due_at < now())::int,
    count(*) filter (where t.status = 'xong')::int,
    round(avg(extract(epoch from (t.done_at - t.created_at)) / 3600) filter (where t.status = 'xong')::numeric, 1),
    count(*) filter (where t.status = 'tra_lai')::int
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id
  where v.process_id = p_process and not i.is_test and t.kind = 'task' group by t.step_id $function$
;

CREATE OR REPLACE FUNCTION public.wf_step(p_def jsonb, p_idx integer)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$ select p_def->'steps'->p_idx $function$
;

CREATE OR REPLACE FUNCTION public.wf_submit_approval(p_task uuid, p_note text DEFAULT ''::text, p_checklist jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; it record; miss text; r int;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' or (c.ins).status <> 'dang_chay' then raise exception 'Việc đã xử lý xong'; end if;
  if not _wf_has_appr(c.st) then raise exception 'Bước này không có luồng duyệt'; end if;
  if (c.t).appr_state = 'dang_duyet' then raise exception 'Đang trong luồng duyệt'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không phụ trách bước "%"', c.st->>'name'; end if;
  for it in select * from _wf_items(c.st) loop
    if it.kind = 'file' then
      if not exists (select 1 from jsonb_array_elements((c.t).files) f where f->>'item' = it.key) then raise exception 'Chưa tải file: %', it.text; end if;
    elsif coalesce((p_checklist->>it.key)::boolean, false) is not true then raise exception 'Chưa tích: %', it.text; end if;
  end loop;
  miss := _wf_required_missing((c.v).def, c.st, (c.ins).data);
  if miss is not null then raise exception 'Chưa nhập trường bắt buộc: %', miss; end if;
  update wf_tasks set checklist = coalesce(p_checklist, '{}'), note = coalesce(p_note, '') where id = p_task;
  select coalesce(max(round), 0) + 1 into r from wf_approvals where task_id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, 'gui_duyet', (c.st->>'name') || coalesce(': ' || nullif(trim(p_note), ''), ''));
  if not _wf_open_level(p_task, 0, r) then
    perform set_config('wf.sys', 'on', true);
    perform wf_act(p_task, 'next', coalesce(p_note, ''), coalesce(p_checklist, '{}'));
    perform set_config('wf.sys', 'off', true);
    return 'dat';
  end if;
  return 'dang_duyet';
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_task_file(p_task uuid, p_item text, p_name text, p_path text, p_remove boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; f jsonb;
begin
  select * into c from _wf_ctx(p_task);
  if (c.t).status <> 'cho' then raise exception 'Việc đã xử lý xong, không sửa file được'; end if;
  if not (wf_can_do((c.t).assigned_to, c.st) or wf_is_manager(c.st)) then raise exception 'Bạn không được sửa nội dung bước này'; end if;
  if p_remove then
    select coalesce(jsonb_agg(x), '[]') into f from jsonb_array_elements((c.t).files) x where x->>'path' <> p_path;
  else
    if coalesce(p_path, '') = '' or p_path not like 'wf/' || (c.ins).id || '/%' then raise exception 'Đường dẫn file không hợp lệ'; end if;
    f := (c.t).files || jsonb_build_array(jsonb_build_object('item', p_item, 'name', p_name, 'path', p_path, 'at', now(), 'by', app_uid()));
  end if;
  update wf_tasks set files = f where id = p_task;
  insert into wf_events(instance_id, process_id, action, detail) values ((c.ins).id, (c.v).process_id, case when p_remove then 'go_file' else 'tai_file' end,
    (c.st->>'name') || ': ' || coalesce(p_name, p_path));
  return f;
end $function$
;

CREATE OR REPLACE FUNCTION public.wf_task_rights(p_task uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('do', t.kind = 'task' and wf_can_do(t.assigned_to, st) and (t.assigned_to is not null or _wf_match(st->'assignee') or has_role('admin_it')),
    'manage', t.kind = 'task' and wf_is_manager(st), 'watch', wf_is_watcher(st))
  from wf_tasks t join wf_instances i on i.id = t.instance_id join wf_versions v on v.id = i.version_id
  cross join lateral (select _wf_node(v.def, t.step_id) as st) s where t.id = p_task $function$
;

CREATE OR REPLACE FUNCTION public.wf_validate(p_def jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare e text[] := '{}'; s jsonb; i int := 0; ids text[] := '{}'; lanes text[]; it record; r jsonb; ty text; b text;
begin
  select coalesce(array_agg(x->>'id'), '{}') into lanes from jsonb_array_elements(coalesce(p_def->'lanes', '[]')) x;
  if coalesce(jsonb_array_length(p_def->'steps'), 0) = 0 then return array['Quy trình chưa có bước nào']; end if;
  select coalesce(array_agg(x->>'id'), '{}') into ids from jsonb_array_elements(p_def->'steps') x;
  for s in select * from jsonb_array_elements(p_def->'steps') loop
    i := i + 1; ty := _wf_type(s);
    if coalesce(trim(s->>'name'), '') = '' and ty = 'task' then e := e || ('Bước ' || i || ' chưa có tên'); end if;
    if i = 1 and ty <> 'task' then e := e || 'Nút đầu tiên phải là Công việc'::text; end if;
    if (select count(*) from unnest(ids) x where x = s->>'id') > 1 then e := e || ('Bước ' || i || ' trùng mã'); end if;
    if coalesce(s->>'lane','') <> '' and not (s->>'lane' = any(lanes)) then e := e || ('Bước ' || i || ' thuộc làn không tồn tại'); end if;
    if ty = 'task' then
      if coalesce(s->'assignee'->>'id', '') = '' and coalesce(jsonb_array_length(s->'managers'), 0) = 0 then
        e := e || ('Bước ' || i || ' (' || coalesce(s->>'name','') || ') chưa có người làm hoặc người quản trị để phân công'); end if;
      if i = 1 and coalesce(s->'assignee'->>'id', '') = '' then e := e || 'Bước đầu tiên phải có người làm'::text; end if;
      if i = 1 and coalesce((s->>'allow_back')::boolean, false) then e := e || 'Bước đầu tiên không thể trả lại'::text; end if;
      for it in select * from _wf_items(s) loop
        if coalesce(trim(it.text), '') = '' then e := e || ('Bước ' || i || ' có mục checklist trống'); end if;
      end loop;
      for r in select * from jsonb_array_elements(coalesce(s->'approval'->'levels', '[]')) loop
        if coalesce(jsonb_array_length(r->'approvers'), 0) = 0 then e := e || ('Bước ' || i || ': cấp duyệt "' || coalesce(nullif(r->>'name',''), '?') || '" chưa có người duyệt'); end if;
      end loop;
    elsif ty = 'parallel' then
      if coalesce(jsonb_array_length(s->'branches'), 0) < 2 then e := e || ('Nút ' || i || ' (tách song song) cần ít nhất 2 nhánh'); end if;
      for b in select jsonb_array_elements_text(coalesce(s->'branches', '[]')) loop
        if not (b = any(ids)) then e := e || ('Nút ' || i || ': nhánh song song trỏ tới nút không tồn tại'); end if;
      end loop;
    elsif ty = 'action' then
      if coalesce(jsonb_array_length(s->'actions'), 0) = 0 then e := e || ('Nút ' || i || ' (hành động) chưa có hành động nào'); end if;
      for r in select * from jsonb_array_elements(coalesce(s->'actions', '[]')) loop
        if r->>'kind' = 'zalo' and coalesce(jsonb_array_length(r->'to'), 0) = 0 then e := e || ('Nút ' || i || ': hành động gửi Zalo chưa có người nhận'); end if;
        if r->>'kind' = 'set' and coalesce(r->>'field', '') = '' then e := e || ('Nút ' || i || ': hành động gán giá trị chưa chọn trường'); end if;
        if r->>'kind' = 'start' and coalesce(r->>'process_id', '') = '' then e := e || ('Nút ' || i || ': hành động mở quy trình chưa chọn quy trình'); end if;
      end loop;
    elsif ty = 'subprocess' then
      if coalesce(s->>'process_id', '') = '' then e := e || ('Nút ' || i || ' (quy trình con) chưa chọn quy trình'); end if;
    end if;
    if ty <> 'parallel' then
      if coalesce(s->>'next', '') not in ('', '__end') and not (s->>'next' = any(ids)) then e := e || ('Bước ' || i || ': bước tiếp theo không tồn tại'); end if;
      for r in select * from jsonb_array_elements(coalesce(s->'routes', '[]')) loop
        if coalesce(r->>'field', '') = '' or coalesce(r->>'goto', '') = '' then e := e || ('Bước ' || i || ': nhánh điều kiện chưa đủ trường / bước đến');
        elsif r->>'goto' <> '__end' and not (r->>'goto' = any(ids)) then e := e || ('Bước ' || i || ': nhánh trỏ tới bước không tồn tại'); end if;
      end loop;
    end if;
  end loop;
  return e;
end $function$
;

CREATE OR REPLACE FUNCTION public.zalo_group_cmd(p_chat text, p_from text, p_name text, p_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u profiles; t text := trim(p_text); lt text := lower(trim(p_text)); co text; g zalo_groups; tok text; pid uuid; pids uuid[] := '{}'; bad text[] := '{}'; sug text; msg text; is_pj boolean;
begin
  select * into u from profiles where zalo_chat_id = p_from and active limit 1;
  select * into g from zalo_groups where chat_id = p_chat;
  if lt ~ '^/nhom' then
    if g.chat_id is null then return 'Nhóm này chưa nối với PMS. Admin gõ: /noi PN (hoặc IPC, HW, tatca) hoặc /noi duan <mã dự án>'; end if;
    return 'Nhóm đang nối PMS · ' || coalesce(g.company, 'tất cả công ty')
      || case when not g.all_projects then ' · dự án: ' || (select string_agg(code, ', ' order by code) from projects where id = any(g.projects)) else ' · mọi dự án' end
      || ' · nhận: ' || array_to_string(g.events, ', ') || case when g.active then '' else ' (đang tắt)' end; end if;
  if u.id is null or not (u.roles && array['admin_it','admin_cnc']) then return 'Chỉ admin đã liên kết Zalo với PMS mới nối/huỷ nhóm được.'; end if;
  if lt ~ '^/huy' then delete from zalo_groups where chat_id = p_chat; return 'Đã huỷ nối nhóm này với PMS. Bot sẽ không gửi tin vào nhóm nữa.'; end if;
  if lt ~ '^/noi' then
    is_pj := lt ~ '^/noi\s+(duan|du an|da|project)\y';
    for tok in select x from regexp_split_to_table(regexp_replace(t, '^/\S+\s*((du\s*an|duan|da|project)\s+)?', '', 'i'), '[\s,;]+') x where x <> '' loop
      if upper(tok) in ('PN','PNC','CNC') then co := 'PN'; continue; end if;
      if upper(tok) = 'IPC' then co := 'IPC'; continue; end if;
      if upper(tok) in ('HW','HANWA','HANWHA') then co := 'HW'; continue; end if;
      if lower(tok) in ('tatca','all') then continue; end if;
      if not is_pj then continue; end if;
      select id into pid from projects where upper(code) = upper(tok) limit 1;
      if pid is null then select string_agg(code, ', ') into sug from (select code from projects where code ilike '%' || tok || '%' or name ilike '%' || tok || '%' order by code limit 5) z;
        bad := bad || (tok || coalesce(' (gần giống: ' || sug || ')', '')); else pids := pids || pid; end if;
    end loop;
    if is_pj and cardinality(pids) = 0 then return 'Không tìm thấy dự án: ' || array_to_string(bad, '; ') || E'\nVD: /noi duan SLU'; end if;
    insert into zalo_groups(chat_id, name, company, projects, all_projects, linked_by) values (p_chat, coalesce(p_name, ''), co, pids, not is_pj, u.id)
      on conflict (chat_id) do update set company = excluded.company,
        projects = case when is_pj then array(select distinct x from unnest(zalo_groups.projects || excluded.projects) x) else '{}' end, all_projects = not is_pj,
        name = coalesce(nullif(excluded.name, ''), zalo_groups.name), active = true, linked_by = u.id
      returning * into g;
    msg := '✓ Đã nối nhóm với PMS · ' || coalesce(g.company, 'tất cả công ty')
      || case when not g.all_projects then ' · dự án: ' || (select string_agg(code, ', ' order by code) from projects where id = any(g.projects)) else ' · mọi dự án' end
      || E'.\nNhóm sẽ nhận: đơn mới, phiếu đã duyệt, phiếu bị trả về, phiếu trễ hạn. Admin chỉnh trong app › Quản trị › Kết nối & API.\nTrả lời vào phiếu: gõ mã + nội dung, VD "003 ok".';
    if cardinality(bad) > 0 then msg := msg || E'\n⚠ Không tìm thấy: ' || array_to_string(bad, '; '); end if;
    return msg;
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.zalo_link_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c text;
begin
  c := lpad((floor(random() * 1000000))::int::text, 6, '0');
  insert into zalo_link_codes(code, user_id) values (c, app_uid())
    on conflict (code) do update set user_id = excluded.user_id, expires_at = now() + interval '30 minutes';
  return c;
end $function$
;

CREATE OR REPLACE FUNCTION public.zalo_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare k text;
begin
  select value into k from app_secrets where name = 'NOTIFY_KEY';
  if k is null then return new; end if;
  if (tg_op = 'INSERT' and new.status = 'cho') or (tg_op = 'UPDATE' and new.status = 'tu_choi' and old.status = 'cho') then
    perform net.http_post(
      url := 'https://wtybzzlglgvzflovqhng.supabase.co/functions/v1/zalo?op=approval',
      body := jsonb_build_object('approval_id', new.id, 'event', case when tg_op = 'INSERT' then 'cho' else 'tu_choi' end),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-key', k));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.zalo_out_add(p_chat text, p_doc uuid, p_msg text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into zalo_out(req_id, chat_id, doc_id, message_id) values (-(nextval('zalo_raw_id_seq')), p_chat, p_doc, p_msg);
$function$
;

CREATE OR REPLACE FUNCTION public.zalo_reply(p_chat text, p_text text, p_raw jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid; t text := trim(coalesce(p_text, '')); q text; dc uuid; m record; how text := ''; rid uuid; mj jsonb; tg uuid[]; rc uuid[]; me text; extra text := ''; lst text;
begin
  select id into uid from profiles where zalo_chat_id = p_chat and active limit 1;
  if uid is null or t = '' then return null; end if;
  perform _zalo_out_resolve();
  q := coalesce(p_raw #>> '{quote,message_id}', p_raw #>> '{quote,msg_id}', p_raw #>> '{reply_to_message,message_id}', p_raw #>> '{quoted_message,message_id}',
                p_raw ->> 'quote_msg_id', p_raw ->> 'reply_to_message_id', p_raw #>> '{quote_message,message_id}');
  if q is not null then select doc_id into dc from zalo_out where message_id = q and chat_id = p_chat order by at desc limit 1; if dc is not null then how := 'q'; end if; end if;
  if dc is null then
    for m in select * from (select distinct on (x.doc_id) x.doc_id, x.at, doc_code(x.doc_id) code from order_msgs x
        where x.at > now() - interval '14 days' and uid = any(_with_deleg(x.to_users)) and x.doc_id is not null order by x.doc_id, x.at desc) z order by z.at desc loop
      if upper(t) like upper(m.code) || '%' then dc := m.doc_id; t := trim(substr(t, length(m.code) + 1)); how := 'c'; exit; end if;
      if upper(t) like upper(regexp_replace(m.code, '^.*-', '')) || '%' and m.code ~ '-' then dc := m.doc_id; t := trim(substr(t, length(regexp_replace(m.code, '^.*-', '')) + 1)); how := 'c'; exit; end if;
    end loop;
    t := trim(regexp_replace(t, '^[:.,-]\s*', ''));
  end if;
  if dc is null and coalesce(p_raw->>'_group', '') = '1' then return null; end if;
  if dc is null then
    select doc_id into dc from zalo_out where chat_id = p_chat and doc_id is not null and at > now() - interval '48 hours' order by at desc limit 1;
    if dc is null then select doc_id into dc from order_msgs where kind in ('nudge','reassign') and at > now() - interval '48 hours' and uid = any(_with_deleg(to_users)) and doc_id is not null
      order by (replied_at is null) desc, at desc limit 1; end if;
  end if;
  if dc is null then return null; end if;
  if t = '' then t := trim(p_text); end if;
  -- "@?" = xem danh sách người tag được
  if t ~ '^@\?\s*$' then
    select string_agg('• ' || p.full_name, E'\n' order by p.full_name) into lst from profiles p where p.active and p.id <> uid and _user_sees_doc(p.id, dc);
    return 'Người nhắc được trong ' || doc_code(dc) || E':\n' || coalesce(lst, '(không có)') || E'\nGõ @Tên trong tin trả lời để nhắc.';
  end if;
  rid := _reply(uid, dc, t, 'zalo');
  if t like '%@%' then
    mj := _zalo_mentions(uid, dc, t);
    tg := array(select (jsonb_array_elements_text(mj->'tags'))::uuid);
    if cardinality(tg) > 0 then
      select to_users into rc from order_msgs where id = rid;
      update order_msgs set to_users = array(select distinct x from unnest(coalesce(to_users, '{}') || tg) x), meta = meta || jsonb_build_object('tags', to_jsonb(tg)) where id = rid;
      select full_name into me from profiles where id = uid;
      perform _zsend(array(select x from unnest(tg) x where not (x = any(coalesce(rc, '{}')))), '📣 ' || coalesce(me, '') || ' nhắc bạn (qua Zalo):' || E'\n“' || t || E'”\n' || _doc_line(dc)
        || _reply_hint(dc));
      select E'\nĐã nhắc: ' || string_agg(full_name, ', ') into extra from profiles where id = any(tg);
    end if;
    if jsonb_array_length(mj->'warn') > 0 then extra := extra || E'\n⚠ ' || (select string_agg(x, E'\n⚠ ') from jsonb_array_elements_text(mj->'warn') x); end if;
  end if;
  return '✓ Đã ghi phản hồi vào ' || doc_code(dc) || '.' || extra || case when how = '' then E'\nMẹo: muốn ghi vào phiếu khác, gõ mã phiếu trước nội dung, VD: "003 ok".' else '' end;
end $function$
;

CREATE OR REPLACE FUNCTION public.zalo_unlink()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ update profiles set zalo_chat_id = null, zalo_name = null where id = app_uid() $function$
;

CREATE OR REPLACE FUNCTION public.zgroups_pick()
 RETURNS TABLE(chat_id text, name text, company text, projects uuid[], rule_customers uuid[], rule_prefix text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select chat_id, name, company, projects, rule_customers, rule_prefix from zalo_groups where active and not all_projects and (has_role('admin_it') or has_role('admin_cnc') or has_role('kinh_doanh')) order by name;
$function$
;

-- ===== defaults / not null =====
alter table private.kv alter column k set not null;
alter table private.kv alter column v set not null;
alter table private.kv alter column at set default now();
alter table public.act_grants alter column id set default gen_random_uuid();
alter table public.act_grants alter column id set not null;
alter table public.act_grants alter column admin_id set not null;
alter table public.act_grants alter column from_at set not null;
alter table public.act_grants alter column to_at set not null;
alter table public.act_grants alter column reason set default ''::text;
alter table public.act_grants alter column reason set not null;
alter table public.act_grants alter column created_by set default auth.uid();
alter table public.act_grants alter column created_by set not null;
alter table public.act_grants alter column created_at set default now();
alter table public.act_grants alter column created_at set not null;
alter table public.app_errors alter column id set default nextval('app_errors_id_seq'::regclass);
alter table public.app_errors alter column id set not null;
alter table public.app_errors alter column at set default now();
alter table public.app_errors alter column at set not null;
alter table public.app_errors alter column user_id set default app_uid();
alter table public.app_errors alter column real_user set default auth.uid();
alter table public.app_secrets alter column name set not null;
alter table public.app_secrets alter column value set not null;
alter table public.app_secrets alter column updated_at set default now();
alter table public.app_settings alter column key set not null;
alter table public.app_settings alter column value set default ''::text;
alter table public.app_settings alter column value set not null;
alter table public.app_settings alter column updated_at set default now();
alter table public.approval_levels alter column id set default gen_random_uuid();
alter table public.approval_levels alter column id set not null;
alter table public.approval_levels alter column proc set not null;
alter table public.approval_levels alter column company set not null;
alter table public.approval_levels alter column ord set default 1;
alter table public.approval_levels alter column ord set not null;
alter table public.approval_levels alter column name set default 'Duyệt thêm'::text;
alter table public.approval_levels alter column name set not null;
alter table public.approval_levels alter column cond_field set default 'none'::text;
alter table public.approval_levels alter column cond_field set not null;
alter table public.approval_levels alter column cond_op set default '>'::text;
alter table public.approval_levels alter column cond_op set not null;
alter table public.approval_levels alter column sla_h set default 24;
alter table public.approval_levels alter column sla_h set not null;
alter table public.approval_levels alter column active set default true;
alter table public.approval_levels alter column active set not null;
alter table public.approval_levels alter column created_at set default now();
alter table public.approval_steps alter column id set default gen_random_uuid();
alter table public.approval_steps alter column id set not null;
alter table public.approval_steps alter column doc_type set not null;
alter table public.approval_steps alter column step_no set not null;
alter table public.approval_steps alter column label set not null;
alter table public.approval_steps alter column hours set default 4;
alter table public.approval_steps alter column hours set not null;
alter table public.approvals alter column id set default gen_random_uuid();
alter table public.approvals alter column id set not null;
alter table public.approvals alter column order_id set not null;
alter table public.approvals alter column doc_type set not null;
alter table public.approvals alter column round set default 1;
alter table public.approvals alter column round set not null;
alter table public.approvals alter column step_no set not null;
alter table public.approvals alter column label set not null;
alter table public.approvals alter column status set default 'cho'::text;
alter table public.approvals alter column status set not null;
alter table public.approvals alter column created_at set default now();
alter table public.approvals alter column created_at set not null;
alter table public.audit_log alter column at set default now();
alter table public.audit_log alter column at set not null;
alter table public.audit_log alter column actor set default auth.uid();
alter table public.audit_log alter column table_name set not null;
alter table public.audit_log alter column action set not null;
alter table public.batches alter column id set default gen_random_uuid();
alter table public.batches alter column id set not null;
alter table public.batches alter column order_id set not null;
alter table public.batches alter column proc set not null;
alter table public.batches alter column seq set default 1;
alter table public.batches alter column seq set not null;
alter table public.batches alter column title set default ''::text;
alter table public.batches alter column title set not null;
alter table public.batches alter column status set default 'dang_lam'::text;
alter table public.batches alter column status set not null;
alter table public.batches alter column checklist set default '{}'::jsonb;
alter table public.batches alter column checklist set not null;
alter table public.batches alter column final_files set default '[]'::jsonb;
alter table public.batches alter column final_files set not null;
alter table public.batches alter column created_by set default auth.uid();
alter table public.batches alter column created_at set default now();
alter table public.batches alter column created_at set not null;
alter table public.cccd_views alter column id set default nextval('cccd_views_id_seq'::regclass);
alter table public.cccd_views alter column id set not null;
alter table public.cccd_views alter column doc_id set not null;
alter table public.cccd_views alter column at set default now();
alter table public.cccd_views alter column at set not null;
alter table public.chain_people alter column proc set not null;
alter table public.chain_people alter column company set not null;
alter table public.chain_people alter column role set not null;
alter table public.chain_people alter column sla_h set default 48;
alter table public.chain_people alter column sla_h set not null;
alter table public.checklist_done alter column order_id set not null;
alter table public.checklist_done alter column item_id set not null;
alter table public.checklist_done alter column done set default true;
alter table public.checklist_done alter column done set not null;
alter table public.checklist_done alter column done_by set default auth.uid();
alter table public.checklist_done alter column done_at set default now();
alter table public.checklist_done alter column done_at set not null;
alter table public.checklist_items alter column id set default gen_random_uuid();
alter table public.checklist_items alter column id set not null;
alter table public.checklist_items alter column step set not null;
alter table public.checklist_items alter column label set not null;
alter table public.checklist_items alter column required set default true;
alter table public.checklist_items alter column required set not null;
alter table public.checklist_items alter column sort set default 0;
alter table public.checklist_items alter column sort set not null;
alter table public.checklist_items alter column active set default true;
alter table public.checklist_items alter column active set not null;
alter table public.checklist_items alter column created_at set default now();
alter table public.checklist_items alter column created_at set not null;
alter table public.co_counters alter column company set not null;
alter table public.co_counters alter column day set not null;
alter table public.co_counters alter column last set default 0;
alter table public.co_counters alter column last set not null;
alter table public.co_counters2 alter column k set not null;
alter table public.co_counters2 alter column last set default 0;
alter table public.co_counters2 alter column last set not null;
alter table public.co_orders alter column id set default gen_random_uuid();
alter table public.co_orders alter column id set not null;
alter table public.co_orders alter column company set not null;
alter table public.co_orders alter column code set not null;
alter table public.co_orders alter column code_auto set not null;
alter table public.co_orders alter column edited set default false;
alter table public.co_orders alter column edited set not null;
alter table public.co_orders alter column created_by set default auth.uid();
alter table public.co_orders alter column created_at set default now();
alter table public.co_orders alter column created_at set not null;
alter table public.companies alter column code set not null;
alter table public.companies alter column name set not null;
alter table public.companies alter column rule set default '{YYYYMMDD}-{BAN}-{MUA}-{DA}/{STT:2}'::text;
alter table public.companies alter column rule set not null;
alter table public.companies alter column allow_edit set default false;
alter table public.companies alter column allow_edit set not null;
alter table public.companies alter column ord set default 0;
alter table public.companies alter column ord set not null;
alter table public.companies alter column ct_rule set default '{BAN}-{YYYY}/{SEQ:4}'::text;
alter table public.companies alter column ct_rule set not null;
alter table public.companies alter column ct_last set default 0;
alter table public.companies alter column ct_last set not null;
alter table public.companies alter column ct_yearly set default true;
alter table public.companies alter column ct_yearly set not null;
alter table public.confirmations alter column order_id set not null;
alter table public.confirmations alter column vat_rate set default 8;
alter table public.confirmations alter column vat_rate set not null;
alter table public.confirmations alter column terms set default ''::text;
alter table public.confirmations alter column terms set not null;
alter table public.customers alter column id set default gen_random_uuid();
alter table public.customers alter column id set not null;
alter table public.customers alter column code set not null;
alter table public.customers alter column name set not null;
alter table public.customers alter column created_at set default now();
alter table public.customers alter column created_at set not null;
alter table public.customers alter column active set default true;
alter table public.customers alter column active set not null;
alter table public.customers alter column ship_addresses set default '{}'::text[];
alter table public.customers alter column ship_addresses set not null;
alter table public.customers alter column kind set default 'khach_hang'::text;
alter table public.customers alter column kind set not null;
alter table public.customers alter column vehicles set default '[]'::jsonb;
alter table public.customers alter column vehicles set not null;
alter table public.delegations alter column id set default gen_random_uuid();
alter table public.delegations alter column id set not null;
alter table public.delegations alter column user_id set not null;
alter table public.delegations alter column to_user set not null;
alter table public.delegations alter column from_date set default CURRENT_DATE;
alter table public.delegations alter column from_date set not null;
alter table public.delegations alter column to_date set not null;
alter table public.delegations alter column created_at set default now();
alter table public.deliveries alter column order_id set not null;
alter table public.deliveries alter column pmkt_code set default ''::text;
alter table public.deliveries alter column pmkt_code set not null;
alter table public.deliveries alter column vehicle set default ''::text;
alter table public.deliveries alter column vehicle set not null;
alter table public.deliveries alter column driver set default ''::text;
alter table public.deliveries alter column driver set not null;
alter table public.deliveries alter column photo_paths set default '{}'::text[];
alter table public.deliveries alter column photo_paths set not null;
alter table public.deliveries alter column note set default ''::text;
alter table public.deliveries alter column note set not null;
alter table public.doc_cccd alter column doc_id set not null;
alter table public.doc_cccd alter column enc set not null;
alter table public.doc_cccd alter column masked set not null;
alter table public.doc_cccd alter column updated_at set default now();
alter table public.doc_cccd alter column updated_at set not null;
alter table public.doc_records alter column id set default gen_random_uuid();
alter table public.doc_records alter column id set not null;
alter table public.doc_records alter column order_id set not null;
alter table public.doc_records alter column doc_id set not null;
alter table public.doc_records alter column proc set not null;
alter table public.doc_records alter column company set not null;
alter table public.doc_records alter column batch_title set default ''::text;
alter table public.doc_records alter column batch_title set not null;
alter table public.doc_records alter column kind set not null;
alter table public.doc_records alter column path set not null;
alter table public.doc_records alter column note set default ''::text;
alter table public.doc_records alter column note set not null;
alter table public.doc_records alter column by_user set default app_uid();
alter table public.doc_records alter column at set default now();
alter table public.doc_records alter column at set not null;
alter table public.doc_records alter column has_secret set default false;
alter table public.doc_records alter column has_secret set not null;
alter table public.docs alter column id set default gen_random_uuid();
alter table public.docs alter column id set not null;
alter table public.docs alter column batch_id set not null;
alter table public.docs alter column company set not null;
alter table public.docs alter column status set not null;
alter table public.docs alter column header set default '{}'::jsonb;
alter table public.docs alter column header set not null;
alter table public.docs alter column tables set default '{}'::jsonb;
alter table public.docs alter column tables set not null;
alter table public.docs alter column files set default '[]'::jsonb;
alter table public.docs alter column files set not null;
alter table public.docs alter column notes set default '[]'::jsonb;
alter table public.docs alter column notes set not null;
alter table public.docs alter column signs set default '[]'::jsonb;
alter table public.docs alter column signs set not null;
alter table public.docs alter column status_at set default now();
alter table public.docs alter column status_at set not null;
alter table public.docs alter column created_at set default now();
alter table public.docs alter column created_at set not null;
alter table public.docs alter column checklist set default '{}'::jsonb;
alter table public.docs alter column checklist set not null;
alter table public.excel_checks alter column path set not null;
alter table public.excel_checks alter column ok set not null;
alter table public.excel_checks alter column codes set default '{}'::text[];
alter table public.excel_checks alter column codes set not null;
alter table public.excel_checks alter column qty set default 0;
alter table public.excel_checks alter column qty set not null;
alter table public.excel_checks alter column rows set default 0;
alter table public.excel_checks alter column rows set not null;
alter table public.excel_checks alter column at set default now();
alter table public.excel_checks alter column at set not null;
alter table public.handover_lines alter column id set default gen_random_uuid();
alter table public.handover_lines alter column id set not null;
alter table public.handover_lines alter column order_id set not null;
alter table public.handover_lines alter column material set not null;
alter table public.handover_lines alter column thickness_mm set not null;
alter table public.handover_lines alter column planned_kg set not null;
alter table public.handovers alter column order_id set not null;
alter table public.handovers alter column lot_no set default 1;
alter table public.handovers alter column lot_no set not null;
alter table public.handovers alter column delivered_by set default ''::text;
alter table public.handovers alter column delivered_by set not null;
alter table public.handovers alter column received_by set default ''::text;
alter table public.handovers alter column received_by set not null;
alter table public.issues alter column id set default gen_random_uuid();
alter table public.issues alter column id set not null;
alter table public.issues alter column order_id set not null;
alter table public.issues alter column source set not null;
alter table public.issues alter column kind set not null;
alter table public.issues alter column description set not null;
alter table public.issues alter column action set default ''::text;
alter table public.issues alter column action set not null;
alter table public.issues alter column status set default 'mo'::text;
alter table public.issues alter column status set not null;
alter table public.issues alter column created_by set default app_uid();
alter table public.issues alter column created_at set default now();
alter table public.issues alter column created_at set not null;
alter table public.material_plan_lines alter column id set default gen_random_uuid();
alter table public.material_plan_lines alter column id set not null;
alter table public.material_plan_lines alter column order_id set not null;
alter table public.material_plan_lines alter column material set not null;
alter table public.material_plan_lines alter column thickness_mm set not null;
alter table public.material_plan_lines alter column f1_kg set not null;
alter table public.material_plan_lines alter column need_kg set not null;
alter table public.material_plan_lines alter column stock_kg set default 0;
alter table public.material_plan_lines alter column stock_kg set not null;
alter table public.material_plans alter column order_id set not null;
alter table public.material_plans alter column waste_pct set default 3;
alter table public.material_plans alter column waste_pct set not null;
alter table public.material_plans alter column note set default ''::text;
alter table public.material_plans alter column note set not null;
alter table public.materials alter column id set default gen_random_uuid();
alter table public.materials alter column id set not null;
alter table public.materials alter column name set not null;
alter table public.materials alter column density set not null;
alter table public.materials alter column keywords set default '{}'::text[];
alter table public.materials alter column keywords set not null;
alter table public.materials alter column is_default set default false;
alter table public.materials alter column is_default set not null;
alter table public.materials alter column active set default true;
alter table public.materials alter column active set not null;
alter table public.materials alter column ord set default 0;
alter table public.materials alter column ord set not null;
alter table public.materials alter column updated_at set default now();
alter table public.materials alter column updated_at set not null;
alter table public.monthly_plans alter column month set not null;
alter table public.monthly_plans alter column tons set not null;
alter table public.monthly_plans alter column updated_by set default auth.uid();
alter table public.monthly_plans alter column updated_at set default now();
alter table public.monthly_plans alter column updated_at set not null;
alter table public.order_counters alter column period set not null;
alter table public.order_counters alter column last_no set not null;
alter table public.order_lines alter column id set default gen_random_uuid();
alter table public.order_lines alter column id set not null;
alter table public.order_lines alter column order_id set not null;
alter table public.order_lines alter column line_no set default 1;
alter table public.order_lines alter column line_no set not null;
alter table public.order_lines alter column product_code set default ''::text;
alter table public.order_lines alter column product_code set not null;
alter table public.order_lines alter column material set default 'SS400'::text;
alter table public.order_lines alter column material set not null;
alter table public.order_lines alter column thickness_mm set not null;
alter table public.order_lines alter column length_mm set not null;
alter table public.order_lines alter column width_mm set not null;
alter table public.order_lines alter column qty set not null;
alter table public.order_lines alter column spec set default ''::text;
alter table public.order_lines alter column spec set not null;
alter table public.order_msgs alter column id set default gen_random_uuid();
alter table public.order_msgs alter column id set not null;
alter table public.order_msgs alter column order_id set not null;
alter table public.order_msgs alter column kind set not null;
alter table public.order_msgs alter column to_users set default '{}'::uuid[];
alter table public.order_msgs alter column to_users set not null;
alter table public.order_msgs alter column text set not null;
alter table public.order_msgs alter column via set default 'app'::text;
alter table public.order_msgs alter column via set not null;
alter table public.order_msgs alter column meta set default '{}'::jsonb;
alter table public.order_msgs alter column meta set not null;
alter table public.order_msgs alter column at set default now();
alter table public.order_msgs alter column at set not null;
alter table public.order_prices alter column line_id set not null;
alter table public.order_prices alter column order_id set not null;
alter table public.order_prices alter column unit_price set default 0;
alter table public.order_prices alter column unit_price set not null;
alter table public.order_prices alter column price_unit set default 'kg'::text;
alter table public.order_prices alter column price_unit set not null;
alter table public.order_steps alter column order_id set not null;
alter table public.order_steps alter column step set not null;
alter table public.order_steps alter column supervisor_ids set default '{}'::uuid[];
alter table public.order_steps alter column supervisor_ids set not null;
alter table public.order_steps alter column started_at set default now();
alter table public.order_steps alter column started_at set not null;
alter table public.order_steps alter column supervisor_group_ids set default '{}'::uuid[];
alter table public.order_steps alter column supervisor_group_ids set not null;
alter table public.order_steps alter column half_sent set default false;
alter table public.order_steps alter column half_sent set not null;
alter table public.order_steps alter column over_sent set default false;
alter table public.order_steps alter column over_sent set not null;
alter table public.orders alter column id set default gen_random_uuid();
alter table public.orders alter column id set not null;
alter table public.orders alter column project set default ''::text;
alter table public.orders alter column project set not null;
alter table public.orders alter column channel set default 'Email'::text;
alter table public.orders alter column channel set not null;
alter table public.orders alter column contact set default ''::text;
alter table public.orders alter column contact set not null;
alter table public.orders alter column description set default ''::text;
alter table public.orders alter column description set not null;
alter table public.orders alter column supplement_note set default ''::text;
alter table public.orders alter column supplement_note set not null;
alter table public.orders alter column status set default 'tiep_nhan'::text;
alter table public.orders alter column status set not null;
alter table public.orders alter column f1_result set default 'chua'::text;
alter table public.orders alter column f1_result set not null;
alter table public.orders alter column nvl_status set default 'chua_bat_dau'::text;
alter table public.orders alter column nvl_status set not null;
alter table public.orders alter column gc_status set default 'chua_bat_dau'::text;
alter table public.orders alter column gc_status set not null;
alter table public.orders alter column gh_status set default 'chua_giao'::text;
alter table public.orders alter column gh_status set not null;
alter table public.orders alter column created_by set default app_uid();
alter table public.orders alter column created_at set default now();
alter table public.orders alter column created_at set not null;
alter table public.orders alter column updated_at set default now();
alter table public.orders alter column updated_at set not null;
alter table public.orders alter column extra set default '{}'::jsonb;
alter table public.orders alter column extra set not null;
alter table public.packing_lines alter column id set default gen_random_uuid();
alter table public.packing_lines alter column id set not null;
alter table public.packing_lines alter column order_id set not null;
alter table public.packing_lines alter column pallet_no set not null;
alter table public.packing_lines alter column content set default ''::text;
alter table public.packing_lines alter column content set not null;
alter table public.packing_lines alter column qty set default 0;
alter table public.packing_lines alter column qty set not null;
alter table public.packing_lines alter column kg set default 0;
alter table public.packing_lines alter column kg set not null;
alter table public.packing_lists alter column order_id set not null;
alter table public.packing_lists alter column place set default ''::text;
alter table public.packing_lists alter column place set not null;
alter table public.packing_lists alter column note set default ''::text;
alter table public.packing_lists alter column note set not null;
alter table public.perf_config alter column id set default 1;
alter table public.perf_config alter column id set not null;
alter table public.perf_config alter column cfg set not null;
alter table public.perf_config alter column updated_at set default now();
alter table public.perf_spins alter column id set default nextval('perf_spins_id_seq'::regclass);
alter table public.perf_spins alter column id set not null;
alter table public.perf_spins alter column user_id set not null;
alter table public.perf_spins alter column cost set not null;
alter table public.perf_spins alter column prize set not null;
alter table public.perf_spins alter column bonus set default 0;
alter table public.perf_spins alter column bonus set not null;
alter table public.perf_spins alter column at set default now();
alter table public.perf_spins alter column at set not null;
alter table public.perf_spins alter column kind set default 'points'::text;
alter table public.perf_spins alter column kind set not null;
alter table public.print_templates alter column id set default gen_random_uuid();
alter table public.print_templates alter column id set not null;
alter table public.print_templates alter column proc set not null;
alter table public.print_templates alter column name set not null;
alter table public.print_templates alter column path set not null;
alter table public.print_templates alter column version set default 1;
alter table public.print_templates alter column version set not null;
alter table public.print_templates alter column vars set default '{}'::text[];
alter table public.print_templates alter column active set default true;
alter table public.print_templates alter column active set not null;
alter table public.print_templates alter column created_by set default app_uid();
alter table public.print_templates alter column created_at set default now();
alter table public.proc_fields alter column id set default gen_random_uuid();
alter table public.proc_fields alter column id set not null;
alter table public.proc_fields alter column proc set not null;
alter table public.proc_fields alter column area set not null;
alter table public.proc_fields alter column tbl set default ''::text;
alter table public.proc_fields alter column tbl set not null;
alter table public.proc_fields alter column key set not null;
alter table public.proc_fields alter column label set not null;
alter table public.proc_fields alter column type set default 'text'::text;
alter table public.proc_fields alter column type set not null;
alter table public.proc_fields alter column options set default '{}'::text[];
alter table public.proc_fields alter column options set not null;
alter table public.proc_fields alter column help set default ''::text;
alter table public.proc_fields alter column help set not null;
alter table public.proc_fields alter column ord set default 0;
alter table public.proc_fields alter column ord set not null;
alter table public.proc_fields alter column active set default true;
alter table public.proc_fields alter column active set not null;
alter table public.proc_fields alter column sys set default false;
alter table public.proc_fields alter column sys set not null;
alter table public.proc_fields alter column perms set default '{}'::jsonb;
alter table public.proc_fields alter column perms set not null;
alter table public.proc_fields alter column updated_at set default now();
alter table public.proc_fields alter column updated_at set not null;
alter table public.proc_fields alter column restricted set default false;
alter table public.proc_fields alter column restricted set not null;
alter table public.proc_fields alter column view_roles set default '{}'::text[];
alter table public.proc_fields alter column view_roles set not null;
alter table public.proc_fields alter column view_users set default '{}'::uuid[];
alter table public.proc_fields alter column view_users set not null;
alter table public.proc_fields alter column view_approver set default false;
alter table public.proc_fields alter column view_approver set not null;
alter table public.proc_fields alter column import_names set default '{}'::text[];
alter table public.proc_fields alter column import_names set not null;
alter table public.profiles alter column id set not null;
alter table public.profiles alter column full_name set default ''::text;
alter table public.profiles alter column full_name set not null;
alter table public.profiles alter column unit set default 'CNC'::text;
alter table public.profiles alter column unit set not null;
alter table public.profiles alter column roles set default '{}'::text[];
alter table public.profiles alter column roles set not null;
alter table public.profiles alter column active set default true;
alter table public.profiles alter column active set not null;
alter table public.profiles alter column created_at set default now();
alter table public.profiles alter column created_at set not null;
alter table public.profiles alter column "position" set default ''::text;
alter table public.profiles alter column "position" set not null;
alter table public.projects alter column id set default gen_random_uuid();
alter table public.projects alter column id set not null;
alter table public.projects alter column code set not null;
alter table public.projects alter column name set not null;
alter table public.projects alter column status set default 'open'::text;
alter table public.projects alter column status set not null;
alter table public.projects alter column created_by set default auth.uid();
alter table public.projects alter column created_at set default now();
alter table public.projects alter column created_at set not null;
alter table public.purchase_orders alter column order_id set not null;
alter table public.purchase_orders alter column po_no set default ''::text;
alter table public.purchase_orders alter column po_no set not null;
alter table public.purchase_orders alter column supplier set default ''::text;
alter table public.purchase_orders alter column supplier set not null;
alter table public.purchase_orders alter column unit_price set default 0;
alter table public.purchase_orders alter column unit_price set not null;
alter table public.purchase_orders alter column note set default ''::text;
alter table public.purchase_orders alter column note set not null;
alter table public.qc_finished alter column order_id set not null;
alter table public.qc_finished alter column result set default 'chua'::text;
alter table public.qc_finished alter column result set not null;
alter table public.qc_finished alter column note set default ''::text;
alter table public.qc_finished alter column note set not null;
alter table public.ratings alter column id set default gen_random_uuid();
alter table public.ratings alter column id set not null;
alter table public.ratings alter column doc_id set not null;
alter table public.ratings alter column rater set not null;
alter table public.ratings alter column ratee set not null;
alter table public.ratings alter column stars set not null;
alter table public.ratings alter column tags set default '{}'::text[];
alter table public.ratings alter column tags set not null;
alter table public.ratings alter column comment set default ''::text;
alter table public.ratings alter column comment set not null;
alter table public.ratings alter column acting set default false;
alter table public.ratings alter column acting set not null;
alter table public.ratings alter column created_at set default now();
alter table public.ratings alter column created_at set not null;
alter table public.ratings alter column updated_at set default now();
alter table public.ratings alter column updated_at set not null;
alter table public.receipt_lines alter column id set default gen_random_uuid();
alter table public.receipt_lines alter column id set not null;
alter table public.receipt_lines alter column order_id set not null;
alter table public.receipt_lines alter column material set not null;
alter table public.receipt_lines alter column thickness_mm set not null;
alter table public.receipt_lines alter column expected_kg set not null;
alter table public.receipt_lines alter column bad_kg set default 0;
alter table public.receipt_lines alter column bad_kg set not null;
alter table public.receipts alter column order_id set not null;
alter table public.receipts alter column qc_result set default 'chua'::text;
alter table public.receipts alter column qc_result set not null;
alter table public.receipts alter column qc_note set default ''::text;
alter table public.receipts alter column qc_note set not null;
alter table public.sim_log alter column id set default nextval('sim_log_id_seq'::regclass);
alter table public.sim_log alter column id set not null;
alter table public.sim_log alter column at set default now();
alter table public.step_checks alter column id set default gen_random_uuid();
alter table public.step_checks alter column id set not null;
alter table public.step_checks alter column proc set not null;
alter table public.step_checks alter column step set not null;
alter table public.step_checks alter column label set not null;
alter table public.step_checks alter column level set default 'req'::text;
alter table public.step_checks alter column level set not null;
alter table public.step_checks alter column ord set default 0;
alter table public.step_checks alter column ord set not null;
alter table public.step_checks alter column active set default true;
alter table public.step_checks alter column active set not null;
alter table public.step_checks alter column created_at set default now();
alter table public.step_defaults alter column step set not null;
alter table public.step_defaults alter column role set default ''::text;
alter table public.step_defaults alter column role set not null;
alter table public.step_defaults alter column approval set default false;
alter table public.step_defaults alter column approval set not null;
alter table public.step_defaults alter column supervisor_ids set default '{}'::uuid[];
alter table public.step_defaults alter column supervisor_ids set not null;
alter table public.step_defaults alter column sla_hours set default 24;
alter table public.step_defaults alter column sla_hours set not null;
alter table public.step_defaults alter column supervisor_group_ids set default '{}'::uuid[];
alter table public.step_defaults alter column supervisor_group_ids set not null;
alter table public.step_guides alter column key set not null;
alter table public.step_guides alter column title set default ''::text;
alter table public.step_guides alter column title set not null;
alter table public.step_guides alter column purpose set default ''::text;
alter table public.step_guides alter column purpose set not null;
alter table public.step_guides alter column todo set default ''::text;
alter table public.step_guides alter column todo set not null;
alter table public.step_guides alter column notes set default ''::text;
alter table public.step_guides alter column notes set not null;
alter table public.step_guides alter column links set default ''::text;
alter table public.step_guides alter column links set not null;
alter table public.step_guides alter column ord set default 0;
alter table public.step_guides alter column ord set not null;
alter table public.step_guides alter column updated_at set default now();
alter table public.step_guides alter column updated_at set not null;
alter table public.stock_moves alter column at set default now();
alter table public.stock_moves alter column at set not null;
alter table public.stock_moves alter column material set not null;
alter table public.stock_moves alter column thickness_mm set not null;
alter table public.stock_moves alter column warehouse set default 'Kho NVL IPC'::text;
alter table public.stock_moves alter column warehouse set not null;
alter table public.stock_moves alter column qty_kg set not null;
alter table public.stock_moves alter column kind set not null;
alter table public.stock_moves alter column ref set default ''::text;
alter table public.stock_moves alter column ref set not null;
alter table public.stock_moves alter column actor set default app_uid();
alter table public.user_co_roles alter column user_id set not null;
alter table public.user_co_roles alter column company set not null;
alter table public.user_co_roles alter column roles set default '{}'::text[];
alter table public.user_co_roles alter column roles set not null;
alter table public.wf_approvals alter column id set default gen_random_uuid();
alter table public.wf_approvals alter column id set not null;
alter table public.wf_approvals alter column task_id set not null;
alter table public.wf_approvals alter column round set default 1;
alter table public.wf_approvals alter column round set not null;
alter table public.wf_approvals alter column level set not null;
alter table public.wf_approvals alter column level_id set not null;
alter table public.wf_approvals alter column level_name set not null;
alter table public.wf_approvals alter column approver set not null;
alter table public.wf_approvals alter column status set default 'cho'::text;
alter table public.wf_approvals alter column status set not null;
alter table public.wf_approvals alter column note set default ''::text;
alter table public.wf_approvals alter column note set not null;
alter table public.wf_approvals alter column created_at set default now();
alter table public.wf_approvals alter column created_at set not null;
alter table public.wf_approvals alter column over_sent set default false;
alter table public.wf_approvals alter column over_sent set not null;
alter table public.wf_events alter column actor set default app_uid();
alter table public.wf_events alter column real_actor set default auth.uid();
alter table public.wf_events alter column action set not null;
alter table public.wf_events alter column detail set default ''::text;
alter table public.wf_events alter column detail set not null;
alter table public.wf_events alter column at set default now();
alter table public.wf_events alter column at set not null;
alter table public.wf_instances alter column id set default gen_random_uuid();
alter table public.wf_instances alter column id set not null;
alter table public.wf_instances alter column version_id set not null;
alter table public.wf_instances alter column title set not null;
alter table public.wf_instances alter column status set default 'dang_chay'::text;
alter table public.wf_instances alter column status set not null;
alter table public.wf_instances alter column is_test set default false;
alter table public.wf_instances alter column is_test set not null;
alter table public.wf_instances alter column step_idx set default 0;
alter table public.wf_instances alter column step_idx set not null;
alter table public.wf_instances alter column data set default '{}'::jsonb;
alter table public.wf_instances alter column data set not null;
alter table public.wf_instances alter column started_by set default app_uid();
alter table public.wf_instances alter column started_at set default now();
alter table public.wf_instances alter column started_at set not null;
alter table public.wf_processes alter column id set default gen_random_uuid();
alter table public.wf_processes alter column id set not null;
alter table public.wf_processes alter column code set not null;
alter table public.wf_processes alter column name set not null;
alter table public.wf_processes alter column description set default ''::text;
alter table public.wf_processes alter column description set not null;
alter table public.wf_processes alter column category set default 'Khác'::text;
alter table public.wf_processes alter column category set not null;
alter table public.wf_processes alter column is_template set default false;
alter table public.wf_processes alter column is_template set not null;
alter table public.wf_processes alter column created_by set default app_uid();
alter table public.wf_processes alter column created_at set default now();
alter table public.wf_processes alter column created_at set not null;
alter table public.wf_tasks alter column id set default gen_random_uuid();
alter table public.wf_tasks alter column id set not null;
alter table public.wf_tasks alter column instance_id set not null;
alter table public.wf_tasks alter column step_id set not null;
alter table public.wf_tasks alter column step_name set not null;
alter table public.wf_tasks alter column status set default 'cho'::text;
alter table public.wf_tasks alter column status set not null;
alter table public.wf_tasks alter column checklist set default '{}'::jsonb;
alter table public.wf_tasks alter column checklist set not null;
alter table public.wf_tasks alter column note set default ''::text;
alter table public.wf_tasks alter column note set not null;
alter table public.wf_tasks alter column created_at set default now();
alter table public.wf_tasks alter column created_at set not null;
alter table public.wf_tasks alter column files set default '[]'::jsonb;
alter table public.wf_tasks alter column files set not null;
alter table public.wf_tasks alter column half_sent set default false;
alter table public.wf_tasks alter column half_sent set not null;
alter table public.wf_tasks alter column over_sent set default false;
alter table public.wf_tasks alter column over_sent set not null;
alter table public.wf_tasks alter column esc_sent set default false;
alter table public.wf_tasks alter column esc_sent set not null;
alter table public.wf_tasks alter column kind set default 'task'::text;
alter table public.wf_tasks alter column kind set not null;
alter table public.wf_tasks alter column join_from set default '[]'::jsonb;
alter table public.wf_tasks alter column join_from set not null;
alter table public.wf_versions alter column id set default gen_random_uuid();
alter table public.wf_versions alter column id set not null;
alter table public.wf_versions alter column process_id set not null;
alter table public.wf_versions alter column version set not null;
alter table public.wf_versions alter column status set default 'nhap'::text;
alter table public.wf_versions alter column status set not null;
alter table public.wf_versions alter column def set default '{"lanes": [], "steps": []}'::jsonb;
alter table public.wf_versions alter column def set not null;
alter table public.wf_versions alter column note set default ''::text;
alter table public.wf_versions alter column note set not null;
alter table public.wf_versions alter column updated_by set default app_uid();
alter table public.wf_versions alter column updated_at set default now();
alter table public.wf_versions alter column updated_at set not null;
alter table public.wo_counters alter column period set not null;
alter table public.wo_counters alter column last_no set not null;
alter table public.work_groups alter column id set default gen_random_uuid();
alter table public.work_groups alter column id set not null;
alter table public.work_groups alter column name set not null;
alter table public.work_groups alter column note set default ''::text;
alter table public.work_groups alter column note set not null;
alter table public.work_groups alter column member_ids set default '{}'::uuid[];
alter table public.work_groups alter column member_ids set not null;
alter table public.work_groups alter column active set default true;
alter table public.work_groups alter column active set not null;
alter table public.work_groups alter column created_at set default now();
alter table public.work_groups alter column created_at set not null;
alter table public.work_order_lines alter column id set default gen_random_uuid();
alter table public.work_order_lines alter column id set not null;
alter table public.work_order_lines alter column order_id set not null;
alter table public.work_order_lines alter column material set not null;
alter table public.work_order_lines alter column thickness_mm set not null;
alter table public.work_order_lines alter column qty set not null;
alter table public.work_order_lines alter column f1_kg set not null;
alter table public.work_order_lines alter column issue_kg set not null;
alter table public.work_orders alter column order_id set not null;
alter table public.work_orders alter column reserve_pct set default 3;
alter table public.work_orders alter column reserve_pct set not null;
alter table public.work_orders alter column wh_from set default 'Kho NVL IPC'::text;
alter table public.work_orders alter column wh_from set not null;
alter table public.work_orders alter column wh_to set default 'Xưởng CNC Phương Nam'::text;
alter table public.work_orders alter column wh_to set not null;
alter table public.work_orders alter column note set default ''::text;
alter table public.work_orders alter column note set not null;
alter table public.zalo_groups alter column chat_id set not null;
alter table public.zalo_groups alter column name set default ''::text;
alter table public.zalo_groups alter column name set not null;
alter table public.zalo_groups alter column events set default ARRAY['new_order'::text, 'approved'::text, 'returned'::text, 'late'::text];
alter table public.zalo_groups alter column events set not null;
alter table public.zalo_groups alter column active set default true;
alter table public.zalo_groups alter column active set not null;
alter table public.zalo_groups alter column at set default now();
alter table public.zalo_groups alter column at set not null;
alter table public.zalo_groups alter column projects set default '{}'::uuid[];
alter table public.zalo_groups alter column projects set not null;
alter table public.zalo_groups alter column rule_customers set default '{}'::uuid[];
alter table public.zalo_groups alter column rule_customers set not null;
alter table public.zalo_groups alter column rule_prefix set default '{}'::text[];
alter table public.zalo_groups alter column rule_prefix set not null;
alter table public.zalo_groups alter column all_projects set default true;
alter table public.zalo_groups alter column all_projects set not null;
alter table public.zalo_link_codes alter column code set not null;
alter table public.zalo_link_codes alter column user_id set not null;
alter table public.zalo_link_codes alter column expires_at set default (now() + '00:30:00'::interval);
alter table public.zalo_link_codes alter column expires_at set not null;
alter table public.zalo_out alter column req_id set not null;
alter table public.zalo_out alter column chat_id set not null;
alter table public.zalo_out alter column at set default now();
alter table public.zalo_out alter column at set not null;
alter table public.zalo_raw alter column id set default nextval('zalo_raw_id_seq'::regclass);
alter table public.zalo_raw alter column id set not null;
alter table public.zalo_raw alter column at set default now();
alter table public.zalo_raw alter column at set not null;

-- ===== constraints =====
alter table private.kv add constraint kv_pkey PRIMARY KEY (k);
alter table public.act_grants add constraint act_grants_pkey PRIMARY KEY (id);
alter table public.act_grants add constraint act_grants_check CHECK ((to_at > from_at));
alter table public.app_errors add constraint app_errors_pkey PRIMARY KEY (id);
alter table public.app_secrets add constraint app_secrets_pkey PRIMARY KEY (name);
alter table public.app_settings add constraint app_settings_pkey PRIMARY KEY (key);
alter table public.approval_levels add constraint approval_levels_pkey PRIMARY KEY (id);
alter table public.approval_steps add constraint approval_steps_doc_type_step_no_key UNIQUE (doc_type, step_no);
alter table public.approval_steps add constraint approval_steps_pkey PRIMARY KEY (id);
alter table public.approvals add constraint approvals_pkey PRIMARY KEY (id);
alter table public.approvals add constraint approvals_status_check CHECK ((status = ANY (ARRAY['cho'::text, 'dat'::text, 'tu_choi'::text, 'huy'::text])));
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.batches add constraint batches_pkey PRIMARY KEY (id);
alter table public.batches add constraint batches_proc_check CHECK ((proc = ANY (ARRAY['QT0'::text, 'QT1'::text, 'QT2'::text, 'QT3'::text])));
alter table public.batches add constraint batches_status_check CHECK ((status = ANY (ARRAY['dang_lam'::text, 'cho_ky'::text, 'hoan_tat'::text, 'fail'::text, 'huy'::text])));
alter table public.cccd_views add constraint cccd_views_pkey PRIMARY KEY (id);
alter table public.chain_people add constraint chain_people_pkey PRIMARY KEY (proc, company, role);
alter table public.checklist_done add constraint checklist_done_pkey PRIMARY KEY (order_id, item_id);
alter table public.checklist_items add constraint checklist_items_pkey PRIMARY KEY (id);
alter table public.co_counters add constraint co_counters_pkey PRIMARY KEY (company, day);
alter table public.co_counters2 add constraint co_counters2_pkey PRIMARY KEY (k);
alter table public.co_orders add constraint co_orders_code_key UNIQUE (code);
alter table public.co_orders add constraint co_orders_doc_id_key UNIQUE (doc_id);
alter table public.co_orders add constraint co_orders_pkey PRIMARY KEY (id);
alter table public.companies add constraint companies_pkey PRIMARY KEY (code);
alter table public.companies add constraint companies_code_check CHECK ((code ~ '^[A-Z0-9]{2,6}$'::text));
alter table public.confirmations add constraint confirmations_pkey PRIMARY KEY (order_id);
alter table public.customers add constraint customers_code_key UNIQUE (code);
alter table public.customers add constraint customers_pkey PRIMARY KEY (id);
alter table public.customers add constraint customers_kind_check CHECK ((kind = ANY (ARRAY['khach_hang'::text, 'van_chuyen'::text, 'noi_bo'::text])));
alter table public.delegations add constraint delegations_pkey PRIMARY KEY (id);
alter table public.deliveries add constraint deliveries_pkey PRIMARY KEY (order_id);
alter table public.doc_cccd add constraint doc_cccd_pkey PRIMARY KEY (doc_id);
alter table public.doc_records add constraint doc_records_pkey PRIMARY KEY (id);
alter table public.doc_records add constraint doc_records_kind_check CHECK ((kind = ANY (ARRAY['trinh_duyet'::text, 'duyet'::text, 'tu_choi'::text])));
alter table public.doc_records add constraint doc_records_result_check CHECK ((result = ANY (ARRAY['thanh_cong'::text, 'that_bai'::text])));
alter table public.docs add constraint docs_pkey PRIMARY KEY (id);
alter table public.docs add constraint docs_company_check CHECK ((company = ANY (ARRAY['PN'::text, 'IPC'::text, 'HW'::text])));
alter table public.excel_checks add constraint excel_checks_pkey PRIMARY KEY (path);
alter table public.handover_lines add constraint handover_lines_order_id_material_thickness_mm_key UNIQUE (order_id, material, thickness_mm);
alter table public.handover_lines add constraint handover_lines_pkey PRIMARY KEY (id);
alter table public.handovers add constraint handovers_pkey PRIMARY KEY (order_id);
alter table public.issues add constraint issues_pkey PRIMARY KEY (id);
alter table public.issues add constraint issues_kind_check CHECK ((kind = ANY (ARRAY['sai_lech_nvl'::text, 'loi_nvl'::text, 'loi_gia_cong'::text, 'khach_doi'::text, 'khac'::text])));
alter table public.issues add constraint issues_source_check CHECK ((source = ANY (ARRAY['F4'::text, 'F6'::text, 'QC_TP'::text, 'F9'::text, 'khac'::text])));
alter table public.issues add constraint issues_status_check CHECK ((status = ANY (ARRAY['mo'::text, 'da_xu_ly'::text, 'chuyen_cap_tren'::text])));
alter table public.material_plan_lines add constraint material_plan_lines_order_id_material_thickness_mm_key UNIQUE (order_id, material, thickness_mm);
alter table public.material_plan_lines add constraint material_plan_lines_pkey PRIMARY KEY (id);
alter table public.material_plans add constraint material_plans_pkey PRIMARY KEY (order_id);
alter table public.material_plans add constraint material_plans_waste_pct_check CHECK (((waste_pct >= (0)::numeric) AND (waste_pct < (100)::numeric)));
alter table public.materials add constraint materials_name_key UNIQUE (name);
alter table public.materials add constraint materials_pkey PRIMARY KEY (id);
alter table public.materials add constraint materials_density_check CHECK (((density > (0)::numeric) AND (density < (30)::numeric)));
alter table public.monthly_plans add constraint monthly_plans_pkey PRIMARY KEY (month);
alter table public.monthly_plans add constraint monthly_plans_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric));
alter table public.monthly_plans add constraint monthly_plans_tons_check CHECK ((tons >= (0)::numeric));
alter table public.order_counters add constraint order_counters_pkey PRIMARY KEY (period);
alter table public.order_lines add constraint order_lines_pkey PRIMARY KEY (id);
alter table public.order_lines add constraint order_lines_length_mm_check CHECK ((length_mm > (0)::numeric));
alter table public.order_lines add constraint order_lines_qty_check CHECK ((qty > 0));
alter table public.order_lines add constraint order_lines_thickness_mm_check CHECK ((thickness_mm > (0)::numeric));
alter table public.order_lines add constraint order_lines_width_mm_check CHECK ((width_mm > (0)::numeric));
alter table public.order_msgs add constraint order_msgs_pkey PRIMARY KEY (id);
alter table public.order_msgs add constraint order_msgs_kind_check CHECK ((kind = ANY (ARRAY['nudge'::text, 'reply'::text, 'reassign'::text, 'auto'::text, 'note'::text, 'turn'::text, 'result'::text])));
alter table public.order_prices add constraint order_prices_pkey PRIMARY KEY (line_id);
alter table public.order_prices add constraint order_prices_price_unit_check CHECK ((price_unit = ANY (ARRAY['kg'::text, 'tấm'::text, 'm²'::text])));
alter table public.order_prices add constraint order_prices_unit_price_check CHECK ((unit_price >= (0)::numeric));
alter table public.order_steps add constraint order_steps_pkey PRIMARY KEY (order_id, step);
alter table public.orders add constraint orders_code_key UNIQUE (code);
alter table public.orders add constraint orders_pkey PRIMARY KEY (id);
alter table public.orders add constraint orders_channel_check CHECK ((channel = ANY (ARRAY['Email'::text, 'Điện thoại'::text, 'Hệ thống'::text])));
alter table public.orders add constraint orders_f1_result_check CHECK ((f1_result = ANY (ARRAY['chua'::text, 'dat'::text, 'khong_dat'::text])));
alter table public.orders add constraint orders_status_check CHECK ((status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text, 'kiem_tra_f1'::text, 'xndh'::text, 'cho_duyet_xndh'::text, 'cho_khach'::text, 'san_xuat'::text, 'giao_hang'::text, 'hoan_tat'::text, 'huy'::text])));
alter table public.packing_lines add constraint packing_lines_order_id_pallet_no_key UNIQUE (order_id, pallet_no);
alter table public.packing_lines add constraint packing_lines_pkey PRIMARY KEY (id);
alter table public.packing_lines add constraint packing_lines_kg_check CHECK ((kg >= (0)::numeric));
alter table public.packing_lines add constraint packing_lines_qty_check CHECK ((qty >= 0));
alter table public.packing_lists add constraint packing_lists_pkey PRIMARY KEY (order_id);
alter table public.perf_config add constraint perf_config_pkey PRIMARY KEY (id);
alter table public.perf_config add constraint perf_config_id_check CHECK ((id = 1));
alter table public.perf_spins add constraint perf_spins_pkey PRIMARY KEY (id);
alter table public.print_templates add constraint print_templates_pkey PRIMARY KEY (id);
alter table public.proc_fields add constraint proc_fields_proc_area_tbl_key_key UNIQUE (proc, area, tbl, key);
alter table public.proc_fields add constraint proc_fields_pkey PRIMARY KEY (id);
alter table public.proc_fields add constraint proc_fields_area_check CHECK ((area = ANY (ARRAY['header'::text, 'col'::text, 'file'::text, 'table'::text])));
alter table public.proc_fields add constraint proc_fields_proc_check CHECK ((proc = ANY (ARRAY['F0'::text, 'QT0'::text, 'QT1'::text, 'QT2'::text, 'QT3'::text])));
alter table public.proc_fields add constraint proc_fields_type_check CHECK ((type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text, 'textarea'::text, 'file'::text, 'person'::text, 'carrier'::text, 'bool'::text, 'ref'::text, 'formula'::text, 'lookup'::text, 'int'::text, 'datetime'::text, 'multi'::text, 'subtable'::text, 'money'::text, 'percent'::text, 'email'::text, 'phone'::text, 'url'::text, 'location'::text])));
alter table public.profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table public.profiles add constraint profiles_unit_check CHECK ((unit = ANY (ARRAY['CNC'::text, 'IPC'::text, 'HANWA'::text, 'IT'::text, 'KHAC'::text])));
alter table public.projects add constraint projects_code_key UNIQUE (code);
alter table public.projects add constraint projects_pkey PRIMARY KEY (id);
alter table public.projects add constraint projects_code_check CHECK ((code ~ '^[A-Z0-9]{2,12}$'::text));
alter table public.projects add constraint projects_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0));
alter table public.projects add constraint projects_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text])));
alter table public.purchase_orders add constraint purchase_orders_pkey PRIMARY KEY (order_id);
alter table public.purchase_orders add constraint purchase_orders_unit_price_check CHECK ((unit_price >= (0)::numeric));
alter table public.qc_finished add constraint qc_finished_pkey PRIMARY KEY (order_id);
alter table public.qc_finished add constraint qc_finished_result_check CHECK ((result = ANY (ARRAY['chua'::text, 'dat'::text, 'khong_dat'::text])));
alter table public.ratings add constraint ratings_doc_id_rater_ratee_key UNIQUE (doc_id, rater, ratee);
alter table public.ratings add constraint ratings_pkey PRIMARY KEY (id);
alter table public.ratings add constraint ratings_stars_check CHECK (((stars >= 1) AND (stars <= 5)));
alter table public.receipt_lines add constraint receipt_lines_order_id_material_thickness_mm_key UNIQUE (order_id, material, thickness_mm);
alter table public.receipt_lines add constraint receipt_lines_pkey PRIMARY KEY (id);
alter table public.receipts add constraint receipts_pkey PRIMARY KEY (order_id);
alter table public.receipts add constraint receipts_qc_result_check CHECK ((qc_result = ANY (ARRAY['chua'::text, 'dat'::text, 'khong_dat'::text])));
alter table public.sim_log add constraint sim_log_pkey PRIMARY KEY (id);
alter table public.step_checks add constraint step_checks_pkey PRIMARY KEY (id);
alter table public.step_checks add constraint step_checks_level_check CHECK ((level = ANY (ARRAY['req'::text, 'rec'::text, 'note'::text])));
alter table public.step_defaults add constraint step_defaults_pkey PRIMARY KEY (step);
alter table public.step_guides add constraint step_guides_pkey PRIMARY KEY (key);
alter table public.stock_moves add constraint stock_moves_pkey PRIMARY KEY (id);
alter table public.stock_moves add constraint stock_moves_kind_check CHECK ((kind = ANY (ARRAY['nhap'::text, 'xuat'::text, 'dieu_chinh'::text])));
alter table public.user_co_roles add constraint user_co_roles_pkey PRIMARY KEY (user_id, company);
alter table public.user_co_roles add constraint user_co_roles_company_check CHECK ((company = ANY (ARRAY['PN'::text, 'IPC'::text, 'HW'::text])));
alter table public.wf_approvals add constraint wf_approvals_pkey PRIMARY KEY (id);
alter table public.wf_approvals add constraint wf_approvals_status_check CHECK ((status = ANY (ARRAY['cho'::text, 'dong_y'::text, 'tu_choi'::text, 'bo_qua'::text])));
alter table public.wf_events add constraint wf_events_pkey PRIMARY KEY (id);
alter table public.wf_instances add constraint wf_instances_pkey PRIMARY KEY (id);
alter table public.wf_instances add constraint wf_instances_status_check CHECK ((status = ANY (ARRAY['dang_chay'::text, 'hoan_tat'::text, 'fail'::text, 'huy'::text])));
alter table public.wf_processes add constraint wf_processes_code_key UNIQUE (code);
alter table public.wf_processes add constraint wf_processes_pkey PRIMARY KEY (id);
alter table public.wf_tasks add constraint wf_tasks_pkey PRIMARY KEY (id);
alter table public.wf_tasks add constraint wf_tasks_status_check CHECK ((status = ANY (ARRAY['cho'::text, 'xong'::text, 'tra_lai'::text, 'fail'::text, 'huy'::text])));
alter table public.wf_versions add constraint wf_versions_process_id_version_key UNIQUE (process_id, version);
alter table public.wf_versions add constraint wf_versions_pkey PRIMARY KEY (id);
alter table public.wf_versions add constraint wf_versions_status_check CHECK ((status = ANY (ARRAY['nhap'::text, 'phat_hanh'::text, 'luu_tru'::text])));
alter table public.wo_counters add constraint wo_counters_pkey PRIMARY KEY (period);
alter table public.work_groups add constraint work_groups_name_key UNIQUE (name);
alter table public.work_groups add constraint work_groups_pkey PRIMARY KEY (id);
alter table public.work_order_lines add constraint work_order_lines_order_id_material_thickness_mm_key UNIQUE (order_id, material, thickness_mm);
alter table public.work_order_lines add constraint work_order_lines_pkey PRIMARY KEY (id);
alter table public.work_orders add constraint work_orders_code_key UNIQUE (code);
alter table public.work_orders add constraint work_orders_pkey PRIMARY KEY (order_id);
alter table public.work_orders add constraint work_orders_reserve_pct_check CHECK (((reserve_pct >= (0)::numeric) AND (reserve_pct < (50)::numeric)));
alter table public.zalo_groups add constraint zalo_groups_pkey PRIMARY KEY (chat_id);
alter table public.zalo_groups add constraint zalo_groups_company_check CHECK ((company = ANY (ARRAY['PN'::text, 'IPC'::text, 'HW'::text])));
alter table public.zalo_link_codes add constraint zalo_link_codes_pkey PRIMARY KEY (code);
alter table public.zalo_out add constraint zalo_out_pkey PRIMARY KEY (req_id);
alter table public.zalo_raw add constraint zalo_raw_pkey PRIMARY KEY (id);
alter table public.act_grants add constraint act_grants_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.act_grants add constraint act_grants_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.act_grants add constraint act_grants_target_id_fkey FOREIGN KEY (target_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.approval_levels add constraint approval_levels_group_id_fkey FOREIGN KEY (group_id) REFERENCES work_groups(id);
alter table public.approval_levels add constraint approval_levels_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.approval_steps add constraint approval_steps_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES profiles(id);
alter table public.approvals add constraint approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES profiles(id);
alter table public.approvals add constraint approvals_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.batches add constraint batches_co_order_id_fkey FOREIGN KEY (co_order_id) REFERENCES co_orders(id) ON DELETE SET NULL;
alter table public.batches add constraint batches_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.batches add constraint batches_src_qt0_fkey FOREIGN KEY (src_qt0) REFERENCES batches(id);
alter table public.chain_people add constraint chain_people_group_id_fkey FOREIGN KEY (group_id) REFERENCES work_groups(id);
alter table public.chain_people add constraint chain_people_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.checklist_done add constraint checklist_done_done_by_fkey FOREIGN KEY (done_by) REFERENCES profiles(id);
alter table public.checklist_done add constraint checklist_done_item_id_fkey FOREIGN KEY (item_id) REFERENCES checklist_items(id);
alter table public.checklist_done add constraint checklist_done_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.co_counters add constraint co_counters_company_fkey FOREIGN KEY (company) REFERENCES companies(code);
alter table public.co_orders add constraint co_orders_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE CASCADE;
alter table public.co_orders add constraint co_orders_company_fkey FOREIGN KEY (company) REFERENCES companies(code);
alter table public.co_orders add constraint co_orders_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE;
alter table public.co_orders add constraint co_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.co_orders add constraint co_orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
alter table public.co_orders add constraint co_orders_ref_id_fkey FOREIGN KEY (ref_id) REFERENCES co_orders(id) ON DELETE SET NULL;
alter table public.companies add constraint companies_buyer_fkey FOREIGN KEY (buyer) REFERENCES companies(code);
alter table public.confirmations add constraint confirmations_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.delegations add constraint delegations_to_user_fkey FOREIGN KEY (to_user) REFERENCES profiles(id);
alter table public.delegations add constraint delegations_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.deliveries add constraint deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.doc_cccd add constraint doc_cccd_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE;
alter table public.doc_records add constraint doc_records_by_user_fkey FOREIGN KEY (by_user) REFERENCES profiles(id);
alter table public.doc_records add constraint doc_records_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES docs(id);
alter table public.doc_records add constraint doc_records_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.docs add constraint docs_assignee_fkey FOREIGN KEY (assignee) REFERENCES profiles(id);
alter table public.docs add constraint docs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES batches(id);
alter table public.handover_lines add constraint handover_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.handovers add constraint handovers_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.issues add constraint issues_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.material_plan_lines add constraint material_plan_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.material_plans add constraint material_plans_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_lines add constraint order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_msgs add constraint order_msgs_doc_fk FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE;
alter table public.order_msgs add constraint order_msgs_from_user_fkey FOREIGN KEY (from_user) REFERENCES profiles(id);
alter table public.order_msgs add constraint order_msgs_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_prices add constraint order_prices_line_id_fkey FOREIGN KEY (line_id) REFERENCES order_lines(id) ON DELETE CASCADE;
alter table public.order_prices add constraint order_prices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.order_steps add constraint order_steps_doer_group_id_fkey FOREIGN KEY (doer_group_id) REFERENCES work_groups(id);
alter table public.order_steps add constraint order_steps_doer_id_fkey FOREIGN KEY (doer_id) REFERENCES profiles(id);
alter table public.order_steps add constraint order_steps_done_by_fkey FOREIGN KEY (done_by) REFERENCES profiles(id);
alter table public.order_steps add constraint order_steps_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.orders add constraint orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
alter table public.orders add constraint orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
alter table public.orders add constraint orders_extractor_id_fkey FOREIGN KEY (extractor_id) REFERENCES profiles(id);
alter table public.orders add constraint orders_f1_checked_by_fkey FOREIGN KEY (f1_checked_by) REFERENCES profiles(id);
alter table public.orders add constraint orders_kh1_id_fkey FOREIGN KEY (kh1_id) REFERENCES customers(id);
alter table public.orders add constraint orders_kh2_id_fkey FOREIGN KEY (kh2_id) REFERENCES customers(id);
alter table public.orders add constraint orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
alter table public.packing_lines add constraint packing_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.packing_lists add constraint packing_lists_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.perf_spins add constraint perf_spins_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.profiles add constraint profiles_impersonating_fkey FOREIGN KEY (impersonating) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.profiles add constraint profiles_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES profiles(id);
alter table public.projects add constraint projects_end_customer_id_fkey FOREIGN KEY (end_customer_id) REFERENCES customers(id);
alter table public.purchase_orders add constraint purchase_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.qc_finished add constraint qc_finished_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.ratings add constraint ratings_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES docs(id) ON DELETE CASCADE;
alter table public.ratings add constraint ratings_ratee_fkey FOREIGN KEY (ratee) REFERENCES profiles(id);
alter table public.ratings add constraint ratings_rater_fkey FOREIGN KEY (rater) REFERENCES profiles(id);
alter table public.receipt_lines add constraint receipt_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.receipts add constraint receipts_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.step_defaults add constraint step_defaults_doer_group_id_fkey FOREIGN KEY (doer_group_id) REFERENCES work_groups(id);
alter table public.step_defaults add constraint step_defaults_doer_id_fkey FOREIGN KEY (doer_id) REFERENCES profiles(id);
alter table public.stock_moves add constraint stock_moves_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
alter table public.user_co_roles add constraint user_co_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.wf_approvals add constraint wf_approvals_approver_fkey FOREIGN KEY (approver) REFERENCES profiles(id);
alter table public.wf_approvals add constraint wf_approvals_task_id_fkey FOREIGN KEY (task_id) REFERENCES wf_tasks(id);
alter table public.wf_events add constraint wf_events_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES wf_instances(id);
alter table public.wf_events add constraint wf_events_process_id_fkey FOREIGN KEY (process_id) REFERENCES wf_processes(id);
alter table public.wf_instances add constraint wf_instances_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
alter table public.wf_instances add constraint wf_instances_parent_task_fkey FOREIGN KEY (parent_task) REFERENCES wf_tasks(id);
alter table public.wf_instances add constraint wf_instances_version_id_fkey FOREIGN KEY (version_id) REFERENCES wf_versions(id);
alter table public.wf_tasks add constraint wf_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
alter table public.wf_tasks add constraint wf_tasks_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES wf_instances(id);
alter table public.wf_tasks add constraint wf_tasks_prev_task_fkey FOREIGN KEY (prev_task) REFERENCES wf_tasks(id);
alter table public.wf_versions add constraint wf_versions_process_id_fkey FOREIGN KEY (process_id) REFERENCES wf_processes(id);
alter table public.work_order_lines add constraint work_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.work_orders add constraint work_orders_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
alter table public.zalo_groups add constraint zalo_groups_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES profiles(id);
alter table public.zalo_link_codes add constraint zalo_link_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ===== indexes =====
CREATE INDEX act_grants_admin ON public.act_grants USING btree (admin_id, to_at);
CREATE INDEX act_grants_created_by_fk ON public.act_grants USING btree (created_by);
CREATE INDEX act_grants_target_id_fk ON public.act_grants USING btree (target_id);
CREATE INDEX app_errors_at ON public.app_errors USING btree (at DESC);
CREATE INDEX approval_levels_group_id_fk ON public.approval_levels USING btree (group_id);
CREATE INDEX approval_levels_user_id_fk ON public.approval_levels USING btree (user_id);
CREATE INDEX approval_steps_approver_id_fk ON public.approval_steps USING btree (approver_id);
CREATE INDEX approvals_approver_id_status_idx ON public.approvals USING btree (approver_id, status);
CREATE INDEX approvals_order_id_idx ON public.approvals USING btree (order_id);
CREATE INDEX audit_log_order_id_at_idx ON public.audit_log USING btree (order_id, at DESC);
CREATE INDEX batches_co_order_id_fk ON public.batches USING btree (co_order_id);
CREATE INDEX batches_order_id_fk ON public.batches USING btree (order_id);
CREATE INDEX batches_order_proc_idx ON public.batches USING btree (order_id, proc);
CREATE INDEX chain_people_group_id_fk ON public.chain_people USING btree (group_id);
CREATE INDEX chain_people_user_id_fk ON public.chain_people USING btree (user_id);
CREATE INDEX checklist_done_done_by_fk ON public.checklist_done USING btree (done_by);
CREATE INDEX checklist_done_item_id_fk ON public.checklist_done USING btree (item_id);
CREATE INDEX co_orders_batch_id_fk ON public.co_orders USING btree (batch_id);
CREATE INDEX co_orders_company_fk ON public.co_orders USING btree (company);
CREATE INDEX co_orders_order_id_idx ON public.co_orders USING btree (order_id);
CREATE INDEX co_orders_project_id_idx ON public.co_orders USING btree (project_id);
CREATE INDEX co_orders_ref_id_fk ON public.co_orders USING btree (ref_id);
CREATE INDEX companies_buyer_fk ON public.companies USING btree (buyer);
CREATE INDEX delegations_to_user_fk ON public.delegations USING btree (to_user);
CREATE INDEX delegations_user_id_fk ON public.delegations USING btree (user_id);
CREATE INDEX doc_records_by_user_fk ON public.doc_records USING btree (by_user);
CREATE INDEX doc_records_doc_idx ON public.doc_records USING btree (doc_id, kind, at);
CREATE INDEX doc_records_order_idx ON public.doc_records USING btree (order_id, at);
CREATE INDEX docs_assignee_fk ON public.docs USING btree (assignee);
CREATE INDEX docs_batch_id_fk ON public.docs USING btree (batch_id);
CREATE INDEX issues_order_id_fk ON public.issues USING btree (order_id);
CREATE INDEX order_lines_order_id_idx ON public.order_lines USING btree (order_id);
CREATE INDEX order_msgs_doc_idx ON public.order_msgs USING btree (doc_id, kind, at);
CREATE INDEX order_msgs_from_user_fk ON public.order_msgs USING btree (from_user);
CREATE INDEX order_msgs_order_idx ON public.order_msgs USING btree (order_id, at);
CREATE INDEX order_prices_order_id_fk ON public.order_prices USING btree (order_id);
CREATE INDEX order_steps_doer_group_id_fk ON public.order_steps USING btree (doer_group_id);
CREATE INDEX order_steps_doer_id_fk ON public.order_steps USING btree (doer_id);
CREATE INDEX order_steps_done_by_fk ON public.order_steps USING btree (done_by);
CREATE INDEX orders_created_by_fk ON public.orders USING btree (created_by);
CREATE INDEX orders_customer_idx ON public.orders USING btree (customer_id);
CREATE INDEX orders_extractor_id_fk ON public.orders USING btree (extractor_id);
CREATE INDEX orders_f1_checked_by_fk ON public.orders USING btree (f1_checked_by);
CREATE INDEX orders_kh1_id_fk ON public.orders USING btree (kh1_id);
CREATE INDEX orders_kh2_id_fk ON public.orders USING btree (kh2_id);
CREATE INDEX orders_project_id_idx ON public.orders USING btree (project_id);
CREATE INDEX perf_spins_user_id_fk ON public.perf_spins USING btree (user_id);
CREATE INDEX profiles_impersonating_fk ON public.profiles USING btree (impersonating);
CREATE INDEX profiles_manager_id_fk ON public.profiles USING btree (manager_id);
CREATE INDEX projects_end_customer_id_fk ON public.projects USING btree (end_customer_id);
CREATE INDEX step_defaults_doer_group_id_fk ON public.step_defaults USING btree (doer_group_id);
CREATE INDEX step_defaults_doer_id_fk ON public.step_defaults USING btree (doer_id);
CREATE INDEX stock_moves_material_thickness_mm_idx ON public.stock_moves USING btree (material, thickness_mm);
CREATE INDEX stock_moves_order_id_fk ON public.stock_moves USING btree (order_id);
CREATE INDEX wf_appr_open ON public.wf_approvals USING btree (approver) WHERE (status = 'cho'::text);
CREATE INDEX wf_appr_task ON public.wf_approvals USING btree (task_id);
CREATE INDEX wf_events_inst ON public.wf_events USING btree (instance_id);
CREATE INDEX wf_events_process_id_fk ON public.wf_events USING btree (process_id);
CREATE INDEX wf_inst_order ON public.wf_instances USING btree (order_id);
CREATE INDEX wf_inst_parent ON public.wf_instances USING btree (parent_task);
CREATE INDEX wf_instances_version_id_fk ON public.wf_instances USING btree (version_id);
CREATE INDEX wf_tasks_assigned_to_fk ON public.wf_tasks USING btree (assigned_to);
CREATE INDEX wf_tasks_inst ON public.wf_tasks USING btree (instance_id);
CREATE INDEX wf_tasks_open ON public.wf_tasks USING btree (status) WHERE (status = 'cho'::text);
CREATE INDEX wf_tasks_prev_task_fk ON public.wf_tasks USING btree (prev_task);
CREATE INDEX zalo_link_codes_user_id_fk ON public.zalo_link_codes USING btree (user_id);
CREATE INDEX zalo_out_msg ON public.zalo_out USING btree (message_id);
CREATE UNIQUE INDEX customers_tax_uq ON public.customers USING btree (tax_code) WHERE ((tax_code IS NOT NULL) AND (tax_code <> ''::text));
CREATE UNIQUE INDEX materials_one_default ON public.materials USING btree (is_default) WHERE is_default;

-- ===== views =====
create or replace view public.docs_v with (security_invoker=false) as
 WITH k AS MATERIALIZED (
         SELECT p.proc,
            c.co,
            doc_visible(c.co, p.proc) AS vis,
                CASE
                    WHEN doc_visible(c.co, p.proc) THEN hidden_keys(p.proc, c.co)
                    ELSE '{}'::text[]
                END AS hk
           FROM (( VALUES ('QT0'::text), ('QT1'::text), ('QT2'::text), ('QT3'::text)) p(proc)
             CROSS JOIN ( VALUES ('PN'::text), ('IPC'::text), ('HW'::text)) c(co))
        )
 SELECT d.id,
    d.batch_id,
    d.company,
    d.status,
    d.status_at,
    d.created_at,
    d.apv,
    d.assignee,
        CASE
            WHEN v.vis THEN d.assign_note
            ELSE NULL::text
        END AS assign_note,
        CASE
            WHEN v.vis THEN d.signs
            ELSE COALESCE(( SELECT jsonb_agg((x.s - 'note'::text) ORDER BY x.i) AS jsonb_agg
               FROM jsonb_array_elements(d.signs) WITH ORDINALITY x(s, i)), '[]'::jsonb)
        END AS signs,
        CASE
            WHEN v.vis THEN _mask_h(d.header, v.hk)
            ELSE '{}'::jsonb
        END AS header,
        CASE
            WHEN v.vis THEN _mask_t(d.tables, v.hk)
            ELSE '{}'::jsonb
        END AS tables,
        CASE
            WHEN (NOT v.vis) THEN '[]'::jsonb
            WHEN ('h:tx_cccd'::text = ANY (v.hk)) THEN COALESCE(( SELECT jsonb_agg(y.f ORDER BY y.i) AS jsonb_agg
               FROM jsonb_array_elements(d.files) WITH ORDINALITY y(f, i)
              WHERE ((y.f ->> 'kind'::text) IS DISTINCT FROM 'gh_cccd'::text)), '[]'::jsonb)
            ELSE d.files
        END AS files,
        CASE
            WHEN v.vis THEN d.notes
            ELSE '[]'::jsonb
        END AS notes,
    v.vis AS can_view,
        CASE
            WHEN v.vis THEN v.hk
            ELSE '{}'::text[]
        END AS hidden,
    d.checklist,
        CASE
            WHEN (v.vis AND (d.ret_snap IS NOT NULL)) THEN (((d.ret_snap - 'header'::text) - 'tables'::text) || jsonb_build_object('header', _mask_h(COALESCE((d.ret_snap -> 'header'::text), '{}'::jsonb), v.hk), 'tables', _mask_t(COALESCE((d.ret_snap -> 'tables'::text), '{}'::jsonb), v.hk)))
            ELSE NULL::jsonb
        END AS ret_snap
   FROM ((docs d
     JOIN batches b ON ((b.id = d.batch_id)))
     JOIN k v ON (((v.proc = b.proc) AND (v.co = d.company))));
create or replace view public.stock_balance with (security_invoker=true) as
 SELECT material,
    thickness_mm,
    warehouse,
    round(sum(qty_kg), 2) AS qty_kg
   FROM stock_moves
  GROUP BY material, thickness_mm, warehouse;

-- ===== triggers =====
CREATE TRIGGER act_guard BEFORE INSERT OR UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION _act_guard_batches();
CREATE TRIGGER act_guard BEFORE INSERT OR UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _act_guard_docs();
CREATE TRIGGER act_guard BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION _act_guard_orders();
CREATE TRIGGER approvals_zalo AFTER INSERT OR UPDATE ON public.approvals FOR EACH ROW EXECUTE FUNCTION zalo_notify();
CREATE TRIGGER audit_acting_as BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION fill_acting_as();
CREATE TRIGGER audit_conf AFTER INSERT OR UPDATE ON public.confirmations FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_dlv AFTER INSERT OR UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_hl AFTER INSERT OR UPDATE ON public.handover_lines FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_issues AFTER INSERT OR UPDATE ON public.issues FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_lines AFTER INSERT OR DELETE OR UPDATE ON public.order_lines FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_mpl AFTER INSERT OR DELETE OR UPDATE ON public.material_plan_lines FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_orders AFTER INSERT OR DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_pk AFTER INSERT OR UPDATE ON public.packing_lists FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_pkl AFTER INSERT OR UPDATE ON public.packing_lines FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_po AFTER INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_rl AFTER INSERT OR UPDATE ON public.receipt_lines FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER audit_wo AFTER INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION audit_row();
CREATE TRIGGER batches_qt0_done_zalo AFTER UPDATE OF status ON public.batches FOR EACH ROW EXECUTE FUNCTION qt0_done_zalo();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.act_grants FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.approval_levels FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.approval_steps FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.chain_people FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.checklist_items FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.delegations FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.materials FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.perf_config FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.print_templates FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.proc_fields FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.step_defaults FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.step_guides FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.user_co_roles FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.work_groups FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER cfg_audit AFTER INSERT OR DELETE OR UPDATE ON public.zalo_groups FOR EACH ROW EXECUTE FUNCTION _cfg_audit();
CREATE TRIGGER checklist_gate BEFORE UPDATE OF status ON public.docs FOR EACH ROW EXECUTE FUNCTION _checklist_gate();
CREATE TRIGGER co_chain_guard BEFORE INSERT OR UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _co_chain_guard();
CREATE TRIGGER co_doc_after AFTER INSERT ON public.docs FOR EACH ROW EXECUTE FUNCTION _co_doc_after();
CREATE TRIGGER co_doc_before BEFORE INSERT ON public.docs FOR EACH ROW EXECUTE FUNCTION _co_doc_before();
CREATE TRIGGER co_doc_keep BEFORE UPDATE OF header ON public.docs FOR EACH ROW EXECUTE FUNCTION _co_doc_keep();
CREATE TRIGGER co_orders_closed_guard BEFORE UPDATE ON public.co_orders FOR EACH ROW EXECUTE FUNCTION _closed_co_guard();
CREATE TRIGGER doc_records_secret BEFORE INSERT ON public.doc_records FOR EACH ROW EXECUTE FUNCTION _rec_secret();
CREATE TRIGGER docs_cccd BEFORE INSERT OR UPDATE OF header, ret_snap ON public.docs FOR EACH ROW EXECUTE FUNCTION _docs_cccd();
CREATE TRIGGER docs_clear_assignee BEFORE UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION docs_clear_assignee();
CREATE TRIGGER docs_closed_guard BEFORE UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _closed_doc_guard();
CREATE TRIGGER docs_file_del_guard BEFORE UPDATE OF files ON public.docs FOR EACH ROW EXECUTE FUNCTION _file_del_guard();
CREATE TRIGGER docs_seq_unlock AFTER UPDATE OF status ON public.docs FOR EACH ROW EXECUTE FUNCTION docs_seq_unlock();
CREATE TRIGGER docs_turn_msg AFTER UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION docs_turn_msg();
CREATE TRIGGER docs_zalo AFTER INSERT OR UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION docs_zalo();
CREATE TRIGGER excel_gate BEFORE UPDATE OF status ON public.docs FOR EACH ROW EXECUTE FUNCTION _excel_gate();
CREATE TRIGGER g_hl BEFORE UPDATE ON public.handover_lines FOR EACH ROW EXECUTE FUNCTION guard_hl();
CREATE TRIGGER g_mpl BEFORE UPDATE ON public.material_plan_lines FOR EACH ROW EXECUTE FUNCTION guard_mpl();
CREATE TRIGGER g_rl BEFORE UPDATE ON public.receipt_lines FOR EACH ROW EXECUTE FUNCTION guard_rl();
CREATE TRIGGER lock_batches BEFORE INSERT OR DELETE OR UPDATE ON public.batches FOR EACH ROW EXECUTE FUNCTION _lock_guard();
CREATE TRIGGER lock_docs BEFORE INSERT OR DELETE OR UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _lock_guard();
CREATE TRIGGER lock_orders BEFORE DELETE OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION _lock_guard();
CREATE TRIGGER order_project_name BEFORE INSERT OR UPDATE OF project_id, project ON public.orders FOR EACH ROW EXECUTE FUNCTION _order_project_name();
CREATE TRIGGER order_steps_guard BEFORE UPDATE ON public.order_steps FOR EACH ROW EXECUTE FUNCTION guard_order_steps();
CREATE TRIGGER order_steps_notify BEFORE INSERT OR UPDATE ON public.order_steps FOR EACH ROW EXECUTE FUNCTION order_steps_notify();
CREATE TRIGGER orders_checklist BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION guard_checklist();
CREATE TRIGGER orders_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION set_order_code();
CREATE TRIGGER orders_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION guard_order_status();
CREATE TRIGGER orders_req_check BEFORE INSERT OR UPDATE OF project, channel, contact, extractor_id, quote_due, due_date, description, extra ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_req_check();
CREATE TRIGGER orders_track_ins AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION track_steps();
CREATE TRIGGER orders_track_upd AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION track_steps();
CREATE TRIGGER profiles_guard BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION guard_profile();
CREATE TRIGGER project_rename AFTER UPDATE OF name ON public.projects FOR EACH ROW EXECUTE FUNCTION _project_rename();
CREATE TRIGGER qt0_guard BEFORE INSERT OR UPDATE OF tables, status ON public.docs FOR EACH ROW EXECUTE FUNCTION _qt0_guard();
CREATE TRIGGER qt0_new_guard BEFORE INSERT ON public.batches FOR EACH ROW EXECUTE FUNCTION _qt0_new_guard();
CREATE TRIGGER so_ct_assign BEFORE UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _so_ct_assign();
CREATE TRIGGER wf_approvals_zalo AFTER INSERT ON public.wf_approvals FOR EACH ROW EXECUTE FUNCTION _wf_appr_zalo();
CREATE TRIGGER wf_instances_not_deleted BEFORE INSERT ON public.wf_instances FOR EACH ROW EXECUTE FUNCTION _wf_guard_deleted();
CREATE TRIGGER wf_tasks_required BEFORE UPDATE ON public.wf_tasks FOR EACH ROW EXECUTE FUNCTION _wf_guard_required();
CREATE TRIGGER wf_tasks_zalo AFTER INSERT OR UPDATE OF assigned_to ON public.wf_tasks FOR EACH ROW EXECUTE FUNCTION _wf_tasks_zalo();
CREATE TRIGGER zg_docs AFTER UPDATE ON public.docs FOR EACH ROW EXECUTE FUNCTION _zg_docs();
CREATE TRIGGER zg_orders AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION _zg_orders();
CREATE TRIGGER zg_projects AFTER INSERT OR UPDATE OF end_customer_id, code ON public.projects FOR EACH ROW EXECUTE FUNCTION _zg_projects();

-- ===== RLS =====
alter table public.act_grants enable row level security;
alter table public.app_errors enable row level security;
alter table public.app_secrets enable row level security;
alter table public.app_settings enable row level security;
alter table public.approval_levels enable row level security;
alter table public.approval_steps enable row level security;
alter table public.approvals enable row level security;
alter table public.audit_log enable row level security;
alter table public.batches enable row level security;
alter table public.cccd_views enable row level security;
alter table public.chain_people enable row level security;
alter table public.checklist_done enable row level security;
alter table public.checklist_items enable row level security;
alter table public.co_counters enable row level security;
alter table public.co_counters2 enable row level security;
alter table public.co_orders enable row level security;
alter table public.companies enable row level security;
alter table public.confirmations enable row level security;
alter table public.customers enable row level security;
alter table public.delegations enable row level security;
alter table public.deliveries enable row level security;
alter table public.doc_cccd enable row level security;
alter table public.doc_records enable row level security;
alter table public.docs enable row level security;
alter table public.excel_checks enable row level security;
alter table public.handover_lines enable row level security;
alter table public.handovers enable row level security;
alter table public.issues enable row level security;
alter table public.material_plan_lines enable row level security;
alter table public.material_plans enable row level security;
alter table public.materials enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.order_counters enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_msgs enable row level security;
alter table public.order_prices enable row level security;
alter table public.order_steps enable row level security;
alter table public.orders enable row level security;
alter table public.packing_lines enable row level security;
alter table public.packing_lists enable row level security;
alter table public.perf_config enable row level security;
alter table public.perf_spins enable row level security;
alter table public.print_templates enable row level security;
alter table public.proc_fields enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.qc_finished enable row level security;
alter table public.ratings enable row level security;
alter table public.receipt_lines enable row level security;
alter table public.receipts enable row level security;
alter table public.sim_log enable row level security;
alter table public.step_checks enable row level security;
alter table public.step_defaults enable row level security;
alter table public.step_guides enable row level security;
alter table public.stock_moves enable row level security;
alter table public.user_co_roles enable row level security;
alter table public.wf_approvals enable row level security;
alter table public.wf_events enable row level security;
alter table public.wf_instances enable row level security;
alter table public.wf_processes enable row level security;
alter table public.wf_tasks enable row level security;
alter table public.wf_versions enable row level security;
alter table public.wo_counters enable row level security;
alter table public.work_groups enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.work_orders enable row level security;
alter table public.zalo_groups enable row level security;
alter table public.zalo_link_codes enable row level security;
alter table public.zalo_out enable row level security;
alter table public.zalo_raw enable row level security;
create policy act_grants_read on public.act_grants as PERMISSIVE for SELECT to authenticated using ((( SELECT is_real_admin() AS is_real_admin) OR (admin_id = ( SELECT auth.uid() AS uid)) OR (target_id = ( SELECT auth.uid() AS uid))));
create policy app_errors_del on public.app_errors as PERMISSIVE for DELETE to public using (has_role('admin_it'::text));
create policy app_errors_read on public.app_errors as PERMISSIVE for SELECT to public using (has_role('admin_it'::text));
create policy app_settings_read on public.app_settings as PERMISSIVE for SELECT to authenticated using (true);
create policy app_settings_write on public.app_settings as PERMISSIVE for ALL to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "IT sửa cấp duyệt · sửa" on public.approval_levels as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "IT sửa cấp duyệt · thêm" on public.approval_levels as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy "IT sửa cấp duyệt · xoá" on public.approval_levels as PERMISSIVE for DELETE to authenticated using (has_role('admin_it'::text));
create policy "đọc cấp duyệt" on public.approval_levels as PERMISSIVE for SELECT to authenticated using (true);
create policy "IT sửa chuỗi duyệt · sửa" on public.approval_steps as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "IT sửa chuỗi duyệt · thêm" on public.approval_steps as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy "IT sửa chuỗi duyệt · xoá" on public.approval_steps as PERMISSIVE for DELETE to authenticated using (has_role('admin_it'::text));
create policy "xem chuỗi duyệt" on public.approval_steps as PERMISSIVE for SELECT to authenticated using (true);
create policy "xem lượt duyệt" on public.approvals as PERMISSIVE for SELECT to authenticated using (true);
create policy "xem nhật ký" on public.audit_log as PERMISSIVE for SELECT to authenticated using (((action !~~ 'cfg:%'::text) OR has_role('admin_it'::text)));
create policy b_read on public.batches as PERMISSIVE for SELECT to authenticated using (true);
create policy "IT xem nhật ký CCCD" on public.cccd_views as PERMISSIVE for SELECT to public using (has_role('admin_it'::text));
create policy cp_ins on public.chain_people as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy cp_read on public.chain_people as PERMISSIVE for SELECT to authenticated using (true);
create policy cp_upd on public.chain_people as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy cd_ins on public.checklist_done as PERMISSIVE for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy cd_read on public.checklist_done as PERMISSIVE for SELECT to authenticated using (true);
create policy cd_upd on public.checklist_done as PERMISSIVE for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) IS NOT NULL)) with check ((( SELECT auth.uid() AS uid) IS NOT NULL));
create policy ci_ins on public.checklist_items as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy ci_read on public.checklist_items as PERMISSIVE for SELECT to authenticated using (true);
create policy ci_upd on public.checklist_items as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "xem đơn công ty" on public.co_orders as PERMISSIVE for SELECT to authenticated using (true);
create policy "admin sửa công ty" on public.companies as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_it'::text) OR has_role('admin_cnc'::text))) with check (true);
create policy "xem công ty" on public.companies as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa XNĐH" on public.confirmations as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text))) with check ((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text)));
create policy "xem XNĐH" on public.confirmations as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa khách (quản trị)" on public.customers as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) OR has_role('admin_it'::text))) with check (true);
create policy "sửa khách · sửa" on public.customers as PERMISSIVE for UPDATE to authenticated using (has_role('kinh_doanh'::text)) with check (has_role('kinh_doanh'::text));
create policy "sửa khách · thêm" on public.customers as PERMISSIVE for INSERT to authenticated with check (has_role('kinh_doanh'::text));
create policy "sửa khách · xoá" on public.customers as PERMISSIVE for DELETE to authenticated using (has_role('kinh_doanh'::text));
create policy "tạo khách" on public.customers as PERMISSIVE for INSERT to authenticated with check ((has_role('kinh_doanh'::text) OR has_role('admin_cnc'::text) OR has_role('admin_it'::text)));
create policy "xem khách" on public.customers as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa ủy quyền · sửa" on public.delegations as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_it'::text) OR (user_id = app_uid()))) with check ((has_role('admin_it'::text) OR (user_id = app_uid())));
create policy "sửa ủy quyền · thêm" on public.delegations as PERMISSIVE for INSERT to authenticated with check ((has_role('admin_it'::text) OR (user_id = app_uid())));
create policy "sửa ủy quyền · xoá" on public.delegations as PERMISSIVE for DELETE to authenticated using ((has_role('admin_it'::text) OR (user_id = app_uid())));
create policy "đọc ủy quyền" on public.delegations as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F9" on public.deliveries as PERMISSIVE for UPDATE to authenticated using (((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = deliveries.order_id) AND (o.gh_status = 'lap_lgh'::text))))) OR ((has_role('kho_qc'::text) OR has_role('admin_cnc'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = deliveries.order_id) AND (o.gh_status = ANY (ARRAY['giao_hang'::text, 'ky_bbgh'::text])))))))) with check (true);
create policy "xem F9" on public.deliveries as PERMISSIVE for SELECT to authenticated using (true);
create policy doc_records_ins on public.doc_records as PERMISSIVE for INSERT to authenticated with check ((by_user = app_uid()));
create policy doc_records_read on public.doc_records as PERMISSIVE for SELECT to public using (((by_user = app_uid()) OR rec_visible2(doc_id, kind, proc, company, has_secret)));
create policy doc_records_upd on public.doc_records as PERMISSIVE for UPDATE to authenticated using ((by_user = app_uid())) with check ((by_user = app_uid()));
create policy d_read on public.docs as PERMISSIVE for SELECT to authenticated using (true);
create policy "xem kết quả kiểm Excel" on public.excel_checks as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa dòng F6" on public.handover_lines as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = handover_lines.order_id) AND (o.gc_status = 'ban_giao'::text)))))) with check (true);
create policy "xem dòng F6" on public.handover_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F6" on public.handovers as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = handovers.order_id) AND (o.gc_status = 'ban_giao'::text)))))) with check (true);
create policy "xem F6" on public.handovers as PERMISSIVE for SELECT to authenticated using (true);
create policy "tạo F7" on public.issues as PERMISSIVE for INSERT to authenticated with check ((has_role('admin_cnc'::text) OR has_role('kho_qc'::text) OR has_role('mua_hang'::text) OR has_role('ke_hoach'::text)));
create policy "xem F7" on public.issues as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa tồn F3" on public.material_plan_lines as PERMISSIVE for UPDATE to authenticated using ((has_role('ke_hoach'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = material_plan_lines.order_id) AND (o.nvl_status = 'du_toan'::text)))))) with check (true);
create policy "xem dòng F3" on public.material_plan_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F3" on public.material_plans as PERMISSIVE for UPDATE to authenticated using ((has_role('ke_hoach'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = material_plans.order_id) AND (o.nvl_status = 'du_toan'::text)))))) with check (true);
create policy "xem F3" on public.material_plans as PERMISSIVE for SELECT to authenticated using (true);
create policy materials_read on public.materials as PERMISSIVE for SELECT to authenticated using (true);
create policy materials_write on public.materials as PERMISSIVE for ALL to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "admin sửa kế hoạch tháng · sửa" on public.monthly_plans as PERMISSIVE for UPDATE to authenticated using (( SELECT is_real_admin() AS is_real_admin)) with check (( SELECT is_real_admin() AS is_real_admin));
create policy "admin sửa kế hoạch tháng · thêm" on public.monthly_plans as PERMISSIVE for INSERT to authenticated with check (( SELECT is_real_admin() AS is_real_admin));
create policy "admin sửa kế hoạch tháng · xoá" on public.monthly_plans as PERMISSIVE for DELETE to authenticated using (( SELECT is_real_admin() AS is_real_admin));
create policy "xem kế hoạch tháng" on public.monthly_plans as PERMISSIVE for SELECT to authenticated using (true);
create policy "không truy cập trực tiếp" on public.order_counters as PERMISSIVE for SELECT to authenticated using (false);
create policy "sửa F1 · sửa" on public.order_lines as PERMISSIVE for UPDATE to authenticated using (((has_role('ky_thuat'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_lines.order_id) AND (o.status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text]))))))) with check (((has_role('ky_thuat'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_lines.order_id) AND (o.status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text])))))));
create policy "sửa F1 · thêm" on public.order_lines as PERMISSIVE for INSERT to authenticated with check (((has_role('ky_thuat'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_lines.order_id) AND (o.status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text])))))));
create policy "sửa F1 · xoá" on public.order_lines as PERMISSIVE for DELETE to authenticated using (((has_role('ky_thuat'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_lines.order_id) AND (o.status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text])))))));
create policy "xem F1" on public.order_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy order_msgs_read on public.order_msgs as PERMISSIVE for SELECT to authenticated using (msg_visible(doc_id));
create policy "sửa giá · sửa" on public.order_prices as PERMISSIVE for UPDATE to authenticated using (((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_prices.order_id) AND (o.status = 'xndh'::text)))))) with check (((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_prices.order_id) AND (o.status = 'xndh'::text))))));
create policy "sửa giá · thêm" on public.order_prices as PERMISSIVE for INSERT to authenticated with check (((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_prices.order_id) AND (o.status = 'xndh'::text))))));
create policy "sửa giá · xoá" on public.order_prices as PERMISSIVE for DELETE to authenticated using (((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text)) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_prices.order_id) AND (o.status = 'xndh'::text))))));
create policy "xem giá" on public.order_prices as PERMISSIVE for SELECT to authenticated using ((has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text) OR has_role('duyet'::text) OR has_role('xem'::text)));
create policy os_read on public.order_steps as PERMISSIVE for SELECT to authenticated using (true);
create policy os_upd on public.order_steps as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_it'::text) OR has_role('admin_cnc'::text) OR has_role('kinh_doanh'::text) OR (( SELECT auth.uid() AS uid) = ANY (supervisor_ids)) OR (( SELECT auth.uid() AS uid) = doer_id) OR in_group(doer_group_id) OR in_any_group(supervisor_group_ids))) with check (true);
create policy "admin sửa đơn" on public.orders as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (true);
create policy "sửa F0" on public.orders as PERMISSIVE for UPDATE to authenticated using (((has_role('kinh_doanh'::text) OR has_role('admin_cnc'::text)) AND (status = ANY (ARRAY['tiep_nhan'::text, 'boc_tach'::text, 'kiem_tra_f1'::text, 'xndh'::text])))) with check (true);
create policy "tạo đơn" on public.orders as PERMISSIVE for INSERT to authenticated with check ((has_role('kinh_doanh'::text) OR has_role('admin_cnc'::text)));
create policy "xem đơn" on public.orders as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa dòng F8" on public.packing_lines as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = packing_lines.order_id) AND (o.gh_status = 'thong_bao'::text)))))) with check (true);
create policy "xem dòng F8" on public.packing_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F8" on public.packing_lists as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = packing_lists.order_id) AND (o.gh_status = 'thong_bao'::text)))))) with check (true);
create policy "xem F8" on public.packing_lists as PERMISSIVE for SELECT to authenticated using (true);
create policy "đọc cấu hình hiệu quả" on public.perf_config as PERMISSIVE for SELECT to authenticated using (true);
create policy "xem lượt quay" on public.perf_spins as PERMISSIVE for SELECT to authenticated using (((user_id = app_uid()) OR has_role('admin_it'::text) OR has_role('duyet'::text)));
create policy "IT sửa mẫu in · sửa" on public.print_templates as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "IT sửa mẫu in · thêm" on public.print_templates as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy "IT sửa mẫu in · xoá" on public.print_templates as PERMISSIVE for DELETE to authenticated using (has_role('admin_it'::text));
create policy "đọc mẫu in" on public.print_templates as PERMISSIVE for SELECT to authenticated using (true);
create policy "proc_fields_admin · sửa" on public.proc_fields as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "proc_fields_admin · thêm" on public.proc_fields as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy "proc_fields_admin · xoá" on public.proc_fields as PERMISSIVE for DELETE to authenticated using (has_role('admin_it'::text));
create policy proc_fields_read on public.proc_fields as PERMISSIVE for SELECT to authenticated using (true);
create policy "IT sửa người dùng" on public.profiles as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "xem hồ sơ người dùng" on public.profiles as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa dự án" on public.projects as PERMISSIVE for UPDATE to authenticated using (((has_role('kinh_doanh'::text) OR has_role('admin_cnc'::text) OR has_role('admin_it'::text)) AND (status = 'open'::text))) with check ((status = 'open'::text));
create policy "tạo dự án" on public.projects as PERMISSIVE for INSERT to authenticated with check (((has_role('kinh_doanh'::text) OR has_role('admin_cnc'::text) OR has_role('admin_it'::text)) AND (status = 'open'::text)));
create policy "xem dự án" on public.projects as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa PO" on public.purchase_orders as PERMISSIVE for UPDATE to authenticated using ((has_role('mua_hang'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = purchase_orders.order_id) AND (o.nvl_status = 'mua_hang'::text)))))) with check (true);
create policy "xem PO" on public.purchase_orders as PERMISSIVE for SELECT to authenticated using ((has_role('mua_hang'::text) OR has_role('ke_hoach'::text) OR has_role('duyet'::text) OR has_role('admin_cnc'::text) OR has_role('xem'::text)));
create policy "xem QC TP" on public.qc_finished as PERMISSIVE for SELECT to authenticated using (true);
create policy ratings_read on public.ratings as PERMISSIVE for SELECT to authenticated using (((ratee = app_uid()) OR (rater = app_uid()) OR has_role('admin_it'::text)));
create policy "sửa dòng F4" on public.receipt_lines as PERMISSIVE for UPDATE to authenticated using ((has_role('kho_qc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = receipt_lines.order_id) AND (o.nvl_status = 'nhap_kho'::text)))))) with check (true);
create policy "xem dòng F4" on public.receipt_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F4" on public.receipts as PERMISSIVE for UPDATE to authenticated using ((has_role('kho_qc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = receipts.order_id) AND (o.nvl_status = 'nhap_kho'::text)))))) with check (true);
create policy "xem F4" on public.receipts as PERMISSIVE for SELECT to authenticated using (true);
create policy sc_read on public.step_checks as PERMISSIVE for SELECT to authenticated using (true);
create policy "sc_write · sửa" on public.step_checks as PERMISSIVE for UPDATE to authenticated using (is_adm()) with check (is_adm());
create policy "sc_write · thêm" on public.step_checks as PERMISSIVE for INSERT to authenticated with check (is_adm());
create policy "sc_write · xoá" on public.step_checks as PERMISSIVE for DELETE to authenticated using (is_adm());
create policy sd_read on public.step_defaults as PERMISSIVE for SELECT to authenticated using (true);
create policy sd_upd on public.step_defaults as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy step_guides_read on public.step_guides as PERMISSIVE for SELECT to authenticated using (true);
create policy "xem sổ kho" on public.stock_moves as PERMISSIVE for SELECT to authenticated using (true);
create policy ucr_read on public.user_co_roles as PERMISSIVE for SELECT to authenticated using (((user_id = auth.uid()) OR (user_id = app_uid()) OR has_role('admin_it'::text)));
create policy ucr_write on public.user_co_roles as PERMISSIVE for ALL to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy wfa_r on public.wf_approvals as PERMISSIVE for SELECT to authenticated using (true);
create policy wfe_r on public.wf_events as PERMISSIVE for SELECT to authenticated using (true);
create policy wfi_r on public.wf_instances as PERMISSIVE for SELECT to authenticated using (true);
create policy wfp_r on public.wf_processes as PERMISSIVE for SELECT to authenticated using (true);
create policy wft_r on public.wf_tasks as PERMISSIVE for SELECT to authenticated using (true);
create policy wfv_r on public.wf_versions as PERMISSIVE for SELECT to authenticated using (true);
create policy "không đọc bộ đếm LGC" on public.wo_counters as PERMISSIVE for SELECT to authenticated using (false);
create policy wg_ins on public.work_groups as PERMISSIVE for INSERT to authenticated with check (has_role('admin_it'::text));
create policy wg_read on public.work_groups as PERMISSIVE for SELECT to authenticated using (true);
create policy wg_upd on public.work_groups as PERMISSIVE for UPDATE to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy "xem dòng F5" on public.work_order_lines as PERMISSIVE for SELECT to authenticated using (true);
create policy "sửa F5" on public.work_orders as PERMISSIVE for UPDATE to authenticated using ((has_role('admin_cnc'::text) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = work_orders.order_id) AND (o.gc_status = 'lap_lgc'::text)))))) with check (true);
create policy "xem F5" on public.work_orders as PERMISSIVE for SELECT to authenticated using (true);
create policy zalo_groups_adm on public.zalo_groups as PERMISSIVE for ALL to authenticated using (has_role('admin_it'::text)) with check (has_role('admin_it'::text));
create policy zalo_raw_admin on public.zalo_raw as PERMISSIVE for SELECT to authenticated using (is_real_admin());
create policy "IT xoá file" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'files'::text) AND has_role('admin_it'::text)));
create policy "tải file" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'files'::text));
create policy "đọc file" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'files'::text) AND file_visible(name)));

-- ===== storage buckets =====
insert into storage.buckets(id, name, public) values ('files', 'files', f) on conflict (id) do nothing;

-- ===== cron =====
select cron.schedule('daily-report-8am', '0 1 * * *', 'select public.send_daily_report()');
select cron.schedule('sla-scan', '7 * * * *', 'select public.sla_scan()');
select cron.schedule('wf_remind', '*/15 * * * *', 'select public.wf_remind()');
select cron.schedule('zalo-out-resolve', '*/5 * * * *', 'select public._zalo_out_resolve()');
