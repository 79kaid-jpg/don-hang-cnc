import { useCallback, useEffect, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { dt, ROLES } from '../lib/format';
import { STEP_LABEL } from './Checklist';
import { Icon } from './Icon';

/** Người thực hiện + người giám sát + thời hạn của bước (giống giai đoạn BASE Workflow) */
export type OStep = { order_id: string; step: string; doer_id: string | null; supervisor_ids: string[]; started_at: string; due_at: string | null; done_at: string | null; done_by: string | null };
export type SDef = { step: string; role: string; approval: boolean; doer_id: string | null; supervisor_ids: string[]; sla_hours: number };

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

/** Hai ô chọn người, dùng cho cả đơn lẻ và mặc định */
function PeoplePick({ people, role, doer, sups, disabled, approval, onChange }: {
  people: Profile[]; role: string; doer: string | null; sups: string[]; disabled: boolean; approval?: boolean;
  onChange: (doer: string | null, sups: string[]) => void }) {
  const act = people.filter((p) => p.active);
  const fit = act.filter((p) => p.roles.includes(role)), rest = act.filter((p) => !p.roles.includes(role));
  return (
    <div className="sp-grid">
      <label className="f">Người thực hiện{approval && <span className="small muted"> (bước duyệt: theo chuỗi duyệt)</span>}
        <select value={doer ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null, sups)} className={!doer && !approval ? 'need' : ''}>
          <option value="">{approval ? '— theo chuỗi duyệt —' : '— chưa giao —'}</option>
          {fit.length > 0 && <optgroup label={'Có vai trò ' + (ROLES[role] ?? role)}>{fit.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</optgroup>}
          <optgroup label="Người khác">{rest.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</optgroup>
        </select></label>
      <div className="f">Người giám sát
        <div className="sp-sups">
          {sups.map((id) => { const p = people.find((x) => x.id === id); return (
            <span key={id} className="sp-chip"><Avatar p={p} />{p?.full_name ?? '?'}
              {!disabled && <button aria-label={'Bỏ ' + (p?.full_name ?? '')} onClick={() => onChange(doer, sups.filter((x) => x !== id))}><Icon name="x" size={14} /></button>}</span>); })}
          {!disabled && (
            <select aria-label="Thêm người giám sát" value="" onChange={(e) => e.target.value && onChange(doer, [...sups, e.target.value])}>
              <option value="">+ Thêm</option>
              {act.filter((p) => !sups.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>)}
          {disabled && !sups.length && <span className="small muted">Chưa có</span>}
        </div>
      </div>
    </div>);
}

export function StepPeople({ orderId, step, people }: { orderId: string; step: string; people: Record<string, Profile> }) {
  const { me, can } = useAuth();
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
  const editable = can('admin_it') || can('admin_cnc') || can('kinh_doanh') || r.supervisor_ids.includes(me?.id ?? '') || r.doer_id === me?.id;
  const save = async (doer: string | null, sups: string[]) => {
    setErr(''); setOk('');
    const { error } = await sb.from('order_steps').update({ doer_id: doer, supervisor_ids: sups }).eq('order_id', orderId).eq('step', step);
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
      <PeoplePick people={list} role={def?.role ?? ''} approval={def?.approval} doer={r.doer_id} sups={r.supervisor_ids} disabled={!editable} onChange={save} />
      {!r.doer_id && !def?.approval && <div className="small" style={{ color: 'var(--red)' }}><Icon name="alert" size={13} /> Chưa có người thực hiện – phải giao người mới chuyển được bước.</div>}
      {err && <div className="msg err">{err}</div>}
    </div>);
}

/** Quản trị: người mặc định + SLA cho từng bước (chỉ Admin IT sửa) */
export function StepDefaultsAdmin({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<SDef[] | null>(null); const [people, setPeople] = useState<Profile[]>([]);
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
          <PeoplePick people={people} role={d.role} approval={d.approval} doer={d.doer_id} sups={d.supervisor_ids} disabled={!canEdit}
            onChange={(doer, sups) => save(d.step, { doer_id: doer, supervisor_ids: sups })} />
          <label className="f sd-sla">SLA (giờ)<input inputMode="decimal" defaultValue={d.sla_hours} disabled={!canEdit}
            onBlur={(e) => Number(e.target.value) > 0 && Number(e.target.value) !== Number(d.sla_hours) && save(d.step, { sla_hours: Number(e.target.value) })} /></label>
        </div>))}
    </div>);
}

/** Tiến trình các giai đoạn (giống cột phải của BASE): người làm, kỳ vọng vs thực tế */
export function StepTimeline({ orderId, people }: { orderId: string; people: Record<string, Profile> }) {
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
                  <span className="row" style={{ gap: 4 }}>{r.doer_id && <><Avatar p={people[r.doer_id]} />{people[r.doer_id]?.full_name}</>}
                    {r.supervisor_ids.length > 0 && <span title="Giám sát"> · GS: {r.supervisor_ids.map((s) => people[s]?.full_name).join(', ')}</span>}</span>
                </div>
              </div>
            </li>);
        })}
      </ol>
    </div>);
}
