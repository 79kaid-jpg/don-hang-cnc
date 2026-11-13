import { GuideBox } from './GuideBox';
import { FixMsg } from './FixMsg';
import { isTyping, modalOpen } from './Shortcuts';
import { missingReq, jumpField } from '../lib/checks';
import { goFix } from '../lib/gotoFix';
import { cached, cacheUser, peek } from '../lib/qcache';
export const canActQ = (id: string, st: string) => cached('ca:' + cacheUser + ':' + id + ':' + st, () => sb.rpc('can_act', { p_doc: id }).then((r) => !!r.data), 60000);
import { viewHtml, viewUrl } from '../lib/viewer';
import { Assignees } from './Assignees';
import { useGuides, guideFor, guideByKey } from '../lib/guides';
import { StepChecks, DocSteps, StepDot, useStepProg } from './StepChecks';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { safeName } from '../lib/files';
import { normNum, parseTsv } from '../lib/paste';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb, errText, type Customer, type Order, type Profile } from '../lib/supabase';
import { dt, num as fnum } from '../lib/format';
import {
  BATCH_WORD, CHECK5, COMPANIES, COMPANY, FINAL, FLOW, NEXT_LABEL, PROC_NAME, PROC_TABLES, ROLE_NAME, ROLE_OF, STATUS, TABLES,
  sumOf, numIn, isNumOk, numTyping, type Batch, type Col, type Company, type Doc, type Proc, type Row
} from '../lib/proc';
import { Icon } from './Icon';
import { CoBar, CoLink } from './CoBar';
import { codeFile, docCode, reloadCoIdx, useCoIdx, useMyCo } from '../lib/myco';
import { checkExcelFile, type XCheck } from '../lib/excelCheck';
import { CustomerPicker } from './CustomerPicker';
import { Journey } from './Journey';
import { advanceDoc } from '../lib/records';
import { ReviewPdf, reviewQ } from './Records';
import { parties } from '../lib/xlsxTpl';
import { useFields, fieldsOf, permOf, colsOf, hdrOf, tablesOf, type FDef } from '../lib/fields';
import { PrintTplButton } from './PrintTpl';
import { QtTag } from './QtTag';
import { confirmDialog, toast } from './ui';
import { useAuth } from '../lib/auth';

const fmtN = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? '' : fnum(v, d));

/** Một quy trình của một đơn: danh sách hồ sơ (lần / lệnh / đợt) → chuỗi công ty → bản đang chọn */
export default function ProcPanel({ o, proc, people, autoNew = false }: { o: Order; proc: Proc; people: Record<string, Profile>; autoNew?: boolean }) {
  const [batches, setBatches] = useState<Batch[] | null>(null); const [docs, setDocs] = useState<Doc[]>([]);
  const [psp] = useSearchParams();
  const [bid, setBid] = useState(() => psp.get('b') ?? ''); const [co, setCo] = useState<Company | ''>(() => (psp.get('co') as Company | null) ?? '');
  const [info, setInfo] = useState(false);
  const [creating, setCreating] = useState(autoNew);
  const load = useCallback(async () => {
    reloadCoIdx();
    const { data: b } = await sb.from('batches').select('*').eq('order_id', o.id).eq('proc', proc).order('seq');
    const bs = (b as Batch[]) ?? []; setBatches(bs);
    if (bs.length) { const { data: d } = await sb.from('docs_v').select('*').in('batch_id', bs.map((x) => x.id)); const dd = (d as Doc[]) ?? []; setDocs(dd); dd.forEach((x) => { if (!['da_duyet', 'fail'].includes(x.status)) { canActQ(x.id, x.status).catch(() => {}); if (['duyet', 'duyet_them'].includes(x.status)) reviewQ(x.id, x.status).catch(() => {}); } }); } else setDocs([]);
  }, [o.id, proc]);
  useEffect(() => { load(); }, [load]);
  const B = batches?.find((x) => x.id === bid) ?? batches?.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches?.at(-1);
  useEffect(() => { dispatchEvent(new CustomEvent('pp-batch', { detail: { proc, id: B?.id ?? '' } })); }, [proc, B?.id]);
  const bDocs = docs.filter((d) => d.batch_id === B?.id);
  const cur = [...bDocs].sort((a, z) => COMPANIES.indexOf(z.company) - COMPANIES.indexOf(a.company))[0];
  const D = bDocs.find((d) => d.company === co) ?? (cur?.can_view === false ? bDocs.filter((x) => x.can_view !== false).at(-1) ?? cur : cur);
  if (!batches) return <div className="card muted">Đang tải {proc}…</div>;
  return (
    <div className="pp">
      <div className="pp-head">
        <div className="pp-hl"><button type="button" className={'pp-qt' + (info ? ' on' : '')} aria-expanded={info} aria-label={PROC_NAME[proc] + ' – xem mô tả'} title={PROC_NAME[proc]} onClick={() => setInfo(!info)}><QtTag qt={proc} /><Icon name="info" size={13} /></button>
          {proc === 'QT1' && <span id="pp-codeslot" className="pp-codeslot" />}
          {batches.length > 1 && (() => { const B0 = batches.find((x) => x.id === bid) ?? batches.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches.at(-1)!; return <BatchSel o={o} batches={batches} B={B0} onPick={(id) => { setBid(id); setCo(''); }} />; })()}
        {batches.length ? <button type="button" className="btn sm icon-btn pp-new" data-sk="t" data-kbd="Shift T" title={proc === 'QT1' ? 'Tách đơn mới' : 'Mở ' + BATCH_WORD[proc] + ' mới'} aria-label={proc === 'QT1' ? 'Tách đơn mới' : 'Mở ' + BATCH_WORD[proc] + ' mới'} onClick={() => setCreating(true)}><Icon name="plus" size={18} /></button>
          : <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{'Bắt đầu ' + proc}</button>}</div>
      </div>
      {info && <p className="small muted pp-desc">{proc === 'QT0' ? 'Chỉ Phương Nam CNC làm. Danh sách tấm đã duyệt là đầu vào (tuỳ chọn) của XNĐH.'
            : proc === 'QT1' ? 'Phương Nam lập → duyệt → IPC chép danh sách, đổi giá → duyệt → Hanwa → duyệt. Mỗi bên in bộ của mình cho khách ký.'
            : proc === 'QT2' ? 'Đầu vào là Excel lệnh gia công từ phần mềm sản xuất. Một đơn có thể chia nhiều lệnh. Cả 3 công ty đều lập hồ sơ.'
            : 'Mỗi đợt giao một phiếu, qua 3 công ty rồi khách ký nhận. Tổng các đợt khớp lệnh do phần mềm sản xuất kiểm.'}</p>}
      {creating && <NewBatch o={o} proc={proc} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setBid(id); setCo(''); load(); }} />}
      {batches.length === 0 ? <div className="empty"><Icon name="inbox" size={28} /><b>Chưa có hồ sơ {proc} cho đơn này</b><span className="small muted">Bấm “{'Bắt đầu ' + proc}” để mở.</span></div> : (<>
        {B && B.status === 'cho_ky' && <Final b={B} o={o} onDone={load} />}
        {B && B.status === 'hoan_tat' && proc !== 'QT0' && <div className="msg ok"><Icon name="check" size={18} /><span>{B.title}: đã xong cả 3 công ty và đã ký tay{B.final_files.length ? ' · ' : ''}{B.final_files.map((f) => <FileLink key={f.path} f={f} />)}</span></div>}
        {B && B.status === 'fail' && <div className="msg err"><Icon name="alert" size={18} /><span>{B.title}: Thất bại – đã dừng. {B.proc === 'QT0' ? 'Mở “lần bóc tách mới”' : 'Mở lượt mới'} nếu cần làm lại.</span></div>}
        {B && B.proc === 'QT2' && <Check5 b={B} />}
        {D && B && D.can_view === false && <div className="card lock-card"><Icon name="shield" size={22} /><div><b>Hồ sơ của {COMPANY[D.company]}</b><br />
          <span className="small muted">Bạn chỉ xem được hồ sơ của công ty mình. Tiến độ: {D.status === 'da_duyet' ? 'đã duyệt' : D.status === 'fail' ? 'thất bại' : 'đang xử lý'}.</span></div></div>}
        {D && B && D.can_view !== false && <DocView key={D.id + D.status} o={o} b={B} d={D} people={people} onChanged={load} docs={bDocs} onPickCo={setCo} />}
      </>)}
    </div>);
}

function Chain({ proc, b, docs, sel, onPick }: { proc: Proc; b: Batch; docs: Doc[]; sel?: Company; onPick: (c: Company) => void }) {
  const d = proc === 'QT0' ? docs[0] : undefined; const prog = useStepProg('QT0', d); const i = d ? FLOW.QT0.indexOf(d.status) : -1; const done = d?.status === 'da_duyet';
  if (proc === 'QT0') {
    return <ol className="pp-chain">{FLOW.QT0.map((s, k) => <li key={s} className={done || k < i ? 'done' : k === i ? 'cur' : ''}><StepDot n={k + 1} done={done || k < i} p={prog[s]} />{STATUS[s]}</li>)}
      <li className={done ? 'done' : d?.status === 'fail' ? 'bad' : ''}><span className="dot">{done ? <Icon name="check" size={12} /> : '★'}</span>{d?.status === 'fail' ? 'Fail' : 'DS tấm đã ký'}</li></ol>;
  }
  const SH: Record<string, string> = { PN: 'PN', IPC: 'IPC', HW: 'HW' };
  return (
    <ol className="pp-step" aria-label="Tiến độ các công ty">
      {COMPANIES.map((c) => { const d = docs.find((x) => x.company === c); const st = !d ? 'todo' : d.status === 'da_duyet' ? 'done' : d.status === 'fail' ? 'bad' : 'cur';
        return <li key={c} className={st + (sel === c ? ' sel' : '')}>
          <button type="button" disabled={!d} onClick={() => onPick(c)} aria-pressed={sel === c} title={COMPANY[c] + ': ' + (!d ? 'chưa tới' : STATUS[d.status])}>
            <span className="dot">{st === 'done' ? <Icon name="check" size={11} /> : st === 'bad' ? '!' : ''}</span>
            <span className="pp-step-t"><b>{SH[c] ?? c}</b><small>{!d ? 'chưa tới' : STATUS[d.status]}</small></span></button></li>; })}
      <li className={b.status === 'hoan_tat' ? 'done' : b.status === 'cho_ky' ? 'cur' : 'todo'}><span className="pp-step-b" title={FINAL[proc]}>
        <span className="dot">{b.status === 'hoan_tat' ? <Icon name="check" size={11} /> : ''}</span><span className="pp-step-t"><b>Ký</b><small>{b.status === 'hoan_tat' ? 'đã ký' : b.status === 'cho_ky' ? 'chờ ký' : 'ký tay'}</small></span></span></li>
    </ol>);
}

