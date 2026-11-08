import { useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { PROC_NAME, type Proc } from '../lib/proc';
import { loadFields, type FDef } from '../lib/fields';
import { Icon } from './Icon';
import { Msg, confirmDialog, toast } from './ui';

const CO_OF: Record<string, string> = { CNC: 'Phương Nam CNC', IPC: 'IPC', HANWA: 'Hanwa', IT: 'IT (thấy theo quyền Admin)', KHAC: 'Khác' };

/** Quyền xem dữ liệu nhạy cảm theo NGƯỜI DÙNG: bật / tắt từng trường cho người này */
export function UserDataAccess({ p, roles }: { p: Profile; roles: string[] }) {
  const [fs, setFs] = useState<FDef[] | null>(null); const [busy, setBusy] = useState('');
  const load = () => sb.from('proc_fields').select('*').eq('restricted', true).eq('active', true).order('proc').order('ord').then(({ data }) => setFs((data as FDef[]) ?? []));
  useEffect(() => { load(); }, []);
  const adm = roles.includes('admin_it');
  const why = (f: FDef) => adm ? 'Admin IT' : (f.view_users ?? []).includes(p.id) ? 'cấp riêng' : roles.some((r) => (f.view_roles ?? []).includes(r)) ? 'theo vai trò' : f.view_approver ? 'nếu là người duyệt' : '';
  const toggle = async (f: FDef) => {
    setBusy(f.id!); const on = (f.view_users ?? []).includes(p.id);
    const view_users = on ? (f.view_users ?? []).filter((u) => u !== p.id) : [...(f.view_users ?? []), p.id];
    const { error } = await sb.from('proc_fields').update({ view_users }).eq('id', f.id!);
    setBusy(''); if (error) return toast(errText(error)); toast((on ? 'Đã bỏ quyền xem ' : 'Đã cho xem ') + f.label); load(); loadFields();
  };
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h2>Phạm vi dữ liệu</h2>
      <div className="msg info"><Icon name="shield" size={16} /><span>Công ty: <b>{CO_OF[p.unit] ?? p.unit}</b>. {adm ? 'Admin IT thấy toàn bộ dữ liệu của cả 3 công ty.'
        : 'Chỉ thấy hồ sơ QT1–QT3 của công ty mình; QT0, F0 và thông tin đơn hàng là dữ liệu chung.'}</span></div>
      <b style={{ marginTop: 6 }}>Trường nhạy cảm</b>
      <span className="small muted">Bật để người này thấy trường đó (trong hồ sơ công ty họ). Cấu hình theo vai trò ở Quản trị → Trường dữ liệu.</span>
      {!fs ? <span className="small muted">Đang tải…</span> : fs.length === 0 ? <span className="small muted">Chưa có trường nào được đánh dấu nhạy cảm.</span> :
        fs.map((f) => { const w = why(f); const on = (f.view_users ?? []).includes(p.id);
          return <label key={f.id} className="role-row">
            <input type="checkbox" checked={adm || on || w === 'theo vai trò'} disabled={adm || w === 'theo vai trò' || busy === f.id} onChange={() => toggle(f)} />
            <span><b>{PROC_NAME[f.proc as Proc] ?? f.proc} · {f.label}</b><br /><span className="small muted">{w ? 'Được xem: ' + w : 'Không xem được'}</span></span></label>; })}
    </section>);
}

/** Tài khoản: đổi email, đặt lại mật khẩu, xoá (qua Edge Function admin-users, chỉ Admin IT) */
export function UserAccount({ p, isMe, onDeleted }: { p: Profile; isMe: boolean; onDeleted: () => void }) {
  const [email, setEmail] = useState(''); const [email0, setEmail0] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const call = async (body: Record<string, unknown>) => { setBusy(true); setErr('');
    const { data, error } = await sb.functions.invoke('admin-users', { body });
    setBusy(false); const e = (data as { error?: string } | null)?.error ?? (error ? errText(error) : '');
    if (e) { setErr(e); return null; } return data as Record<string, unknown>; };
  useEffect(() => { sb.functions.invoke('admin-users', { body: { op: 'get', id: p.id } }).then(({ data }) => { const e = (data as { email?: string } | null)?.email ?? ''; setEmail(e); setEmail0(e); }); }, [p.id]);
  const saveEmail = async () => { if (await call({ op: 'update', id: p.id, email })) { toast('Đã đổi email'); setEmail0(email); } };
  const savePw = async () => { if (await call({ op: 'update', id: p.id, password: pw })) { toast('Đã đặt mật khẩu mới cho ' + p.full_name); setPw(''); } };
  const del = async () => {
    if (!(await confirmDialog(`Xoá hẳn tài khoản ${p.full_name}? Không khôi phục được. Nếu người này đã có dữ liệu (đơn, phiếu, ký duyệt) hệ thống sẽ không cho xoá – khi đó hãy tắt "Cho phép đăng nhập".`, 'Xoá tài khoản'))) return;
    if (await call({ op: 'delete', id: p.id })) { toast('Đã xoá ' + p.full_name); onDeleted(); }
  };
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>Tài khoản</h2>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="f" style={{ flex: 1 }}>Email đăng nhập<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="btn" disabled={busy || !email || email === email0} onClick={saveEmail}>Đổi email</button></div>
      <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
        <label className="f" style={{ flex: 1 }}>Đặt mật khẩu mới<input type="text" autoComplete="off" value={pw} placeholder="Tối thiểu 8 ký tự – gửi riêng cho người dùng" onChange={(e) => setPw(e.target.value)} /></label>
        <button className="btn" disabled={busy || pw.length < 8} onClick={savePw}>Đặt mật khẩu</button></div>
      <Msg err={err} />
      {!isMe && <button className="btn danger" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={del}><Icon name="trash" size={16} />Xoá tài khoản</button>}
    </section>);
}
