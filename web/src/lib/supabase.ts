import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
if (!url || !key) console.error('Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
export const sb = createClient(url, key);

export type Profile = { id: string; full_name: string; unit: string; roles: string[]; active: boolean; impersonating?: string | null; zalo_chat_id?: string | null; zalo_name?: string | null };
export type Customer = { id: string; code: string; name: string };
export type Order = {
  id: string; code: string; kh1_id: string | null; kh2_id: string | null; project: string; channel: string;
  contact: string; description: string; quote_due: string | null; due_date: string | null; extractor_id: string | null;
  supplement_note: string; status: string; f1_result: string; nvl_status: string; gc_status: string; gh_status: string;
  created_at: string;
};
export type Line = { id: string; order_id: string; line_no: number; product_code: string; material: string; thickness_mm: number;
  length_mm: number; width_mm: number; qty: number; area_m2: number; weight_kg: number; spec: string };
export type Approval = { id: string; order_id: string; doc_type: string; round: number; step_no: number; label: string;
  approver_id: string | null; status: string; note: string | null; due_at: string | null; decided_at: string | null; created_at: string };

/** Lỗi từ Postgres → câu tiếng Việt cho người dùng */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m.includes('row-level security')) return 'Bạn không có quyền sửa phiếu này ở bước hiện tại.';
  return m;
}

// Báo "đang xử lý" toàn cục cho mọi thao tác nghiệp vụ (rpc): thanh tiến trình + chặn bấm lặp
let pending = 0;
const emit = () => window.dispatchEvent(new CustomEvent('busy', { detail: pending > 0 }));
const origRpc = sb.rpc.bind(sb);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(sb as any).rpc = (...args: Parameters<typeof origRpc>) => {
  pending++; emit();
  const p = origRpc(...args);
  return p.then((r) => { pending--; emit(); return r; }, (e) => { pending--; emit(); throw e; });
};