const BS = (s: string) => s === 'dang_lam' ? 'đang làm' : s === 'cho_ky' ? 'chờ ký tay' : s === 'hoan_tat' ? 'xong' : s === 'fail' ? 'thất bại' : s;
/** Chọn đơn (lần/lệnh/đợt) theo mã của công ty người xem */
function BatchSel({ o, batches, B, onPick }: { o: Order; batches: Batch[]; B: Batch; onPick: (id: string) => void }) {
  const { co } = useMyCo(); const { codeOf } = useCoIdx();
  const dm = (b: Batch) => { const c = codeOf(o.id, co, b.id); const m = c && /^(\d{4})(\d{2})(\d{2})-/.exec(c); if (m) return m[3] + '/' + m[2]; const d = new Date(b.created_at); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'); };
  const lb = (b: Batch) => <>{b.title}<small className="pp-bdm">{dm(b)}</small></>;
  const full = (b: Batch) => codeOf(o.id, co, b.id) || b.title;
  const i = batches.findIndex((x) => x.id === B.id);
  const ref = useRef<HTMLDetailsElement>(null);
  return <>
    <div className="pp-bseg" role="tablist" aria-label="Chọn đơn">{batches.map((b) => (
      <button key={b.id} type="button" role="tab" aria-selected={B.id === b.id} className={B.id === b.id ? 'on' : ''} onClick={() => onPick(b.id)} title={full(b) + ' · ' + BS(b.status)}>
        <i className={'pp-bdot ' + b.status} aria-hidden="true" /><b>{lb(b)}</b></button>))}</div>
    <details className="pp-bdd" ref={ref}><summary><i className={'pp-bdot ' + B.status} aria-hidden="true" /><b>{lb(B)}</b><span className="small muted">{i + 1}/{batches.length}</span><span aria-hidden="true" className="muted">▾</span></summary>
      <div className="pp-bmenu" role="listbox">{batches.map((b) => (
        <button key={b.id} type="button" role="option" aria-selected={B.id === b.id} title={full(b) + ' · ' + BS(b.status)} className={B.id === b.id ? 'on' : ''} onClick={() => { if (ref.current) ref.current.open = false; onPick(b.id); }}>
          <i className={'pp-bdot ' + b.status} aria-hidden="true" /><b>{lb(b)}</b>{B.id === b.id && <Icon name="check" size={15} />}</button>))}</div></details>
  </>;
}

/** Thẻ "Việc của bạn": bước đang chạy, mã đơn của mình, tham chiếu PN */
function YourTurn({ o, b, cur }: { o: Order; b: Batch; cur: Doc }) {
  const { co } = useMyCo(); const { codeOf } = useCoIdx();
  if (b.status !== 'dang_lam') return null;
  const mine = cur.company === co; const my = codeOf(o.id, co, b.id); const pn = co !== 'PN' ? codeOf(o.id, 'PN', b.id) : null;
  return <div className={'card pp-turn' + (mine ? ' mine' : '')}>
    <span className="pp-turn-k">{mine ? 'Việc của bạn' : 'Đang chờ'}</span>
    <b className="pp-turn-t">{COMPANY[cur.company]} · {STATUS[cur.status]}</b>
    {(my || pn) && <dl className="pp-turn-d">{my && <><dt>Mã đơn {co}</dt><dd>{my}</dd></>}{pn && <><dt>Tham chiếu PN</dt><dd>{pn}</dd></>}</dl>}
  </div>;
}

function Check5({ b }: { b: Batch }) {
  return <details className="pp-ck"><summary><Icon name="check" size={15} /> Đủ 5 điều kiện (tích khi lập lệnh)</summary>
    <ul>{CHECK5.map((t, i) => <li key={t}><Icon name={b.checklist['c' + (i + 1)] ? 'check' : 'x'} size={14} />{t}</li>)}</ul></details>;
}

function NewBatch({ o, proc, onClose, onDone }: { o: Order; proc: Proc; onClose: () => void; onDone: (id: string) => void }) {
  const [title, setTitle] = useState(''); const [use0, setUse0] = useState(true); const [ck, setCk] = useState<Record<string, boolean>>({}); const [err, setErr] = useState('');
  const n = Object.values(ck).filter(Boolean).length;
  // Tách đơn: chọn tấm từ QT0 · QT2/QT3: chọn đơn PN
  const [rows0, setRows0] = useState<Row[] | null>(null); const [used, setUsed] = useState<Record<number, string>>({}); const [pick, setPick] = useState<Set<number>>(new Set());
  const [pnOrders, setPnOrders] = useState<{ id: string; code: string }[]>([]); const [coId, setCoId] = useState('');
  // IPC / HW: lập XNĐH bằng tham chiếu mã đơn đã duyệt của công ty trước
  const { co: myCoNB } = useMyCo(); const refMode = proc === 'QT1' && (myCoNB === 'IPC' || myCoNB === 'HW');
  const prevCo = myCoNB === 'HW' ? 'IPC' : 'PN';
  const [refs, setRefs] = useState<{ code: string; title: string; used: string | null }[] | null>(null); const [ref, setRef] = useState('');
  useEffect(() => { if (!refMode) return; sb.rpc('ref_candidates', { p_order: o.id, p_co: myCoNB }).then(({ data }) => { const l = (data ?? []) as { code: string; title: string; used: string | null }[]; setRefs(l); if (l.length === 1) setRef(l[0].code); }); }, [refMode, o.id, myCoNB]);
  useEffect(() => { if (refMode) return;
    if (proc === 'QT1') (async () => {
      const { data: bs } = await sb.from('batches').select('id, proc, status, done_at, title').eq('order_id', o.id);
      const b0 = ((bs ?? []) as Batch[]).filter((x) => x.proc === 'QT0' && x.status === 'hoan_tat').sort((a, z) => (z.done_at ?? '').localeCompare(a.done_at ?? ''))[0];
      if (!b0) return setRows0([]);
      const q1 = ((bs ?? []) as Batch[]).filter((x) => x.proc === 'QT1');
      const { data: ds } = await sb.from('docs_v').select('batch_id, company, tables').in('batch_id', [b0.id, ...q1.map((x) => x.id)]);
      const all = (ds ?? []) as { batch_id: string; company: string; tables: Record<string, Row[]> }[];
      const r0 = all.find((d) => d.batch_id === b0.id)?.tables?.ds ?? []; setRows0(r0);
      const key = (r: Row) => [r.ma_tam, r.vat_lieu, r.day, r.dai, r.rong].join('|');
      const u: Record<number, string> = {};
      all.filter((d) => d.company === 'PN' && d.batch_id !== b0.id).forEach((d) => { const ks = new Set((d.tables?.ds ?? []).map(key)); const t = q1.find((x) => x.id === d.batch_id)?.title ?? '';
        r0.forEach((r, i) => { if (ks.has(key(r))) u[i] = t; }); });
      setUsed(u); setPick(new Set(r0.map((_, i) => i).filter((i) => !u[i])));
    })();
    if (proc === 'QT2' || proc === 'QT3') sb.from('co_orders').select('id, code').eq('order_id', o.id).eq('company', 'PN').order('created_at').then(({ data }) => {
      const l = (data ?? []) as { id: string; code: string }[]; setPnOrders(l); if (l.length === 1) setCoId(l[0].id); });
  }, [o.id, proc]);
  const weld = (r: Row) => Number(String(r.duong_han ?? '').replace(',', '.')) > 0;
  const sel = (f: (r: Row, i: number) => boolean) => setPick(new Set((rows0 ?? []).map((r, i) => (f(r, i) ? i : -1)).filter((i) => i >= 0)));
  const go = async () => {
    setErr('');
    if (refMode) { const { data, error } = await sb.rpc('doc_from_ref', { p_code: ref.trim(), p_co: myCoNB }); if (error) return setErr(errText(error)); toast('Đã lập XNĐH ' + myCoNB + ' từ ' + ref); reloadCoIdx(); onDone(String(data ?? '')); return; }
    const { data, error } = await sb.rpc('batch_create', { p_order: o.id, p_proc: proc, p_title: title, p_opts: proc === 'QT1' ? { use_qt0: use0, ...(use0 && rows0?.length ? { rows: [...pick].sort((a, z) => a - z) } : {}) } : proc === 'QT2' ? { checklist: ck, co_order: coId || null } : { co_order: coId || null } });
    if (error) setErr(errText(error)); else { toast('Đã mở ' + proc); onDone(data as string); }
  };
  return (
    createPortal(<div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Mở {BATCH_WORD[proc]} mới · {o.project ?? ''}</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      {refMode && <div className="nb-ref">
        <label className="f">Tham chiếu đơn {prevCo} đã duyệt *
          <input list="nb-refs" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={'Chọn hoặc gõ mã đơn ' + prevCo} autoFocus /></label>
        <datalist id="nb-refs">{(refs ?? []).map((r) => <option key={r.code} value={r.code}>{r.title}{r.used === 'fail' ? ' · lập lại (đơn cũ thất bại)' : ''}</option>)}</datalist>
        {refs && refs.length === 0 && <p className="small muted" style={{ margin: 0 }}>Chưa có đơn {prevCo} nào đã duyệt mà {myCoNB} chưa lập.</p>}
        <p className="small muted" style={{ margin: 0 }}>Sẽ copy: danh sách tấm (không kèm giá), điều kiện giao hàng. Bạn tự nhập đơn giá, VAT, điều kiện thanh toán.</p>
      </div>}
      {!refMode && <><label className="f">Tên (để trống thì tự đánh số)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={proc === 'QT2' ? 'Ví dụ: Lệnh 1 – 250 tấm' : proc === 'QT3' ? 'Ví dụ: Đợt 1 – 50 tấm' : ''} /></label>
      {proc === 'QT1' && <label className="ck-item"><input type="checkbox" checked={use0} onChange={() => setUse0(!use0)} /><span>Lấy danh sách tấm từ QT0 đã duyệt <span className="small muted">(tách đơn: chỉ tick các tấm thuộc đơn này)</span></span></label>}
      {proc === 'QT1' && use0 && rows0 !== null && (rows0.length === 0 ? <p className="small muted">Chưa có danh sách tấm QT0 đã duyệt.</p> : <div className="nb-pick">
        <div className="nb-pick-h"><b>Chọn tấm cho XNĐH này</b><span className="small muted">{pick.size}/{rows0.length} tấm</span></div>
        <div className="nb-flt">
          <button type="button" className="chip" onClick={() => sel((_, i) => !used[i])}>Chưa dùng</button>
          <button type="button" className="chip" onClick={() => sel((r, i) => !used[i] && weld(r))}>Có hàn</button>
          <button type="button" className="chip" onClick={() => sel((r, i) => !used[i] && !weld(r))}>Không hàn</button>
          <button type="button" className="chip" onClick={() => sel(() => true)}>Tất cả</button>
          <button type="button" className="chip" onClick={() => setPick(new Set())}>Bỏ chọn</button></div>
        <ul className="nb-rows">{rows0.map((r, i) => <li key={i}><label className={'nb-row' + (pick.has(i) ? ' on' : '') + (used[i] ? ' used' : '')}>
          <input type="checkbox" checked={pick.has(i)} onChange={() => { const n2 = new Set(pick); if (n2.has(i)) n2.delete(i); else n2.add(i); setPick(n2); }} />
          <span className="nb-t"><b>{String(r.ma_tam ?? '#' + (i + 1))}</b><span className="small muted">{[r.vat_lieu, r.day && r.day + 'mm', r.so_tam && r.so_tam + ' tấm', weld(r) && 'có hàn'].filter(Boolean).join(' · ')}</span>{used[i] && <span className="nb-used">Đã ở {used[i]}</span>}</span></label></li>)}</ul>
      </div>)}
      {(proc === 'QT2' || proc === 'QT3') && pnOrders.length > 0 && <label className="f">Thuộc đơn PN *<select value={coId} onChange={(e) => setCoId(e.target.value)}>
        <option value="">— Chọn đơn —</option>{pnOrders.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>}
      {proc === 'QT2' && <div className="f">Đủ 5 điều kiện mới được lập lệnh ({n}/5)
        {CHECK5.map((t, i) => <label key={t} className={'ck-item' + (ck['c' + (i + 1)] ? ' on' : '')}><input type="checkbox" checked={!!ck['c' + (i + 1)]} onChange={() => setCk({ ...ck, ['c' + (i + 1)]: !ck['c' + (i + 1)] })} /><span>{t}</span></label>)}</div>}
      </>}
      {err && <div className="msg err"><Icon name="alert" size={18} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn primary" disabled={(refMode && !ref.trim()) || (!refMode && ((proc === 'QT2' && n < 5) || ((proc === 'QT2' || proc === 'QT3') && pnOrders.length > 0 && !coId) || (proc === 'QT1' && use0 && !!rows0?.length && pick.size === 0)))} onClick={go}>{refMode ? 'Lập XNĐH từ tham chiếu' : proc === 'QT2' && n < 5 ? 'Chưa đủ 5 điều kiện · chờ' : 'Mở ' + BATCH_WORD[proc]}</button></div>
    </div></div>, document.body));
}

/** PN / IPC: sau khi duyệt, tải bản in đã ký tay để lưu trữ (không chặn bước nào) */
function SignedBox({ d, o, b, files, onDone }: { d: Doc; o: Order; b: Batch; files: { kind: string; name: string; path: string }[]; onDone: (nf: never) => void }) {
  const mine = files.filter((x) => x.kind === 'ban_ky'); const [busy, setBusy] = useState(false); const { me } = useAuth();
  const up = async (e: React.ChangeEvent<HTMLInputElement>) => { const fl = Array.from(e.target.files ?? []); e.target.value = ''; if (!fl.length) return; setBusy(true);
    try { for (const file of fl) { const path = `${o.id}/${b.id}/${d.company}/ky-${Date.now()}-${safeName(file.name)}`;
        const r = await sb.storage.from('files').upload(path, file); if (r.error) throw r.error;
        const { data, error } = await sb.rpc('doc_signed_add', { p_doc: d.id, p_file: { kind: 'ban_ky', name: file.name, path, at: new Date().toISOString(), by: me?.id, step: 'da_duyet' } }); if (error) throw error; onDone(data as never); }
      toast('Đã lưu bản ký'); } catch (x) { toast(errText(x as Error)); } setBusy(false); };
  return <div className={'pp-signed' + (mine.length ? ' ok' : '')}><Icon name={mine.length ? 'check' : 'file'} size={16} />
    <span className="pp-signed-t"><b>Bản ký lưu trữ</b><span className="small muted">{mine.length ? mine.length + ' file' : 'In bản “ĐÃ DUYỆT”, ký tay rồi chụp / scan tải lên'}</span>
      {mine.map((x) => <FileLink key={x.path} f={x} />)}</span>
    <label className={'btn sm' + (busy ? ' disabled' : '')}><Icon name="upload" size={14} />{busy ? 'Đang tải…' : mine.length ? 'Thêm' : 'Tải lên'}<input type="file" accept="image/*,application/pdf" capture="environment" multiple hidden disabled={busy} onChange={up} /></label></div>;
}

function FileLink({ f }: { f: { name: string; path: string } }) {
  const open = async () => { const { data } = await sb.storage.from('files').createSignedUrl(f.path, 600); if (data?.signedUrl) viewUrl(data.signedUrl, f.name); };
  return <button className="link-btn" onClick={open}><Icon name="file" size={14} />{f.name}</button>;
}

function Final({ b, o, onDone }: { b: Batch; o: Order; onDone: () => void }) {
  const [err, setErr] = useState('');
  const up = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr(''); const out: { name: string; path: string }[] = [];
    for (const file of Array.from(e.target.files ?? [])) {
      const path = `${o.id}/${b.id}/ky-tay/${Date.now()}-${safeName(file.name)}`;
      const r = await sb.storage.from('files').upload(path, file); if (r.error) { setErr(errText(r.error)); return; } out.push({ name: file.name, path });
    }
    const { error } = await sb.rpc('batch_finish', { p_batch: b.id, p_files: out });
    if (error) setErr(errText(error)); else { toast('Đã hoàn tất ' + b.title); onDone(); }
  };
  return <div className="pp-final"><Icon name="file" size={20} /><div style={{ flex: 1 }}><b>Cả 3 công ty đã duyệt. Bước cuối: {FINAL[b.proc]}</b>
    <div className="small muted">In bản của từng công ty (nút In ở mỗi bản), ký tay vào ô trống, chụp hoặc scan rồi tải lên để hoàn tất.</div>
    {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}</div>
    <label className="btn primary"><Icon name="upload" size={16} />Tải bản đã ký<input type="file" multiple accept="image/*,application/pdf" hidden onChange={up} /></label></div>;
}

function DocView({ o, b, d, people, onChanged, docs = [], onPickCo }: { o: Order; b: Batch; d: Doc; people: Record<string, Profile>; onChanged: () => void; docs?: Doc[]; onPickCo?: (c: Company) => void }) {
  const [admInfo, setAdmInfo] = useState(false); const [viewInfo, setViewInfo] = useState(false);
  const [shut, setShutS] = useState(() => { try { return localStorage.getItem('pp-side-shut') === '1'; } catch { return false; } });
  const setShut = (v: boolean) => { setShutS(v); try { localStorage.setItem('pp-side-shut', v ? '1' : '0'); } catch { /* */ } };
  useEffect(() => { const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (e.key === ']' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) setShutS((v) => { try { localStorage.setItem('pp-side-shut', v ? '0' : '1'); } catch { /* */ } return !v; }); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const waitH = Math.max(0, (Date.now() - new Date(d.status_at).getTime()) / 36e5);
  const proc = b.proc;
  const [can, setCan] = useState(() => !!peek<boolean>('ca:' + cacheUser + ':' + d.id + ':' + d.status, 60000));
  const [h, setH] = useState<Record<string, string>>(d.header ?? {}); const [t, setT] = useState<Record<string, Row[]>>(d.tables ?? {}); const [files, setFiles] = useState(d.files ?? []);
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<'' | 'back' | 'fail'>(''); const [why, setWhy] = useState('');
  const { acting, actUntil } = useAuth(); const lockAct = acting && !actUntil && !/^\s*\[(MẪU|MAU|TEST)\]/i.test(o.project ?? '');
  if (lockAct && can) setCan(false);
  useEffect(() => { canActQ(d.id, d.status).then((v) => setCan(v && !lockAct)); }, [d.id, d.status, lockAct]);
  const [lvs, setLvs] = useState<{ id: string; name: string; user_id: string | null; group_id: string | null; sla_h: number }[]>([]);
  const apv = (d as Doc & { apv?: { queue: string[]; idx: number } }).apv;
  useEffect(() => { if (apv?.queue?.length) sb.from('approval_levels').select('id, name, user_id, group_id, sla_h').in('id', apv.queue).then(({ data }) => setLvs((data as never[]) ?? [])); }, [apv?.queue?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const lvName = d.status === 'duyet_them' && apv ? lvs.find((l) => l.id === apv.queue[apv.idx])?.name : undefined;
  useFields();
  const pm = (f: FDef) => permOf(f, d.company, d.status, proc);
  const guides = useGuides(); const [fsp, setFsp] = useSearchParams();
  useEffect(() => { const fx = fsp.get('fix'); if (!fx || (fsp.get('b') && fsp.get('b') !== b.id)) return; const t = setTimeout(() => { setErr(fx); goFix(fx); const n = new URLSearchParams(fsp); n.delete('fix'); n.delete('b'); n.delete('co'); setFsp(n, { replace: true }); }, 900); return () => clearTimeout(t); }, [d.id, fsp.get('fix')]); // eslint-disable-line react-hooks/exhaustive-deps
  const adm = useAuth().can('admin_it'); const fAdm = useAuth().can('admin_it') || useAuth().can('admin_cnc'); const meId = useAuth().me?.id;
  /** Gỡ / thay file: admin toàn quyền; người khác chỉ file mình tải, trong đúng bước đã tải */
  const canDelF = (x: { by?: string; step?: string }) => fAdm || (!!x.by && x.by === meId && x.step === d.status);
  const closed = d.status === 'da_duyet' || d.status === 'fail'; // phiếu đã chốt: chỉ xem (kể cả admin)
  const canEd = (f: FDef) => !closed && ((adm && !f.sys) || (can && (pm(f) === 'edit' || pm(f) === 'required')));
  const hid = new Set(d.hidden ?? []); // trường bị ẩn theo phân quyền (máy chủ đã xoá giá trị)
  const hFields = fieldsOf(proc, 'header').filter((f) => pm(f) !== 'hide' && !hid.has('h:' + f.key) && !(proc === 'QT1' && f.key === 'so_xn'));
  // Gợi ý địa chỉ giao: địa chỉ của bên nhận (PN→IPC, IPC→Hanwa, Hanwa→khách cuối)
  const [ship, setShip] = useState<string[]>([]); const [carriers, setCarriers] = useState<Customer[]>([]); const [custs, setCusts] = useState<Customer[]>([]);
  const hasCarrier = hFields.some((f) => f.type === 'carrier');
  useEffect(() => { if (hasCarrier) sb.from('customers').select('*').in('kind', ['van_chuyen', 'noi_bo']).eq('active', true).order('name').then(({ data }) => setCarriers((data as Customer[]) ?? [])); }, [proc, hasCarrier]); // eslint-disable-line react-hooks/exhaustive-deps
  const plates = carriers.find((c) => c.id === h.dvvc)?.vehicles ?? [];
  useEffect(() => { if (!hFields.some((f) => f.key === 'dia_diem' || f.key === 'dk_giao')) return;
    cached('custs', () => sb.from('customers').select('*'), 60000).then(({ data }) => { const cs = (data as Customer[]) ?? []; setCusts(cs); const { buyer } = parties(o, d.company, proc, cs, h.end_customer_id);
      setShip([...(buyer?.ship_addresses ?? []), buyer?.address ?? ''].filter(Boolean)); }); }, [d.id, h.end_customer_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fFields = fieldsOf(proc, 'file').filter((f) => pm(f) !== 'hide');
  const tblDefs = PROC_TABLES[proc].map(([key, def]) => { const fs = fieldsOf(proc, 'col', key);
    const cols = colsOf(proc, key).flatMap((c) => { const f = fs.find((x) => x.key === c.k)!; const p = pm(f); return p === 'hide' || hid.has(key + ':' + c.k) ? [] : [{ ...c, ro: closed || (!adm && !(p === 'edit' || p === 'required')), req: p === 'required' }]; });
    const tf = fieldsOf(proc, 'table').find((x) => x.key === key); const treq = !!tf && pm(tf) === 'required';
    return { key, title: TABLES[def].t, treq, cols, ed: !closed && (adm || (can && cols.some((c) => !c.ro && !c.calc) && (proc !== 'QT0' || d.status !== 'tiep_nhan'))) }; });
  const editable = hFields.some(canEd) || fFields.some(canEd) || tblDefs.some((x) => x.ed);
  const totalOf = (): string | undefined => { if (proc !== 'QT1') return undefined; const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const sm = sumOf(t.ds ?? [], c); const v = numIn(h.vat) ?? 8; return String(Math.round(sm + sm * v / 100)); };
  // Admin: nạp nhanh dữ liệu mẫu vào ô trống (đầu phiếu) và bảng trống (3 dòng ví dụ)
  const fillDemo = () => {
    const today = new Date().toISOString().slice(0, 10); const H0: Record<string, string> = { ...h }; let nh = 0, nt = 0;
    const HV: Record<string, string> = { so_lenh: 'D16000' + Math.floor(10 + Math.random() * 89), so_hd: 'HW', ma_dh: '110260HW0001', code_bpmh: 'BPMH-01', nguoi_phat_lenh: 'Huỳnh Thị Viên',
      kho_xuat: 'Công ty CP Phương Nam CNC', kho_nhan: 'Công ty CP Phương Nam CNC', dang_gc: 'SLU-N0096-3mm-TC đợt 1', xuong: 'Xưởng CNC Phương Nam', vat: '8', hao_hut: '5', kenh: 'Email',
      dk_giao: 'Giao tại kho bên mua', dk_tt: 'Chuyển khoản 30 ngày', so_xn: 'XN-' + o.code.slice(-3), so_phieu: 'PXK-' + o.code.slice(-3), dia_diem: ship[0] ?? 'Kho Hanwa – KCN Long Hậu', xe: '51C-447.39', tai_xe: 'Nguyễn Văn B' };
    for (const f of hFields) { if (!canEd(f) || String(H0[f.key] ?? '').trim()) continue;
      const v = HV[f.key] ?? (f.type === 'date' ? today : f.type === 'number' ? '1' : f.type === 'select' ? f.options[0] ?? '' : f.type === 'person' || f.type === 'carrier' ? '' : 'Mẫu – ' + f.label);
      if (v) { H0[f.key] = v; nh++; } }
    const T0 = { ...t };
    for (const tb of tblDefs) { if (!tb.ed || (T0[tb.key] ?? []).length) continue;
      T0[tb.key] = [0, 1, 2].map((i) => Object.fromEntries(tb.cols.filter((c) => !c.calc).map((c) => [c.k, String(sampleRow(c, i))])).valueOf() as Row); nt++; }
    setH(H0); setT(T0); setDirty(true);
    toast(nh + nt ? `Đã nạp ${nh} ô đầu phiếu, ${nt} bảng mẫu. Kiểm tra rồi bấm Lưu.` : 'Không còn ô trống để nạp');
  };
  const badNums = (): string[] => {
    const out: string[] = [];
    for (const f of hFields) if (f.type === 'number' && !isNumOk(h[f.key])) out.push(f.label);
    for (const tb of tblDefs) for (const c of tb.cols) if (c.n && !c.calc) { const n = (t[tb.key] ?? []).filter((r) => !isNumOk(r[c.k])).length; if (n) out.push(`${c.t} (${n} dòng)`); }
    return out;
  };
  const save = async (quiet = false) => {
    const bad = badNums(); if (bad.length) { setErr('Sai kiểu số: ' + bad.join(', ') + '. Chỉ nhập chữ số, dấu thập phân là "," hoặc ".".'); return false; }
    const hh = totalOf() != null ? { ...h, tong_tt: totalOf()! } : h;
    const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: hh, p_tables: t, p_files: files });
    if (error) { setErr(errText(error)); return false; } setDirty(false); if (!quiet) toast('Đã lưu'); return true;
  };
  useUnsavedGuard(dirty);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (editable && dirty && !busy) save(); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  useEffect(() => { const k = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return; const key = e.key.toLowerCase(); if (!'tchdng'.includes(key) || key.length !== 1) return;
    const go = () => { const el = document.querySelector<HTMLElement>('[data-sk="' + key + '"]'); if (!el) return; if (el.tagName === 'INPUT') { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else { el.click(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
    e.preventDefault(); if (key !== 't' && shut) { setShut(false); setTimeout(go, 60); } else go(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  const act = async (action: 'next' | 'back' | 'fail', n = '') => {
    setErr(''); setBusy(true);
    if (editable && dirty && !(await save(true))) { setBusy(false); return; }
    try {
      const r = await advanceDoc(o, b, { ...d, ...h0(d) }, action, n); setBusy(false);
      toast(action === 'next' ? 'Đã ký → ' + (STATUS[r.next] ?? r.next) : action === 'back' ? 'Đã trả về' : 'Đã đánh Thất bại'); if (r.warn) setTimeout(() => toast(r.warn!), 1500);
      setAsk(''); setWhy(''); onChanged();
    } catch (e) { setBusy(false); const m = errText(e as Error); const ms = /checklist bắt buộc/.test(m) ? missingReq(proc, d.company, d.status, { header: h, tables: t, files } as never) : [];
      setErr(ms.length ? m + ' – còn trống: ' + ms.map((x) => x.label).join(', ') : m); if (ms[0]) setTimeout(() => jumpField(ms[0].key), 300); }
  };
  const addNote = async () => { const { error } = await sb.rpc('doc_note', { p_doc: d.id, p_text: note }); if (error) setErr(errText(error)); else { setNote(''); onChanged(); } };
  const persist = async (nf: typeof files, msg: string) => { setFiles(nf); const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: h, p_tables: t, p_files: nf }); if (error) { setErr(errText(error)); return false; } toast(msg); return true; };
  const removeFile = async (path: string, name: string) => {
    if (!(await confirmDialog(`Gỡ file “${name}”?`, 'Gỡ file'))) return;
    if (await persist(files.filter((x) => x.path !== path), 'Đã gỡ ' + name)) sb.storage.from('files').remove([path]);
  };
  const [xv, setXv] = useState(0);
  const upload = async (e: React.ChangeEvent<HTMLInputElement>, kind: string, replace = false) => {
    const old = replace ? files.filter((x) => x.kind === kind && canDelF(x as { by?: string; step?: string })) : [];
    const nf = files.filter((x) => !old.includes(x));
    for (const file of Array.from(e.target.files ?? [])) {
      let check: XCheck | undefined;
      if (kind === 'excel') { const r = await checkExcelFile(file); if (!r.ok) { setErr(r.error); e.target.value = ''; return; } check = r.c; }
      const path = `${o.id}/${b.id}/${d.company}/${Date.now()}-${safeName(file.name)}`;
      const r = await sb.storage.from('files').upload(path, file); if (r.error) { setErr(errText(r.error)); return; }
      nf.push({ kind, name: file.name, path, at: new Date().toISOString(), by: meId, step: d.status, ...(check ? { check } : {}) } as (typeof files)[number]);
    }
    e.target.value = '';
    const saved = await persist(nf, replace ? 'Đã thay file' : 'Đã tải file');
    if (saved && old.length) sb.storage.from('files').remove(old.map((x) => x.path));
    // Máy chủ kiểm lại file Excel bóc tách (kết quả dùng để chặn chuyển bước)
    if (saved && kind === 'excel') { for (const x of nf.filter((y) => y.kind === 'excel' && !files.some((z) => z.path === y.path))) await sb.functions.invoke('excel-check', { body: { path: x.path } }); setXv((v) => v + 1); }
  };
  const who = (id?: string) => (id ? people[id]?.full_name ?? '…' : '');
  const first = FLOW[proc][0] === d.status;
  const role = ROLE_OF[d.status];
  const admEdit = adm && (d.status === 'da_duyet' || !FLOW[proc].slice(0, proc === 'QT0' ? 3 : 1).includes(d.status));

  return (
    <section className={'card pp-doc pp-doc-in' + (shut ? ' shut' : '')}>
      <div className="pp-main">
      <div className="pp-doc-head">
        <div className="pp-dh"><div className="pp-dh1">{proc === 'QT0' || docs.length < 2 ? <b className="pp-dco">{proc === 'QT0' ? b.title : COMPANY[d.company]}</b>
            : <details className="pp-cosel"><summary><b className="pp-dco">{COMPANY[d.company]}</b><span aria-hidden="true" className="muted">▾</span></summary>
              <div className="odh-menu" role="menu">{COMPANIES.map((c) => { const x = docs.find((y) => y.company === c); return <button key={c} type="button" role="menuitem" disabled={!x} aria-current={c === d.company} onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; onPickCo?.(c); }}><b>{COMPANY[c]}</b><span className="small muted" style={{ marginLeft: 'auto' }}>{x ? STATUS[x.status] : 'chưa tới'}</span></button>; })}</div></details>}
            <span className="pp-dst">· {d.status === 'duyet_them' ? lvName ?? 'Duyệt thêm' : STATUS[d.status]}</span>
            {can && !['da_duyet', 'fail'].includes(d.status) && <span className="pp-mine">Việc của bạn</span>}</div>
          <div className="small muted">{(role || lvName) && <><Assignees proc={proc} company={d.company} role={d.status === 'duyet_them' ? undefined : role} level={d.status === 'duyet_them' ? lvs.find((l) => l.id === apv?.queue[apv.idx]) : undefined} people={people} /></>} · từ {dt(d.status_at)}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {!lockAct && !can && !adm && d.status !== 'da_duyet' && d.status !== 'fail' && <button type="button" className={'btn xs icon-only pp-admi pp-vwi' + (viewInfo ? ' on' : '')} aria-expanded={viewInfo} title="Bạn đang xem (không có quyền làm bước này)" aria-label="Bạn đang xem – xem chi tiết" onClick={() => setViewInfo(!viewInfo)}><Icon name="eye" size={14} /></button>}
          {admEdit && <button type="button" className={'btn xs icon-only pp-admi' + (admInfo ? ' on' : '')} aria-expanded={admInfo} title="Đang sửa với quyền Admin" aria-label="Đang sửa với quyền Admin – xem chi tiết" onClick={() => setAdmInfo(!admInfo)}><Icon name="shield" size={14} /></button>}
          {d.status !== 'da_duyet' && d.status !== 'fail' && <GuideBox compact g={d.status === 'duyet_them' ? guideByKey(guides, 'sim.extra') : guideFor(guides, proc, d.company, d.status)} vars={{ cty: COMPANY[d.company], phieu: PROC_NAME[proc], cap: lvName ?? 'Cấp duyệt thêm' }} />}
          {editable && <button className="btn xs" disabled={!dirty} onClick={() => save()}><Icon name="check" size={13} />{dirty ? 'Lưu' : 'Đã lưu'}</button>}
          <PrintTplButton o={o} b={b} d={d} people={people} fallback={() => printDoc(o, b, d, people)} />
          <button className="btn xs icon-only" title="In bản mặc định của app (không theo mẫu Excel)" aria-label="In bản mặc định" onClick={() => printDoc(o, b, d, people)}><Icon name="file" size={13} /></button>
          {(can || adm) && d.status === FLOW[proc][0] && (proc === 'QT0' || d.company === 'PN') && b.status === 'dang_lam' && <button className="btn xs icon-only danger-soft" title={'Xoá ' + b.title + ' để lập lại (chỉ khi còn ở bước đầu)'} aria-label={'Xoá ' + b.title} onClick={async () => {
            if (!(await confirmDialog(`Xoá hẳn “${b.title}” (${PROC_NAME[proc]})? Toàn bộ dữ liệu đã nhập sẽ mất. Sau đó bạn có thể mở lại ${BATCH_WORD[proc]} mới.`, 'Xoá hồ sơ', true))) return;
            const { error } = await sb.rpc('batch_delete', { p_batch: b.id, p_note: '' }); if (error) return toast(errText(error)); toast('Đã xoá ' + b.title); onChanged(); }}><Icon name="trash" size={13} /></button>}
          {adm && editable && d.status !== 'da_duyet' && <button className="btn xs icon-only" title="Admin: nạp dữ liệu mẫu vào ô trống & bảng trống" aria-label="Nạp dữ liệu mẫu" onClick={fillDemo}><Icon name="bolt" size={13} /></button>}
        </div>
      </div>
      {d.status === 'da_duyet' && proc !== 'QT0' && <div className="pt-cta"><PrintTplButton o={o} b={b} d={d} people={people} big /></div>}
      {admEdit && admInfo && <div className="msg warn"><Icon name="shield" size={16} /><span>Bạn đang sửa với quyền Admin{d.status === 'da_duyet' ? ' trên phiếu đã duyệt' : ''}. Mọi thay đổi được ghi vào lịch sử đơn hàng.</span></div>}
      {lockAct && d.status !== 'da_duyet' && d.status !== 'fail' && <div className="msg lock-mini"><Icon name="shield" size={15} /><span>Đơn thật · chỉ xem khi vào vai</span></div>}
      {(() => { const tk = tablesOf(proc)[0]?.key; const rs = (tk && (t as Record<string, Row[]>)[tk]) || []; if (!tk || rs.length === 0) return null; const cs = colsOf(proc, tk);
        const g = (k: string) => { const c = cs.find((x) => x.k === k); return c ? sumOf(rs, c) : null; }; const f = (v: number | null, dd: number, u: string) => v == null ? null : fmtN(v, dd) + u;
        const kg = g('kg'); const parts = [rs.length + ' dòng', f(g('so_tam'), 0, ' tấm'), f(g('m2'), 1, ' m²'), kg == null ? null : kg >= 1000 ? fmtN(kg / 1000, 1) + ' t' : fmtN(kg, 0) + ' kg', f(g('tt'), 0, ' đ')].filter(Boolean);
        return <div className="pp-sum" aria-label="Tóm tắt">{parts.map((x, i) => <span key={i}>{x}</span>)}</div>; })()}
      {!lockAct && !can && !adm && d.status !== 'da_duyet' && d.status !== 'fail' && viewInfo && <div className="msg info"><Icon name="eye" size={16} /><span>Bạn đang xem. Bước này do người phụ trách “{ROLE_NAME[role]}” của {COMPANY[d.company]} làm (Quản trị → Người phụ trách quy trình).</span></div>}

      {proc !== 'QT0' && d.status !== 'fail' && <DocSteps proc={proc} d={d} live={{ header: h, tables: t as never, files } as never} />}
      <ReviewPdf docId={d.id} status={d.status} />
      {(proc === 'QT2' || proc === 'QT3') && <CoLink coOrderId={(b as { co_order_id?: string | null }).co_order_id} company={d.company} />}
      {proc === 'QT3' && d.company === 'HW' && <div className="f qt3-end"><span>Khách nhận hàng <span className="muted small">(Hanwa đổi được; mặc định là khách cuối của dự án)</span></span>
        <CustomerPicker value={h.end_customer_id || o.customer_id || ''} list={custs} canCreate={false} onChange={(c) => { if (!(can || adm)) return; setH({ ...h, end_customer_id: c?.id ?? '' }); setDirty(true); }} /></div>}
      {proc === 'QT1' && <CoBar docId={d.id} can={can} onTables={(x) => { setT(x as Record<string, Row[]>); }} />}
      <div className="grid2">
        {hFields.map((f) => { const ed = canEd(f); const v = h[f.key] ?? ''; const on = (x: string) => { setH({ ...h, [f.key]: x }); setDirty(true); };
          return <label key={f.key} data-fk={f.key} className={'f' + (f.type === 'textarea' ? ' f-wide' : '') + (can && pm(f) === 'required' && !String(v).trim() ? ' f-miss' : '')}><span>{f.label}{pm(f) === 'required' && <b className="req" aria-label="bắt buộc"> *</b>}</span>
            {f.type === 'carrier' ? <select disabled={!ed} value={v} onChange={(e) => on(e.target.value)}><option value="">— chọn —</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'noi_bo' ? ' (tự chở)' : ''}</option>)}</select>
              : f.type === 'select' ? <select disabled={!ed} value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{f.options.map((o2) => <option key={o2}>{o2}</option>)}{v && !f.options.includes(v) && <option>{v}</option>}</select>
              : f.type === 'textarea' ? <textarea rows={2} disabled={!ed} value={v} onChange={(e) => on(e.target.value)} />
              : <input type={f.type === 'date' ? 'date' : 'text'} list={(f.key === 'dia_diem' || f.key === 'dk_giao') && ship.length ? 'ship-' + d.id : f.key === 'xe' && plates.length ? 'xe-' + d.id : f.key === 'tai_xe' && plates.length ? 'tx-' + d.id : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined} disabled={!ed} value={v} aria-invalid={f.type === 'number' && !isNumOk(v) ? true : undefined}
                onChange={(e) => { const x = f.type === 'number' ? numTyping(e.target.value) : e.target.value; const pv = f.key === 'xe' ? plates.find((p) => p.plate === x) : undefined;
                  if (pv?.driver && !h.tai_xe) { setH({ ...h, xe: x, tai_xe: pv.driver }); setDirty(true); } else on(x); }} />}
            {f.key === 'xe' && plates.length > 0 && <datalist id={'xe-' + d.id}>{plates.map((p) => <option key={p.plate} value={p.plate}>{p.driver}</option>)}</datalist>}
            {f.key === 'tai_xe' && plates.length > 0 && <datalist id={'tx-' + d.id}>{[...new Set(plates.map((p) => p.driver).filter(Boolean))].map((x) => <option key={x} value={x} />)}</datalist>}
            {f.type === 'number' && !isNumOk(v) && <small className="f-err">Phải là số, VD: 12 hoặc 12,5</small>}
            {(f.key === 'dia_diem' || f.key === 'dk_giao') && ship.length > 0 && <datalist id={'ship-' + d.id}>{ship.map((x) => <option key={x} value={x} />)}</datalist>}
            {f.help && <small className="muted">{f.help}</small>}</label>; })}
      </div>

      {proc === 'QT1' && d.status === 'da_duyet' && d.company !== 'HW' && <SignedBox d={d} o={o} b={b} files={files} onDone={(nf) => { setFiles(nf); onChanged(); }} />}
      <div className="pp-files">
        {fFields.map(({ key: k, label: lab, ...f }) => (
          <div key={k} data-fk={k} className={'pp-fk' + (can && pm({ key: k, label: lab, ...f } as FDef) === 'required' && !files.some((x) => x.kind === k) ? ' f-miss' : '')}><span className="small"><b>{lab}</b>{pm({ key: k, label: lab, ...f } as FDef) === 'required' && <b className="req"> *</b>}</span>
            <span className="row" style={{ gap: 6 }}>{(() => { const ed = canEd({ key: k, label: lab, ...f } as FDef); const mine = files.filter((x) => x.kind === k); return <>
              {mine.map((x) => { const xx = x as { by?: string; step?: string }; const del = ed && canDelF(xx); return <span key={x.path} className="pp-file"><span className="row" style={{ gap: 2 }}><FileLink f={x} />
                {del ? <button className="btn xs icon-only" title={'Gỡ ' + x.name} aria-label={'Gỡ ' + x.name} onClick={() => removeFile(x.path, x.name)}><Icon name="trash" size={13} /></button>
                  : ed && <span className="pp-flock" title="Chỉ người tải file (trong bước đã tải) hoặc admin được gỡ"><Icon name="shield" size={13} /></span>}</span>
                {xx.by && <span className="pp-fby">Tải bởi {who(xx.by)}{xx.step ? ' · ' + (STATUS[xx.step] ?? xx.step) : ''}</span>}</span>; })}
              {mine.length === 0 && <span className="small muted">chưa có</span>}
              {k === 'excel' && mine.length > 0 && <XStatus key={xv} files={mine as never} ds={(t.ds ?? []) as never} canRecheck={ed} />}
              {ed && mine.some((x) => canDelF(x as { by?: string; step?: string })) && <label className="btn xs" title="Thay các file bạn đã tải bằng file mới"><Icon name="refresh" size={13} />Thay<input type="file" multiple hidden onChange={(e) => upload(e, k, true)} /></label>}
              {ed && <label className="btn xs" title={mine.length ? 'Thêm file' : 'Tải file lên'}><Icon name="upload" size={13} />{mine.length ? 'Thêm' : 'Tải lên'}<input type="file" multiple hidden onChange={(e) => upload(e, k)} /></label>}</>; })()}</span></div>))}
      </div>

      {tblDefs.map(({ key, title, cols, ed, treq }) => (
        <TableEdit key={key} title={title} req={treq} cols={cols} rows={t[key] ?? []} editable={ed}
          onChange={(rows) => { setT({ ...t, [key]: rows }); setDirty(true); }} fname={`${codeFile(docCode(o, b, d.company))}-${proc}-${key}`} />))}
      {proc === 'QT1' && !hid.has('ds:don_gia') && <Qt1Total rows={t.ds ?? []} vat={numIn(h.vat) ?? 8} />}
      {proc === 'QT2' && <Qt2Loss nl={t.nl ?? []} tp={t.tp ?? []} />}

      <FixMsg err={err} />
      {can && !['da_duyet', 'fail'].includes(d.status) && (
        <div className="pp-act">
          {ask ? (<div className="pp-ask">
            <label className="f">{ask === 'fail' ? 'Lý do thất bại – dừng hẳn lượt này (hao hụt lớn, vượt dự toán, khách huỷ…)' : 'Lý do trả về'} *<textarea rows={2} autoFocus value={why} onChange={(e) => setWhy(e.target.value)} /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setAsk('')}>Huỷ</button>
              <button className="btn rt-go" disabled={!why.trim() || busy} onClick={() => act(ask, why.trim())}>{ask === 'fail' ? 'Xác nhận Thất bại' : 'Trả về'}</button></div></div>) : (<>
            <SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} />
            {!first && <button className="btn kb-back pp-sec" onClick={() => setAsk('back')}><Icon name="back" size={16} />Trả về</button>}
            {(d.status === 'duyet' || d.status === 'duyet_them') && <button className="btn rt-go pp-sec" onClick={() => setAsk('fail')}><Icon name="x" size={16} />Thất bại</button>}
            {(!first || d.status === 'duyet' || d.status === 'duyet_them') && <details className="pp-actmore"><summary className="btn icon-btn" aria-label="Thao tác khác"><Icon name="more" size={18} /></summary>
              <div className="odh-menu pp-actmenu" role="menu">
                {!first && <button type="button" role="menuitem" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setAsk('back'); }}><Icon name="back" size={16} />Trả về</button>}
                {(d.status === 'duyet' || d.status === 'duyet_them') && <button type="button" role="menuitem" className="danger-h" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setAsk('fail'); }}><Icon name="x" size={16} />Thất bại</button>}</div></details>}
            <button className="btn primary pp-go" disabled={busy} title={(d.status === 'duyet' || d.status === 'duyet_them') ? 'Duyệt sẽ lưu PDF có dấu “ĐÃ DUYỆT”' + (proc !== 'QT0' ? (d.company === 'HW' ? ' · tiếp theo: khách ký tay' : ' · tiếp theo: ' + COMPANY[d.company === 'PN' ? 'IPC' : 'HW']) : '') : undefined} onClick={() => act('next')}><Icon name="check" size={16} />{busy ? 'Đang ký…' : (d.status === 'duyet_them' ? 'Duyệt (' + (lvName ?? 'cấp thêm') + ')' : NEXT_LABEL[d.status] ?? 'Ký')}</button>{(d.status === 'duyet' || d.status === 'duyet_them') && <span className="pp-hint">Duyệt sẽ lưu PDF có dấu “ĐÃ DUYỆT”</span>}</>)}
        </div>)}
      {editable && !(can && !['da_duyet', 'fail'].includes(d.status)) && <div className="pp-act"><SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} /></div>}
      {d.status !== 'da_duyet' && d.status !== 'fail' && <StepChecks proc={proc} d={d} people={people} canEdit={can || adm} onChanged={onChanged} live={{ header: h, tables: t as never, files }} />}
      </div>
      <aside className="pp-side">
        <button type="button" className="pp-sidebtn" onClick={() => setShut(!shut)} aria-expanded={!shut} title={(shut ? 'Mở' : 'Đóng') + ' ghi chú & hành trình'} data-kbd="]" aria-label={(shut ? 'Mở' : 'Đóng') + ' cột ghi chú và hành trình'}><Icon name={shut ? 'back' : 'arrow'} size={14} /></button>
        <div className="pp-shutter" onClick={() => setShut(false)} aria-hidden={!shut}>
          {(role || lvName) && !['da_duyet', 'fail'].includes(d.status) && <Assignees mini proc={proc} company={d.company} role={d.status === 'duyet_them' ? undefined : role} level={d.status === 'duyet_them' ? lvs.find((l) => l.id === apv?.queue[apv.idx]) : undefined} people={people} />}
          <span className="pp-sh-i" title="Ghi chú"><Icon name="chat" size={15} />{(d.notes ?? []).length || ''}</span>
          <span className="pp-sh-i" title="Đã chờ ở bước này"><Icon name="clock" size={15} />{waitH < 1 ? Math.round(waitH * 60) + "'" : waitH < 48 ? Math.round(waitH) + 'h' : Math.round(waitH / 24) + 'd'}</span>
        </div>
      <div className="pp-notes">
        <b>Ghi chú nối tiếp</b>
        {d.notes.length === 0 && <span className="small muted">Chưa có ghi chú.</span>}
        {d.notes.map((n, i) => <div key={i} className="pp-note"><span className="small muted">{ROLE_NAME[n.role] ?? n.role} · {who(n.user)} · {dt(n.at)}</span><div>{n.text}</div></div>)}
        {can && <div className="row"><input data-sk="c" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thêm ghi chú (yêu cầu đặc biệt, vấn đề kỹ thuật, lưu ý…)" />
          <button className="btn sm" disabled={!note.trim()} onClick={addNote}>Ghi</button></div>}
      </div>


      <Journey d={d} proc={proc} people={people} />
      </aside>
    </section>);
}

