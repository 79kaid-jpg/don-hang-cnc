import { useEffect, useState } from 'react';
import { sb } from './supabase';

/** Hướng dẫn từng bước – một nguồn duy nhất (bảng step_guides), Admin sửa ở Quản trị → Hướng dẫn bước */
export type Guide = { key: string; title: string; purpose: string; todo: string; notes: string; links: string; ord: number; updated_by: string | null; updated_at: string; prev: Record<string, string> | null };

let cache: Guide[] | null = null; let inflight: Promise<Guide[]> | null = null; const subs = new Set<() => void>();
export function loadGuides(force = false): Promise<Guide[]> {
  if (cache && !force) return Promise.resolve(cache);
  if (inflight && !force) return inflight;
  inflight = Promise.resolve(sb.from('step_guides').select('*').order('ord').order('key')).then(({ data }) => {
    const v = (data as Guide[]) ?? []; inflight = null; cache = v.length ? v : null; subs.forEach((f) => f()); return v; });
  return inflight;
}
export function useGuides(): Guide[] {
  const [v, setV] = useState<Guide[]>(cache ?? []);
  useEffect(() => { const f = () => setV(cache ?? []); subs.add(f); loadGuides().then(f); return () => { subs.delete(f); }; }, []);
  return v;
}
sb.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN' || e === 'INITIAL_SESSION') loadGuides(true); });

/** Hướng dẫn cho bước: ưu tiên bản riêng của công ty (QT1.IPC.lap), không có thì bản chung (QT1.*.lap) */
export function guideFor(all: Guide[], proc: string, company: string | null | undefined, step: string): Guide | undefined {
  return (company ? all.find((g) => g.key === `${proc}.${company}.${step}`) : undefined) ?? all.find((g) => g.key === `${proc}.*.${step}`);
}
export const guideByKey = (all: Guide[], key: string) => all.find((g) => g.key === key);

/** Thay {cty}, {cty_sau}, {phieu}, {cap} trong nội dung */
export function fillVars(s: string, v: Record<string, string> = {}) { return s.replace(/\{(\w+)\}/g, (m, k) => v[k] ?? m); }
export const lines = (s: string) => s.split('\n').map((x) => x.replace(/^\s*[-•*\d.)]+\s*/, '').trim()).filter(Boolean);
export const adminGuideLink = (key: string) => '#/quan-tri?t=guide&k=' + encodeURIComponent(key);
