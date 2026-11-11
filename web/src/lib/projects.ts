import { useEffect, useState } from 'react';
import { sb } from './supabase';

export type Project = { id: string; code: string; name: string; end_customer_id: string | null; location: string | null; note: string | null; status: 'open' | 'closed'; created_at: string; closed_at: string | null };
let cache: Project[] | null = null; const subs = new Set<(p: Project[]) => void>();
export async function reloadProjects() { const { data } = await sb.from('projects').select('*').order('created_at', { ascending: false }); cache = (data as Project[]) ?? []; subs.forEach((f) => f(cache!)); return cache; }
/** Danh mục dự án (dùng chung, tải 1 lần) */
export function useProjects() {
  const [list, set] = useState<Project[] | null>(cache);
  useEffect(() => { subs.add(set); if (!cache) reloadProjects(); return () => { subs.delete(set); }; }, []);
  return list;
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
/** Gợi ý mã từ tên: chữ đầu mỗi từ, không dấu, viết hoa */
export const codeFromName = (n: string) => { const w = norm(n).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean); return (w.length === 1 ? w[0].slice(0, 4) : w.map((x) => x[0]).join('')).slice(0, 8); };
export const CODE_RE = /^[A-Z0-9]{2,12}$/;
