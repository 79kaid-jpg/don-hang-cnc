/** Trình tạo quy trình (thử nghiệm) – mô hình dữ liệu. Định nghĩa quy trình là JSON; engine SQL (wf_*) đọc JSON này. */
import { sb } from '../lib/supabase';

export type Assignee = { type: 'user' | 'group' | 'role'; id: string };
export type StepKind = 'lap' | 'kiem_tra' | 'duyet' | 'ky';
export type CheckItem = { id: string; text: string; kind: 'check' | 'file' };
export type Step = {
  id: string; name: string; kind: StepKind; lane: string; assignee: Assignee;
  /** Người theo dõi: thấy việc ở bước này. Người quản trị giai đoạn: sửa nội dung, phân công / đổi người làm */
  watchers?: Assignee[]; managers?: Assignee[];
  sla_hours?: number; checklist?: (string | CheckItem)[]; perms?: Record<string, Perm>;
  /** Rẽ nhánh: xét lần lượt, khớp đầu tiên thì sang goto. next = bước mặc định ('' = bước kế, '__end' = kết thúc) */
  routes?: Route[]; next?: string;
  /** Luồng duyệt gắn vào bước: các cấp chạy nối tiếp */
  approval?: Approval; allow_back?: boolean; allow_fail?: boolean; require_note?: boolean; guide?: string;
};
export type Lane = { id: string; name: string };
export type Op = 'gt' | 'ge' | 'lt' | 'le' | 'eq' | 'ne' | 'contains' | 'empty' | 'filled';
export type Route = { id: string; field: string; op: Op; value?: string; goto: string };
export const OPS: Record<Op, string> = { gt: 'lớn hơn', ge: 'từ (≥)', lt: 'nhỏ hơn', le: 'đến (≤)', eq: 'bằng', ne: 'khác', contains: 'có chứa', empty: 'để trống', filled: 'đã nhập' };
export const END = '__end';
export type ApprLevel = { id: string; name: string; approvers: Assignee[]; rule: 'all' | 'any' | 'min'; min?: number; sla_hours?: number; when?: { field: string; op: Op; value?: string } };
export type Approval = { levels: ApprLevel[]; on_reject: 'restart' | 'back' | 'fail' };
export const RULE: Record<ApprLevel['rule'], string> = { all: 'Tất cả phải đồng ý', any: 'Một người đồng ý là đạt', min: 'Tối thiểu N người đồng ý' };
export const ON_REJECT: Record<Approval['on_reject'], string> = { restart: 'Trả về người làm bước sửa, rồi duyệt lại từ cấp 1', back: 'Trả về bước trước', fail: 'Dừng quy trình (Fail)' };
export type ApprRow = { id: string; task_id: string; round: number; level: number; level_id: string; level_name: string; approver: string; status: 'cho' | 'dong_y' | 'tu_choi' | 'bo_qua'; note: string; due_at: string | null; created_at: string; decided_at: string | null };
export const hasAppr = (s?: Step) => !!s?.approval?.levels?.length;
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'table';
export type Column = { id: string; label: string; type: 'text' | 'number'; formula?: string; sum?: boolean };
export type Field = { id: string; label: string; type: FieldType; options?: string[]; columns?: Column[]; help?: string };
export type Perm = 'hide' | 'view' | 'edit' | 'required';
export const PERM: Record<Perm, string> = { hide: 'Ẩn', view: 'Xem', edit: 'Sửa', required: 'Bắt buộc' };
export const FTYPE: Record<FieldType, string> = { text: 'Chữ ngắn', textarea: 'Đoạn văn', number: 'Số', date: 'Ngày', select: 'Chọn một', table: 'Bảng' };
export type Def = { lanes: Lane[]; steps: Step[]; fields?: Field[] };
export type Process = { id: string; code: string; name: string; description: string; category: string; is_template: boolean; created_at: string; created_by?: string; deleted_at?: string | null };
export type Version = { id: string; process_id: string; version: number; status: 'nhap' | 'phat_hanh' | 'luu_tru'; def: Def; updated_at: string; published_at: string | null };
export type Instance = { id: string; version_id: string; title: string; status: 'dang_chay' | 'hoan_tat' | 'fail' | 'huy'; is_test: boolean; step_idx: number; started_by: string; started_at: string; done_at: string | null };
export type Task = { id: string; instance_id: string; step_id: string; step_name: string; status: 'cho' | 'xong' | 'tra_lai' | 'fail' | 'huy'; assigned_to: string | null; appr_state: 'dang_duyet' | 'cho_sua' | null;
  files: { item: string; name: string; path: string; at: string; by: string }[]; due_at: string | null; checklist: Record<string, boolean>; done_by: string | null; note: string; created_at: string; done_at: string | null };