/** Trạng thái lưu + nút Lưu nháp cạnh nút Ký */
function SaveState({ editable, dirty, busy, onSave }: { editable: boolean; dirty: boolean; busy: boolean; onSave: () => void }) {
  if (!editable) return null;
  return <span className="pp-save">
    <button type="button" className={'btn sm pp-savebtn' + (dirty ? ' dirty' : '')} disabled={!dirty || busy} onClick={onSave} aria-live="polite" data-kbd="Ctrl S" data-kbd-label={dirty ? 'Lưu nháp' : 'Đã lưu'}>
      {dirty ? <><i className="pp-dot" aria-hidden="true" /><Icon name="check" size={14} /><span>Lưu<span className="pp-savelb"> nháp</span></span></> : <><Icon name="check" size={14} /><span>Đã lưu</span></>}</button></span>;
}

/** Còn thay đổi chưa lưu: hỏi trước khi rời trang (đóng tab, bấm liên kết trong app) */
const h0 = (d: Doc) => ({ apv: (d as Doc & { apv?: { queue: string[]; idx: number } | null }).apv ?? null });

function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const bu = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || e.ctrlKey || e.metaKey || e.shiftKey || a.closest('.pp-files')) return;
      const href = a.getAttribute('href') ?? ''; if (!href.startsWith('#')) return;
      e.preventDefault(); e.stopPropagation();
      confirmDialog('Phiếu còn thay đổi chưa lưu. Rời trang sẽ mất các thay đổi này.', 'Rời trang, bỏ thay đổi').then((ok) => { if (ok) location.hash = href.slice(1); });
    };
    addEventListener('beforeunload', bu); document.addEventListener('click', click, true);
    return () => { removeEventListener('beforeunload', bu); document.removeEventListener('click', click, true); };
  }, [dirty]);
}

