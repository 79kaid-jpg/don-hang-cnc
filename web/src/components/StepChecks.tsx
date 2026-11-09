import { useEffect, useRef, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { FLOW, STATUS, PROC_NAME, PROC_TABLES, TABLES, type Proc, type Doc } from '../lib/proc';
import { fieldsOf, useFields } from '../lib/fields';
import { itemsOf, loadChecks, progress, useChecks, applyAuto, reqKeysOf, AUTO_HINT, LEVEL_NAME, type CheckItem, type CheckTpl, type Level } from '../lib/checks';
import { useAuth } from '../lib/auth';
import { Ring } from './Ring';
import { Icon } from './Icon';
import { toast, confirmDialog } from './ui';

type DocCk = Doc & { checklist?: Record<string, CheckItem[]> };
const fdt = (s?: string) => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/** Dải bước ở đầu phiếu: mỗi bước một vòng tiến độ checklist */
export function StepRings({ proc, d }: { proc: Proc; d: DocCk }) {
  const tpl = useChecks(); const fl = FLOW[proc]; const ci = fl.indexOf(d.status === 'duyet_them' ? 'duyet' : d.status); const fin = d.status === 'da_duyet';
  const rows = fl.map((s) => ({ s, p: progress(s === d.status ? applyAuto(itemsOf(tpl, proc, s, d.checklist), d, reqKeysOf(proc, d.company, s)).items : itemsOf(tpl, proc, s, d.checklist)) })).filter((x) => x.p.total);
  if (!rows.length) return null;
  return <div className="sc-steps" aria-label="Checklist theo bước">{rows.map(({ s, p }) => { const k = fl.indexOf(s);
    return <span key={s} className={'sc-step' + (k === ci && !fin ? ' cur' : k < ci || fin ? ' past' : '')}><Ring done={p.done} total={p.total} size={28} stroke={3.5} />{STATUS[s]}</span>; })}</div>;
}

/** Checklist của bước hiện tại – tích, ghi chú, thêm mục riêng cho hồ sơ */
export function StepChecks({ proc, d, people, canEdit, onChanged, live }: { proc: Proc; d: DocCk; people: Record<string, Profile>; canEdit: boolean; onChanged?: () => void; live?: { header?: Record<string, string>; tables?: Record<string, Record<string, unknown>[]>; files?: { kind: string }[] } }) {
  const tpl = useChecks(); const { me } = useAuth();
  const step = d.status;
  const [items, setItems] = useState<CheckItem[]>(() => itemsOf(tpl, proc, step, d.checklist));
  const [nl, setNl] = useState(''); const [busy, setBusy] = useState(false);
  const base = useRef<CheckItem[] | null>(null);
  useEffect(() => { base.current = null; }, [d.checklist, step]);
  const data = live ?? d;
  useEffect(() => { const r = applyAuto(base.current ?? itemsOf(tpl, proc, step, d.checklist), data, reqKeysOf(proc, d.company, step)); setItems(r.items);
    // Tự tích / bỏ tích theo dữ liệu đang nhập (lưu checklist sau 0,8 giây)
    if (!r.changed || !canEdit || !FLOW[proc].includes(step)) return;
    base.current = r.items;
    const tm = setTimeout(() => { sb.rpc('doc_check', { p_doc: d.id, p_step: step, p_items: r.items }); }, 800);
    return () => clearTimeout(tm);
  }, [tpl, proc, step, d.checklist, data.header, data.tables, data.files]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!FLOW[proc].includes(step) || !items.length && !canEdit) return null;
  const p = progress(items);
  const push = async (next: CheckItem[]) => {
    setItems(next); setBusy(true);
    const { error } = await sb.rpc('doc_check', { p_doc: d.id, p_step: step, p_items: next }); setBusy(false);
    if (error) { toast(errText(error)); setItems(base.current ?? itemsOf(tpl, proc, step, d.checklist)); return; }
    base.current = next; onChanged?.();
  };
  const set = (i: number, patch: Partial<CheckItem>) => push(items.map((x, k) => k === i ? { ...x, ...patch } : x));
  const tick = (i: number) => { const x = items[i]; const on = !x.done;
    if (on && x.level === 'note' && !(x.note ?? '').trim()) { toast('Mục này cần ghi chú trước khi tích'); return; }
    set(i, on ? { done: true, by: me?.id, at: new Date().toISOString() } : { done: false, by: undefined, at: undefined }); };
  const add = () => { const v = nl.trim(); if (!v) return; setNl(''); push([...items, { id: 'c' + Date.now(), label: v, level: 'rec', custom: true }]); };
  const del = async (i: number) => { if (await confirmDialog(`Xoá mục “${items[i].label}” khỏi hồ sơ này?`, 'Xoá mục')) push(items.filter((_, k) => k !== i)); };
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
  return (
    <section className={'sc-card' + (p.total && !p.miss && p.done === p.total ? ' ok' : '')} aria-label="Checklist bước hiện tại">
      <div className="sc-head">
        <Ring done={p.done} total={p.total} size={44} stroke={5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3>Checklist · {STATUS[step]}</h3>
          <div className="sc-sub">{p.done}/{p.total} mục · {p.miss ? <b style={{ color: '#B45309' }}>còn {p.miss} mục bắt buộc</b> : 'đủ mục bắt buộc'}{busy ? ' · đang lưu…' : ''}</div>
        </div>
        <div className="sc-bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></div>
      </div>
      <ul className="sc-list">{items.map((x, i) => (
        <li key={x.id} className={'sc-it' + (x.done ? ' done' : '')}>
          <input type="checkbox" checked={!!x.done} disabled={!canEdit || busy || !!x.auto} onChange={() => tick(i)} aria-label={x.label} title={x.auto ? 'Tự kiểm: ' + AUTO_HINT(x.auto) : undefined} />
          <div className="sc-l"><span>{x.label}</span>
            {x.level === 'note' && (canEdit && !x.done ? <input className="sc-note" placeholder="Ghi chú / số liệu…" defaultValue={x.note ?? ''} onBlur={(e) => e.target.value !== (x.note ?? '') && set(i, { note: e.target.value })} />
              : x.note ? <span className="small">📝 {x.note}</span> : null)}
            {x.done && x.by && <span className="sc-meta">✓ {x.by === 'auto' ? 'Hệ thống tự kiểm' : people[x.by]?.full_name ?? '…'} · {fdt(x.at)}</span>}
            {x.auto && !x.done && <span className="sc-meta sc-auto">⚡ Tự tích khi {AUTO_HINT(x.auto)} </span>}
          </div>
          {x.auto && <span className="sc-lv auto" title={'Tự kiểm: ' + AUTO_HINT(x.auto)}>⚡ Tự kiểm</span>}
          <span className={'sc-lv ' + x.level}>{LEVEL_NAME[x.level]}</span>
          {canEdit && x.custom && <button className="sc-del" aria-label="Xoá mục" onClick={() => del(i)}><Icon name="x" size={14} /></button>}
        </li>))}</ul>
      {canEdit && <div className="sc-add"><input value={nl} placeholder="Thêm mục riêng cho hồ sơ này…" onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn xs" disabled={!nl.trim()} onClick={add}><Icon name="plus" size={13} />Thêm</button></div>}
    </section>);
}

const STEPS_OF = (p: Proc) => FLOW[p];
/** Quản trị → Checklist: mẫu mặc định cho từng bước của QT0–QT3 */
export function StepChecksAdmin({ canEdit }: { canEdit: boolean }) {
  const [all, setAll] = useState<CheckTpl[] | null>(null); const [sel, setSel] = useState<[Proc, string]>(['QT0', 'tiep_nhan']);
  const [nl, setNl] = useState(''); const [lv, setLv] = useState<Level>('req'); const [drag, setDrag] = useState<string | null>(null);
  const load = () => sb.from('step_checks').select('*').order('ord').then(({ data }) => { setAll((data as CheckTpl[]) ?? []); loadChecks(true); });
  useEffect(() => { load(); }, []);
  const list = (all ?? []).filter((x) => x.proc === sel[0] && x.step === sel[1]);
  const upd = async (id: string, patch: Partial<CheckTpl>) => { const { error } = await sb.from('step_checks').update(patch).eq('id', id); if (error) toast(errText(error)); else load(); };
  const add = async () => { if (!nl.trim()) return; const { error } = await sb.from('step_checks').insert({ proc: sel[0], step: sel[1], label: nl.trim(), level: lv, ord: (list.at(-1)?.ord ?? 0) + 1 });
    if (error) toast(errText(error)); else { setNl(''); load(); } };
  const del = async (x: CheckTpl) => { if (!(await confirmDialog(`Xoá “${x.label}”? Hồ sơ đang làm đã chụp checklist vẫn giữ nguyên.`, 'Xoá mục'))) return;
    const { error } = await sb.from('step_checks').delete().eq('id', x.id); if (error) toast(errText(error)); else load(); };
  const drop = async (target: string) => { if (!drag || drag === target) return; const ids = list.map((x) => x.id); const a = ids.indexOf(drag), b = ids.indexOf(target);
    ids.splice(b, 0, ids.splice(a, 1)[0]); setDrag(null);
    await Promise.all(ids.map((id, i) => sb.from('step_checks').update({ ord: i + 1 }).eq('id', id))); load(); };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div><h2 style={{ margin: 0 }}>Checklist theo bước</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Mẫu mặc định cho từng bước. Khi hồ sơ bắt đầu tích, checklist được chụp lại vào hồ sơ – sửa mẫu chỉ áp dụng cho hồ sơ chưa tích. Mục <b>Bắt buộc</b> chưa tích thì không ký chuyển bước được.</p></div>
      {!canEdit && <div className="msg info"><Icon name="alert" size={16} /><span>Chỉ Admin IT được sửa.</span></div>}
      <div className="sca-grid">
        <nav className="sca-nav" aria-label="Chọn bước">{(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => <div key={p}><h4>{p} · {PROC_NAME[p]}</h4>
          {STEPS_OF(p).map((s) => { const n = (all ?? []).filter((x) => x.proc === p && x.step === s && x.active).length;
            return <button key={s} className={sel[0] === p && sel[1] === s ? 'on' : ''} onClick={() => setSel([p, s])}>{STATUS[s]}<em>{n}</em></button>; })}</div>)}</nav>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <b>{sel[0]} · {STATUS[sel[1]]}</b>
          <ul className="sca-list">{list.map((x) => (
            <li key={x.id} className={'sca-row' + (drag === x.id ? ' drag' : '')} draggable={canEdit} onDragStart={() => setDrag(x.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(x.id)}>
              <span className="grip" aria-hidden="true">⋮⋮</span>
              <input defaultValue={x.label} disabled={!canEdit} aria-label="Nội dung" onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== x.label && upd(x.id, { label: e.target.value.trim() })} />
              <AutoPick proc={sel[0]} value={x.auto ?? ''} disabled={!canEdit} onChange={(v) => upd(x.id, { auto: v || null })} />
              <select value={x.level} disabled={!canEdit} aria-label="Mức" onChange={(e) => upd(x.id, { level: e.target.value as Level })}>{(Object.keys(LEVEL_NAME) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_NAME[l]}</option>)}</select>
              {canEdit && <button className="btn xs icon-only" aria-label="Xoá" onClick={() => del(x)}><Icon name="trash" size={13} /></button>}
            </li>))}
            {all && !list.length && <li className="small muted">Bước này chưa có mục nào.</li>}</ul>
          {canEdit && <div className="sc-add"><input value={nl} placeholder="Thêm mục…" onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <select value={lv} onChange={(e) => setLv(e.target.value as Level)} style={{ width: 150, height: 36, minHeight: 36 }}>{(Object.keys(LEVEL_NAME) as Level[]).map((l) => <option key={l} value={l}>{LEVEL_NAME[l]}</option>)}</select>
            <button className="btn xs primary" onClick={add} disabled={!nl.trim()}><Icon name="plus" size={13} />Thêm</button></div>}
        </div></div>
    </div>);
}

/** Chọn quy tắc tự kiểm cho một mục checklist */
function AutoPick({ proc, value, disabled, onChange }: { proc: Proc; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  useFields();
  const hs = fieldsOf(proc, 'header'), fs = fieldsOf(proc, 'file');
  const tbs = PROC_TABLES[proc].map(([k, def]) => ({ k, t: TABLES[def]?.t ?? k, cols: TABLES[def]?.cols ?? [] }));
  return <select className="sca-auto" value={value} disabled={disabled} aria-label="Tự kiểm tra" onChange={(e) => onChange(e.target.value)}>
    <option value="">Tích tay</option>
    <option value="req">⚡ Đủ trường bắt buộc của bước</option>
    <optgroup label="⚡ Ô thông tin đã nhập">{hs.map((f) => <option key={f.key} value={'h:' + f.key}>{f.label}</option>)}</optgroup>
    <optgroup label="⚡ Bảng có dữ liệu">{tbs.map((t) => <option key={t.k} value={'t:' + t.k}>{t.t}</option>)}</optgroup>
    <optgroup label="⚡ Cột đã nhập đủ mọi dòng">{tbs.flatMap((t) => t.cols.filter((c) => !c.calc).map((c) => <option key={t.k + c.k} value={'c:' + t.k + '.' + c.k}>{t.t} · {c.t}</option>))}</optgroup>
    <optgroup label="⚡ Đã tải file">{fs.map((f) => <option key={f.key} value={'f:' + f.key}>{f.label}</option>)}</optgroup>
  </select>;
}