export type Vai = 'lam' | 'phan_cong' | 'quan_tri' | 'theo_doi' | 'duyet';
export type MyTask = { task_id: string; instance_id: string; title: string; process_name: string; step_name: string; due_at: string | null; is_test: boolean; created_at: string; assigned_to: string | null; vai: Vai };
export const VAI: Record<Vai, string> = { lam: 'Tôi làm', phan_cong: 'Cần phân công', quan_tri: 'Tôi quản trị', theo_doi: 'Tôi theo dõi', duyet: 'Chờ tôi duyệt' };
/** Mục checklist: hỗ trợ dạng chuỗi cũ */
export const items = (s: Step): CheckItem[] => (s.checklist ?? []).map((c) => typeof c === 'string' ? { id: c, text: c, kind: 'check' } : c);

export const KIND: Record<StepKind, { t: string; c: string }> = {
  lap: { t: 'Lập', c: 'k-lap' }, kiem_tra: { t: 'Kiểm tra', c: 'k-kt' }, duyet: { t: 'Duyệt', c: 'k-duyet' }, ky: { t: 'Ký', c: 'k-ky' }
};
export const VSTATUS: Record<Version['status'], string> = { nhap: 'Bản nháp', phat_hanh: 'Đã phát hành', luu_tru: 'Lưu trữ' };
export const ISTATUS: Record<Instance['status'], string> = { dang_chay: 'Đang chạy', hoan_tat: 'Hoàn tất', fail: 'Fail', huy: 'Đã huỷ' };
export const TSTATUS: Record<Task['status'], string> = { cho: 'Đang chờ', xong: 'Đã xong', tra_lai: 'Trả lại', fail: 'Fail', huy: 'Huỷ' };
export const ROLE_LABEL: Record<string, string> = {
  admin_cnc: 'Admin CNC', kinh_doanh: 'Kinh doanh', ky_thuat: 'Kỹ thuật', kiem_tra_f1: 'Kiểm tra', duyet: 'Duyệt', ipc: 'IPC',
  kho_qc: 'Kho / QC', ke_hoach: 'Kế hoạch', mua_hang: 'Mua hàng', thiet_ke_qt: 'Thiết kế quy trình', admin_it: 'IT', xem: 'Chỉ xem'
};

export const uid = (p = 's') => p + Math.random().toString(36).slice(2, 8);
export const newStep = (lane = ''): Step => ({ id: uid(), name: '', kind: 'lap', lane, assignee: { type: 'user', id: '' }, sla_hours: 8, allow_back: true });
export const emptyDef = (): Def => ({ lanes: [{ id: 'l1', name: 'Phòng ban 1' }], steps: [] });

