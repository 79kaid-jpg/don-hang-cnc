import { useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { DOC, ROLES } from '../lib/format';
import { Msg } from '../components/ui';

type Step = { id: string; doc_type: string; step_no: number; label: string; approver_id: string | null; hours: number };

export default function Admin() {
  const [tab, setTab] = useState<'users' | 'flows'>('users');
  const [people, setPeople] = useState<Profile[]>([]); const [steps, setSteps] = useState<Step[]>([]);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = () => {
    sb.from('profiles').select('*').order('full_name').then(({ data }) => setPeople((data as Profile[]) ?? []));
    sb.from('approval_steps').select('*').order('doc_type').order('step_no').then(({ data }) => setSteps((data as Step[]) ?? []));
  };
  useEffect(load, []);
  const saveUser = async (p: Profile) => {
    const { error } = await sb.from('profiles').update({ full_name: p.full_name, unit: p.unit, roles: p.roles, active: p.active }).eq('id', p.id);
    if (error) setErr(errText(error)); else { setOk('Đã lưu ' + p.full_name); load(); }
  };
  const saveStep = async (s: Step) => {
    const { error } = await sb.from('approval_steps').update({ label: s.label, approver_id: s.approver_id, hours: s.hours }).eq('id', s.id);
    if (error) setErr(errText(error)); else { setOk('Đã lưu chuỗi duyệt.'); load(); }
  };
  const patchP = (id: string, x: Partial<Profile>) => setPeople(people.map((p) => (p.id === id ? { ...p, ...x } : p)));
  const patchS = (id: string, x: Partial<Step>) => setSteps(steps.map((s) => (s.id === id ? { ...s, ...x } : s)));
  return (
    <>
      <div><h1>Quản trị</h1><p className="muted" style={{ margin: '4px 0 0' }}>Tài khoản tạo ở Supabase (Authentication → Add user); vai trò và chuỗi duyệt chỉnh ở đây.</p></div>
      <div className="tabs"><button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>Người dùng & vai trò</button>
        <button className={tab === 'flows' ? 'on' : ''} onClick={() => setTab('flows')}>Chuỗi duyệt & hạn</button></div>
      <Msg err={err} ok={ok} />
      {tab === 'users' && (
        <div className="card flush scroll"><table className="tbl" style={{ minWidth: 900 }}>
          <thead><tr><th>Họ tên</th><th>Đơn vị</th><th>Vai trò</th><th>Hoạt động</th><th></th></tr></thead>
          <tbody>{people.map((p) => (
            <tr key={p.id}>
              <td><input aria-label="Họ tên" value={p.full_name} onChange={(e) => patchP(p.id, { full_name: e.target.value })} /></td>
              <td><select aria-label="Đơn vị" value={p.unit} onChange={(e) => patchP(p.id, { unit: e.target.value })}>{['CNC', 'IPC', 'IT', 'KHAC'].map((u) => <option key={u}>{u}</option>)}</select></td>
              <td><div className="row" style={{ gap: 6 }}>{Object.entries(ROLES).map(([k, t]) => (
                <label key={k} className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" style={{ minHeight: 0, width: 'auto' }} checked={p.roles.includes(k)}
                    onChange={(e) => patchP(p.id, { roles: e.target.checked ? [...p.roles, k] : p.roles.filter((r) => r !== k) })} />{t}</label>))}</div></td>
              <td><input type="checkbox" aria-label="Hoạt động" style={{ minHeight: 0, width: 'auto' }} checked={p.active} onChange={(e) => patchP(p.id, { active: e.target.checked })} /></td>
              <td><button className="btn sm primary" onClick={() => saveUser(p)}>Lưu</button></td>
            </tr>))}</tbody>
        </table></div>)}
      {tab === 'flows' && (
        <div className="card flush scroll"><table className="tbl" style={{ minWidth: 760 }}>
          <thead><tr><th>Phiếu</th><th>Cấp</th><th>Nhãn</th><th>Người duyệt</th><th>Hạn (giờ)</th><th></th></tr></thead>
          <tbody>{steps.map((s) => (
            <tr key={s.id}>
              <td><b>{DOC[s.doc_type] ?? s.doc_type}</b></td><td>{s.step_no}</td>
              <td><input aria-label="Nhãn" value={s.label} onChange={(e) => patchS(s.id, { label: e.target.value })} /></td>
              <td><select aria-label="Người duyệt" value={s.approver_id ?? ''} onChange={(e) => patchS(s.id, { approver_id: e.target.value || null })}>
                <option value="">[chưa gán]</option>{people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></td>
              <td><input aria-label="Hạn giờ" type="number" min={1} value={s.hours} onChange={(e) => patchS(s.id, { hours: Number(e.target.value) })} style={{ width: 80 }} /></td>
              <td><button className="btn sm primary" onClick={() => saveStep(s)}>Lưu</button></td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
