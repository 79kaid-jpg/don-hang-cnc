import { useEffect, useState } from 'react';
import { sb } from './supabase';
import { ROLE_OF } from './proc';

/** Tên người phụ trách THẬT theo cấu hình (Quản trị → Phụ trách quy trình) – dùng cho Sơ đồ, Hướng dẫn… thay cho tên ghi cứng */
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null };
let cache: { cp: CP[]; ppl: Record<string, string>; gs: Record<string, string[]> } | null = null; let inflight: Promise<void> | null = null;
const load = () => inflight ??= Promise.all([sb.from('chain_people').select('proc, company, role, user_id, group_id'), sb.from('profiles').select('id, full_name'), sb.from('work_groups').select('id, member_ids')])
  .then(([a, b, c]) => { cache = { cp: (a.data as CP[]) ?? [], ppl: Object.fromEntries(((b.data ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])),
    gs: Object.fromEntries(((c.data ?? []) as { id: string; member_ids: string[] }[]).map((g) => [g.id, g.member_ids])) }; });
const RN: Record<string, string> = { admin: 'Admin', ky_thuat: 'Kỹ thuật', lap: 'Lập', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', hoan_tat: 'Hoàn tất' };
const CO: Record<string, string> = { PN: 'PN', IPC: 'IPC', HW: 'Hanwa' };

export function useWho() {
  const [, set] = useState(0);
  useEffect(() => { if (!cache) load().then(() => set((x) => x + 1)); }, []);
  const names = (proc: string, co: string, role: string, max = 2) => { if (!cache) return '…';
    const c = cache.cp.find((x) => x.proc === proc && x.company === co && x.role === role); if (!c) return 'chưa gán';
    const ids = c.user_id ? [c.user_id] : c.group_id ? cache.gs[c.group_id] ?? [] : [];
    const n = ids.map((i) => cache!.ppl[i]).filter(Boolean); return n.length ? n.slice(0, max).join(', ') + (n.length > max ? ' +' + (n.length - max) : '') : 'chưa gán'; };
  const fin = (proc: string) => cache?.cp.find((x) => x.proc === proc && x.role === 'hoan_tat')?.company ?? 'HW';
  /** keys: 'tiep_nhan' (QT0) | 'PN.kiem_tra' | 'ky' → "Kiểm tra · Mai Anh" */
  const who = (proc: string, keys: string[]) => keys.map((k) => {
    if (k === 'ky' || k === 'hoan_tat') { const co = proc === 'QT0' ? 'PN' : fin(proc); const r = proc === 'QT0' ? 'admin' : 'hoan_tat'; return (proc === 'QT0' ? '' : CO[co] + ' · ') + 'Tải bản ký: ' + names(proc, co, r); }
    const [co, st] = k.includes('.') ? k.split('.') : ['PN', k]; const r = ROLE_OF[st] ?? st;
    return (proc === 'QT0' ? '' : CO[co] + ' · ') + RN[r] + ': ' + names(proc, co, r); }).join(' · ');
  return { who, names, ready: !!cache };
}
