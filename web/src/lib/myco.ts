import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { useAuth } from './auth';

export type Co = 'PN' | 'IPC' | 'HW';
export const CO_NAME: Record<Co, string> = { PN: 'Phương Nam CNC', IPC: 'IPC', HW: 'Hanwa' };
const UNIT: Record<string, Co> = { CNC: 'PN', PN: 'PN', IPC: 'IPC', HANWA: 'HW', HW: 'HW' };
const get = () => { try { return localStorage.getItem('view-co') as Co | null; } catch { return null; } };
const subs = new Set<() => void>();
export const setViewCo = (c: Co | null) => { try { if (c) localStorage.setItem('view-co', c); else localStorage.removeItem('view-co'); } catch { /* */ } subs.forEach((f) => f()); };

/** Công ty của người đang xem (theo Đơn vị). Admin/IT chọn được công ty để xem (lưu trên máy). */
export function useMyCo(): { co: Co; own: Co | null; canSwitch: boolean; allowed: Co[]; all: boolean } {
  const { me, can } = useAuth(); const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const own = UNIT[(me?.unit ?? '').toUpperCase()] ?? null;
  const cos = useMyCos(me?.id);
  const all = can('admin_it') || !own;            // admin / tổng giám đốc: mọi công ty
  const canSwitch = all || cos.length > 1;          // kiêm nhiệm ≥ 2 công ty: đổi trong các công ty của mình
  const allowed: Co[] = all ? ['PN', 'IPC', 'HW'] : (cos.length ? cos : own ? [own] : []);
  const g = get(); const co = (canSwitch && g && allowed.includes(g) ? g : null) ?? own ?? allowed[0] ?? 'PN';
  return { co, own, canSwitch, allowed, all };
}

/** Công ty người dùng tham gia (Đơn vị + các bước được giao ở công ty khác) */
let cosCache: { id: string; v: Co[] } | null = null; const cosSubs = new Set<() => void>();
function useMyCos(id?: string): Co[] {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); cosSubs.add(f);
    if (id && cosCache?.id !== id) { cosCache = { id, v: [] }; sb.rpc('my_cos').then(({ data }) => { cosCache = { id, v: ((data as Co[]) ?? []) }; cosSubs.forEach((x) => x()); }); }
    return () => { cosSubs.delete(f); }; }, [id]);
  return id && cosCache?.id === id ? cosCache.v : [];
}

type Row = { id: string; company: Co; code: string; order_id: string | null; batch_id: string | null; project_id: string | null };
let rows: Row[] | null = null; let inflight: Promise<void> | null = null; const rsubs = new Set<() => void>();
export const reloadCoIdx = () => (inflight = Promise.resolve(sb.from('co_orders').select('id, company, code, order_id, batch_id, project_id').then(({ data }) => { rows = (data as Row[]) ?? []; rsubs.forEach((f) => f()); })).then(() => { inflight = null; }));
/** Chỉ mục mã đơn theo công ty: codeOf(order, batch?, co) */
export function useCoIdx() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((x) => x + 1); rsubs.add(f); if (!rows && !inflight) reloadCoIdx(); return () => { rsubs.delete(f); }; }, []);
  const codeOf = (order: string | undefined, co: Co, batch?: string) => { if (!rows || !order) return undefined;
    const m = rows.filter((r) => r.order_id === order && r.company === co && (!batch || r.batch_id === batch));
    return m.length ? m.map((r) => r.code).join(', ') : null; };
  const allOf = (order: string | undefined) => (rows ?? []).filter((r) => r.order_id === order);
  const match = (q: string) => (rows ?? []).filter((r) => r.code.toLowerCase().includes(q.toLowerCase()) && r.order_id).map((r) => r.order_id as string);
  return { ready: !!rows, codeOf, match, allOf, text: (order: string) => (rows ?? []).filter((r) => r.order_id === order).map((r) => r.code).join(' ') };
}

/** Mã XNĐH của phiếu (công ty đang làm → công ty khác của XNĐH → mã nội bộ). Dùng cho tên file, tiêu đề in. */
export function docCode(o: { id: string; code: string }, b: { id: string }, company: string): string {
  if (!rows && !inflight) reloadCoIdx();
  const m = (rows ?? []).filter((r) => r.batch_id === b.id);
  return (m.find((r) => r.company === company) ?? m[m.length - 1])?.code ?? o.code;
}
/** Tên file an toàn từ mã (đổi / thành -) */
export const codeFile = (c: string) => c.replace(/\//g, '-');

/** Phạm vi xem dùng chung toàn app: Tất cả hoặc 1 công ty (admin / người không thuộc công ty nào mới đổi được) */
export type Scope = 'ALL' | Co;
const getScope = (): Scope | null => { try { return localStorage.getItem('scope-co') as Scope | null; } catch { return null; } };
export const setScope = (c: Scope) => { try { localStorage.setItem('scope-co', c); } catch { /* */ } if (c !== 'ALL') setViewCo(c); else subs.forEach((f) => f()); };
export function useScope(): { scope: Scope; canSwitch: boolean; own: Co | null; options: Scope[] } {
  const { own, canSwitch, allowed, all } = useMyCo();
  const options: Scope[] = all ? ['ALL', 'PN', 'IPC', 'HW'] : allowed;
  const g = getScope(); const scope: Scope = canSwitch && g && options.includes(g) ? g : (all ? 'ALL' : own ?? allowed[0] ?? 'ALL');
  return { scope, canSwitch, own, options };
}
export const SCOPE_LABEL: Record<Scope, string> = { ALL: 'Tất cả', PN: 'PNC', IPC: 'IPC', HW: 'HAN' };
export const SCOPES: Scope[] = ['ALL', 'PN', 'IPC', 'HW'];
