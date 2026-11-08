import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { stepOf, ROLE_OF, ROLE_NAME, type Batch, type Doc } from './proc';

type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null };
export type Holder = { who: string; what: string; since?: string; uid?: string | null };

/** Ai đang giữ hồ sơ: bước hiện tại → người/nhóm phụ trách (chain_people) */
export function useHolders() {
  const [cp, setCp] = useState<CP[]>([]); const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    sb.from('chain_people').select('proc, company, role, user_id, group_id').then(({ data }) => setCp((data as CP[]) ?? []));
    Promise.all([sb.from('profiles').select('id, full_name'), sb.from('work_groups').select('id, name')]).then(([a, b]) =>
      setNames(Object.fromEntries([...((a.data as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name]), ...((b.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])])));
  }, []);
  return (b: Batch, ds: Doc[]): Holder | null => {
    if (b.status !== 'dang_lam' && b.status !== 'cho_ky') return null;
    const st = stepOf(b, ds);
    const company = st.key === 'ky' ? 'PN' : st.company ?? 'PN';
    const role = st.key === 'ky' ? 'hoan_tat' : ROLE_OF[st.doc?.status ?? ''];
    if (!role) return null;
    const r = cp.find((c) => c.proc === b.proc && c.company === company && c.role === role);
    return { uid: st.doc?.assignee ?? r?.user_id ?? null, who: st.doc?.assignee ? names[st.doc.assignee] ?? '…' : r ? names[r.user_id ?? r.group_id ?? ''] ?? '…' : 'Chưa giao người', what: b.proc + ' · ' + ROLE_NAME[role], since: st.doc?.status_at };
  };
}
export const initialOf = (n: string) => (n.replace(/\(.*?\)/g, '').trim().split(' ').filter(Boolean)[0]?.[0] ?? '?').toUpperCase();
/** "2 giờ", "3 ngày" */
export const waited = (t?: string) => { if (!t) return ''; const h = (Date.now() - new Date(t).getTime()) / 36e5;
  return h < 1 ? Math.max(1, Math.round(h * 60)) + ' phút' : h < 24 ? Math.round(h) + ' giờ' : Math.floor(h / 24) + ' ngày'; };
export const STUCK_DAYS = 2;
export const isStuck = (t?: string) => !!t && (Date.now() - new Date(t).getTime()) / 864e5 >= STUCK_DAYS;
