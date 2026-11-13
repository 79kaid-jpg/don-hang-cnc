import { useEffect, useState } from 'react';
import { errText, sb, type Profile } from '../lib/supabase';
import { confirmDialog, toast } from './ui';

type G = { id: string; admin_id: string; target_id: string | null; from_at: string; to_at: string; reason: string; created_by: string; created_at: string; revoked_at: string | null };
const loc = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
const dt = (s: string) => new Date(s).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

/** Quản trị › Uỷ quyền làm thay: admin được làm thay 1 người / tất cả trong khoảng thời gian */
export function ActGrants({ people }: { people: Profile[] }) {
  const [gs, setGs] = useState<G[] | null>(null);
  const now = new Date(); const eod = new Date(now); eod.setHours(17, 30, 0, 0); if (eod <= now) eod.setDate(eod.getDate() + 1);
  const [f, setF] = useState({ admin: '', target: '', from: loc(now), to: loc(eod), reason: '' }); const [busy, setBusy] = useState(false);
  const load = () => sb.from('act_grants').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => setGs((data as G[]) ?? []));
  useEffect(() => { load(); }, []);
  const nm = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name ?? '—' : 'Tất cả người dùng');
  const admins = people.filter((p) => p.active && p.roles.some((r) => r === 'admin_it' || r === 'admin_cnc'));
  const users = people.filter((p) => p.active && p.id !== f.admin);
  const st = (g: G) => g.revoked_at ? ['Đã huỷ', 'idle'] : new Date(g.to_at) < now ? ['Hết hạn', 'idle'] : new Date(g.from_at) > now ? ['Sắp tới', 'warn'] : ['Đang hiệu lực', 'ok'];
  const add = async () => {
    if (!f.admin || !f.reason.trim()) { toast('Chọn admin và ghi lý do'); return; }
    setBusy(true); const { error } = await sb.rpc('act_grant_add', { p_admin: f.admin, p_target: f.target || null, p_from: new Date(f.from).toISOString(), p_to: new Date(f.to).toISOString(), p_reason: f.reason });
    setBusy(false); if (error) { toast(errText(error)); return; } toast('Đã cấp uỷ quyền'); setF({ ...f, reason: '' }); load();
  };
  const revoke = async (g: G) => { if (!(await confirmDialog(`Huỷ uỷ quyền cho ${nm(g.admin_id)} làm thay ${nm(g.target_id)}?`, 'Huỷ uỷ quyền'))) return;
    const { error } = await sb.rpc('act_grant_revoke', { p_id: g.id }); if (error) toast(errText(error)); else load(); };
  return <div className="ag">
    <section className="card ag-form">
      <h3 style={{ margin: 0 }}>Cấp uỷ quyền làm thay</h3>
      <p className="small muted" style={{ margin: 0 }}>Trong thời gian này, admin bấm “Làm thay” sẽ thao tác được như người đó (nhập, gửi, duyệt, ký). Chữ ký ghi rõ “làm thay”. Hết giờ tự khoá.</p>
      <div className="ag-grid">
        <label className="f">Admin được làm thay *<select value={f.admin} onChange={(e) => setF({ ...f, admin: e.target.value })}><option value="">— Chọn admin —</option>{admins.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label className="f">Làm thay ai<select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}><option value="">Tất cả người dùng (SIT)</option>{users.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.unit ? ' · ' + p.unit : ''}</option>)}</select></label>
        <label className="f">Từ *<input type="datetime-local" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label className="f">Đến *<input type="datetime-local" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label className="f ag-wide">Lý do *<input value={f.reason} placeholder="VD: Anh Hậu nghỉ phép / SIT đợt 1" onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn primary" disabled={busy} onClick={add}>{busy ? 'Đang lưu…' : 'Cấp uỷ quyền'}</button></div>
    </section>
    <section className="card flush">
      <div className="card-head"><h3 style={{ margin: 0 }}>Danh sách uỷ quyền</h3></div>
      {!gs ? <div className="skel" style={{ height: 80, margin: 12 }} /> : gs.length === 0 ? <p className="muted small" style={{ padding: '0 16px 16px' }}>Chưa có uỷ quyền nào.</p> :
        <ul className="ag-list">{gs.map((g) => { const [t, c] = st(g); return <li key={g.id}>
          <div className="ag-main"><b>{nm(g.admin_id)}</b> <span className="muted">làm thay</span> <b>{nm(g.target_id)}</b>
            <span className="small muted ag-sub">{dt(g.from_at)} → {dt(g.to_at)} · {g.reason} · cấp bởi {nm(g.created_by)}</span></div>
          <span className={'chip ' + c}>{t}</span>
          {!g.revoked_at && new Date(g.to_at) > now && <button className="btn sm danger" onClick={() => revoke(g)}>Huỷ</button>}</li>; })}</ul>}
    </section>
  </div>;
}
