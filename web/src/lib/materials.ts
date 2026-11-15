import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { setMaterials, type Material } from './proc';

let cache: Material[] | null = null; const subs = new Set<(m: Material[]) => void>();
export async function reloadMaterials() {
  const { data } = await sb.from('materials').select('*').order('ord'); cache = ((data as Material[]) ?? []).map((m) => ({ ...m, density: Number(m.density) }));
  setMaterials(cache); subs.forEach((f) => f(cache!)); return cache;
}
/** Danh mục vật liệu (tải 1 lần, dùng chung) */
export function useMaterials() {
  const [list, set] = useState<Material[] | null>(cache);
  useEffect(() => { subs.add(set); if (!cache) reloadMaterials(); return () => { subs.delete(set); }; }, []);
  return list;
}
