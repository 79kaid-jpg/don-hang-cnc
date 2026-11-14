import { useCallback, useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { COMPANIES, COMPANY, PROC_NAME, ROLE_NAME, type Proc } from '../lib/proc';
import { useGroups } from './StepPeople';
import { QtTag } from './QtTag';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

/** Quản trị: ai lập / kiểm tra / duyệt cho từng quy trình × công ty (chỉ Admin IT sửa) */
const UNIT_OF: Record<string, string> = { PN: 'CNC', IPC: 'IPC', HW: 'HANWA' };
const CO_OF: Record<string, string> = { CNC: 'PNC', PN: 'PNC', IPC: 'IPC', HANWA: 'HAN', HW: 'HAN', IT: 'IT' };
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
    const { error } = await sb.from('chain_people').upsert(rec); if (error) { setErr(errText(error)); return; } load();
    if (!rec.user_id) return;
    // Phiếu đang mở ở bước này: hỏi có giao luôn cho người mới (kèm Zalo) không
    const { data: ds } = await sb.from('docs_v').select('id, status, batches!inner(proc, status)').eq('company', c).eq('batches.proc', p).eq('batches.status', 'dang_lam');
    const ROLE: Record<string, string> = p === 'QT0' ? { tiep_nhan: 'admin', boc_tach: 'ky_thuat', tao_ds: 'admin', kiem_tra: 'kiem_tra', duyet: 'duyet' } : { lap: 'lap', kiem_tra: 'kiem_tra', duyet: 'duyet' };
    const n = ((ds as { status: string }[]) ?? []).filter((d) => ROLE[d.status] === r).length;
    if (!n) return;
    const who = people.find((u) => u.id === rec.user_id)?.full_name ?? '';
    if (await confirmDialog(`Có ${n} phiếu đang mở ở bước này. Chuyển cả ${n} phiếu cho ${who} và báo Zalo?`, 'Chuyển phiếu', true)) {
      const { data, error: e2 } = await sb.rpc('reassign_open', { p_proc: p, p_company: c, p_role: r, p_user: rec.user_id });
      if (e2) setErr(errText(e2)); else toast(`Đã chuyển ${data} phiếu cho ${who}`);
    }
  };
  const setFin = async (p: string, c: string) => {
    if (!(await confirmDialog(`Chuyển bước ký tay & hoàn tất ${p} sang ${COMPANY[c as 'PN']}? Mặc định giao cho người Lập của ${COMPANY[c as 'PN']}.`, 'Chuyển'))) return;
    const l = get(p, c, 'lap'); const has = rows.some((x) => x.proc === p && x.role === 'hoan_tat');
    const rec = { company: c, user_id: l?.user_id ?? null, group_id: l?.group_id ?? null };
    const { error } = has ? await sb.from('chain_people').update(rec).eq('proc', p).eq('role', 'hoan_tat') : await sb.from('chain_people').insert({ proc: p, role: 'hoan_tat', ...rec });
    if (error) setErr(errText(error)); else { toast('Đã chuyển sang ' + COMPANY[c as 'PN']); load(); }
  };
  const Cell = ({ p, c, r }: { p: string; c: string; r: string }) => { const x = get(p, c, r); const v = x?.group_id ? 'g:' + x.group_id : x?.user_id ? 'p:' + x.user_id : '';
    return <select value={v} disabled={!canEdit} onChange={(e) => set(p, c, r, e.target.value)} className={!v ? 'need' : ''} aria-label={p + ' ' + c + ' ' + r}>
      <option value="">— chưa giao —</option>
      <optgroup label="Nhóm">{groups.filter((g) => g.active).map((g) => <option key={g.id} value={'g:' + g.id}>Nhóm {g.name}</option>)}</optgroup>
      <optgroup label={'Người · ' + COMPANY[c as 'PN']}>{people.filter((u) => u.unit === UNIT_OF[c]).map((u) => <option key={u.id} value={'p:' + u.id}>{u.full_name}</option>)}</optgroup>
      <optgroup label="Kiêm nhiệm · công ty khác">{people.filter((u) => u.unit !== UNIT_OF[c]).map((u) => <option key={u.id} value={'p:' + u.id}>{u.full_name} · {CO_OF[(u.unit ?? '').toUpperCase()] ?? u.unit ?? '—'}</option>)}</optgroup></select>; };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!canEdit && <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được sửa.</span></div>}
      <p className="small muted" style={{ margin: 0 }}>Người hoặc nhóm ở mỗi ô được làm bước đó và nhận Zalo khi hồ sơ tới lượt. Giao cho nhóm thì ai trong nhóm cũng làm được. Dòng “Ký tay & hoàn tất”: chọn công ty in mẫu cho khách ký và tải bản ký (mặc định Hanwa – bên ký với khách cuối). Ô “Tải bản ký tay” là người tải bản khách / kho đã ký ở bước cuối QT1–QT3.</p>
      {err && <div className="msg err">{err}</div>}
      {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => (
        <section key={p} className="cp-sec">
          <h3 className="row" style={{ margin: '0 0 8px' }}><QtTag qt={p} />{PROC_NAME[p]}</h3>
          <div className="tbl-wrap"><table className="tbl cp-tbl">
            <thead><tr><th>Bước</th>{(p === 'QT0' ? ['PN' as const] : COMPANIES).map((c) => <th key={c}>{COMPANY[c]}</th>)}</tr></thead>
            <tbody>{ROWS[p].map((r) => <tr key={r}><td><b>{ROLE_NAME[r]}</b></td>{(p === 'QT0' ? ['PN'] : COMPANIES).map((c) => <td key={c}><Cell p={p} c={c} r={r} /></td>)}</tr>)}
              {p !== 'QT0' && (() => { const fc = rows.find((x) => x.proc === p && x.role === 'hoan_tat')?.company ?? 'HW';
                return <tr className="cp-fin"><td><b>Ký tay & hoàn tất</b><div className="small muted">in mẫu, tải bản ký</div></td>{COMPANIES.map((c) => <td key={c}>{c === fc
                  ? <Cell p={p} c={c} r="hoan_tat" />
                  : canEdit ? <button className="btn xs cp-pick" onClick={() => setFin(p, c)} title={"Chọn " + COMPANY[c]}>Chọn bên này</button> : <span className="small muted">—</span>}</td>)}</tr>; })()}</tbody>
          </table></div>
        </section>))}
    </div>);
}
