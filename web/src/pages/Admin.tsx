import { GroupsAdmin, StepDefaultsAdmin, useGroups } from '../components/StepPeople';
import { ChecklistAdmin } from '../components/Checklist';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb, errText, type Profile } from '../lib/supabase';
import { DOC, ROLES } from '../lib/format';
import { Msg, Skeleton, confirmDialog, toast } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuth } from '../lib/auth';

type Step = { id: string; doc_type: string; step_no: number; label: string; approver_id: string | null; hours: number };
const UNITS = ['CNC', 'IPC', 'IT', 'KHAC'];

/** Quản trị – thiết kế ưu tiên điện thoại: danh sách thẻ → bấm mở chi tiết; nút hành động luôn hiện, không cần cuộn ngang */
export default function Admin() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'users' | 'groups' | 'flows' | 'ck' | 'sd'>('users');
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const [q, setQ] = useState(''); const [fRole, setFRole] = useState(''); const [fAct, setFAct] = useState<'on' | 'off' | 'all'>('on'); const [fZ, setFZ] = useState(false);
  const [groups] = useGroups();
  const load = () => {
    sb.from('profiles').select('*').order('full_name').then(({ data }) => setPeople((data as Profile[]) ?? []));
    sb.from('approval_steps').select('*').order('doc_type').order('step_no').then(({ data }) => setSteps((data as Step[]) ?? []));
  };
  useEffect(load, []);
  const list = useMemo(() => (people ?? []).filter((p) => (p.full_name + ' ' + p.roles.join(' ')).toLowerCase().includes(q.toLowerCase())), [people, q]);
  const open = people?.find((p) => p.id === openId) ?? null;
  const noRole = (people ?? []).filter((p) => p.active && !p.roles.length).length;

  if (creating) return <NewUser onBack={() => setCreating(false)} onDone={(id) => { setCreating(false); load(); setOpenId(id); }} />;
  if (open) return <UserDetail p={open} onBack={() => setOpenId(null)} onSaved={load} />;

  const TABS: [typeof tab, string, string, string][] = [
    ['users', 'Người dùng', 'Tài khoản & vai trò', 'users'], ['groups', 'Nhóm', 'Nhóm làm việc', 'kanban'],
    ['sd', 'Phụ trách bước', 'Người làm, giám sát, SLA', 'clock'], ['ck', 'Checklist', 'Mục phải xong mỗi bước', 'check'],
    ['flows', 'Chuỗi duyệt', 'Người duyệt & hạn', 'flow']];
  const act = (people ?? []).filter((p) => p.active);
  const noZalo = act.filter((p) => !p.zalo_chat_id).length;
  const roleCount = (r: string) => act.filter((p) => p.roles.includes(r)).length;
  const shown = list.filter((p) => (fRole === '' || (fRole === '_none' ? !p.roles.length : p.roles.includes(fRole))) && (fAct === 'all' || (fAct === 'on') === p.active) && (!fZ || !p.zalo_chat_id));
  return (
    <>
      <div className="page-head"><div><h1>Quản trị</h1>
        <p className="muted">Tài khoản, vai trò, nhóm, người phụ trách từng bước, checklist và chuỗi duyệt.</p></div>
        {can('admin_it') && tab === 'users' && <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Tạo người dùng</button>}
      </div>
      {people && <div className="adm-stats">
        <button className="adm-stat" onClick={() => { setTab('users'); setFRole(''); setFAct('on'); setFZ(false); }}><b>{act.length}</b><span>Đang hoạt động</span></button>
        <button className={'adm-stat' + (noRole ? ' warn' : '')} onClick={() => { setTab('users'); setFRole('_none'); setFAct('on'); setFZ(false); }}><b>{noRole}</b><span>Chưa có vai trò</span></button>
        <button className={'adm-stat' + (noZalo ? ' warn' : '')} onClick={() => { setTab('users'); setFRole(''); setFAct('on'); setQ(''); setFZ(true); }}><b>{noZalo}</b><span>Chưa liên kết Zalo</span></button>
        <button className="adm-stat" onClick={() => setTab('groups')}><b>{groups.filter((g) => g.active).length}</b><span>Nhóm</span></button>
      </div>}
      <div className="qt-group od-group adm-group"><div className="qt-tabs" role="tablist" aria-label="Mục quản trị">
        {TABS.map(([k, t, sub, ic]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <b><Icon name={ic as never} size={15} /> {t}</b><span>{sub}</span></button>))}
      </div><div className="qt-panel od-panel adm-panel" key={tab}>

      {tab === 'users' && (<div className="adm-users">
        <div className="row">
          <label className="search" style={{ flex: '1 1 260px', maxWidth: 'none' }}><Icon name="search" size={18} />
            <input aria-label="Tìm người dùng" placeholder="Tìm tên, vai trò…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="seg" role="group" aria-label="Trạng thái">{([['on', 'Hoạt động'], ['off', 'Đã khoá'], ['all', 'Tất cả']] as const).map(([k, t]) =>
            <button key={k} type="button" aria-pressed={fAct === k} onClick={() => setFAct(k)}>{t}</button>)}</div>
        </div>
        <div className="adm-chips" role="group" aria-label="Lọc theo vai trò">
          <button className={'pill-toggle' + (fRole === '' ? ' on' : '')} aria-pressed={fRole === ''} onClick={() => setFRole('')}>Tất cả vai trò</button>
          {Object.entries(ROLES).map(([k, t]) => roleCount(k) > 0 && (
            <button key={k} className={'pill-toggle' + (fRole === k ? ' on' : '')} aria-pressed={fRole === k} onClick={() => setFRole(fRole === k ? '' : k)}>{t} <span className="kb-count">{roleCount(k)}</span></button>))}
          <button className={'pill-toggle' + (fZ ? ' on' : '')} aria-pressed={fZ} onClick={() => setFZ(!fZ)}>Chưa liên kết Zalo</button>
          {noRole > 0 && <button className={'pill-toggle' + (fRole === '_none' ? ' on' : '')} aria-pressed={fRole === '_none'} onClick={() => setFRole('_none')}>Chưa có vai trò <span className="kb-count">{noRole}</span></button>}
        </div>
        {!people ? <Skeleton rows={4} h={76} /> : shown.length === 0 ? <p className="muted">Không có người dùng khớp bộ lọc.</p> : (
          <ul className="ulist adm-ulist">
            {shown.map((p) => { const gs = groups.filter((g) => g.active && g.member_ids.includes(p.id)); return (
              <li key={p.id}>
                <button className={'ucard' + (p.active ? '' : ' off')} onClick={() => setOpenId(p.id)} aria-label={'Mở ' + p.full_name}>
                  <span className="avatar">{(p.full_name || '?').split(' ').filter(Boolean).slice(-2).map((x) => x[0]).join('').toUpperCase()}</span>
                  <span className="ucard-main">
                    <span className="row" style={{ gap: 6 }}><b>{p.full_name || '(chưa đặt tên)'}</b>
                      <span className="chip idle">{p.unit}</span>{!p.active && <span className="chip bad">Đã khoá</span>}
                      <span className={'zl ' + (p.zalo_chat_id ? 'on' : '')} title={p.zalo_chat_id ? 'Đã liên kết Zalo' + (p.zalo_name ? ': ' + p.zalo_name : '') : 'Chưa liên kết Zalo – không nhận thông báo'}>Zalo</span></span>
                    <span className="ucard-roles">{p.roles.length ? p.roles.map((r) => <span key={r} className="chip wait">{ROLES[r] ?? r}</span>)
                      : <span className="chip bad">Chưa có vai trò</span>}
                      {gs.map((g) => <span key={g.id} className="chip grp-chip"><Icon name="users" size={12} />{g.name}</span>)}</span>
                  </span>
                  <Icon name="arrow" size={18} />
                </button>
              </li>); })}
          </ul>)}
      </div>)}

      {tab === 'groups' && <GroupsAdmin canEdit={can('admin_it')} />}
      {tab === 'sd' && <StepDefaultsAdmin canEdit={can('admin_it')} />}
      {tab === 'ck' && <ChecklistAdmin canEdit={can('admin_it')} />}
      {tab === 'flows' && (!steps || !people ? <Skeleton rows={4} h={90} /> : <Flows steps={steps} people={people} onSaved={load} />)}
      </div></div>
    </>
  );
}