function Qt1Total({ rows, vat }: { rows: Row[]; vat: number }) {
  const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const s = sumOf(rows, c);
  return <div className="pp-total"><span>Cộng: <b>{fmtN(s)}</b> đ</span><span>Thuế GTGT {vat}%: <b>{fmtN(Math.round(s * vat / 100))}</b> đ</span><span>Tổng thanh toán: <b>{fmtN(s + Math.round(s * vat / 100))}</b> đ</span></div>;
}
function Qt2Loss({ nl, tp }: { nl: Row[]; tp: Row[] }) {
  const kg = TABLES.nl.cols.find((x) => x.k === 'kg')!; const a = sumOf(nl, kg), z = sumOf(tp, kg); const l = a ? 1 - z / a : null;
  return <div className="pp-total"><span>Nguyên liệu: <b>{fmtN(a, 1)}</b> kg</span><span>Thành phẩm: <b>{fmtN(z, 1)}</b> kg</span>
    <span className={l != null && l > 0.15 ? 'kb-late' : ''}>Hao hụt: <b>{l == null ? '' : (l * 100).toFixed(1) + '%'}</b> (định mức ~15%)</span></div>;
}

/** Điện thoại: mỗi dòng một thẻ gọn, bấm để sửa */
function MList({ cols, rows, shown, editable, open, setOpen, set, onChange, totals }: { cols: Col[]; rows: Row[]; shown: number[]; editable: boolean; open: number; setOpen: (i: number) => void; set: (i: number, k: string, v: string) => void; onChange: (r: Row[]) => void; totals: Record<string, number> }) {
  const val = (r: Row, c: Col) => c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '');
  const head = cols.find((c) => !c.n) ?? cols[0];
  const right = cols.find((c) => c.k === 'don_gia') ?? cols.find((c) => c.k === 'tt') ?? cols.find((c) => c.k === 'kg');
  const sub = cols.filter((c) => c !== head && c !== right && ['day', 'so_tam', 'sl', 'm2', 'kg'].includes(c.k)).slice(0, 4);
  return <div className="pp-mlist">
    {rows.length === 0 && <div className="small muted">Chưa có dòng nào.</div>}
    {shown.map((i) => [rows[i], i] as const).map(([r, i]) => <div key={i} data-row={i} className={'pp-mrow' + (open === i ? ' on' : '')}>
      <button type="button" className="pp-mrow-h" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
        <span className="pp-mrow-m"><b>{val(r, head) || '(trống) #' + (i + 1)}</b><span className="small muted">{sub.map((c) => { const v = val(r, c); return v ? c.t + ' ' + v : ''; }).filter(Boolean).join(' · ')}</span></span>
        {right && <span className="pp-mrow-r"><b>{val(r, right) || '—'}</b><span className="small muted">{/\(([^)]+)\)/.exec(right.t)?.[1] ?? right.t}</span></span>}</button>
      {open === i && <div className="pp-mrow-e">
        {cols.map((c) => <label key={c.k} className="f"><span>{c.t}{c.req && <b className="req"> *</b>}</span>
          {c.calc || c.ro || !editable ? <output>{val(r, c) || '—'}</output>
            : <input value={typeof r[c.k] === 'number' ? String(r[c.k]) : String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} aria-invalid={c.n && !isNumOk(r[c.k]) ? true : undefined} onChange={(e) => set(i, c.k, c.n ? numTyping(e.target.value) : e.target.value)} />}</label>)}
        {editable && <button type="button" className="btn sm danger-soft" onClick={() => { onChange(rows.filter((_, j) => j !== i)); setOpen(-1); }}><Icon name="trash" size={14} />Bỏ dòng</button>}
      </div>}
    </div>)}
    {editable && <button type="button" className="btn sm" onClick={() => { onChange([...rows, {}]); setOpen(rows.length); }}><Icon name="plus" size={14} />Thêm dòng</button>}
    {rows.length > 0 && Object.keys(totals).length > 0 && <div className="pp-mtot small">Tổng {rows.length} dòng · {Object.entries(totals).map(([k, v]) => { const c = cols.find((x) => x.k === k)!; return c.t + ' ' + fmtN(v, c.d ?? 0); }).join(' · ')}</div>}
  </div>;
}

