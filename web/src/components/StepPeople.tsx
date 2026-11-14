import { useCallback, useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dt, ROLES } from '../lib/format';
import { STEP_LABEL } from './Checklist';
import { QtTag } from './QtTag';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

/** Người thực hiện + người giám sát + thời hạn của bước (giống giai đoạn BASE Workflow) */
export type OStep = Assign & { order_id: string; step: string; claimed_at: string | null; started_at: string; due_at: string | null; done_at: string | null; done_by: string | null };
export type SDef = Assign & { step: string; role: string; approval: boolean; sla_hours: number };

const initials = (n?: string) => (n || '?').split(' ').filter(Boolean).slice(-2).map((x) => x[0]).join('').toUpperCase();
export const Avatar = ({ p, title }: { p?: Profile; title?: string }) => <span className="av" title={title ?? p?.full_name}>{initials(p?.full_name)}</span>;

export function hoursLeft(due: string | null) { return due ? (new Date(due).getTime() - Date.now()) / 36e5 : null; }
export function DueChip({ due, done }: { due: string | null; done?: string | null }) {
  if (done || !due) return null;
  const h = hoursLeft(due)!;
  if (h < 0) return <span className="chip bad"><Icon name="alert" size={13} />Quá hạn {fmtH(-h)}</span>;
  return <span className={'chip ' + (h < 2 ? 'wait' : 'idle')}><Icon name="clock" size={13} />Còn {fmtH(h)}</span>;
}
const fmtH = (h: number) => (h >= 48 ? Math.round(h / 24) + ' ngày' : h >= 1 ? Math.round(h) + ' giờ' : Math.max(1, Math.round(h * 60)) + ' phút');

export type Group = { id: string; name: string; note: string; member_ids: string[]; active: boolean };
export type Assign = { doer_id: string | null; doer_group_id: string | null; supervisor_ids: string[]; supervisor_group_ids: string[] };
export const GroupBadge = ({ g }: { g?: Group }) => <span className="av grp" title={g ? g.name + ' · ' + g.member_ids.length + ' người' : ''}><Icon name="users" size={12} /></span>;

/** Ô chọn người / nhóm thực hiện + người / nhóm giám sát */
export function PeoplePick({ people, groups, role, v, disabled, approval, onChange }: {
  people: Profile[]; groups: Group[]; role: string; v: Assign; disabled: boolean; approval?: boolean; onChange: (p: Partial<Assign>) => void }) {
  const act = people.filter((p) => p.active), gs = groups.filter((g) => g.active);
  const fit = act.filter((p) => p.roles.includes(role)), rest = act.filter((p) => !p.roles.includes(role));
  const cur = v.doer_group_id ? 'g:' + v.doer_group_id : v.doer_id ? 'p:' + v.doer_id : '';
  const pick = (x: string) => onChange({ doer_id: x.startsWith('p:') ? x.slice(2) : null, doer_group_id: x.startsWith('g:') ? x.slice(2) : null });
  const g = gs.find((x) => x.id === v.doer_group_id);
  return (
    <div className="sp-grid">
      <label className="f">Người / nhóm thực hiện{approval && <span className="small muted"> (bước duyệt: theo chuỗi duyệt)</span>}
        <select value={cur} disabled={disabled} onChange={(e) => pick(e.target.value)} className={!cur && !approval ? 'need' : ''}>
          <option value="">{approval ? '— theo chuỗi duyệt —' : '— chưa giao —'}</option>
          {gs.length > 0 && <optgroup label="Nhóm">{gs.map((x) => <option key={x.id} value={'g:' + x.id}>Nhóm {x.name} ({x.member_ids.length})</option>)}</optgroup>}
          {fit.length > 0 && <optgroup label={'Có vai trò ' + (ROLES[role] ?? role)}>{fit.map((p) => <option key={p.id} value={'p:' + p.id}>{p.full_name}</option>)}</optgroup>}
          <optgroup label="Người khác">{rest.map((p) => <option key={p.id} value={'p:' + p.id}>{p.full_name}</option>)}</optgroup>
        </select>
        {g && <span className="small muted">Ai trong nhóm cũng làm được: {g.member_ids.map((id) => people.find((p) => p.id === id && p.active)?.full_name).filter(Boolean).join(', ') || 'nhóm chưa có người'}</span>}
      </label>
      <div className="f">Người / nhóm giám sát
        <div className="sp-sups">
          {v.supervisor_group_ids.map((id) => { const x = gs.find((y) => y.id === id) ?? groups.find((y) => y.id === id); return (
            <span key={id} className="sp-chip grp"><GroupBadge g={x} />Nhóm {x?.name ?? '?'}
              {!disabled && <button aria-label={'Bỏ nhóm ' + (x?.name ?? '')} onClick={() => onChange({ supervisor_group_ids: v.supervisor_group_ids.filter((y) => y !== id) })}><Icon name="x" size={14} /></button>}</span>); })}
          {v.supervisor_ids.map((id) => { const p = people.find((x) => x.id === id); return (
            <span key={id} className="sp-chip"><Avatar p={p} />{p?.full_name ?? '?'}
              {!disabled && <button aria-label={'Bỏ ' + (p?.full_name ?? '')} onClick={() => onChange({ supervisor_ids: v.supervisor_ids.filter((x) => x !== id) })}><Icon name="x" size={14} /></button>}</span>); })}
          {!disabled && (
            <select aria-label="Thêm người hoặc nhóm giám sát" value="" onChange={(e) => { const x = e.target.value; if (!x) return;
              if (x.startsWith('g:')) onChange({ supervisor_group_ids: [...v.supervisor_group_ids, x.slice(2)] }); else onChange({ supervisor_ids: [...v.supervisor_ids, x.slice(2)] }); }}>
              <option value="">+ Thêm</option>
              {gs.filter((x) => !v.supervisor_group_ids.includes(x.id)).length > 0 && <optgroup label="Nhóm">{gs.filter((x) => !v.supervisor_group_ids.includes(x.id)).map((x) => <option key={x.id} value={'g:' + x.id}>Nhóm {x.name}</option>)}</optgroup>}
              <optgroup label="Người">{act.filter((p) => !v.supervisor_ids.includes(p.id)).map((p) => <option key={p.id} value={'p:' + p.id}>{p.full_name}</option>)}</optgroup>
            </select>)}
          {disabled && !v.supervisor_ids.length && !v.supervisor_group_ids.length && <span className="small muted">Chưa có</span>}
        </div>
      </div>
    </div>);
}

