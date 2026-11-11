import { compareExcel, type XCheck } from './excelCheck';
import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { fieldsOf, permOf } from './fields';
import type { Proc } from './proc';

/** Checklist theo bước: mẫu ở Quản trị (step_checks), bản chụp riêng từng hồ sơ ở docs.checklist[step] */
export type Level = 'req' | 'rec' | 'note';
export type CheckTpl = { id: string; proc: string; step: string; label: string; level: Level; ord: number; active: boolean; auto?: string | null };
export type CheckItem = { id: string; label: string; level: Level; done?: boolean; by?: string; at?: string; note?: string; custom?: boolean; auto?: string | null };
export const LEVEL_NAME: Record<Level, string> = { req: 'Bắt buộc', rec: 'Khuyến nghị', note: 'Cần ghi chú' };

let cache: CheckTpl[] | null = null; let inflight: Promise<CheckTpl[]> | null = null; const subs = new Set<() => void>();
export function loadChecks(force = false): Promise<CheckTpl[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = Promise.resolve(sb.from('step_checks').select('*').eq('active', true).order('ord')).then(({ data }) => { const v = (data as CheckTpl[]) ?? []; cache = v.length ? v : null; inflight = null; if (!v.length) return v; subs.forEach((f) => f()); return v; });
  return inflight;
}
export function useChecks(): CheckTpl[] {
  const [v, setV] = useState<CheckTpl[]>(cache ?? []);
  useEffect(() => { const f = () => setV(cache ?? []); subs.add(f); loadChecks().then(f); return () => { subs.delete(f); }; }, []);
  return v;
}
/** Danh sách mục của một bước: bản đã lưu trong hồ sơ, không thì lấy từ mẫu */
export function itemsOf(tpl: CheckTpl[], proc: string, step: string, saved?: Record<string, CheckItem[]> | null): CheckItem[] {
  // Giống máy chủ (_ck_merge): mẫu hiện hành + trạng thái tick đã lưu + mục tự thêm (luôn Khuyến nghị / Cần ghi chú)
  const s = Array.isArray(saved?.[step]) ? saved![step] : [];
  const base = tpl.filter((t) => t.proc === proc && t.step === step).map((t) => { const o = s.find((x) => x.id === t.id);
    return { id: t.id, label: t.label, level: t.level, auto: t.auto ?? null, ...(o ? { done: o.done, by: o.by, at: o.at, note: o.note } : {}) } as CheckItem; });
  const own = s.filter((x) => x.custom && !tpl.some((t) => t.id === x.id)).map((x) => ({ ...x, level: (x.level === 'note' ? 'note' : 'rec') as Level }));
  if (!tpl.length && s.length) return s; // mẫu chưa tải xong
  return [...base, ...own];
}
export const progress = (it: CheckItem[]) => ({ done: it.filter((x) => x.done).length, total: it.length, miss: it.filter((x) => x.level === 'req' && !x.done).length });
// Tải lại sau khi đăng nhập / đổi người (lần tải trước khi có phiên trả về rỗng do RLS)
sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'TOKEN_REFRESHED' || e === 'INITIAL_SESSION') loadChecks(true); });

/** Tự kiểm tra: quy tắc dạng
 *  h:<trường>      ô thông tin đã nhập
 *  t:<bảng>        bảng có ít nhất 1 dòng
 *  c:<bảng>.<cột>  mọi dòng của bảng đã nhập cột này
 *  f:<loại file>   đã tải file loại này
 *  x:<loại file>   file Excel bóc tách hợp lệ và khớp danh sách tấm
 *  req             mọi trường bắt buộc của bước đã nhập (ô thông tin + file) */
type DocData = { header?: Record<string, string>; tables?: Record<string, Record<string, unknown>[]>; files?: { kind: string; check?: XCheck }[] };
const filled = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
export function evalAuto(rule: string, d: DocData, reqKeys: { h: string[]; f: string[] } = { h: [], f: [] }): boolean {
  const [k, a = ''] = [rule.slice(0, rule.indexOf(':') < 0 ? rule.length : rule.indexOf(':')), rule.split(':').slice(1).join(':')];
  if (k === 'h') return filled(d.header?.[a]);
  if (k === 't') return (d.tables?.[a] ?? []).length > 0;
  if (k === 'c') { const [tb, col] = a.split('.'); const rs = d.tables?.[tb] ?? []; return rs.length > 0 && rs.every((r) => filled(r[col])); }
  if (k === 'f') return (d.files ?? []).some((f) => f.kind === a);
  // x:<loại file> – file Excel đã kiểm và khớp danh sách tấm (ds)
  if (k === 'x') { const fs = (d.files ?? []).filter((f) => f.kind === a); return fs.length > 0 && fs.every((f) => f.check && compareExcel(f.check, d.tables?.ds ?? []).ok); }
  if (k === 'req') return reqKeys.h.every((x) => filled(d.header?.[x])) && reqKeys.f.every((x) => (d.files ?? []).some((f) => f.kind === x));
  return false;
}
/** Áp kết quả tự kiểm vào danh sách: tích khi đạt, bỏ tích nếu trước đó là tự tích mà giờ không đạt */
export function applyAuto(items: CheckItem[], d: DocData, reqKeys?: { h: string[]; f: string[] }, onlyTick = false): { items: CheckItem[]; changed: boolean } {
  let changed = false; const now = new Date().toISOString();
  const out = items.map((x) => { if (!x.auto) return x; const ok = evalAuto(x.auto, d, reqKeys);
    if (ok && !x.done) { changed = true; return { ...x, done: true, by: 'auto', at: now }; }
    if (!onlyTick && !ok && x.done && x.by === 'auto') { changed = true; return { ...x, done: false, by: undefined, at: undefined }; }
    return x; });
  return { items: out, changed };
}
export const AUTO_HINT = (rule: string) => rule === 'req' ? 'đủ trường bắt buộc' : rule.startsWith('x:') ? 'file Excel bóc tách khớp danh sách tấm' : rule.startsWith('h:') ? 'ô thông tin đã nhập' : rule.startsWith('t:') ? 'bảng có dữ liệu' : rule.startsWith('c:') ? 'cột đã nhập đủ' : rule.startsWith('f:') ? 'đã tải file' : '';
export const reqKeysOf = (proc: Proc, co: string, status: string) => ({
  h: fieldsOf(proc, 'header').filter((f) => permOf(f, co, status, proc) === 'required').map((f) => f.key),
  f: fieldsOf(proc, 'file').filter((f) => permOf(f, co, status, proc) === 'required').map((f) => f.key) });
/** Trước khi ký: cập nhật mục tự kiểm vào hồ sơ để máy chủ thấy đúng trạng thái */
export async function syncAuto(proc: Proc, d: { id: string; company: string; status: string; checklist?: Record<string, CheckItem[]> } & DocData): Promise<void> {
  const tpl = await loadChecks(); const cur = itemsOf(tpl, proc, d.status, d.checklist);
  const { items, changed } = applyAuto(cur, d, reqKeysOf(proc, d.company, d.status), true);
  if (changed) await sb.rpc('doc_check', { p_doc: d.id, p_step: d.status, p_items: items });
}