function UserDetail({ p, onBack, onSaved }: { p: Profile; onBack: () => void; onSaved: () => void }) {
  const { real, actAs } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ full_name: p.full_name, unit: p.unit, roles: p.roles, active: p.active });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify({ full_name: p.full_name, unit: p.unit, roles: p.roles, active: p.active });
  const isMe = p.id === real?.id;
  const save = async () => {
    setBusy(true); setErr('');
    const { error } = await sb.from('profiles').update(f).eq('id', p.id);
    setBusy(false); if (error) setErr(errText(error)); else { toast('Đã lưu ' + f.full_name); onSaved(); }
  };
  const loginAs = async () => {
    if (dirty && !(await confirmDialog('Có thay đổi chưa lưu. Bỏ qua và đăng nhập với tư cách người này?', 'Bỏ qua & tiếp tục'))) return;
    if (!(await confirmDialog(`Đăng nhập với tư cách ${p.full_name}? Bạn thấy và thao tác đúng như người này cho tới khi bấm Thoát. Nhật ký ghi tên thật của bạn.`, 'Đăng nhập với tư cách', true))) return;
    const e = await actAs(p.id); if (e) setErr(e); else nav('/');
  };
  const toggle = (r: string) => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] });

  return (
    <div className="udetail">
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}><Icon name="back" size={16} />Người dùng</button>

      <div className="card row" style={{ gap: 14 }}>
        <span className="avatar" style={{ width: 52, height: 52, borderRadius: 26, fontSize: 20 }}>{(f.full_name || '?').charAt(0).toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ fontSize: 22 }}>{f.full_name || '(chưa đặt tên)'}</h1>
          <div className="small muted">{f.unit} · {f.active ? 'Đang hoạt động' : 'Đã khoá'}{isMe ? ' · tài khoản của bạn' : ''}</div></div>
      </div>

      {!isMe && (
        <button className="btn ghost act-as" onClick={loginAs} disabled={!p.active}>
          <Icon name="eye" size={20} /><span><b>Đăng nhập với tư cách {p.full_name}</b><br />
            <span className="small">{p.active ? 'Xem và thao tác đúng như người này' : 'Mở khoá tài khoản trước'}</span></span>
        </button>)}

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Thông tin</h2>
        <label className="f">Họ tên<input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <div className="f" role="group" aria-label="Đơn vị"><span>Đơn vị</span>
          <div className="seg">{UNITS.map((u) => <button key={u} type="button" aria-pressed={f.unit === u} onClick={() => setF({ ...f, unit: u })}>{u}</button>)}</div></div>
        <label className="switch-row"><span><b>Cho phép đăng nhập</b><br /><span className="small muted">Tắt để khoá tài khoản mà không xoá lịch sử</span></span>
          <input type="checkbox" className="switch" checked={f.active} disabled={isMe} onChange={(e) => setF({ ...f, active: e.target.checked })} /></label>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ marginBottom: 8 }}>Vai trò</h2>
        {Object.entries(ROLES).map(([k, t]) => (
          <label key={k} className="role-row">
            <input type="checkbox" checked={f.roles.includes(k)} disabled={isMe && k === 'admin_it'} onChange={() => toggle(k)} />
            <span><b>{t}</b><br /><span className="small muted">{ROLE_HINT[k]}</span></span>
          </label>))}
      </section>

      <Msg err={err} />
      <div className="savebar">
        <span className="small muted" style={{ flex: 1 }}>{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
        <button className="btn primary" disabled={!dirty || busy} onClick={save}><Icon name="check" size={18} />{busy ? 'Đang lưu…' : 'Lưu'}</button>
      </div>
    </div>
  );
}

