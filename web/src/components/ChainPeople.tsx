import { useCallback, useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { COMPANIES, COMPANY, PROC_NAME, ROLE_NAME, type Proc } from '../lib/proc';
import { useGroups } from './StepPeople';
import { QtTag } from './QtTag';
import { Icon } from './Icon';

/** Quản trị: ai lập / kiểm tra / duyệt cho từng quy trình × công ty (chỉ Admin IT sửa) */
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null };
const ROWS: Record<Proc, string[]> = { QT0: ['admin', 'ky_thuat', 'kiem_tra', 'duyet'], QT1: ['lap', 'kiem_tra', 'duyet'], QT2: ['lap', 'kiem_tra', 'duyet'], QT3: ['lap', 'kiem_tra', 'duyet'] };
export function ChainPeopleAdmin({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<CP[]>([]); const [people, setPeople] = useState<Profile[]>([]); const [groups] = useGroups(); const [err, setErr] = useState('');
  const load = useCallback(() => { sb.from('chain_people').select('*').then(({ data }) => setRows((data as CP[]) ?? [])); }, []);
  useEffect(() => { load(); sb.from('profiles').select('*').order('full_name').then(({ data }) => setPeople(((data as Profile[]) ?? []).filter((p) => p.active))); }, [load]);
  const get = (p: string, c: string, r: string) => rows.find((x) => x.proc === p && x.company === c && x.role === r);
  const set = async (p: string, c: string, r: string, v: string) => {
    setErr('');
    const rec = { proc: p, company: c, role: r, user_id: v.startsWith('p:') ? v.slice(2) : null, group_id: v.startsWith('g:') ? v.slice(2) : null };
    const { error } = await sb.from('chain_people').upsert(rec); if (error) setErr(errText(error)); else load();
  };
  const Cell = ({ p, c, r }: { p: string; c: string; r: string }) => { const x = get(p, c, r); const v = x?.group_id ? 'g:' + x.group_id : x?.user_id ? 'p:' + x.user_id : '';
    return <select value={v} disabled={!canEdit} onChange={(e) => set(p, c, r, e.target.value)} className={!v ? 'need' : ''} aria-label={p + ' ' + c + ' ' + r}>
      <option value="">— chưa giao —</option>
      <optgroup label="Nhóm">{groups.filter((g) => g.active).map((g) => <option key={g.id} value={'g:' + g.id}>Nhóm {g.name}</option>)}</optgroup>
      <optgroup label="Người">{people.map((u) => <option key={u.id} value={'p:' + u.id}>{u.full_name}</option>)}</optgroup></select>; };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!canEdit && <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được sửa.</span></div>}
      <p className="small muted" style={{ margin: 0 }}>Người hoặc nhóm ở mỗi ô được làm bước đó và nhận Zalo khi hồ sơ tới lượt. Giao cho nhóm thì ai trong nhóm cũng làm được. Ô “Tải bản ký tay” là người tải bản khách / kho đã ký ở bước cuối QT1–QT3.</p>
      {err && <div className="msg err">{err}</div>}
      {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => (
        <section key={p} className="cp-sec">
          <h3 className="row" style={{ margin: '0 0 8px' }}><QtTag qt={p} />{PROC_NAME[p]}</h3>
          <div className="tbl-wrap"><table className="tbl cp-tbl">
            <thead><tr><th>Bước</th>{(p === 'QT0' ? ['PN' as const] : COMPANIES).map((c) => <th key={c}>{COMPANY[c]}</th>)}</tr></thead>
            <tbody>{ROWS[p].map((r) => <tr key={r}><td><b>{ROLE_NAME[r]}</b></td>{(p === 'QT0' ? ['PN'] : COMPANIES).map((c) => <td key={c}><Cell p={p} c={c} r={r} /></td>)}</tr>)}
              {p !== 'QT0' && <tr><td><b>{ROLE_NAME.hoan_tat}</b></td><td><Cell p={p} c="PN" r="hoan_tat" /></td><td colSpan={2} className="small muted">(do Phương Nam tải lên)</td></tr>}</tbody>
          </table></div>
        </section>))}
    </div>);
}