/** Bảng nhập liệu: sửa trực tiếp, dán từ Excel, tải file Excel, tải mẫu */
/** Cột được "áp dụng cho toàn bộ dòng" */
const FILL_COLS = ['don_gia'];
function TableEdit({ title, req, cols, rows, editable, onChange, fname }: { title: string; req?: boolean; cols: Col[]; rows: Row[]; editable: boolean; onChange: (r: Row[]) => void; fname: string }) {
  const inCols = cols.filter((c) => !c.calc && !c.ro);
  const isAdm = useAuth().can('admin_it');
  const [paste, setPaste] = useState(''); const [open, setOpen] = useState(false); const [msg, setMsg] = useState('');
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // Áp dụng một giá trị cho cả cột: từ ô vừa sửa (gợi ý) hoặc từ nút ở tiêu đề cột
  const [fill, setFill] = useState<{ k: string; v: string } | null>(null); const [hdr, setHdr] = useState<{ k: string; v: string } | null>(null);
  const applyCol = (k: string, v: string, onlyEmpty = false) => {
    const n = rows.filter((r) => (onlyEmpty ? !String(r[k] ?? '').trim() : String(r[k] ?? '') !== v)).length;
    onChange(rows.map((r) => (onlyEmpty && String(r[k] ?? '').trim() ? r : { ...r, [k]: v }))); setFill(null); setHdr(null);
    setMsg(`Đã áp dụng ${v} cho ${n} dòng · cột ${cols.find((c) => c.k === k)?.t}`);
  };
  const offer = (k: string, v: string) => { if (!FILL_COLS.includes(k) || !v.trim() || rows.length < 2) return; if (rows.some((r) => String(r[k] ?? '') !== v)) setFill({ k, v }); };
  // Cột tự giãn theo nội dung dài nhất (tối đa 48 ký tự), không hẹp hơn mặc định
  const wOf = (c: Col) => Math.min(48, Math.max(c.w ?? 7, ...rows.map((r) => String(r[c.k] ?? '').length + 3)));
  const colT = (k: string) => cols.find((c) => c.k === k)?.t ?? '';
  const totals = useMemo(() => Object.fromEntries(cols.filter((c) => c.n && ['so_tam', 'm2', 'kg', 'tt', 'm2_dot', 'duong_han'].includes(c.k)).map((c) => [c.k, sumOf(rows, c)])), [rows, cols]);
  let skipped = 0;
  const fromAoa = (aoa: string[][]) => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9²]/g, '');
    const hi = aoa.findIndex((r) => r.some((c) => inCols.some((x) => norm(c) === norm(x.t))));
    let map: (string | null)[];
    if (hi >= 0) { map = aoa[hi].map((c) => cols.find((x) => norm(c) === norm(x.t))?.k ?? null); aoa = aoa.slice(hi + 1); }
    else map = cols.map((c) => c.k);
    const out: Row[] = []; skipped = 0;
    for (const r of aoa) {
      const row: Row = {}; r.forEach((v, j) => { const k = map[j]; const c = cols.find((x) => x.k === k); if (k && c && !c.calc && !c.ro) row[k] = c?.n ? normNum(String(v ?? '')) : String(v ?? '').trim(); });
      if (!Object.values(row).some((v) => v)) continue;
      if (String(Object.values(row)[0] ?? '').toUpperCase() === 'TỔNG') continue;
      if ([0, 1, 2].some((i) => inCols.every((c) => String(row[c.k] ?? '') === String(sampleRow(c, i))))) { skipped++; continue; } // dòng ví dụ của file mẫu
      out.push(row);
    }
    return out;
  };
  // Dán thẳng vào ô (như Excel): nhiều ô / nhiều dòng → điền từ ô đang chọn sang phải và xuống dưới, thiếu dòng thì thêm
  const pasteAt = (e: React.ClipboardEvent<HTMLInputElement>, ri: number, ck: string) => {
    const txt = e.clipboardData.getData('text/plain'); if (!/[\t\n]/.test(txt.replace(/\r?\n$/, ''))) return; // một ô → để trình duyệt dán bình thường
    e.preventDefault();
    const lines = parseTsv(txt); if (!lines.length) return;
    // có dòng tiêu đề khớp tên cột → dùng ánh xạ theo tên
    const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9²]/g, '');
    if (lines[0].some((x) => inCols.some((c) => norm(x) === norm(c.t)))) { const add = fromAoa(lines); onChange([...rows, ...add]); setMsg('Đã thêm ' + add.length + ' dòng (theo tiêu đề cột)'); return; }
    const start = cols.findIndex((c) => c.k === ck); const out = rows.map((r) => ({ ...r })); let n = 0;
    lines.forEach((cells, li) => { const ix = ri + li; while (out.length <= ix) out.push({});
      cells.forEach((v, cj) => { const c = cols[start + cj]; if (c && !c.calc && !c.ro) out[ix][c.k] = c.n ? normNum(v) : v.trim(); }); n++; });
    onChange(out); setMsg(`Đã dán ${n} dòng × ${Math.min(lines[0].length, cols.length - start)} cột từ ô đang chọn`);
  };
  // Ctrl+V khi đang ở bảng nhưng không ở ô nhập (ví dụ bảng trống): thêm dòng mới
  const pasteAny = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const tg = e.target as HTMLElement; if (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || e.defaultPrevented) return;
    const g = parseTsv(e.clipboardData.getData('text/plain')); if (!g.length) return; e.preventDefault();
    const add = fromAoa(g); if (!add.length) { setMsg(skipped ? 'Các dòng dán vào trùng dòng ví dụ của Mẫu Excel nên không thêm.' : 'Không đọc được dòng nào.'); return; }
    onChange([...rows, ...add]); setMsg('Đã dán ' + add.length + ' dòng');
  };
  const doPaste = () => { const add = fromAoa(parseTsv(paste));
    if (!add.length) { setMsg(skipped ? 'Các dòng dán vào trùng dòng ví dụ của Mẫu Excel nên không thêm. Hãy thay bằng dữ liệu thật.' : 'Không đọc được dòng nào – kiểm tra lại dữ liệu đã chép.'); return; }
    onChange([...rows, ...add]); setPaste(''); setOpen(false); setMsg('Đã thêm ' + add.length + ' dòng' + (skipped ? ` (bỏ qua ${skipped} dòng ví dụ)` : '')); };
  const doFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; const X = await import('xlsx');
    const wb = X.read(await f.arrayBuffer()); const aoa = X.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '', raw: false });
    const add = fromAoa(aoa); onChange([...rows, ...add]); setMsg('Đã nạp ' + add.length + ' dòng từ ' + f.name + (skipped ? ` (bỏ qua ${skipped} dòng ví dụ)` : '')); e.target.value = '';
  };
  // File mẫu: đúng các cột của bảng (cột tự tính để trống, ghi chú "tự tính"), 3 dòng ví dụ
  const tpl = async () => { const X = await import('xlsx'); const hd = cols.map((c) => c.calc ? c.t + ' (tự tính)' : c.t);
    const ex = [0, 1, 2].map((i) => cols.map((c) => (c.calc ? '' : sampleRow(c, i))));
    const ws = X.utils.aoa_to_sheet([hd, ...ex]); ws['!cols'] = hd.map((h, j) => ({ wch: Math.max(10, h.length + 2, ...ex.map((r) => String(r[j]).length + 2)) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Mau'); X.writeFile(wb, fname + '-mau.xlsx'); };
  const fileRef = useRef<HTMLInputElement>(null);
  const [asTbl, setAsTbl] = useState(false); const [mi, setMi] = useState(-1);
  const [q, setQ] = useState(''); const [errOnly, setErrOnly] = useState(false); const errJ = useRef(-1);
  const wrapRef = useRef<HTMLDivElement>(null); const barRef = useRef<HTMLDivElement>(null); const lockS = useRef(''); const [edge, setEdge] = useState({ l: false, r: false }); const [sw, setSw] = useState(0);
  const syncEdge = useCallback(() => { const w = wrapRef.current; if (!w) return; const l = w.scrollLeft > 2, r = w.scrollLeft + w.clientWidth < w.scrollWidth - 2;
    setEdge((e) => (e.l === l && e.r === r ? e : { l, r })); setSw((x) => (x === w.scrollWidth ? x : w.scrollWidth));
    if (barRef.current && lockS.current !== 'b') { lockS.current = 'w'; barRef.current.scrollLeft = w.scrollLeft; requestAnimationFrame(() => { lockS.current = ''; }); } }, []);
  useEffect(() => { const w = wrapRef.current; if (!w) return; syncEdge(); const ro = new ResizeObserver(syncEdge); ro.observe(w); if (w.firstElementChild) ro.observe(w.firstElementChild); return () => ro.disconnect(); });
  const glide = (dir: number) => { const w = wrapRef.current; if (!w) return; const s0 = w.scrollLeft, d = dir * w.clientWidth * 0.8, t0 = performance.now();
    const st = (t: number) => { const k = Math.min(1, (t - t0) / 150); w.scrollLeft = s0 + d * (1 - (1 - k) ** 3); if (k < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); };
  const [nativeVis, setNativeVis] = useState(true); const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = endRef.current; if (!el) return; const io = new IntersectionObserver(([en]) => setNativeVis(en.isIntersecting), { rootMargin: '0px 0px -80px 0px' }); io.observe(el); return () => io.disconnect(); });
  const panStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return; const t = e.target as HTMLElement; if (t.closest('input,button,select,textarea,a,[contenteditable]')) return;
    const w = wrapRef.current; if (!w || w.scrollWidth <= w.clientWidth) return; const x0 = e.clientX, s0 = w.scrollLeft; let moved = false;
    const mv = (ev: PointerEvent) => { const dx = ev.clientX - x0; if (!moved && Math.abs(dx) < 4) return; moved = true; w.classList.add('panning'); w.scrollLeft = s0 - dx; ev.preventDefault(); };
    const up = () => { w.classList.remove('panning'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); };
  const [mob, setMob] = useState(() => window.matchMedia('(max-width:760px)').matches);
  useEffect(() => { const mq = window.matchMedia('(max-width:760px)'); const f = () => setMob(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  const step = mob ? 10 : 25;
  const [lim, setLim] = useState(0); const L = lim || step;
  const bad = (r: Row) => cols.some((c) => !c.calc && !c.ro && ((c.req && !String(r[c.k] ?? '').trim()) || (c.n && !isNumOk(r[c.k]))));
  const ql = q.trim().toLowerCase();
  const hit = rows.map((_, i) => i).filter((i) => (!errOnly || bad(rows[i])) && (!ql || cols.some((c) => !c.n && String(rows[i][c.k] ?? '').toLowerCase().includes(ql))));
  const shown = hit.slice(0, L); const nBad = rows.filter(bad).length;
  const [fixedAll, setFixedAll] = useState(false);
  useEffect(() => { if (errOnly && nBad === 0) { setErrOnly(false); setLim(0); setFixedAll(true); const t = setTimeout(() => setFixedAll(false), 4000); return () => clearTimeout(t); } }, [errOnly, nBad]);
  const clearAll = async () => { if (await confirmDialog(`Xoá hết ${rows.length} dòng của bảng “${title}”? (Chưa lưu thì bấm Huỷ thay đổi để lấy lại)`, 'Xoá hết')) onChange([]); };
  const addSample = () => { onChange([...rows, ...[0, 1, 2].map((i) => Object.fromEntries(inCols.map((c) => [c.k, String(sampleRow(c, i))])) as Row)]); setMsg('Đã nạp 3 dòng mẫu – kiểm tra rồi bấm Lưu'); };
  return (
    <div className={'pp-tbl' + (asTbl ? ' as-tbl' : '')} onPaste={editable ? pasteAny : undefined}>
      <div className="row between pp-th"><b>{title}{req && <span className="req-star" title="Bắt buộc có ít nhất 1 dòng trước khi ký"> *</span>} <span className="small muted">· {rows.length} dòng</span></b>
        {rows.length > 0 && <span className="pp-vt" role="group" aria-label="Kiểu xem"><button type="button" aria-pressed={!asTbl} title="Danh sách" aria-label="Danh sách" onClick={() => setAsTbl(false)}><Icon name="list" size={16} /></button><button type="button" aria-pressed={asTbl} title="Bảng" aria-label="Bảng" onClick={() => setAsTbl(true)}><Icon name="sheet" size={16} /></button></span>}
        {editable && <span className="row pp-tools" style={{ gap: 6 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={doFile} />
          <button className="btn xs" title="Tải file Excel lên (đọc theo tên cột)" onClick={() => fileRef.current?.click()}><Icon name="upload" size={13} />Tải lên</button>
          <button className="btn xs" title="Dán dữ liệu đã chép từ Excel – hoặc bấm vào một ô rồi Ctrl+V" onClick={() => setOpen(!open)}><Icon name="copy" size={13} />Dán</button>
          <button className="btn xs" title="Tải file mẫu: đúng các cột của bảng, có 3 dòng ví dụ" onClick={tpl}><Icon name="download" size={13} />Mẫu</button>
          {isAdm && <button className="btn xs icon-only" title="Admin: nạp 3 dòng dữ liệu mẫu" aria-label="Nạp dữ liệu mẫu" onClick={addSample}><Icon name="bolt" size={13} /></button>}
          {rows.length > 0 && <button className="btn xs icon-only danger-h" title="Xoá hết các dòng" aria-label="Xoá hết các dòng" onClick={clearAll}><Icon name="trash" size={13} /></button>}</span>}</div>
      {open && <div className="pp-paste"><textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Chép các dòng trong Excel (có hoặc không có dòng tiêu đề) rồi dán vào đây.\nThứ tự cột như bảng: ' + cols.map((c) => c.t).join(' · ')} />
        <button className="btn sm primary" disabled={!paste.trim()} onClick={doPaste}>Thêm vào bảng</button></div>}
      {msg && <div className="small muted">{msg}</div>}
      {hdr && <div className="fill-bar" role="dialog" aria-label={'Đặt chung ' + colT(hdr.k)}>
        <span className="fill-t"><Icon name="list" size={15} /><span>Đặt chung <b>{colT(hdr.k)}</b> cho {rows.length} dòng</span></span>
        <input autoFocus value={hdr.v} inputMode="decimal" onChange={(e) => setHdr({ ...hdr, v: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); /* phải bấm nút, không tự áp dụng */ if (e.key === 'Escape') setHdr(null); }} placeholder="Nhập giá trị" />
        <button className="btn sm primary" disabled={!hdr.v.trim()} onClick={() => applyCol(hdr.k, hdr.v)}>Áp dụng tất cả</button>
        <button className="btn sm" disabled={!hdr.v.trim()} onClick={() => applyCol(hdr.k, hdr.v, true)}>Chỉ ô trống</button>
        <button className="btn sm icon-btn" onClick={() => setHdr(null)} aria-label="Đóng"><Icon name="x" size={15} /></button></div>}
      {fill && !hdr && <div className="fill-bar sug" role="status">
        <span className="fill-t"><Icon name="list" size={15} /><span>Áp dụng <b>{fill.v}</b> cho cả {rows.length} dòng · <b>{colT(fill.k)}</b>?</span></span>
        <button className="btn sm primary" onClick={() => applyCol(fill.k, fill.v)}>Tất cả</button>
        {rows.some((r) => !String(r[fill.k] ?? '').trim()) && <button className="btn sm" onClick={() => applyCol(fill.k, fill.v, true)}>Chỉ ô trống</button>}
        <button className="btn sm icon-btn" onClick={() => setFill(null)} aria-label="Bỏ qua"><Icon name="x" size={15} /></button></div>}
      {rows.length > 10 && <div className="pp-find">
        <label className="pp-q"><Icon name="search" size={15} /><input type="search" placeholder="Tìm mã tấm, vật liệu…" value={q} onChange={(e) => { setQ(e.target.value); setLim(0); }} aria-label="Tìm tấm" /></label>
        {nBad > 0 && <button type="button" className={'pp-chip' + (errOnly ? ' on' : '')} aria-pressed={errOnly} title="Chỉ hiện dòng lỗi" onClick={() => { setErrOnly(!errOnly); setLim(0); }}>Lỗi {nBad}</button>}
        {nBad > 0 && <button type="button" className="pp-chip nx" title="Đến dòng lỗi tiếp theo" aria-label="Đến dòng lỗi tiếp theo" onClick={() => {
          const bads = rows.map((_, i) => i).filter((i) => bad(rows[i])); const cur = errJ.current; const nx = bads.find((i) => i > cur) ?? bads[0]; errJ.current = nx;
          const pos = hit.indexOf(nx); if (pos < 0) { setQ(''); setErrOnly(false); } setLim((x) => Math.max(x || step, (pos < 0 ? nx : pos) + 1));
          setTimeout(() => { const el = [...document.querySelectorAll<HTMLElement>('[data-row="' + nx + '"]')].find((x) => x.offsetParent) ?? null; if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('pp-flash'); setTimeout(() => el.classList.remove('pp-flash'), 1200); } }, 60); }}><Icon name="arrow" size={13} /></button>}
        {(ql || errOnly) && <span className="small muted">{hit.length}/{rows.length}</span>}
        {fixedAll && <span className="small pp-okmsg" role="status"><Icon name="check" size={14} />Đã sửa hết lỗi</span>}
      </div>}
      {mob && <MList cols={cols} rows={rows} shown={shown} editable={editable} open={mi} setOpen={setMi} set={set} onChange={onChange} totals={totals} />}
      {(!mob || asTbl) && <div className="pp-tw">
      {edge.l && <button type="button" className="pp-edge l" aria-label="Cuộn sang trái" onClick={() => glide(-1)}><Icon name="back" size={18} /></button>}
      {edge.r && <button type="button" className="pp-edge r" aria-label="Cuộn sang phải" onClick={() => glide(1)}><Icon name="back" size={18} /></button>}
      <div className={'tbl-wrap' + (edge.l ? ' sl' : '') + (edge.r ? ' sr' : '')} ref={wrapRef} onScroll={syncEdge} onPointerDown={panStart}><table className="tbl pp-grid">
        <thead><tr><th>#</th>{cols.map((c) => <th key={c.k} className={c.n ? 'n' : 't'}>{editable && !c.calc && !c.ro && FILL_COLS.includes(c.k) && rows.length > 1
          ? <button className="th-fill" onClick={() => setHdr(hdr?.k === c.k ? null : { k: c.k, v: String(rows.find((r) => String(r[c.k] ?? '').trim())?.[c.k] ?? '') })} title={'Đặt cùng giá trị cho cả cột ' + c.t} aria-label={'Đặt chung cột ' + c.t}>
              {c.t}{c.req && <b className="req"> *</b>}<Icon name="list" size={12} /></button> : <>{c.t}{c.req && <b className="req"> *</b>}</>}</th>)}{editable && <th />}</tr></thead>
        <tbody>
          {shown.map((i) => [rows[i], i] as const).map(([r, i]) => <tr key={i} data-row={i} className={bad(r) ? 'pp-bad' : undefined}><td className="muted">{i + 1}</td>
            {cols.map((c) => <td key={c.k} className={(c.n ? 'n' : 't') + (!c.calc && !c.ro && ((c.req && !String(r[c.k] ?? '').trim()) || (c.n && !isNumOk(r[c.k]))) ? ' pp-cbad' : '')} title={c.k === 'ma_tam' ? String(r[c.k] ?? '') : undefined}>{c.calc ? <span className="calc">{fmtN(c.calc(r), c.d ?? 0)}</span>
              : editable && !c.ro ? <input onPaste={(e) => pasteAt(e, i, c.k)} value={typeof r[c.k] === 'number' ? String(Math.round((r[c.k] as number) * 1e6) / 1e6) : String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} aria-invalid={c.n && !isNumOk(r[c.k]) ? true : undefined} title={c.n && !isNumOk(r[c.k]) ? c.t + ' phải là số' : undefined} onChange={(e) => set(i, c.k, c.n ? numTyping(e.target.value) : e.target.value)} onBlur={(e) => offer(c.k, e.target.value)}
                data-cell={i + ':' + c.k} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); // Enter = xuống ô dưới; không bao giờ tự áp dụng cả cột
                  const nx = (e.currentTarget.closest('table') as HTMLElement | null)?.querySelector<HTMLInputElement>('[data-cell="' + (i + 1) + ':' + c.k + '"]'); if (nx) nx.focus(); else (e.target as HTMLInputElement).blur(); } }} className={c.n ? 'num' : undefined} style={{ minWidth: wOf(c) + 'ch' }} />
              : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '')}</td>)}
            {editable && <td><button className="link-btn" aria-label="Bỏ dòng" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}</tr>)}
          {editable && rows.length === 0 && <tr><td colSpan={cols.length + 2}><div className="pp-dropzone" tabIndex={0} role="textbox" aria-label="Dán dữ liệu từ Excel">
            <Icon name="copy" size={16} /><span><b>Bấm vào đây rồi nhấn Ctrl+V</b> để dán các dòng đã chép từ Excel <span className="muted">(có hoặc không có dòng tiêu đề)</span></span></div></td></tr>}
          {editable && <tr><td colSpan={cols.length + 2}><button className="link-btn" onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Thêm dòng</button></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan={2} className="pp-tot-lb">Tổng <span>{rows.length} dòng</span></td>{cols.slice(1).map((c) => <td key={c.k} className={c.n ? 'n' : ''}>{c.k in totals ? <b>{fmtN(totals[c.k], c.d ?? 0)}</b> : null}</td>)}{editable && <td />}</tr></tfoot>}
      </table></div>
      <div ref={endRef} className="pp-tend" />
      {(edge.l || edge.r) && <div className="pp-hhint small muted">Kéo ✋ ở ô không nhập, ⇧ + lăn chuột, hoặc bấm ‹ › để cuộn ngang</div>}
      </div>}
      {hit.length > step && <div className="pp-pager">
        <span className="small muted">Hiện 1–{shown.length} / {hit.length}</span>
        {hit.length > shown.length && <button type="button" className="btn sm" onClick={() => setLim(L + step)}>Xem thêm {Math.min(step, hit.length - shown.length)}</button>}
        {hit.length > shown.length && <button type="button" className="link-btn" onClick={() => setLim(hit.length)}>Hiện tất cả</button>}
        {L > step && <button type="button" className="btn sm" onClick={() => { setLim(0); requestAnimationFrame(() => document.querySelector('.pp-tbl')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }}><span className="pp-upic"><Icon name="back" size={14} /></span>Thu gọn</button>}
      </div>}
      {hit.length === 0 && rows.length > 0 && <div className="small muted pp-none">Không có tấm khớp. <button type="button" className="btn sm" onClick={() => { setQ(''); setErrOnly(false); setLim(0); }}>Bỏ lọc</button></div>}
    </div>);
}

