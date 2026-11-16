import { useEffect, useRef, useState } from 'react';
import { sb, errText, type Profile } from '../lib/supabase';
import { FLOW, STATUS, PROC_NAME, PROC_TABLES, TABLES, type Proc, type Doc } from '../lib/proc';
import { fieldsOf, useFields } from '../lib/fields';
import { itemsOf, loadChecks, progress, useChecks, applyAuto, reqKeysOf, missingReq, jumpField, AUTO_HINT, LEVEL_NAME, type CheckItem, type CheckTpl, type Level } from '../lib/checks';
import { useAuth } from '../lib/auth';
import { Ring } from './Ring';
import { Icon } from './Icon';
import { InfoChip, toast, confirmDialog } from './ui';

type DocCk = Doc & { checklist?: Record<string, CheckItem[]> };
const fdt = (s?: string) => s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/** Tiến độ checklist từng bước của một phiếu (bước hiện tại tính cả tự tích) */
export function useStepProg(proc: Proc, d?: DocCk) {
  const tpl = useChecks();
  if (!d) return {} as Record<string, { done: number; total: number }>;
  return Object.fromEntries(FLOW[proc].map((s) => [s, progress(s === d.status ? applyAuto(itemsOf(tpl, proc, s, d.checklist), d, reqKeysOf(proc, d.company, s)).items : itemsOf(tpl, proc, s, d.checklist))]));
}

/** Chấm của thanh bước: vòng checklist x/y nếu bước có checklist, không thì số thứ tự / dấu tích */
export function StepDot({ n, done, p }: { n: number | string; done: boolean; p?: { done: number; total: number } }) {
  if (done || !p?.total) return <span className="dot">{done ? <Icon name="check" size={12} /> : n}</span>;
  return <span className="dot ring-dot" title={`Bước ${n} · checklist ${p.done}/${p.total}`}><Ring done={p.done} total={p.total} size={30} stroke={3} /></span>;
}

/** Thanh bước của phiếu QT1–QT3 (Lập → Kiểm tra → Duyệt), mỗi bước kèm vòng checklist */
export function DocSteps({ proc, d, live }: { proc: Proc; d: DocCk; live?: Partial<DocCk> }) {
  const prog = useStepProg(proc, live ? { ...d, ...live } as DocCk : d); const fl = FLOW[proc]; const fin = d.status === 'da_duyet';
  const ci = fl.indexOf(d.status === 'duyet_them' ? 'duyet' : d.status);
  return <ol className="pp-chain doc-steps" aria-label="Các bước của phiếu">{fl.map((s, k) =>
    <li key={s} className={fin || k < ci ? 'done' : k === ci ? 'cur' : ''}><StepDot n={k + 1} done={fin || k < ci} p={prog[s]} />{STATUS[s]}</li>)}</ol>;
}

/** Checklist tự kiểm chưa lưu theo phiếu – gọi flushChecks(docId) trước khi gửi bước */
const pendingCk: Record<string, { run: () => Promise<unknown> }> = {};
export async function flushChecks(docId: string) { const p = pendingCk[docId]; if (p) { await p.run(); delete pendingCk[docId]; } }