/** Kiểm tra lỗi phía trình duyệt – cùng luật với wf_validate (SQL) để báo ngay khi đang sửa */
export function validate(d: Def): { step?: string; msg: string }[] {
  const e: { step?: string; msg: string }[] = [];
  if (!d.steps.length) e.push({ msg: 'Quy trình chưa có bước nào' });
  const seen = new Set<string>(); const lanes = new Set(d.lanes.map((l) => l.id));
  d.steps.forEach((s, i) => {
    const n = `Bước ${i + 1}`;
    if (!s.name.trim()) e.push({ step: s.id, msg: `${n} chưa có tên` });
    if (!s.assignee?.id && !s.managers?.length) e.push({ step: s.id, msg: `${n}${s.name ? ' (' + s.name + ')' : ''} chưa có người làm hoặc người quản trị để phân công` });
    if (i === 0 && !s.assignee?.id) e.push({ step: s.id, msg: 'Bước đầu tiên phải có người làm' });
    if (items(s).some((c) => !c.text.trim())) e.push({ step: s.id, msg: `${n} có mục checklist trống` });
    if (seen.has(s.id)) e.push({ step: s.id, msg: `${n} trùng mã` });
    if (s.lane && !lanes.has(s.lane)) e.push({ step: s.id, msg: `${n} thuộc làn đã xoá` });
    if (i === 0 && s.allow_back) e.push({ step: s.id, msg: 'Bước đầu tiên không thể trả lại' });
    seen.add(s.id);
  });
  const ids = new Set(d.steps.map((s) => s.id));
  d.steps.forEach((s, i) => {
    if (s.next && s.next !== END && !ids.has(s.next)) e.push({ step: s.id, msg: `Bước ${i + 1}: bước mặc định tiếp theo đã bị xoá` });
    (s.approval?.levels ?? []).forEach((l, k) => { if (!l.approvers?.length) e.push({ step: s.id, msg: `Bước ${i + 1}: cấp duyệt ${k + 1}${l.name ? ' (' + l.name + ')' : ''} chưa có người duyệt` }); });
    (s.routes ?? []).forEach((r) => {
      if (!r.field || !r.goto) e.push({ step: s.id, msg: `Bước ${i + 1}: nhánh điều kiện chưa chọn trường hoặc bước đến` });
      else if (r.goto !== END && !ids.has(r.goto)) e.push({ step: s.id, msg: `Bước ${i + 1}: nhánh trỏ tới bước đã bị xoá` });
    });
  });
  // Nhánh cụt: bước không thể tới được từ bước đầu
  if (d.steps.length) {
    const seen = new Set<number>([0]); const q = [0];
    while (q.length) { const i = q.shift()!; for (const t of targets(d, i)) { const j = d.steps.findIndex((x) => x.id === t.to); if (j >= 0 && !seen.has(j)) { seen.add(j); q.push(j); } } }
    d.steps.forEach((s, i) => { if (!seen.has(i)) e.push({ step: s.id, msg: `Bước ${i + 1}${s.name ? ' (' + s.name + ')' : ''} không có đường nào đi tới` }); });
  }
  d.lanes.forEach((l) => { if (!d.steps.some((s) => s.lane === l.id)) e.push({ msg: `Làn "${l.name}" chưa có bước nào` }); });
  return e;
}

// ── Danh bạ người làm (dùng chung cho trình sửa + màn hình chạy) ──
export type Directory = { users: { id: string; full_name: string; unit: string; roles: string[] }[]; groups: { id: string; name: string }[]; roles: string[] };
let dirCache: Promise<Directory> | null = null;
export function loadDirectory(): Promise<Directory> {
  dirCache ??= Promise.all([
    sb.from('profiles').select('id, full_name, unit, roles').eq('active', true).order('full_name'),
    sb.from('work_groups').select('id, name').eq('active', true).order('name')
  ]).then(([u, g]) => {
    const users = (u.data ?? []) as Directory['users'];
    const roles = [...new Set(users.flatMap((x) => x.roles))].filter((r) => r !== 'admin_it').sort();
    return { users, groups: (g.data ?? []) as Directory['groups'], roles };
  });
  return dirCache;
}
export function who(a: Assignee | undefined, dir: Directory | null): string {
  if (!a?.id) return 'Người quản trị phân công';
  if (!dir) return '…';
  if (a.type === 'user') return dir.users.find((u) => u.id === a.id)?.full_name ?? 'Người đã nghỉ';
  if (a.type === 'group') return 'Nhóm ' + (dir.groups.find((g) => g.id === a.id)?.name ?? '?');
  return 'Vai trò ' + (ROLE_LABEL[a.id] ?? a.id);
}
export const userName = (id: string | null, dir: Directory | null) => (id && dir?.users.find((u) => u.id === id)?.full_name) || '—';
export const fmtDT = (s: string | null) => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
export function slaLeft(due: string | null): { text: string; late: boolean } | null {
  if (!due) return null;
  const h = (new Date(due).getTime() - Date.now()) / 36e5;
  if (h < 0) return { text: `Trễ ${Math.ceil(-h)} giờ`, late: true };
  return { text: h < 1 ? `Còn ${Math.max(1, Math.round(h * 60))} phút` : `Còn ${Math.round(h)} giờ`, late: false };
}

