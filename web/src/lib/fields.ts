import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { HEADER, PROC_TABLES, TABLES, FLOW, type Col, type Company, type Proc } from './proc';

/** Trường dữ liệu QT0–QT3 cấu hình trong Quản trị → Trường dữ liệu (bảng proc_fields) */
export type Area = 'header' | 'col' | 'file' | 'table';
export type Perm = 'hide' | 'view' | 'edit' | 'required';
export type FType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'file' | 'person' | 'carrier';
export type FProc = Proc | 'F0';
export type FDef = { id?: string; proc: FProc; area: Area; tbl: string; key: string; label: string; type: FType; options: string[]; help: string;
  decimals: number | null; ord: number; active: boolean; sys: boolean; perms: Record<string, Record<string, Perm>>;
  /** Trường nhạy cảm: chỉ người được cấp mới xem (máy chủ che giá trị) */ restricted?: boolean; view_roles?: string[]; view_users?: string[]; view_approver?: boolean };

export const PERM_NAME: Record<Perm, string> = { hide: 'Ẩn', view: 'Xem', edit: 'Sửa', required: 'Bắt buộc' };
export const TYPE_NAME: Record<FType, string> = { text: 'Chữ', number: 'Số', date: 'Ngày', select: 'Danh sách chọn', textarea: 'Đoạn văn', file: 'Tệp', person: 'Người dùng', carrier: 'Đơn vị vận chuyển' };
/** Bước mà người làm được nhập liệu theo mặc định */
export const EDIT_STEPS: Record<Proc, string[]> = { QT0: ['tiep_nhan', 'boc_tach', 'tao_ds'], QT1: ['lap'], QT2: ['lap'], QT3: ['lap'] };
export const companiesOf = (p: Proc): Company[] => (p === 'QT0' ? ['PN'] : ['PN', 'IPC', 'HW']);
export const stepsOf = (p: Proc) => FLOW[p];

let store: FDef[] | null = null; let ver = 0; const subs = new Set<() => void>();
export async function loadFields() {
  const { data } = await sb.from('proc_fields').select('*').order('ord');
  // Chưa đăng nhập thì không đọc được cấu hình (trả rỗng) → giữ null để tải lại sau khi đăng nhập
  if (data && data.length) { store = data as FDef[]; ver++; subs.forEach((f) => f()); }
}
/** Dùng trong component để vẽ lại khi cấu hình đổi */
export function useFields() {
  const [, set] = useState(ver);
  useEffect(() => { const f = () => set(ver); subs.add(f); f(); /* bắt kịp nếu cấu hình đã tải xong trước khi đăng ký */ if (!store) loadFields(); return () => { subs.delete(f); }; }, []);
  return ver;
}

// Mặc định theo mã nguồn (khi chưa tải được cấu hình)
const defaults = (p: FProc): FDef[] => {
  if (p === 'F0') return [];
  const base = { proc: p, options: [] as string[], help: '', active: true, perms: {}, decimals: null as number | null };
  const out: FDef[] = [];
  HEADER[p].forEach(([k, l, t], i) => out.push({ ...base, area: 'header', tbl: '', key: k, label: l, type: t === 'num' ? 'number' : t === 'date' ? 'date' : 'text', ord: i, sys: false }));
  PROC_TABLES[p].forEach(([key, def]) => TABLES[def].cols.forEach((c, i) => out.push({ ...base, area: 'col', tbl: key, key: c.k, label: c.t, type: c.n ? 'number' : 'text', decimals: c.d ?? null, ord: i, sys: !!c.calc })));
  (p === 'QT0' ? [['ban_ve', 'Bản vẽ / tài liệu khách gửi'], ['excel', 'Excel bóc tách chi tiết']] : [['dinh_kem', 'File đính kèm']]).forEach(([k, l], i) =>
    out.push({ ...base, area: 'file', tbl: '', key: k, label: l, type: 'file', ord: i, sys: false }));
  return out;
};

export function allFields(p: FProc): FDef[] {
  const s = store?.filter((f) => f.proc === p);
  return (s && s.length ? s : defaults(p)).slice().sort((a, z) => a.ord - z.ord);
}
export const fieldsOf = (p: FProc, area: Area, tbl = '') => allFields(p).filter((f) => f.active && f.area === area && (area !== 'col' || f.tbl === tbl));

/** Quyền của trường ở bước `status` cho công ty `co` */
export function permOf(f: FDef, co: string, status: string, p: Proc): Perm {
  const st = status === 'duyet_them' || status === 'da_duyet' ? 'duyet' : status;
  const v = f.perms?.[co]?.[st];
  if (v) return status === 'da_duyet' && v !== 'hide' ? 'view' : v;
  return EDIT_STEPS[p].includes(st) ? 'edit' : 'view';
}
export const defaultPerm = (p: Proc, st: string): Perm => (EDIT_STEPS[p].includes(st) ? 'edit' : 'view');

/** Đầu phiếu dạng [khoá, nhãn, kiểu] – dùng cho in ấn / mẫu Excel */
export const hdrOf = (p: Proc): [string, string, string][] => fieldsOf(p, 'header').map((f) => [f.key, f.label, f.type]);

/** Cột bảng theo cấu hình, giữ công thức tự tính của mã nguồn */
export function colsOf(p: Proc, tbl: string): Col[] {
  const def = PROC_TABLES[p].find(([k]) => k === tbl)?.[1]; const src = def ? TABLES[def].cols : [];
  return fieldsOf(p, 'col', tbl).map((f) => { const c = src.find((x) => x.k === f.key);
    return { k: f.key, t: f.label, n: f.type === 'number', d: f.decimals ?? c?.d, w: c?.w ?? (f.type === 'number' ? 7 : 10), calc: f.sys ? c?.calc : undefined, g: c?.g, u: c?.u, info: c?.info }; });
}
export const tablesOf = (p: Proc) => PROC_TABLES[p].map(([key, def]) => ({ key, title: TABLES[def].t }));

export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'truong';

/** F0: Ẩn / Bắt buộc (một giá trị cho cả đơn) */
export const f0Perm = (f: FDef): Perm => (f.perms?.['*']?.['*'] as Perm) ?? 'edit';

// Tải lại cấu hình khi đăng nhập / đổi phiên
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION' || ev === 'TOKEN_REFRESHED') { if (!store) setTimeout(() => { loadFields(); }, 0); } });
