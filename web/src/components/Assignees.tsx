import { useEffect, useState } from 'react';
import { sb, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toast } from './ui';

type Who = { user_id: string | null; group_id: string | null };
const gCache: Record<string, { name: string; member_ids: string[] }> = {};

/** Người phụ trách thật của bước (tên người, không phải tên vai trò) + nút ↪ vào vai cho Admin */
export function Assignees({ proc, company, role, level, people, mini }: { proc: string; company: string; role?: string; level?: Who; people: Record<string, Profile>; mini?: boolean }) {
  const { real, acting, actAs } = useAuth();
  const [w, setW] = useState<Who | null>(level ?? null); const [, setTick] = useState(0);
  useEffect(() => { if (level) { setW(level); return; } if (!role) return;
    sb.from('chain_people').select('user_id, group_id').eq('proc', proc).eq('company', company).eq('role', role).maybeSingle().then(({ data }) => setW((data as Who) ?? { user_id: null, group_id: null })); }, [proc, company, role, level?.user_id, level?.group_id]);
  useEffect(() => { const g = w?.group_id; if (!g || gCache[g]) return;
    sb.from('work_groups').select('name, member_ids').eq('id', g).single().then(({ data }) => { if (data) { gCache[g] = data as never; setTick((x) => x + 1); } }); }, [w?.group_id]);
  if (!w) return null;
  const ids = w.user_id ? [w.user_id] : w.group_id ? gCache[w.group_id]?.member_ids ?? [] : [];
  const canAct = !!real?.roles.includes('admin_it') && !acting;
  const go = async (id: string) => { const e = await actAs(id); if (e) toast(e); else location.reload(); };
  if (mini) { const n = ids.length ? people[ids[0]]?.full_name ?? '…' : ''; return <span className="pp-sh-av" title={ids.map((i) => people[i]?.full_name).join(', ') || 'chưa gán'}>{n ? n.trim().split(' ').pop()?.[0] : '?'}{ids.length > 1 && <i>+{ids.length - 1}</i>}</span>; }
  if (!ids.length) return <span className="as-none">chưa gán</span>;
  const shown = ids.slice(0, 2);
  return <span className="as-list">{shown.map((id) => { const n = people[id]?.full_name ?? '…';
    return canAct && id !== real?.id
      ? <button key={id} className="as-chip go" onClick={() => go(id)} title={'Vào vai ' + n} aria-label={'Vào vai ' + n}><span className="as-av">{n.trim().split(' ').pop()?.[0]}</span>{n}<span className="as-ic" aria-hidden="true">↪</span></button>
      : <span key={id} className="as-chip"><span className="as-av">{n.trim().split(' ').pop()?.[0]}</span>{n}</span>; })}
    {ids.length > 2 && <span className="as-more" title={ids.slice(2).map((i) => people[i]?.full_name).join(', ')}>+{ids.length - 2}</span>}</span>;
}