/** Bản in theo mẫu form (A4) */
/** HTML bản in mặc định của app (khi QT chưa có mẫu Excel) */
/** Bản in mặc định: bảng có từ 9 cột trở lên thì in khổ ngang */
export const wideDoc = (p: Proc) => tablesOf(p).some((t) => colsOf(p, t.key).length >= 9);
/** Dòng ví dụ trong file "Mẫu Excel" (theo Lệnh gia công mẫu IPCĐC02). Khi tải lên, dòng trùng ví dụ sẽ bị bỏ qua. */
const SAMPLE: Record<string, (string | number)[]> = {
  ma_tam: ['SL-AL-SILL-137-CUR-BOT.1', 'SL-AL-SILL-137-CUR-BOT.2', 'SL-AL-SILL-137-CUR-TOP.1'],
  vat_lieu: ['Nhôm 3.0 x W x L (A3003-H14/24-CN)', 'Nhôm 3.0 x W x L (A3003-H14/24-CN)', 'Nhôm 3.0 x W x L (A3003-H14/24-CN)'],
  tam_phoi: ['1500x5500', '1500x5500', '1250x2500'], day: [3, 3, 3], dai: [880, 880, 880], rong: [427, 427, 427],
  mac_thep: ['A3003H14-30000W000L-CN', 'A3003H14-30000W000L-CN', 'A3003H14-30000W000L-CN'],
  so_tam: [3, 2, 8], m2_tam: [0.38, 0.38, 0.38], m2: [1.13, 0.75, 3.01], kg: [9.3, 6.2, 24.8], ma_mau: ['YN205V', 'YN205V', 'YN205V'],
  ma_don_hang: ['110260HW0001.001', '110260HW0001.002', '110260HW0001.004'], kh_bv: ['SL-AL-SILL-137-CUR-BOT.1', 'SL-AL-SILL-137-CUR-BOT.2', 'SL-AL-SILL-137-CUR-TOP.1'],
  pallet: ['PL-1', 'PL-1', 'PL-2'], don_gia: [450000, 450000, 450000], duong_han: [0, 0, 1.2], chan: [2, 2, 4], m2_dot: [0, 0, 0],
  ghi_chu: ['', '', ''],
};
const sampleRow = (c: Col, i: number) => { const v = SAMPLE[c.k]?.[i]; return v ?? (c.n ? 1 : 'VD ' + (i + 1)); };
export function docHtml(o: Order, b: Batch, d: Doc, people: Record<string, Profile>, auto = false): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const who = (id?: string) => (id ? people[id]?.full_name ?? '' : '');
  const title = { QT0: 'DANH SÁCH TẤM – BÓC TÁCH BẢN VẼ', QT1: 'XÁC NHẬN ĐƠN HÀNG', QT2: 'LỆNH GIA CÔNG KIÊM BÀN GIAO VẬT LIỆU', QT3: 'PHIẾU XUẤT KHO KIÊM BIÊN BẢN GIAO HÀNG' }[b.proc];
  const meta = [['Mã đơn hàng', docCode(o, b, d.company)], ['Dự án', o.project], ...hdrOf(b.proc).map(([k, l]) => [l, d.header[k] ?? ''])];
  const tbl = PROC_TABLES[b.proc].map(([key, def]) => { const T = { t: TABLES[def].t, cols: colsOf(b.proc, key) }; const rows = d.tables[key] ?? [];
    return `<h3>${esc(T.t)}</h3><table><tr><th>STT</th>${T.cols.map((c) => `<th>${esc(c.t)}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><td>${i + 1}</td>${T.cols.map((c) => `<td class="${c.n ? 'n' : ''}">${esc(c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : r[c.k])}</td>`).join('')}</tr>`).join('')}
      <tr class="t"><td></td>${T.cols.map((c, j) => `<td class="n">${j === 0 ? 'TỔNG' : ['so_tam', 'm2', 'kg', 'tt'].includes(c.k) ? fmtN(sumOf(rows, c), c.d ?? 0) : ''}</td>`).join('')}</tr></table>`; }).join('');
  const roles = b.proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet'];
  const sig = roles.map((r) => { const s = [...d.signs].reverse().find((x) => x.role === r && x.action === 'ky');
    return `<td><b>${r === 'admin' ? 'Người tạo' : ROLE_NAME[r]}</b><br><small>ký điện tử</small><div class="sp">${s ? '✔ ' + esc(who(s.user)) + ((s as { by?: string }).by ? ' <small>(' + esc(who((s as { by?: string }).by!)) + ' làm thay)</small>' : '') + '<br><small>' + esc(dt(s.at)) + '</small>' : ''}</div></td>`; }).join('');
  const hand = b.proc === 'QT1' ? ['Khách hàng xác nhận (ký, đóng dấu)'] : b.proc === 'QT2' ? ['Người bàn giao vật liệu', 'Người nhận vật liệu'] : b.proc === 'QT3' ? ['Thủ kho / người giao', 'Tài xế', 'Khách hàng nhận hàng'] : [];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(docCode(o, b, d.company))} ${b.proc} ${esc(COMPANY[d.company])}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"><style>
    @page{size:A4 ${wideDoc(b.proc) ? 'landscape' : 'portrait'};margin:12mm}body{font-family:'Be Vietnam Pro',system-ui,sans-serif;font-size:11px;color:#111}h1{font-size:17px;text-align:center;margin:6px 0 10px}h3{font-size:12px;margin:12px 0 4px}
    .co{font-weight:700;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:3px 5px;vertical-align:top}th{background:#eee}
    td.n{text-align:right}.meta td{border:0;padding:2px 4px}.t td{font-weight:700;background:#f4f4f4}.sig td{text-align:center;width:25%}.sp{height:60px;padding-top:6px}
    .notes{margin-top:8px;font-size:10.5px}</style></head><body>
    <div class="co">${esc(COMPANY[d.company])}</div><h1>${title}</h1>
    <table class="meta">${meta.map((m, i) => (i % 2 === 0 ? '<tr>' : '') + `<td><b>${esc(m[0])}:</b> ${esc(m[1])}</td>` + (i % 2 ? '</tr>' : '')).join('')}</table>
    ${tbl}
    ${d.notes.length ? `<div class="notes"><b>Ghi chú:</b><br>${d.notes.map((n) => esc((ROLE_NAME[n.role] ?? n.role) + ': ' + n.text)).join('<br>')}</div>` : ''}
    <h3>Ký xác nhận</h3><table class="sig"><tr>${sig}</tr></table>
    ${hand.length ? `<h3>Ký tay</h3><table class="sig"><tr>${hand.map((x) => `<td><b>${x}</b><div class="sp"></div>Họ tên: ……………………</td>`).join('')}</tr></table>` : ''}
    ${auto ? '<script>onload=()=>(document.fonts ? document.fonts.ready : Promise.resolve()).then(()=>setTimeout(()=>print(),200))</script>' : ''}</body></html>`;
}
function printDoc(o: Order, b: Batch, d: Doc, people: Record<string, Profile>) {
  viewHtml(docHtml(o, b, d, people, false), PROC_NAME[b.proc] + ' · ' + b.title);
}

/** Kết quả đối chiếu Excel bóc tách ↔ danh sách tấm – ưu tiên kết quả máy chủ (excel_checks) */
function XStatus({ files, ds, canRecheck }: { files: { name: string; path: string; check?: XCheck }[]; ds: Record<string, unknown>[]; canRecheck?: boolean }) {
  const [srv, setSrv] = useState<Record<string, { ok: boolean; error: string | null; codes: string[]; qty: number; rows: number }> | null>(null); const [busy, setBusy] = useState(false);
  const load = () => sb.from('excel_checks').select('*').in('path', files.map((f) => f.path)).then(({ data }) => setSrv(Object.fromEntries(((data ?? []) as { path: string; ok: boolean; error: string | null; codes: string[]; qty: number; rows: number }[]).map((r) => [r.path, r]))));
  useEffect(() => { load(); }, [files.map((f) => f.path).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const recheck = async () => { setBusy(true); for (const f of files) await sb.functions.invoke('excel-check', { body: { path: f.path } }); await load(); setBusy(false); };
  if (!srv) return <span className="xs-st"><Icon name="clock" size={13} />Đang kiểm…</span>;
  const f = files[0]; const r = srv[f.path];
  const again = canRecheck && <button type="button" className="btn xs" disabled={busy} onClick={recheck}>{busy ? 'Đang kiểm…' : 'Kiểm tra lại'}</button>;
  if (!r) return <span className="row" style={{ gap: 6 }}><span className="xs-st warn"><Icon name="alert" size={13} />Máy chủ chưa kiểm file này</span>{again}</span>;
  if (!r.ok) return <span className="row" style={{ gap: 6 }}><span className="xs-st bad"><Icon name="x" size={13} />File không hợp lệ: {r.error}</span>{again}</span>;
  const lc = files[0].check; void ds;
  return <span className="xs-st info"><Icon name="check" size={13} />File bóc tách hợp lệ{lc?.sheet ? ' · sheet ' + lc.sheet : ''} · {r.rows} dòng · {Number(r.qty).toLocaleString('vi-VN')} tấm{lc?.day?.length ? ' · dày ' + lc.day.join(', ') + 'mm' : ''}</span>;
}