export function useGroups() {
  const [g, setG] = useState<Group[]>([]);
  const load = useCallback(() => { sb.from('work_groups').select('*').order('name').then(({ data }) => setG((data as Group[]) ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  return [g, load] as const;
}

export function StepPeople({ orderId, step, people }: { orderId: string; step: string; people: Record<string, Profile> }) {
  const { me, can } = useAuth(); const [groups] = useGroups();
  const [r, setR] = useState<OStep | null>(null); const [def, setDef] = useState<SDef | null>(null);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = useCallback(async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      sb.from('order_steps').select('*').eq('order_id', orderId).eq('step', step).maybeSingle(),
      sb.from('step_defaults').select('*').eq('step', step).maybeSingle()]);
    setR(a as OStep | null); setDef(b as SDef | null);
  }, [orderId, step]);
  useEffect(() => { load(); }, [load]);
  if (!r) return null;
  const list = Object.values(people);
  const mine = (gid: string | null) => !!gid && !!groups.find((g) => g.id === gid)?.member_ids.includes(me?.id ?? '');
  const editable = can('admin_it') || can('admin_cnc') || can('kinh_doanh') || r.supervisor_ids.includes(me?.id ?? '') || r.doer_id === me?.id
    || mine(r.doer_group_id) || r.supervisor_group_ids.some(mine);
  const inGrp = mine(r.doer_group_id);
  const claim = async () => {
    setErr(''); const { error } = await sb.rpc('claim_step', { p_order: orderId, p_step: step });
    if (error) setErr(errText(error)); else { setOk('Bạn đã nhận việc'); load(); setTimeout(() => setOk(''), 2000); }
  };
  const save = async (patch: Partial<Assign>) => {
    setErr(''); setOk('');
    const { error } = await sb.from('order_steps').update(patch).eq('order_id', orderId).eq('step', step);
    if (error) setErr(errText(error)); else { setOk('Đã lưu'); load(); setTimeout(() => setOk(''), 1500); }
  };
  return (
    <div className="sp">
      <div className="sp-head">
        <b>{STEP_LABEL[step] ?? step}</b>
        <span className="small muted">Bắt đầu {dt(r.started_at)}{r.due_at ? ' · hạn ' + dt(r.due_at) : ''}{def ? ' · SLA ' + def.sla_hours + 'h' : ''}</span>
        <DueChip due={r.due_at} done={r.done_at} />
        {ok && <span className="small" style={{ color: 'var(--blue)' }}>{ok}</span>}
      </div>
      <PeoplePick people={list} groups={groups} role={def?.role ?? ''} approval={def?.approval} v={r} disabled={!editable} onChange={save} />
      {r.doer_group_id && (
        <div className={'claim' + (r.doer_id ? ' on' : '')}>
          {r.doer_id ? <span><Avatar p={people[r.doer_id]} /> <b>{people[r.doer_id]?.full_name}</b> đã nhận việc{r.claimed_at ? ' lúc ' + dt(r.claimed_at) : ''}</span>
            : <span><Icon name="alert" size={15} /> <b>Chưa ai nhận việc</b> – cả nhóm đã được báo qua Zalo. Phải có người nhận mới chuyển được bước.</span>}
          {(inGrp || can('admin_it') || can('admin_cnc')) && r.doer_id !== me?.id && (
            <button className="btn sm primary" onClick={claim}><Icon name="check" size={16} />{r.doer_id ? 'Nhận lại việc' : 'Nhận việc'}</button>)}
        </div>)}
      {!r.doer_id && !r.doer_group_id && !def?.approval && <div className="small" style={{ color: 'var(--red)' }}><Icon name="alert" size={13} /> Chưa có người / nhóm thực hiện – phải giao mới chuyển được bước.</div>}
      {err && <div className="msg err">{err}</div>}
    </div>);
}

/** Quản trị: người mặc định + SLA cho từng bước (chỉ Admin IT sửa) */
export function StepDefaultsAdmin({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<SDef[] | null>(null); const [people, setPeople] = useState<Profile[]>([]); const [groups] = useGroups();
  const [err, setErr] = useState('');
  const load = useCallback(() => {
    sb.from('step_defaults').select('*').then(({ data }) => setRows((data as SDef[]) ?? []));
    sb.from('profiles').select('*').order('full_name').then(({ data }) => setPeople((data as Profile[]) ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async (step: string, patch: Partial<SDef>) => {
    setErr('');
    const { error } = await sb.from('step_defaults').update(patch).eq('step', step);
    if (error) setErr(errText(error)); else load();
  };
  const order = Object.keys(STEP_LABEL);
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!canEdit && <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được sửa người phụ trách mặc định.</span></div>}
      <p className="small muted" style={{ margin: '0 0 8px' }}>Khi đơn vào bước, app tự giao người thực hiện và người giám sát theo bảng này, hạn = giờ vào bước + SLA. Từng đơn vẫn đổi được trong chi tiết đơn.</p>
      {err && <div className="msg err">{err}</div>}
      {(rows ?? []).sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step)).map((d) => (
        <div key={d.step} className="sd-row">
          <div className="sd-name"><b>{STEP_LABEL[d.step] ?? d.step}</b>{d.approval && <span className="chip wait">Bước duyệt</span>}</div>
          <PeoplePick people={people} groups={groups} role={d.role} approval={d.approval} v={d} disabled={!canEdit} onChange={(p) => save(d.step, p)} />
          <label className="f sd-sla">SLA (giờ)<input inputMode="decimal" defaultValue={d.sla_hours} disabled={!canEdit}
            onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(d.sla_hours) && save(d.step, { sla_hours: Number(e.target.value) })} /></label>
        </div>))}
    </div>);
}

/** Tiến trình các giai đoạn (giống cột phải của BASE): người làm, kỳ vọng vs thực tế */
export function StepTimeline({ orderId, people }: { orderId: string; people: Record<string, Profile> }) {
  const [groups] = useGroups();
  const [rows, setRows] = useState<OStep[]>([]); const [defs, setDefs] = useState<Record<string, SDef>>({});
  useEffect(() => {
    sb.from('order_steps').select('*').eq('order_id', orderId).order('started_at').then(({ data }) => setRows((data as OStep[]) ?? []));
    sb.from('step_defaults').select('*').then(({ data }) => setDefs(Object.fromEntries(((data as SDef[]) ?? []).map((d) => [d.step, d]))));
  }, [orderId]);
  if (!rows.length) return null;
  return (
    <div className="card">
      <h3 style={{ margin: '0 0 8px' }}>Tiến trình các giai đoạn</h3>
      <ol className="stl">
        {rows.map((r, i) => {
          const spent = ((r.done_at ? new Date(r.done_at).getTime() : Date.now()) - new Date(r.started_at).getTime()) / 36e5;
          const exp = defs[r.step]?.sla_hours ?? 0; const over = exp > 0 && spent > exp;
          return (
            <li key={r.step} className={r.done_at ? 'done' : 'cur'}>
              <span className="stl-n">{r.done_at ? <Icon name="check" size={13} /> : i + 1}</span>
              <div className="stl-b">
                <div className="row between" style={{ gap: 6 }}><b>{STEP_LABEL[r.step] ?? r.step}</b><span className="small muted">{dt(r.done_at ?? r.started_at)}</span></div>
                <div className="stl-bar"><span style={{ width: Math.min(100, exp ? (spent / exp) * 100 : 0) + '%' }} className={over ? 'over' : ''} /></div>
                <div className="row between small muted" style={{ gap: 6 }}>
                  <span>Kỳ vọng {exp}h · Thực tế <b className={over ? 'bad-t' : ''}>{spent.toFixed(1)}h</b></span>
                  <span className="row" style={{ gap: 4 }}>{r.doer_group_id && <><GroupBadge g={groups.find((g) => g.id === r.doer_group_id)} />Nhóm {groups.find((g) => g.id === r.doer_group_id)?.name}</>}{r.doer_id && <><Avatar p={people[r.doer_id]} />{people[r.doer_id]?.full_name}</>}
                    {(r.supervisor_ids.length + r.supervisor_group_ids.length) > 0 && <span title="Giám sát"> · GS: {[...r.supervisor_group_ids.map((g) => 'Nhóm ' + (groups.find((x) => x.id === g)?.name ?? '?')), ...r.supervisor_ids.map((s) => people[s]?.full_name)].join(', ')}</span>}</span>
                </div>
              </div>
            </li>);
        })}
      </ol>
    </div>);
}

/** Quản trị nhóm (Admin IT) */
export function GroupsAdmin({ canEdit }: { canEdit: boolean }) {
  const [groups, reload] = useGroups(); const [people, setPeople] = useState<Profile[]>([]);
  const [name, setName] = useState(''); const [err, setErr] = useState(''); const [open, setOpen] = useState('');
  useEffect(() => { sb.from('profiles').select('*').order('full_name').then(({ data }) => setPeople((data as Profile[]) ?? [])); }, []);
  const delGroup = async (g: Group) => {
    if (!(await confirmDialog(`Xoá hẳn nhóm "${g.name}"? Không khôi phục được.`, 'Xoá nhóm', true))) return;
    setErr(''); const { data, error } = await sb.rpc('del_group', { p_id: g.id });
    if (error) setErr(errText(error)); else if (data) toast(data as string); else { toast('Đã xoá nhóm ' + g.name); setOpen(''); reload(); } };
  const upd = async (id: string, patch: Partial<Group>) => { setErr(''); const { error } = await sb.from('work_groups').update(patch).eq('id', id); if (error) setErr(errText(error)); else reload(); };
  const add = async () => { if (!name.trim()) return; setErr('');
    const { data, error } = await sb.from('work_groups').insert({ name: name.trim() }).select().single();
    if (error) setErr(errText(error)); else { setName(''); reload(); setOpen((data as Group).id); } };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!canEdit && <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được lập và sửa nhóm.</span></div>}
      <p className="small muted" style={{ margin: 0 }}>Giao bước cho một nhóm thì ai trong nhóm cũng làm và chuyển bước được. Một người có thể ở nhiều nhóm.</p>
      {canEdit && <div className="row"><label className="f" style={{ flex: '1 1 260px' }}>Tên nhóm mới<input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ví dụ: Kho IPC" /></label>
        <button className="btn primary" onClick={add}><Icon name="plus" size={16} />Tạo nhóm</button></div>}
      {err && <div className="msg err">{err}</div>}
      {groups.length === 0 && <p className="muted" style={{ margin: 0 }}>Chưa có nhóm.</p>}
      <ul className="grp-list">
        {groups.map((g) => (
          <li key={g.id} className={g.active ? '' : 'off'}>
            <button className="grp-row" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? '' : g.id)}>
              <GroupBadge g={g} /><b>{g.name}</b><span className="small muted">{g.member_ids.length} người{g.active ? '' : ' · đã ẩn'}</span>
              <span className="grp-avs">{g.member_ids.slice(0, 6).map((id) => <Avatar key={id} p={people.find((p) => p.id === id)} />)}</span>
              <Icon name="arrow" size={16} />
            </button>
            {open === g.id && (
              <div className="grp-edit">
                <label className="f">Tên nhóm<input defaultValue={g.name} disabled={!canEdit} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== g.name && upd(g.id, { name: e.target.value.trim() })} /></label>
                <label className="f">Ghi chú<input defaultValue={g.note} disabled={!canEdit} onBlur={(e) => e.target.value !== g.note && upd(g.id, { note: e.target.value })} /></label>
                <div className="f">Thành viên
                  <div className="grp-mem">
                    {people.filter((p) => p.active).map((p) => { const on = g.member_ids.includes(p.id); return (
                      <label key={p.id} className={'ck-item' + (on ? ' sel' : '')}>
                        <input type="checkbox" checked={on} disabled={!canEdit} onChange={() => upd(g.id, { member_ids: on ? g.member_ids.filter((x) => x !== p.id) : [...g.member_ids, p.id] })} />
                        <Avatar p={p} /><span>{p.full_name}<span className="small muted"> · {p.roles.map((r) => ROLES[r] ?? r).join(', ') || 'chưa có vai trò'}</span></span>
                      </label>); })}
                  </div>
                </div>
                {canEdit && <div className="row" style={{ gap: 8 }}><button className="btn sm" onClick={() => upd(g.id, { active: !g.active })}>{g.active ? 'Ẩn nhóm' : 'Hiện lại nhóm'}</button>
                  <button className="btn sm danger" onClick={() => delGroup(g)}><Icon name="trash" size={14} />Xoá nhóm</button></div>}
              </div>)}
          </li>))}
      </ul>
    </div>);
}

