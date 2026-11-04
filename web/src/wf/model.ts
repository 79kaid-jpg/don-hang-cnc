/** Trình tạo quy trình (thử nghiệm) – mô hình dữ liệu. Định nghĩa quy trình là JSON; engine SQL (wf_*) đọc JSON này. */
import { sb } from '../lib/supabase';

export type Assignee = { type: 'user' | 'group' | 'role'; id: string };
export type StepKind = 'lap' | 'kiem_tra' | 'duyet' | 'ky';
export type Step = {
  id: string; name: string; kind: StepKind; lane: string; assignee: Assignee;
  sla_hours?: number; checklist?: string[]; allow_back?: boolean; allow_fail?: boolean; require_note?: boolean; guide?: string;
};
export type Lane = { id: string; name: string };
export type Def = { lanes: Lane[]; steps: Step[] };
export type Process = { id: string; code: string; name: string; description: string; category: string; is_template: boolean; created_at: string };
export type Version = { id: string; process_id: string; version: number; status: 'nhap' | 'phat_hanh' | 'luu_tru'; def: Def; updated_at: string; published_at: string | null };
export type Instance = { id: string; version_id: string; title: string; status: 'dang_chay' | 'hoan_tat' | 'fail' | 'huy'; is_test: boolean; step_idx: number; started_by: string; started_at: string; done_at: string | null };
export type Task = { id: string; instance_id: string; step_id: string; step_name: string; status: 'cho' | 'xong' | 'tra_lai' | 'fail' | 'huy'; due_at: string | null; checklist: Record<string, boolean>; done_by: string | null; note: string; created_at: string; done_at: string | null };
export type MyTask = { task_id: string; instance_id: string; title: string; process_name: string; step_name: string; due_at: string | null; is_test: boolean; created_at: string };

export const KIND: Record<StepKind, { t: string; c: string }> = {
  lap: { t: 'Lập', c: 'k-lap' }, kiem_tra: { t: 'Kiểm tra', c: 'k-kt' }, duyet: { t: 'Duyệt', c: 'k-duyet' }, ky: { t: 'Ký', c: 'k-ky' }
};
export const VSTATUS: Record<Version['status'], string> = { nhap: 'Bản nháp', phat_hanh: 'Đã phát hành', luu_tru: 'Lưu trữ' };
export const ISTATUS: Record<Instance['status'], string> = { dang_chay: 'Đang chạy', hoan_tat: 'Hoàn tất', fail: 'Fail', huy: 'Đã huỷ' };
export const TSTATUS: Record<Task['status'], string> = { cho: 'Đang chờ', xong: 'Đã xong', tra_lai: 'Trả lại', fail: 'Fail', huy: 'Huỷ' };
export const ROLE_LABEL: Record<string, string> = {
  admin_cnc: 'Admin CNC', kinh_doanh: 'Kinh doanh', ky_thuat: 'Kỹ thuật', kiem_tra_f1: 'Kiểm tra', duyet: 'Duyệt', ipc: 'IPC',
  kho_qc: 'Kho / QC', ke_hoach: 'Kế hoạch', mua_hang: 'Mua hàng', admin_it: 'IT', xem: 'Chỉ xem'
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
    if (!s.assignee?.id) e.push({ step: s.id, msg: `${n}${s.name ? ' (' + s.name + ')' : ''} chưa có người làm` });
    if (seen.has(s.id)) e.push({ step: s.id, msg: `${n} trùng mã` });
    if (s.lane && !lanes.has(s.lane)) e.push({ step: s.id, msg: `${n} thuộc làn đã xoá` });
    if (i === 0 && s.allow_back) e.push({ step: s.id, msg: 'Bước đầu tiên không thể trả lại' });
    seen.add(s.id);
  });
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
  if (!a?.id) return 'Chưa chọn người làm';
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
