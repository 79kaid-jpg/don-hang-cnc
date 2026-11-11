import { useEffect, useState } from 'react';
import { sb } from './supabase';

export type Company = { code: string; name: string; buyer: string | null; rule: string; allow_edit: boolean; ord: number };
export type CoOrder = { id: string; company: string; code: string; code_auto: string; edited: boolean; buyer: string | null; project_id: string | null; order_id: string | null; batch_id: string | null; doc_id: string | null; ref_id: string | null; created_at: string };
let cos: Company[] | null = null; const subs = new Set<(c: Company[]) => void>();
export async function reloadCompanies() { const { data } = await sb.from('companies').select('*').order('ord'); cos = (data as Company[]) ?? []; subs.forEach((f) => f(cos!)); return cos; }
export function useCompanies() {
  const [c, set] = useState<Company[] | null>(cos);
  useEffect(() => { subs.add(set); if (!cos) reloadCompanies(); return () => { subs.delete(set); }; }, []);
  return c;
}