/** Công thức an toàn: chỉ số, mã cột, + - * / ( ). Không dùng eval. */
export function calc(expr: string, row: Record<string, unknown>): number | null {
  const tk = expr.match(/\d+(?:[.,]\d+)?|[A-Za-z_][\w]*|[-+*/()]/g); if (!tk) return null;
  let i = 0;
  const num = (v: unknown) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return String(v ?? '') === '' || !isFinite(x) ? NaN : x; };
  const atom = (): number => {
    const t = tk[i++];
    if (t === '(') { const v = sum(); i++; return v; }
    if (t === '-') return -atom();
    if (/^\d/.test(t)) return Number(t.replace(',', '.'));
    return num(row[t]);
  };
  const prod = (): number => { let v = atom(); while (tk[i] === '*' || tk[i] === '/') { const o = tk[i++], r = atom(); v = o === '*' ? v * r : v / r; } return v; };
  const sum = (): number => { let v = prod(); while (tk[i] === '+' || tk[i] === '-') { const o = tk[i++], r = prod(); v = o === '+' ? v + r : v - r; } return v; };
  try { const v = sum(); return isFinite(v) ? Math.round(v * 1000) / 1000 : null; } catch { return null; }
}
/** Tính các cột công thức theo thứ tự (cột sau dùng được kết quả cột trước) */
export function computeRow(cols: Column[], r: Record<string, unknown>) {
  const o: Record<string, unknown> = { ...r };
  for (const c of cols) if (c.formula) o[c.id] = calc(c.formula, o);
  return o;
}

/** Các mũi tên đi ra từ bước i: nhánh điều kiện + đường mặc định */
export function targets(d: Def, i: number): { to: string; label?: string; branch?: boolean }[] {
  const s = d.steps[i]; const out: { to: string; label?: string; branch?: boolean }[] = [];
  for (const r of s.routes ?? []) if (r.goto) out.push({ to: r.goto, label: routeText(d, r), branch: true });
  out.push({ to: s.next || (d.steps[i + 1]?.id ?? END), label: s.routes?.length ? 'còn lại' : undefined });
  return out;
}
/** Danh sách trường dùng được trong điều kiện: trường thường + tổng cột số của bảng */
export function condFields(d: Def): { id: string; label: string }[] {
  const o: { id: string; label: string }[] = [];
  for (const f of d.fields ?? []) {
    if (f.type === 'table') { for (const c of f.columns ?? []) if (c.type === 'number') o.push({ id: f.id + '.' + c.id, label: `${f.label}: tổng ${c.label}` }); }
    else o.push({ id: f.id, label: f.label || f.id });
  }
  return o;
}
export function routeText(d: Def, r: Route) {
  const f = condFields(d).find((x) => x.id === r.field)?.label ?? r.field;
  return `${f} ${OPS[r.op]}${r.op === 'empty' || r.op === 'filled' ? '' : ' ' + (r.value ?? '')}`;
}
