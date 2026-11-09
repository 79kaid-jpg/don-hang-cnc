import { useEffect, useState } from 'react';
import { sb } from './supabase';

/** Checklist theo bước: mẫu ở Quản trị (step_checks), bản chụp riêng từng hồ sơ ở docs.checklist[step] */
export type Level = 'req' | 'rec' | 'note';
export type CheckTpl = { id: string; proc: string; step: string; label: string; level: Level; ord: number; active: boolean };
export type CheckItem = { id: string; label: string; level: Level; done?: boolean; by?: string; at?: string; note?: string; custom?: boolean };
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
  const s = saved?.[step]; if (Array.isArray(s)) return s;
  return tpl.filter((t) => t.proc === proc && t.step === step).map((t) => ({ id: t.id, label: t.label, level: t.level }));
}
export const progress = (it: CheckItem[]) => ({ done: it.filter((x) => x.done).length, total: it.length, miss: it.filter((x) => x.level === 'req' && !x.done).length });
// Tải lại sau khi đăng nhập / đổi người (lần tải trước khi có phiên trả về rỗng do RLS)
sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'TOKEN_REFRESHED' || e === 'INITIAL_SESSION') loadChecks(true); });