/** Checklist của bước hiện tại – tích, ghi chú, thêm mục riêng cho hồ sơ */
export function StepChecks({ proc, d, people, canEdit, onChanged, live }: { proc: Proc; d: DocCk; people: Record<string, Profile>; canEdit: boolean; onChanged?: () => void; live?: { header?: Record<string, string>; tables?: Record<string, Record<string, unknown>[]>; files?: { kind: string }[] } }) {
  const tpl = useChecks(); const { me } = useAuth();
  const step = d.status;
  const [items, setItems] = useState<CheckItem[]>(() => itemsOf(tpl, proc, step, d.checklist));
  const [nl, setNl] = useState(''); const [busy, setBusy] = useState(false); const [all, setAll] = useState(false); const [flash, setFlash] = useState(false); const box = useRef<HTMLElement>(null);
  useEffect(() => { const go = () => { setAll(true); setFlash(true); requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })); setTimeout(() => setFlash(false), 2400); };
    addEventListener('pms-goto-check', go); return () => removeEventListener('pms-goto-check', go); }, []);
  const base = useRef<CheckItem[] | null>(null);
  const saved = useRef(''); // trạng thái tích đã lưu (để biết còn thay đổi chưa lưu)
  const sig = (xs: CheckItem[]) => JSON.stringify(xs.map((x) => [x.id, !!x.done]));
  useEffect(() => { base.current = null; saved.current = sig(itemsOf(tpl, proc, step, d.checklist)); }, [d.checklist, step, tpl]); // eslint-disable-line react-hooks/exhaustive-deps
  const data = live ?? d;
  useEffect(() => { const r = applyAuto(base.current ?? itemsOf(tpl, proc, step, d.checklist), data, reqKeysOf(proc, d.company, step)); setItems(r.items);
    if (r.changed) base.current = r.items;
    // Tự tích / bỏ tích theo dữ liệu: lưu khi khác bản đã lưu (0,6 giây); gửi bước sẽ chờ lưu xong
    if (!canEdit || !FLOW[proc].includes(step) || sig(r.items) === saved.current) { delete pendingCk[d.id]; return; }
    const its = r.items; const run = () => { const p = Promise.resolve(sb.rpc('doc_check', { p_doc: d.id, p_step: step, p_items: its })).then(({ error }) => { if (!error) saved.current = sig(its); }); pendingCk[d.id] = { run: () => p }; return p; };
    pendingCk[d.id] = { run };
    const tm = setTimeout(run, 600);
    return () => clearTimeout(tm);
  }, [tpl, proc, step, d.checklist, data.header, data.tables, data.files]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!FLOW[proc].includes(step) || !items.length && !canEdit) return null;
  const p = progress(items);
  const push = async (next: CheckItem[]) => {
    setItems(next); setBusy(true);
    const { error } = await sb.rpc('doc_check', { p_doc: d.id, p_step: step, p_items: next }); setBusy(false);
    if (error) { toast(errText(error)); setItems(base.current ?? itemsOf(tpl, proc, step, d.checklist)); return; }
    base.current = next; saved.current = sig(next); onChanged?.();
  };
  const set = (i: number, patch: Partial<CheckItem>) => push(items.map((x, k) => k === i ? { ...x, ...patch } : x));
  const tick = (i: number) => { const x = items[i]; const on = !x.done;
    if (on && x.level === 'note' && !(x.note ?? '').trim()) { toast('Mục này cần ghi chú trước khi tích'); return; }
    set(i, on ? { done: true, by: me?.id, at: new Date().toISOString() } : { done: false, by: undefined, at: undefined }); };
  const add = () => { const v = nl.trim(); if (!v) return; setNl(''); push([...items, { id: 'c' + Date.now(), label: v, level: 'rec', custom: true }]); };
  const del = async (i: number) => { if (await confirmDialog(`Xoá mục “${items[i].label}” khỏi hồ sơ này?`, 'Xoá mục')) push(items.filter((_, k) => k !== i)); };
  const pct = p.total ? Math.round(p.done / p.total * 100) : 0; const full = p.total > 0 && p.done === p.total;
  const shown = items.map((x, i) => ({ x, i })).filter(({ x }) => all || !x.done);
  return (
    <section ref={box} className={'sc-card' + (p.total && !p.miss && p.done === p.total ? ' ok' : '') + (flash ? ' flash' : '')} aria-label="Checklist bước hiện tại">
      <button className="sc-head sc-mini" aria-expanded={all} onClick={() => setAll(!all)} title={all ? 'Thu gọn' : 'Xem tất cả mục'}>
        <Ring done={p.done} total={p.total} size={30} stroke={3.5} />
        <b>Checklist</b><span className="sc-cnt">{p.done}/{p.total}</span>{busy && <span className="small muted">đang lưu…</span>}
        <span className="sc-bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></span>
        <span className="sc-more">{all ? 'Thu gọn' : full ? 'Xem' : 'Tất cả'}<Icon name={all ? 'up' : 'down'} size={14} /></span>
      </button>
      {shown.length > 0 && <ul className="sc-list">{shown.map(({ x, i }) => (
        <li key={x.id} className={'sc-it' + (x.done ? ' done' : '') + (flash && !x.done && x.level === 'req' ? ' miss' : '')}>
          <input type="checkbox" checked={!!x.done} disabled={!canEdit || busy || !!x.auto} onChange={() => tick(i)} aria-label={x.label} title={x.auto ? 'Tự kiểm: ' + AUTO_HINT(x.auto) : undefined} />
          <div className="sc-l"><span>{x.label}</span>
            {x.level === 'note' && (canEdit && !x.done ? <input className="sc-note" placeholder="Ghi chú / số liệu…" defaultValue={x.note ?? ''} onBlur={(e) => e.target.value !== (x.note ?? '') && set(i, { note: e.target.value })} />
              : x.note ? <span className="small">📝 {x.note}</span> : null)}
            {x.done && x.by && <span className="sc-meta">✓ {x.by === 'auto' ? 'Hệ thống tự kiểm' : people[x.by]?.full_name ?? '…'} · {fdt(x.at)}</span>}
            {x.auto && !x.done && <span className="sc-meta sc-auto">⚡ Tự tích khi {AUTO_HINT(x.auto)} </span>}
            {x.auto === 'req' && !x.done && (() => { const ms = missingReq(proc, d.company, step, data); return ms.length > 0 && <span className="sc-miss">Còn thiếu: {ms.map((m, j) => <span key={m.key}>{j ? ', ' : ''}<button type="button" className="linklike" onClick={() => jumpField(m.key)}>{m.label}</button></span>)}</span>; })()}
          </div>
          {x.auto && <span className="sc-lv auto" title={'Tự kiểm: ' + AUTO_HINT(x.auto)}>⚡ Tự kiểm</span>}
          <span className={'sc-lv ' + x.level}>{LEVEL_NAME[x.level]}</span>
          {canEdit && x.custom && <button className="sc-del" aria-label="Xoá mục" onClick={() => del(i)}><Icon name="x" size={14} /></button>}
        </li>))}</ul>}
      {canEdit && all && <div className="sc-add"><input value={nl} placeholder="Thêm mục riêng cho hồ sơ này…" onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn xs" disabled={!nl.trim()} onClick={add}><Icon name="plus" size={13} />Thêm</button></div>}
    </section>);
}