/** Việc của tôi: bước nhóm tôi chờ nhận + bước tôi đang làm */
export function StepInbox() {
  const { me } = useAuth(); const [groups] = useGroups();
  const [rows, setRows] = useState<(OStep & { orders: { code: string; project: string } })[] | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => { sb.from('order_steps').select('*, orders(code, project)').is('done_at', null).order('due_at').then(({ data }) => setRows((data as never) ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows || !me) return null;
  const myG = groups.filter((g) => g.member_ids.includes(me.id)).map((g) => g.id);
  const wait = rows.filter((r) => r.doer_group_id && !r.doer_id && myG.includes(r.doer_group_id));
  const mine = rows.filter((r) => r.doer_id === me.id);
  if (!wait.length && !mine.length) return null;
  const tab = (st: string) => (st.startsWith('qt0') ? 'F1' : st.startsWith('qt1') ? 'F2' : st.startsWith('qt2') ? 'QT2' : 'GH');
  const claim = async (r: OStep) => { setErr(''); const { error } = await sb.rpc('claim_step', { p_order: r.order_id, p_step: r.step }); if (error) setErr(errText(error)); else load(); };
  const Row = ({ r, act }: { r: OStep & { orders: { code: string; project: string } }; act?: boolean }) => (
    <li className={'inbox-row qtl ' + r.step.slice(0, 3)}>
      <a href={'#/don/' + r.order_id + '?tab=' + tab(r.step)} className="inbox-main">
        <span className="row" style={{ gap: 8 }}><QtTag qt={r.step.slice(0, 3).toUpperCase()} /><b>{r.orders.code}</b></span><span className="small">{STEP_LABEL[r.step] ?? r.step}</span><span className="small muted">{r.orders.project}</span></a>
      <DueChip due={r.due_at} />
      {act && <button className="btn sm primary" onClick={() => claim(r)}><Icon name="check" size={16} />Nhận việc</button>}
    </li>);
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {wait.length > 0 && <><h2 style={{ margin: 0 }}>Nhóm tôi có việc chờ nhận <span className="kb-count">{wait.length}</span></h2>
        <ul className="inbox">{wait.map((r) => <Row key={r.order_id + r.step} r={r} act />)}</ul></>}
      {mine.length > 0 && <><h2 style={{ margin: 0 }}>Việc tôi đang làm <span className="kb-count">{mine.length}</span></h2>
        <ul className="inbox">{mine.map((r) => <Row key={r.order_id + r.step} r={r} />)}</ul></>}
      {err && <div className="msg err">{err}</div>}
    </section>);
}
