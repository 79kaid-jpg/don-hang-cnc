
-- ============ 1. View docs_v ============
-- KHÔNG bật security_invoker: bảng docs đã bị revoke SELECT với anon/authenticated (cố ý),
-- view definer là lớp che dữ liệu (doc_visible + _mask_h/_mask_t). Bật invoker → app vỡ toàn bộ
-- (permission denied for table docs), hoặc phải grant SELECT docs → lộ dữ liệu chưa che.
revoke all on public.docs_v from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.docs_v from authenticated;
-- (giữ: grant select on public.docs_v to authenticated)

-- ============ 2. Hàm: chặn PUBLIC/anon ============
-- Lưu ý: các lần "revoke ... from anon" trước KHÔNG có tác dụng vì EXECUTE còn cấp cho PUBLIC.
revoke execute on all functions in schema public from public, anon;
grant  execute on all functions in schema public to authenticated, service_role;
-- Hàm mới tạo sau này: không tự cấp cho anon/PUBLIC
alter default privileges in schema public revoke execute on functions from public, anon;

-- ============ 3. Hàm nội bộ: chặn authenticated gọi trực tiếp qua /rpc ============
-- Chỉ được gọi từ bên trong hàm SECURITY DEFINER khác, trigger hoặc pg_cron (chạy bằng postgres → không ảnh hưởng).
revoke execute on function
  -- gửi Zalo / gọi edge function (spam, giả mạo thông báo)
  public._wf_zalo_send(uuid[], text), public._zalo_step(uuid, text, text, uuid),
  public.send_daily_report(), public.step_reminders(), public.wf_remind(),
  -- ghi dữ liệu không kiểm quyền
  public._on_doc_decided(uuid, text, boolean), public._restart_approval(uuid, text, boolean),
  public.log_event(uuid, text, jsonb),
  public._wf_create_instance(uuid, text, boolean, uuid, uuid, jsonb),
  public._wf_enter(uuid, text, uuid, integer), public._wf_leave(uuid, jsonb, uuid, integer),
  public._wf_settle(uuid), public._wf_on_done(uuid), public._wf_fail(uuid, text),
  public._wf_cancel_open(uuid, uuid), public._wf_open_task(uuid, jsonb),
  public._wf_open_task2(uuid, jsonb, uuid, text), public._wf_open_level(uuid, integer, integer),
  public._wf_run_actions(uuid, jsonb),
  -- đọc dữ liệu tổng hợp / của người khác
  public.daily_report_text(), public.perf_points(uuid), public.perf_ticket_days(uuid),
  public._wf_ctx(uuid), public._wf_people(jsonb), public._wf_people_i(jsonb, uuid),
  public._order(uuid), public._stock(text, numeric), public._check_dk4(uuid), public.checklist_missing(uuid, text),
  public._fin_co(text), public._is_acting(), public._order_is_sample(uuid)
from authenticated;

-- Trigger function: không gọi được qua RPC (Postgres báo "trigger functions can only be called as triggers"),
-- revoke chỉ để dọn cảnh báo; trigger vẫn chạy bình thường.
revoke execute on function
  public._act_guard_batches(), public._act_guard_docs(), public._act_guard_orders(), public._checklist_gate(),
  public._rec_secret(), public._wf_appr_zalo(), public._wf_guard_required(), public._wf_tasks_zalo(),
  public.audit_row(), public.docs_turn_msg(), public.docs_zalo(), public.fill_acting_as(), public.guard_checklist(),
  public.handle_new_user(), public.order_steps_notify(), public.qt0_done_zalo(), public.set_order_code(),
  public.track_steps(), public.zalo_notify(), public._chain_same_co(), public._wf_guard_deleted(),
  public.docs_clear_assignee(), public.guard_hl(), public.guard_mpl(), public.guard_order_status(),
  public.guard_order_steps(), public.guard_profile(), public.guard_rl(), public.orders_req_check()
from authenticated;

-- ============ 4. search_path cho 31 hàm (đều SECURITY INVOKER, hàm tính toán thuần) ============
alter function public._doc_value(docs, text) set search_path = public;
alter function public._flow(text) set search_path = public;
alter function public._jarr_len(jsonb) set search_path = public;
alter function public._lv_match(approval_levels, docs) set search_path = public;
alter function public._mask_h(jsonb, text[]) set search_path = public;
alter function public._mask_t(jsonb, text[]) set search_path = public;
alter function public._merge_hidden(jsonb, jsonb, text[]) set search_path = public;
alter function public._role_of(text, text) set search_path = public;
alter function public._row_ids(jsonb) set search_path = public;
alter function public._secret_system(text) set search_path = public;
alter function public._step_rank(text) set search_path = public;
alter function public._steps(text, text, text, text) set search_path = public;
alter function public._tol(numeric) set search_path = public;
alter function public._wf_any(jsonb) set search_path = public;
alter function public._wf_filled(jsonb) set search_path = public;
alter function public._wf_guard_deleted() set search_path = public;
alter function public._wf_has_appr(jsonb) set search_path = public;
alter function public._wf_idx(jsonb, text) set search_path = public;
alter function public._wf_items(jsonb) set search_path = public;
alter function public._wf_node(jsonb, text) set search_path = public;
alter function public._wf_num(jsonb) set search_path = public;
alter function public._wf_pick(jsonb, jsonb, jsonb) set search_path = public;
alter function public._wf_required_missing(jsonb, jsonb, jsonb) set search_path = public;
alter function public._wf_route(jsonb, integer, jsonb) set search_path = public;
alter function public._wf_test(jsonb, jsonb) set search_path = public;
alter function public._wf_type(jsonb) set search_path = public;
alter function public._wf_val(jsonb, text) set search_path = public;
alter function public.docs_clear_assignee() set search_path = public;
alter function public.guard_order_steps() set search_path = public;
alter function public.wf_step(jsonb, integer) set search_path = public;
alter function public.wf_validate(jsonb) set search_path = public;


-- Sửa: grant ở trên đã mở lại các hàm vốn đã khoá với authenticated → khoá lại
revoke execute on function
  public._doc_line(uuid), public._reply(uuid, uuid, text, text), public._req_check(uuid), public._short_code(uuid),
  public._with_deleg(uuid[]), public._zsend(uuid[], text), public.doc_holders(uuid), public.sla_scan(),
  public.zalo_reply(text, text), public._set_in_fn()
from authenticated;