const ROLE_HINT: Record<string, string> = {
  admin_it: 'Toàn quyền, quản trị, đăng nhập với tư cách người khác',
  kinh_doanh: 'Tạo đơn, F0, sửa F1, lập XNĐH, ghi khách xác nhận',
  ky_thuat: 'Bóc tách F1', kiem_tra_f1: 'Kiểm tra F1 (ĐK1)',
  admin_cnc: 'Lập XNĐH, LGC, bàn giao, LGH chặng 1',
  ke_hoach: 'Dự toán NVL (giai đoạn sau)', mua_hang: 'PO (giai đoạn sau)', kho_qc: 'Nhập kho, QC, giao hàng – không thấy giá',
  ipc: 'Phần IPC của LGC, LGH chặng 2', duyet: 'Xem giá; duyệt các cấp được gán', xem: 'Chỉ xem, có thấy giá'
};

function Flows({ steps, people, onSaved }: { steps: Step[]; people: Profile[]; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, Step>>({});
  const [err, setErr] = useState('');
  const groups = Array.from(new Set(steps.map((s) => s.doc_type)));
  const cur = (s: Step) => draft[s.id] ?? s;
  const patch = (s: Step, x: Partial<Step>) => setDraft({ ...draft, [s.id]: { ...cur(s), ...x } });
  const dirty = Object.keys(draft).length;
  const save = async () => {
    setErr('');
    for (const s of Object.values(draft)) {
      const { error } = await sb.from('approval_steps').update({ label: s.label, approver_id: s.approver_id, hours: s.hours }).eq('id', s.id);
      if (error) { setErr(errText(error)); return; }
    }
    toast('Đã lưu chuỗi duyệt'); setDraft({}); onSaved();
  };
  const active = people.filter((p) => p.active);
  return (
    <>
      {groups.map((g) => (
        <section key={g} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>{DOC[g] ?? g}</h2>
          {steps.filter((s) => s.doc_type === g).map((s) => {
            const c = cur(s);
            return (
              <div key={s.id} className="flow-card">
                <span className={'dot ' + (c.approver_id ? 'done' : 'wait')}>{s.step_no}</span>
                <div className="flow-fields">
                  <label className="f">Người duyệt
                    <select value={c.approver_id ?? ''} onChange={(e) => patch(s, { approver_id: e.target.value || null })}>
                      <option value="">— Chưa gán —</option>{active.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
                  <div className="row" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                    <label className="f" style={{ flex: 1, minWidth: 0 }}>Nhãn<input value={c.label} onChange={(e) => patch(s, { label: e.target.value })} /></label>
                    <label className="f" style={{ width: 96 }}>Hạn (giờ)<input type="number" inputMode="numeric" min={1} value={c.hours} onChange={(e) => patch(s, { hours: Number(e.target.value) })} /></label>
                  </div>
                  {!c.approver_id && <span className="small" style={{ color: 'var(--wait)' }}>Chưa gán người – phiếu không gửi duyệt được</span>}
                </div>
              </div>);
          })}
        </section>))}
      <Msg err={err} />
      <div className="savebar">
        <span className="small muted" style={{ flex: 1 }}>{dirty ? dirty + ' cấp đã sửa, chưa lưu' : 'Không có thay đổi'}</span>
        <button className="btn sm" disabled={!dirty} onClick={() => setDraft({})}>Huỷ</button>
        <button className="btn primary" disabled={!dirty} onClick={save}><Icon name="check" size={18} />Lưu</button>
      </div>
    </>
  );
}

/** Tạo tài khoản mới: Edge Function admin-users (service role ở máy chủ, chỉ Admin IT) */
function NewUser({ onBack, onDone }: { onBack: () => void; onDone: (id: string) => void }) {
  const [groups] = useGroups();
  const [f, setF] = useState({ full_name: '', email: '', unit: 'CNC', password: '', roles: [] as string[], group_ids: [] as string[] });
  const [show, setShow] = useState(true); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState<{ id: string; email: string; pw: string } | null>(null);
  const gen = () => { const a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const r = crypto.getRandomValues(new Uint32Array(10));
    setF({ ...f, password: Array.from(r, (x) => a[x % a.length]).join('') + '!' }); setShow(true); };
  const tog = (k: 'roles' | 'group_ids', v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const submit = async () => {
    setErr(''); setBusy(true);
    const { data, error } = await sb.functions.invoke('admin-users', { body: f });
    setBusy(false);
    let msg = (data as { error?: string } | null)?.error;
    if (error && !msg) { try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* */ } msg = msg || error.message; }
    if (msg) { setErr(msg); return; }
    setDone({ id: (data as { id: string }).id, email: f.email, pw: f.password });
  };
  if (done) return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
      <h1 style={{ margin: 0 }}>Đã tạo tài khoản</h1>
      <div className="msg ok"><Icon name="check" size={18} /><span>Gửi cho người dùng thông tin đăng nhập dưới đây (qua Zalo / trực tiếp). Mật khẩu chỉ hiện lần này.</span></div>
      <div className="newu-cred"><span className="small muted">Email</span><b>{done.email}</b><span className="small muted">Mật khẩu tạm</span><b className="mono">{done.pw}</b></div>
      <div className="row"><button className="btn" onClick={() => navigator.clipboard?.writeText(`App Đơn hàng CNC: https://79kaid-jpg.github.io/don-hang-cnc/\nEmail: ${done.email}\nMật khẩu tạm: ${done.pw}`)}><Icon name="file" size={16} />Chép thông tin</button>
        <button className="btn primary" onClick={() => onDone(done.id)}>Xong, mở hồ sơ</button></div>
    </section>);
  const ok = f.full_name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) && f.password.length >= 8;
  return (
    <>
      <button className="small" onClick={onBack} style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, border: 0, background: 'none', padding: 0, cursor: 'pointer' }}><Icon name="back" size={16} />Người dùng</button>
      <div className="page-head"><div><h1>Tạo người dùng</h1><p className="muted">Tài khoản dùng được ngay, không cần xác nhận email.</p></div></div>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid2">
          <label className="f">Họ tên *<input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder="Nguyễn Văn A" autoFocus /></label>
          <label className="f">Email đăng nhập *<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="ten@congty.vn" autoComplete="off" /></label>
        </div>
        <div className="f" role="group" aria-label="Đơn vị"><span>Đơn vị</span>
          <div className="seg">{UNITS.map((u) => <button key={u} type="button" aria-pressed={f.unit === u} onClick={() => setF({ ...f, unit: u })}>{u}</button>)}</div></div>
        <div className="row">
          <label className="f" style={{ flex: '1 1 260px' }}>Mật khẩu tạm * (từ 8 ký tự)
            <input type={show ? 'text' : 'password'} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" className="mono" /></label>
          <button className="btn" type="button" onClick={gen}><Icon name="refresh" size={16} />Tạo ngẫu nhiên</button>
          <button className="btn icon-btn" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}><Icon name={show ? 'eyeoff' : 'eye'} size={18} /></button>
        </div>
      </section>
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 style={{ marginBottom: 8 }}>Vai trò</h2>
        {Object.entries(ROLES).map(([k, t]) => (
          <label key={k} className="role-row"><input type="checkbox" checked={f.roles.includes(k)} onChange={() => tog('roles', k)} />
            <span><b>{t}</b><br /><span className="small muted">{ROLE_HINT[k]}</span></span></label>))}
      </section>
      {groups.filter((g) => g.active).length > 0 && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ marginBottom: 8 }}>Nhóm</h2>
          {groups.filter((g) => g.active).map((g) => (
            <label key={g.id} className="role-row"><input type="checkbox" checked={f.group_ids.includes(g.id)} onChange={() => tog('group_ids', g.id)} />
              <span><b>{g.name}</b><br /><span className="small muted">{g.member_ids.length} người{g.note ? ' · ' + g.note : ''}</span></span></label>))}
        </section>)}
      <Msg err={err} />
      <div className="savebar">
        <span className="small muted" style={{ flex: 1 }}>{f.roles.length ? f.roles.length + ' vai trò' : 'Chưa chọn vai trò – đăng nhập được nhưng chưa làm được việc gì'}</span>
        <button className="btn" onClick={onBack}>Huỷ</button>
        <button className="btn primary" disabled={!ok || busy} onClick={submit}><Icon name="plus" size={18} />{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button>
      </div>
    </>);
}