const STEPS_OF = (p: Proc) => FLOW[p];
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const PRESETS: [string, Level][] = [['Đối chiếu số lượng với danh sách tấm QT0', 'req'], ['Kiểm tra thành tiền, VAT, tổng thanh toán', 'req'], ['Đã đính kèm file ký tay', 'req'],
  ['Thông tin khách hàng, dự án đúng', 'req'], ['Kiểm tra quy cách, mác thép', 'req'], ['Hạn giao đã xác nhận với khách', 'rec'], ['Ghi chú chênh lệch (nếu có)', 'note']];
/** Quản trị → Checklist: bản đồ bước + soạn trực tiếp từng mục */
export function StepChecksAdmin({ canEdit }: { canEdit: boolean }) {
  const [all, setAll] = useState<CheckTpl[] | null>(null); const [sel, setSel] = useState<[Proc, string]>(['QT0', 'tiep_nhan']);
  const [nl, setNl] = useState(''); const [drag, setDrag] = useState<string | null>(null);
  const [undo, setUndo] = useState<CheckTpl | null>(null); const undoT = useRef<number>();
  const [pane, setPane] = useState<'' | 'copy' | 'tpl' | 'view'>(''); const [dest, setDest] = useState('');
  const load = () => sb.from('step_checks').select('*').order('ord').then(({ data }) => { setAll((data as CheckTpl[]) ?? []); loadChecks(true); });
  useEffect(() => { load(); }, []);
  const of = (p: string, st: string) => (all ?? []).filter((x) => x.proc === p && x.step === st && x.active);
  const list = of(sel[0], sel[1]); const nReq = list.filter((x) => x.level === 'req').length;
  const upd = async (id: string, patch: Partial<CheckTpl>) => { setAll((a) => a && a.map((x) => x.id === id ? { ...x, ...patch } : x));
    const { error } = await sb.from('step_checks').update(patch).eq('id', id); if (error) { toast(errText(error)); load(); } else loadChecks(true); };
  const insert = async (rows: { label: string; level: Level; auto?: string | null }[], p = sel[0], st = sel[1]) => {
    const base = of(p, st).at(-1)?.ord ?? 0;
    const { error } = await sb.from('step_checks').insert(rows.map((r, i) => ({ proc: p, step: st, label: r.label, level: r.level, auto: r.auto ?? null, ord: base + i + 1 })));
    if (error) toast(errText(error)); load(); return !error; };
  const add = async () => { const v = nl.trim(); if (!v) return; if (await insert([{ label: v, level: 'req' }])) setNl(''); };
  const del = async (x: CheckTpl) => { const { error } = await sb.from('step_checks').delete().eq('id', x.id); if (error) { toast(errText(error)); return; }
    load(); setUndo(x); clearTimeout(undoT.current); undoT.current = window.setTimeout(() => setUndo(null), 6000); };
  const restore = async () => { if (!undo) return; const x = undo; setUndo(null);
    const { error } = await sb.from('step_checks').insert({ proc: x.proc, step: x.step, label: x.label, level: x.level, auto: x.auto ?? null, ord: x.ord }); if (error) toast(errText(error)); load(); };
  const reorder = async (ids: string[]) => { setAll((a) => a && a.map((x) => ids.includes(x.id) ? { ...x, ord: ids.indexOf(x.id) + 1 } : x).sort((p, q) => p.ord - q.ord));
    await Promise.all(ids.map((id, i) => sb.from('step_checks').update({ ord: i + 1 }).eq('id', id))); load(); };
  const drop = (target: string) => { if (!drag || drag === target) return; const ids = list.map((x) => x.id); const a = ids.indexOf(drag), b = ids.indexOf(target);
    ids.splice(b, 0, ids.splice(a, 1)[0]); setDrag(null); reorder(ids); };
  const move = (i: number, d: number) => { const ids = list.map((x) => x.id); const j = i + d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; reorder(ids); };
  const copyTo = async () => { if (!dest || !list.length) return; const [p, st] = dest.split('|');
    if (await insert(list.map((x) => ({ label: x.label, level: x.level, auto: p === sel[0] ? x.auto : null })), p as Proc, st)) { toast(`Đã chép ${list.length} mục sang ${p} · ${STATUS[st]}`); setPane(''); setDest(''); } };
  const stepName = (p: Proc, st: string) => p + ' · ' + STATUS[st];
  return (
    <div className="ck2">
      <section className="card ck2-map" aria-label="Bản đồ checklist">
        <div><h2>Bản đồ checklist</h2><p className="small muted">Mỗi ô: số mục · <b className="ck2-red">●</b> số mục bắt buộc. Bấm ô để soạn.</p></div>
        <label className="f ck2-pick">Bước
          <select value={sel[0] + '|' + sel[1]} onChange={(e) => { const [p, st] = e.target.value.split('|'); setSel([p as Proc, st]); setPane(''); }}>
            {PROCS.map((p) => <optgroup key={p} label={p + ' · ' + PROC_NAME[p]}>{STEPS_OF(p).map((st) => { const l = of(p, st);
              return <option key={st} value={p + '|' + st}>{STATUS[st]} ({l.length} mục · {l.filter((x) => x.level === 'req').length} bắt buộc)</option>; })}</optgroup>)}
          </select></label>
        <div className="ck2-rows">{PROCS.map((p) => <div key={p} className="ck2-row"><b className={'ck2-p ' + p}>{p}</b>
          <div className="ck2-cells">{STEPS_OF(p).map((st) => { const l = of(p, st); const r = l.filter((x) => x.level === 'req').length; const on = sel[0] === p && sel[1] === st;
            return <button key={st} className={'ck2-cell' + (on ? ' on' : '') + (!l.length ? ' empty' : '')} aria-pressed={on} onClick={() => { setSel([p, st]); setPane(''); }}>
              <span className="t">{STATUS[st]}</span><span className="n">{l.length}{r > 0 && <em><b className="ck2-red">●</b>{r}</em>}</span></button>; })}</div></div>)}</div>
        <p className="ck2-note small">Thay đổi áp dụng cho <b>phiếu mới</b>. Phiếu đang làm giữ checklist đã chụp.</p>
      </section>

      <section className="card ck2-ed" aria-label="Soạn checklist">
        <header className="ck2-h"><div><small className={'ck2-p ' + sel[0]}>{sel[0]} · {PROC_NAME[sel[0]]}</small><h2>Bước {STATUS[sel[1]]}</h2></div>
          <div className="ck2-tools">
            {canEdit && <button className={'btn sm' + (pane === 'tpl' ? ' on' : '')} aria-pressed={pane === 'tpl'} onClick={() => setPane(pane === 'tpl' ? '' : 'tpl')}>Mẫu gợi ý</button>}
            {canEdit && <button className={'btn sm' + (pane === 'copy' ? ' on' : '')} aria-pressed={pane === 'copy'} disabled={!list.length} onClick={() => setPane(pane === 'copy' ? '' : 'copy')}><span className="ck2-lg">Sao chép sang…</span><span className="ck2-sm">Sao chép</span></button>}
            <button className={'btn sm' + (pane === 'view' ? ' primary' : '')} aria-pressed={pane === 'view'} onClick={() => setPane(pane === 'view' ? '' : 'view')}><Icon name="eye" size={15} /><span className="ck2-lg">Xem như người làm</span><span className="ck2-sm">Xem trước</span></button>
          </div></header>
        {!canEdit && <InfoChip id="ro" icon="eye" label="Chỉ xem"><p>Chỉ Admin IT được sửa.</p></InfoChip>}
        {pane === 'tpl' && <div className="ck2-pane"><b>Bấm để thêm vào bước này</b><div className="ck2-chips">{PRESETS.filter(([t]) => !list.some((x) => x.label === t)).map(([t, l]) =>
          <button key={t} className="ck2-chip" onClick={() => insert([{ label: t, level: l }])}><Icon name="plus" size={13} />{t}<em className={'lv ' + l}>{LEVEL_NAME[l]}</em></button>)}</div></div>}
        {pane === 'copy' && <div className="ck2-pane ck2-copy"><label className="f">Chép {list.length} mục sang bước
          <select value={dest} onChange={(e) => setDest(e.target.value)}><option value="">— Chọn bước —</option>
            {PROCS.map((p) => <optgroup key={p} label={p + ' · ' + PROC_NAME[p]}>{STEPS_OF(p).filter((st) => !(p === sel[0] && st === sel[1])).map((st) => <option key={st} value={p + '|' + st}>{STATUS[st]} (đang có {of(p, st).length})</option>)}</optgroup>)}
          </select></label><button className="btn primary sm" disabled={!dest} onClick={copyTo}>Sao chép</button>
          <span className="small muted">Mục được thêm vào cuối, không xoá mục đang có. Sang quy trình khác thì bỏ phần “Tự tích”.</span></div>}

        <div className={'ck2-gate' + (nReq ? '' : ' none')}>{nReq ? <><b>Người làm phải tích đủ {nReq} mục bắt buộc</b> mới chuyển được bước tiếp theo.</> : 'Bước này chưa có mục bắt buộc – người làm chuyển bước tự do.'}</div>

        {pane === 'view' ? <ul className="ck2-view" aria-label="Xem trước như người làm">{list.map((x) => <li key={x.id}>
            <span className={'box' + (x.auto ? ' auto' : '')} aria-hidden="true">{x.auto ? <Icon name="clock" size={13} /> : null}</span>
            <span className="l">{x.label}{x.auto && <small>Tự tích khi {AUTO_HINT(x.auto)}</small>}</span><em className={'lv ' + x.level}>{LEVEL_NAME[x.level]}</em></li>)}
          {!list.length && <li className="muted">Bước này chưa có mục nào.</li>}</ul>
        : <ol className="ck2-list">{list.map((x, i) => (
          <li key={x.id} className={'ck2-it' + (drag === x.id ? ' drag' : '')} draggable={canEdit} onDragStart={() => setDrag(x.id)} onDragEnd={() => setDrag(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(x.id)}>
            <span className="grip" aria-hidden="true">⋮⋮</span>
            <div className="ck2-main">
              <input className="ck2-label" defaultValue={x.label} key={x.id + x.label} disabled={!canEdit} aria-label={'Nội dung mục ' + (i + 1)}
                onBlur={(e) => { const v = e.target.value.trim(); if (!v) { e.target.value = x.label; toast('Nội dung không được để trống'); } else if (v !== x.label) upd(x.id, { label: v }); }} />
              <label className="ck2-auto">Tự tích khi: <AutoPick proc={sel[0]} value={x.auto ?? ''} disabled={!canEdit} onChange={(v) => upd(x.id, { auto: v || null })} /></label>
            </div>
            <div className="ck2-lv" role="group" aria-label="Mức">{(['req', 'rec', 'note'] as Level[]).map((l) =>
              <button key={l} type="button" className={'lv ' + l} aria-pressed={x.level === l} disabled={!canEdit} onClick={() => x.level !== l && upd(x.id, { level: l })}>{l === 'rec' ? 'Nên làm' : LEVEL_NAME[l]}</button>)}</div>
            {canEdit && <div className="ck2-act">
              <button className="ck2-mv" aria-label="Lên" disabled={!i} onClick={() => move(i, -1)}>↑</button>
              <button className="ck2-mv" aria-label="Xuống" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="ck2-del" aria-label={'Xoá ' + x.label} onClick={() => del(x)}><Icon name="trash" size={15} /></button></div>}
          </li>))}
          {all && !list.length && <li className="ck2-empty">Bước này chưa có mục nào. Gõ bên dưới hoặc dùng “Mẫu gợi ý”.</li>}</ol>}

        {canEdit && pane !== 'view' && <label className="ck2-add"><span className="sr">Thêm mục mới</span>
          <input value={nl} placeholder="+ Thêm mục… (Enter để thêm, mặc định Bắt buộc)" onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          {nl.trim() && <button className="btn primary sm" onClick={add}>Thêm</button>}</label>}
        {undo && <div className="ck2-undo" role="status">Đã xoá “{undo.label}”<button onClick={restore}>Hoàn tác</button></div>}
      </section>
    </div>);
}

/** Chọn quy tắc tự kiểm cho một mục checklist */
function AutoPick({ proc, value, disabled, onChange }: { proc: Proc; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  useFields();
  const hs = fieldsOf(proc, 'header'), fs = fieldsOf(proc, 'file');
  const tbs = PROC_TABLES[proc].map(([k, def]) => ({ k, t: TABLES[def]?.t ?? k, cols: TABLES[def]?.cols ?? [] }));
  return <select className="sca-auto" value={value} disabled={disabled} aria-label="Tự kiểm tra" onChange={(e) => onChange(e.target.value)}>
    <option value="">Không – người làm tự tích</option>
    <option value="req">⚡ Đủ trường bắt buộc của bước</option>
    <optgroup label="⚡ Ô thông tin đã nhập">{hs.map((f) => <option key={f.key} value={'h:' + f.key}>{f.label}</option>)}</optgroup>
    <optgroup label="⚡ Bảng có dữ liệu">{tbs.map((t) => <option key={t.k} value={'t:' + t.k}>{t.t}</option>)}</optgroup>
    <optgroup label="⚡ Cột đã nhập đủ mọi dòng">{tbs.flatMap((t) => t.cols.filter((c) => !c.calc).map((c) => <option key={t.k + c.k} value={'c:' + t.k + '.' + c.k}>{t.t} · {c.t}</option>))}</optgroup>
    <optgroup label="⚡ Đã tải file">{fs.map((f) => <option key={f.key} value={'f:' + f.key}>{f.label}</option>)}</optgroup>
    {fs.some((f) => f.key === 'excel') && <optgroup label="⚡ Excel bóc tách hợp lệ"><option value="x:excel">Excel bóc tách khớp danh sách tấm</option></optgroup>}
  </select>;
}
