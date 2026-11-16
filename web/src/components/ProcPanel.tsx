import { GuideBox } from './GuideBox';
import { Sheet } from './Sheet';
import { switchCo } from './ScopeChip';
import { useScope } from '../lib/myco';
import { Annotate } from './Annotate';
import { bocTachRows, haoHutOf } from '../lib/excelCheck';
import { FixMsg } from './FixMsg';
import { isTyping, keyOf, modalOpen } from './Shortcuts';
import { missingReq, jumpField } from '../lib/checks';
import { goFix } from '../lib/gotoFix';
import { cached, cacheUser, peek, dropCache } from '../lib/qcache';
// Chỉ nhớ kết quả "được làm"; kết quả "không" hỏi lại (vd vừa đổi công ty, máy chủ chưa cập nhật)
export const canActQ = (id: string, st: string) => { const k = 'ca:' + cacheUser + ':' + id + ':' + st; return cached(k, () => sb.rpc('can_act', { p_doc: id }).then((r) => !!r.data), 60000).then((v) => { if (!v) dropCache(k); return v; }); };
import { viewHtml, viewUrl } from '../lib/viewer';
import { Assignees } from './Assignees';
import { useGuides, guideFor, guideByKey } from '../lib/guides';
import { StepChecks, DocSteps, StepDot, useStepProg } from './StepChecks';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { safeName } from '../lib/files';
import { normNum, parseTsv } from '../lib/paste';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sb, errText, type Customer, type Order, type Profile } from '../lib/supabase';
import { dt, num as fnum } from '../lib/format';
import { useProjects } from '../lib/projects';
import { readPmsx, readPmsxHead, readBbgh } from '../lib/pmsx';
import { useMaterials } from '../lib/materials';
import {
  BATCH_WORD, GH_ITEMS, CHECK5, COMPANIES, COMPANY, FINAL, FLOW, NEXT_LABEL, PROC_NAME, PROC_TABLES, ROLE_NAME, ROLE_OF, STATUS, TABLES,
  sumOf, numIn, isNumOk, numTyping, type Batch, type Col, type Company, type Doc, type Proc, type Row,
  stampDens, matOf, m2Of, kgOf, densOf, subRows,
  nlFromPhoi,
} from '../lib/proc';
import { Icon } from './Icon';
import { askRating } from './Rating';
import { Qt0Picker, Qt0Alloc, ReClone, takeRow, q0Key, type Q0Row, type Q0Pick } from './Qt0Picker';
import { procData, procKey, type ProcData } from '../lib/orderData';
import { evalFormula } from '../lib/formula';
import { HeadInput, headErr } from './HeadInput';
import { CoBar, CoLink } from './CoBar';
import { codeFile, docCode, reloadCoIdx, useCoIdx, useMyCo } from '../lib/myco';
import { checkExcelFile, type XCheck } from '../lib/excelCheck';
import { CustomerPicker } from './CustomerPicker';
import { Journey } from './Journey';
import { advanceDoc } from '../lib/records';
import { ReviewPdf, reviewQ } from './Records';
import { parties } from '../lib/xlsxTpl';
import { RtThumbs, rtFilesAt } from './RtThumbs';
import { useFields, fieldsOf, permOf, colsOf, hdrOf, tablesOf, fmtCell, type FDef } from '../lib/fields';
import { PrintTplButton } from './PrintTpl';
import { QtTag } from './QtTag';
import { confirmDialog, toast, Msg, InfoChip } from './ui';
import { useAuth } from '../lib/auth';
import { VarTag } from '../lib/showVars';
import { useWho } from '../lib/people';

const fmtN = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? '' : fnum(v, d));

/** Một quy trình của một đơn: danh sách hồ sơ (lần / lệnh / đợt) → chuỗi công ty → bản đang chọn */
export default function ProcPanel({ o, proc, people, autoNew = false }: { o: Order; proc: Proc; people: Record<string, Profile>; autoNew?: boolean }) {
  const pre = peek<ProcData>(procKey(o.id, proc), 20000); // đã tải sẵn cùng lúc với đầu đơn → hiện ngay
  const [batchesRaw, setBatches] = useState<Batch[] | null>(pre?.batches ?? null); const [docs, setDocs] = useState<Doc[]>(pre?.docs ?? []);
  const first = useRef('');
  const [psp] = useSearchParams();
  const [bid, setBid] = useState(() => psp.get('b') ?? ''); const [co, setCo] = useState<Company | ''>(() => (psp.get('co') as Company | null) ?? '');
  const [info, setInfo] = useState(false);
  const [creating, setCreating] = useState(autoNew);
  const [psp2, setPsp2] = useSearchParams();
  useEffect(() => { if (psp2.get('new') !== '1' || psp2.get('tab') !== proc) return; setCreating(true); const n = new URLSearchParams(psp2); n.delete('new'); setPsp2(n, { replace: true }); }, [psp2.get('new')]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    reloadCoIdx();
    // lần đầu dùng dữ liệu đã tải sẵn (chung với trang đơn); các lần sau (lưu, chuyển bước) tải mới
    const f = first.current === o.id + proc; first.current = o.id + proc;
    const r = await procData(o.id, proc, f); const bs = r.batches; setBatches(bs);
    if (bs.length) { const dd = r.docs; setDocs(dd); dd.forEach((x) => { if (!['da_duyet', 'fail'].includes(x.status)) { canActQ(x.id, x.status).catch(() => {}); if (['duyet', 'duyet_them'].includes(x.status)) reviewQ(x.id, x.status).catch(() => {}); } }); } else setDocs([]);
  }, [o.id, proc]);
  useEffect(() => { load(); }, [load]);
  // Đổi công ty: quyền xem phiếu (can_view) tính theo công ty đang làm → tải lại
  useEffect(() => { const f = () => { load(); }; addEventListener('scope-synced', f); return () => removeEventListener('scope-synced', f); }, [load]);
  const { canSwitch: multiCo0, scope: scope0 } = useScope(); const myCos0 = useMyCo().allowed as string[];
  // Người chỉ thuộc 1 công ty: chỉ thấy hồ sơ có phiếu của công ty mình
  const batchesAll = batchesRaw;
  // Nhiều công ty (kể cả admin): chỉ hiện hồ sơ của công ty đang chọn (QT0 dùng chung nên không lọc)
  const coOk = (x: Batch) => { const ds = docs.filter((d) => d.batch_id === x.id); return !ds.length || (multiCo0 ? (proc === 'QT0' || ds.some((d) => d.company === scope0)) : ds.some((d) => myCos0.includes(d.company))); };
  const batches = !batchesAll || (!multiCo0 && !myCos0.length) ? batchesAll : batchesAll.filter(coOk);
  const B = batches?.find((x) => x.id === bid) ?? batches?.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches?.at(-1);
  useEffect(() => { dispatchEvent(new CustomEvent('pp-batch', { detail: { proc, id: B?.id ?? '' } })); }, [proc, B?.id]);
  const bDocs = docs.filter((d) => d.batch_id === B?.id);
  const cur = [...bDocs].sort((a, z) => COMPANIES.indexOf(z.company) - COMPANIES.indexOf(a.company))[0];
  const D = bDocs.find((d) => d.company === co) ?? (cur?.can_view === false ? bDocs.filter((x) => x.can_view !== false).at(-1) ?? cur : cur);
  const { isPerson } = useWho(); const { me: meNB, can: canNB } = useAuth(); const { co: coNB } = useMyCo();
  const canNew = canNB('admin_it') || isPerson(proc, proc === 'QT0' ? 'PN' : coNB || 'PN', proc === 'QT0' ? 'admin' : 'lap', meNB?.id);
  if (!batches) return <div className="card pp-skel" aria-busy="true" aria-label={'Đang tải ' + proc}><span /><span /><span /><span /></div>;
  return (
    <div className="pp">
      <div className="pp-head">
        <div className="pp-hl"><button type="button" className={'pp-qt' + (info ? ' on' : '')} aria-expanded={info} aria-label={PROC_NAME[proc] + ' – xem mô tả'} title={PROC_NAME[proc]} onClick={() => setInfo(!info)}><QtTag qt={proc} /><Icon name="info" size={13} /></button>
          {batches.length > 1 && (() => { const B0 = batches.find((x) => x.id === bid) ?? batches.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches.at(-1)!; return <BatchSel o={o} batches={batches} B={B0} onPick={(id) => { setBid(id); setCo(''); }} />; })()}
          {proc === 'QT1' && <span id="pp-codeslot" className="pp-codeslot" data-show={batches.length > 1 ? '0' : '1'} />}
        {!canNew ? null : batches.length ? <button type="button" className="btn sm pp-new" data-sk="t" data-kbd="Shift T" title={proc === 'QT1' ? 'Tách đơn mới' : 'Mở ' + BATCH_WORD[proc] + ' mới'} aria-label={proc === 'QT1' ? 'Tách đơn mới' : 'Mở ' + BATCH_WORD[proc] + ' mới'} onClick={() => setCreating(true)}><Icon name="plus" size={16} /><span className="pp-new-t">{({ QT0: 'Lần mới', QT1: 'XNĐH', QT2: 'Lệnh', QT3: 'Đợt' } as Record<string, string>)[proc]}</span></button>
          : <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{'Bắt đầu ' + proc}</button>}</div>
      </div>
      {info && <p className="small muted pp-desc">{proc === 'QT0' ? 'Chỉ Phương Nam CNC làm. Danh sách tấm đã duyệt là đầu vào (tuỳ chọn) của XNĐH.'
            : proc === 'QT1' ? 'Phương Nam lập → duyệt → IPC chép danh sách, đổi giá → duyệt → Hanwa → duyệt. Mỗi bên in bộ của mình cho khách ký.'
            : proc === 'QT2' ? 'Đầu vào là Excel lệnh gia công từ phần mềm sản xuất. Một đơn có thể chia nhiều lệnh. Cả 3 công ty đều lập hồ sơ.'
            : 'Mỗi đợt giao một phiếu, qua 3 công ty rồi khách ký nhận. Tổng các đợt khớp lệnh do phần mềm sản xuất kiểm.'}</p>}
      {creating && <NewBatch o={o} proc={proc} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setBid(id); setCo(''); load(); }} />}
      {batches.length === 0 ? <div className="empty"><Icon name="inbox" size={28} /><b>Chưa có hồ sơ {proc} cho đơn này</b><span className="small muted">Bấm “{'Bắt đầu ' + proc}” để mở.</span></div> : (<>
        {B && B.status === 'cho_ky' && <Final b={B} o={o} onDone={load} />}
        {B && B.status === 'hoan_tat' && proc !== 'QT0' && (() => { const co = D?.company ?? ''; const nx = ({ PN: 'IPC', IPC: 'HW' } as Record<string, string>)[co];
          return <InfoChip id="batch-done" tone="ok" label={<>{B.title} · {co === 'PN' ? 'PNC' : co} xong{nx ? ' → ' + nx : ' cả chuỗi'}</>}>
            <p>{B.title} của {COMPANY[co as Company] ?? co} đã duyệt xong{B.done_at ? ' lúc ' + new Date(B.done_at).toLocaleString('vi-VN') : ''}.</p>
            <p>{nx ? `Hệ thống đã tự mở ${B.title.toLowerCase()} cho ${COMPANY[nx as Company]} – chọn ${nx} ở thanh công ty để xem.` : 'Đã đi hết chuỗi PN → IPC → HW.'}</p>
            {B.final_files.length > 0 && <p>Bản đã ký: {B.final_files.map((f) => <FileLink key={f.path} f={f} />)}</p>}</InfoChip>; })()}
        {B && B.status === 'fail' && <InfoChip id="batch-fail" tone="err" label={<>{B.title} · Thất bại – đã dừng</>}><p>Lượt này đã dừng hẳn, không thao tác được nữa. {B.proc === 'QT0' ? 'Bấm “Lần mới”' : 'Bấm nút + để mở lượt mới'} nếu cần làm lại. Lý do xem ở tab Lịch sử.</p></InfoChip>}
        {B && proc === 'QT1' && D && D.company === 'PN' && D.status === 'fail' && !(B.checklist as Record<string, unknown> | null)?.recloned_to && <div className="row" style={{ gap: 8, alignItems: 'center' }}><ReClone docId={D.id} onDone={(id) => { setBid(id); setCo(''); load(); }} /><span className="small muted">Chép bảng tấm (kể cả đơn giá) sang đơn mới; tấm đơn khác đã lấy sẽ báo thiếu.</span></div>}
        {B && proc === 'QT0' && B.status === 'hoan_tat' && <Qt0Alloc qt0={B.id} order={o.id} />}
        {B && proc === 'QT1' && (B as Batch & { src_qt0?: string | null }).src_qt0 && D && D.company === 'PN' && D.status === 'lap' && <Qt0Alloc qt0={String((B as Batch & { src_qt0?: string }).src_qt0)} order={o.id} />}
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
  const lb = (b: Batch) => { const c = codeOf(o.id, co, b.id); return <>{c || b.title}<small className="pp-bdm">{dm(b)}</small></>; };
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
  const [q0s, setQ0s] = useState<{ id: string; code: string; title: string; tot: number; used: number }[] | null>(null); const [q0, setQ0] = useState(''); const [q0rows, setQ0rows] = useState<Q0Row[] | null>(null);
  const [picks, setPicks] = useState<Q0Pick[]>([]); const [pkOpen, setPkOpen] = useState(false);
  useEffect(() => { setQ0rows(null); setPicks([]); if (!q0) return; sb.rpc('qt0_rows', { p_qt0: q0 }).then(({ data }) => setQ0rows(((data ?? []) as Q0Row[]).filter((x) => String(x.r.ma_tam ?? '').trim()))); }, [q0]);
  const [pnOrders, setPnOrders] = useState<{ id: string; code: string }[]>([]); const [coId, setCoId] = useState('');
  // IPC / HW: lập XNĐH bằng tham chiếu mã đơn đã duyệt của công ty trước
  const { co: myCo0 } = useMyCo(); const { scope: scNB } = useScope(); const myCoNB = scNB === 'IPC' || scNB === 'HW' ? scNB : myCo0; const refMode = false as boolean; const autoCo = proc !== 'QT0' && (myCoNB === 'IPC' || myCoNB === 'HW');
  const prevCo = myCoNB === 'HW' ? 'IPC' : 'PN';
  const [refs, setRefs] = useState<{ code: string; title: string; used: string | null }[] | null>(null); const [ref, setRef] = useState('');
  const [rr, setRr] = useState<{ i: number; ma_tam: string; vat_lieu: string; day: string; so_tam: number; con_lai: number }[] | null>(null); const [take, setTake] = useState<Record<number, string>>({});
  useEffect(() => { setRr(null); if (!refMode || !ref.trim()) return; const t = setTimeout(() => sb.rpc('ref_rows', { p_code: ref.trim(), p_co: myCoNB }).then(({ data }) => {
    const l = (data ?? []) as { i: number; ma_tam: string; vat_lieu: string; day: string; so_tam: number; con_lai: number }[]; setRr(l); setTake(Object.fromEntries(l.filter((x) => x.con_lai > 0).map((x) => [x.i, String(x.con_lai)]))); }), 300); return () => clearTimeout(t); }, [refMode, ref, myCoNB]);
  const takeN = (i: number) => Number(String(take[i] ?? '').replace(',', '.')) || 0;
  const takeBad = (rr ?? []).some((x) => takeN(x.i) > x.con_lai || takeN(x.i) < 0); const takeSum = (rr ?? []).reduce((a, x) => a + takeN(x.i), 0);
  useEffect(() => { if (!refMode) return; sb.rpc('ref_candidates', { p_order: o.id, p_co: myCoNB }).then(({ data }) => { const l = (data ?? []) as { code: string; title: string; used: string | null }[]; setRefs(l); const want = new URLSearchParams(location.hash.split('?')[1] ?? '').get('ref') ?? ''; const hit = l.find((x) => x.code.trim().toUpperCase() === want.trim().toUpperCase()); if (hit) setRef(hit.code); else if (l.length === 1) setRef(l[0].code); }); }, [refMode, o.id, myCoNB]);
  useEffect(() => { if (refMode) return;
    if (proc === 'QT1') sb.rpc('qt0_list', { p_order: o.id }).then(({ data }) => { const l = (data ?? []) as { id: string; code: string; title: string; tot: number; used: number }[]; setQ0s(l);
      const best = [...l].reverse().find((x) => x.tot - x.used > 0) ?? l[l.length - 1]; if (best) setQ0(best.id); });
    if (proc === 'QT2' || proc === 'QT3') sb.from('co_orders').select('id, code').eq('order_id', o.id).eq('company', 'PN').order('created_at').then(({ data }) => {
      const l = (data ?? []) as { id: string; code: string }[]; setPnOrders(l); const want = (new URLSearchParams(location.hash.split('?')[1] ?? '').get('ref') ?? '').trim().toUpperCase(); const rid = new URLSearchParams(location.hash.split('?')[1] ?? '').get('refid'); const hit = l.find((x) => x.id === rid) ?? l.find((x) => x.code.trim().toUpperCase() === want); if (hit) setCoId(hit.id); else if (l.length === 1) setCoId(l[0].id); });
  }, [o.id, proc]);
  const go = async () => {
    setErr('');
    if (refMode) { const { data, error } = await sb.rpc('doc_from_ref', { p_code: ref.trim(), p_co: myCoNB, p_pick: (rr ?? []).filter((x) => takeN(x.i) > 0).map((x) => ({ i: x.i, so_tam: takeN(x.i) })) }); if (error) return setErr(errText(error)); toast('Đã lập XNĐH ' + myCoNB + ' từ ' + ref); reloadCoIdx(); onDone(String(data ?? '')); return; }
    const { data, error } = await sb.rpc('batch_create', { p_order: o.id, p_proc: proc, p_title: title, p_opts: proc === 'QT1' ? { use_qt0: use0 && !!q0, qt0: q0 || null, ...(use0 && q0 ? { pick: picks } : {}) } : proc === 'QT2' ? { checklist: ck, co_order: coId || null } : { co_order: coId || null } });
    if (error) setErr(errText(error)); else { toast('Đã mở ' + proc); onDone(data as string); }
  };
  if (autoCo) return <PrevPick o={o} proc={proc} co={myCoNB as 'IPC' | 'HW'} prev={prevCo} onClose={onClose} onDone={onDone} />;
  return (
    createPortal(<div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Mở {BATCH_WORD[proc]} mới · {o.project ?? ''}</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      {refMode && <div className="nb-ref">
        <label className="f">Tham chiếu đơn {prevCo} đã duyệt *
          <input list="nb-refs" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={'Chọn hoặc gõ mã đơn ' + prevCo} autoFocus /></label>
        <datalist id="nb-refs">{(refs ?? []).map((r) => <option key={r.code} value={r.code}>{r.title} · còn {r.used} tấm</option>)}</datalist>
        {refs && refs.length === 0 && <p className="small muted" style={{ margin: 0 }}>Chưa có đơn {prevCo} nào đã duyệt mà {myCoNB} chưa lập.</p>}
        {rr && rr.length > 0 && <div className="nb-pick">
          <div className="nb-pick-h"><b>Chọn số tấm cho XNĐH này</b><span className="small muted">{takeSum.toLocaleString('vi-VN')} / {rr.reduce((a, x) => a + x.con_lai, 0).toLocaleString('vi-VN')} tấm còn lại</span></div>
          <div className="nb-flt"><button type="button" className="chip" onClick={() => setTake(Object.fromEntries(rr.map((x) => [x.i, String(x.con_lai)])))}>Lấy hết phần còn lại</button>
            <button type="button" className="chip" onClick={() => setTake({})}>Bỏ chọn</button></div>
          <ul className="nb-rows">{rr.map((x) => { const v = takeN(x.i); const over = v > x.con_lai; return <li key={x.i}><div className={'nb-row' + (v > 0 ? ' on' : '') + (x.con_lai <= 0 ? ' used' : '')}>
            <span className="nb-t"><b>{x.ma_tam || '#' + (x.i + 1)}</b><span className="small muted">{[x.vat_lieu, x.day && x.day + 'mm'].filter(Boolean).join(' · ')} · còn <b>{x.con_lai}</b>/{x.so_tam}</span></span>
            <input className={'nb-q' + (over ? ' bad' : '')} inputMode="decimal" aria-label={'Số tấm lấy – ' + x.ma_tam} disabled={x.con_lai <= 0} value={take[x.i] ?? ''} placeholder="0" onChange={(e) => setTake({ ...take, [x.i]: e.target.value })} /></div></li>; })}</ul>
          {takeBad && <span className="small" style={{ color: 'var(--red)' }}>Có dòng lấy quá số còn lại.</span>}
        </div>}
        {rr && rr.length > 0 && rr.every((x) => x.con_lai <= 0) && <p className="small muted" style={{ margin: 0 }}>Đơn này đã dùng hết số tấm.</p>}
        <p className="small muted" style={{ margin: 0 }}>Sẽ copy: các tấm đã chọn (không kèm giá), điều kiện giao hàng. Bạn tự nhập đơn giá, VAT, điều kiện thanh toán. Có thể lập thêm XNĐH khác từ phần còn lại.</p>
      </div>}
      {!refMode && <><label className="f">Tên (để trống thì tự đánh số)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={proc === 'QT2' ? 'Ví dụ: Lệnh 1 – 250 tấm' : proc === 'QT3' ? 'Ví dụ: Đợt 1 – 50 tấm' : ''} /></label>
      {proc === 'QT1' && <label className="ck-item"><input type="checkbox" checked={use0} onChange={() => setUse0(!use0)} /><span>Lấy danh sách tấm từ QT0 đã duyệt <span className="small muted">(tách đơn: chỉ tick các tấm thuộc đơn này)</span></span></label>}
      {proc === 'QT1' && use0 && q0s !== null && (q0s.length === 0 ? <p className="small muted">Chưa có QT0 nào đã duyệt.</p> : <div className="nb-pick">
        <label className="f">Lấy từ QT0 *<select value={q0} onChange={(e) => setQ0(e.target.value)}>
          {q0s.map((x) => <option key={x.id} value={x.id}>{x.code} · còn {Math.max(0, x.tot - x.used)}/{x.tot} tấm</option>)}</select></label>
        <div className="nb-pick-h"><b>{picks.length ? `Đã chọn ${picks.length} dòng · ${picks.reduce((a, x) => a + x.q, 0).toLocaleString('vi-VN')} tấm` : 'Chưa chọn tấm'}</b>
          <button type="button" className="btn sm primary" disabled={!q0rows} onClick={() => setPkOpen(true)}>{picks.length ? 'Sửa lựa chọn' : 'Chọn tấm…'}</button></div>
        <span className="small muted">Tách đơn: lọc theo cột (mã tấm, loại gia công, dày…), nhập số tấm lấy để chia đơn lớn. Tấm đã lên đơn khác hiện mã đơn.</span>
        {pkOpen && q0rows && <Qt0Picker code={q0s.find((x) => x.id === q0)?.code ?? 'QT0'} rows={q0rows} inTable={{}} onClose={() => setPkOpen(false)} onPick={(p) => { setPicks(p); setPkOpen(false); }} />}
      </div>)}
      {(proc === 'QT2' || proc === 'QT3') && pnOrders.length > 0 && <label className="f">Thuộc đơn PN *<select value={coId} onChange={(e) => setCoId(e.target.value)}>
        <option value="">— Chọn đơn —</option>{pnOrders.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></label>}
      {proc === 'QT2' && <div className="f">Đủ 5 điều kiện mới được lập lệnh ({n}/5)
        {CHECK5.map((t, i) => <label key={t} className={'ck-item' + (ck['c' + (i + 1)] ? ' on' : '')}><input type="checkbox" checked={!!ck['c' + (i + 1)]} onChange={() => setCk({ ...ck, ['c' + (i + 1)]: !ck['c' + (i + 1)] })} /><span>{t}</span></label>)}</div>}
      </>}
      {err && <div className="msg err"><Icon name="alert" size={18} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn primary" disabled={(refMode && (!ref.trim() || !rr || takeSum <= 0 || takeBad)) || (!refMode && ((proc === 'QT2' && n < 5) || ((proc === 'QT2' || proc === 'QT3') && pnOrders.length > 0 && !coId) || (proc === 'QT1' && use0 && !!q0s?.length && picks.length === 0)))} onClick={go}>{refMode ? 'Lập XNĐH từ tham chiếu' : proc === 'QT2' && n < 5 ? 'Chưa đủ 5 điều kiện · chờ' : 'Mở ' + BATCH_WORD[proc]}</button></div>
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
  useEffect(() => { const k = (e: KeyboardEvent) => { const t = e.target as HTMLElement; if (keyOf(e) === ']' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) setShutS((v) => { try { localStorage.setItem('pp-side-shut', v ? '0' : '1'); } catch { /* */ } return !v; }); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  const waitH = Math.max(0, (Date.now() - new Date(d.status_at).getTime()) / 36e5);
  const proc = b.proc;
  const [can, setCan] = useState(() => !!peek<boolean>('ca:' + cacheUser + ':' + d.id + ':' + d.status, 60000));
  const [h, setH] = useState<Record<string, string>>(d.header ?? {}); const [t, setT] = useState<Record<string, Row[]>>(d.tables ?? {}); const [files, setFiles] = useState(d.files ?? []);
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<'' | 'back' | 'fail'>(''); const [why, setWhy] = useState(''); const [backTo, setBackTo] = useState('');
  const { acting, actUntil } = useAuth(); const lockAct = acting && !actUntil && !/^\s*\[(MẪU|MAU|TEST)\]/i.test(o.project ?? '');
  // Làm nhiều công ty: chỉ thao tác khi đang chọn đúng công ty của phiếu (chuyển công ty tường minh)
  const { scope, canSwitch: multiCo } = useScope(); const myCos = useMyCo().allowed as string[]; const coLock = multiCo && scope !== d.company;
  if ((lockAct || coLock) && can) setCan(false);
  const [canRaw, setCanRaw] = useState(false);
  useEffect(() => { if (coLock) return; const run = () => canActQ(d.id, d.status + '|' + scope).then((v) => { setCanRaw(v); setCan(v && !lockAct && !coLock); }); run(); addEventListener('scope-synced', run); return () => removeEventListener('scope-synced', run); }, [d.id, d.status, lockAct, coLock, scope]);
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
  // Tự điền sẵn khi ô trống (vẫn sửa được): người phát lệnh = người làm bước, VAT 8%, ngày lập = hôm nay
  const meName = useAuth().me?.full_name;
  useEffect(() => { if (closed || !can) return;
    const today = new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
    const def: Record<string, string | undefined> = { nguoi_phat_lenh: meName, vat: '8', ngay: today };
    const add: Record<string, string> = {};
    for (const f of fieldsOf(proc, 'header')) { const v = def[f.key]; if (v && !String(h[f.key] ?? '').trim() && canEd(f)) add[f.key] = v; }
    if (Object.keys(add).length) { setH((x) => ({ ...add, ...Object.fromEntries(Object.entries(x).filter(([, v]) => String(v ?? '').trim())) })); setDirty(true); } }, [d.id, can, meName, closed]); // eslint-disable-line react-hooks/exhaustive-deps
  const hid = new Set(d.hidden ?? []); // trường bị ẩn theo phân quyền (máy chủ đã xoá giá trị)
  const hFields = fieldsOf(proc, 'header').filter((f) => pm(f) !== 'hide' && !hid.has('h:' + f.key) && !(proc === 'QT1' && f.key === 'so_xn') && !(proc === 'QT3' && (f.key === 'tx_cccd' || f.key === 'tx_sdt')));
  // Gợi ý địa chỉ giao: địa chỉ của bên nhận (PN→IPC, IPC→Hanwa, Hanwa→khách cuối)
  const [ship, setShip] = useState<string[]>([]); const [carriers, setCarriers] = useState<Customer[]>([]); const [custs, setCusts] = useState<Customer[]>([]);
  const hasCarrier = hFields.some((f) => f.type === 'carrier');
  useEffect(() => { if (hasCarrier) sb.from('customers').select('*').in('kind', ['van_chuyen', 'noi_bo']).eq('active', true).order('name').then(({ data }) => setCarriers((data as Customer[]) ?? [])); }, [proc, hasCarrier]); // eslint-disable-line react-hooks/exhaustive-deps
  const plates = carriers.find((c) => c.id === h.dvvc)?.vehicles ?? [];
  // Điều kiện giao hàng: gợi ý riêng (mẫu hay dùng + giá trị đã nhập ở phiếu trước)
  const [dkgs, setDkgs] = useState<string[]>([]);
  useEffect(() => { if (!hFields.some((f) => f.key === 'dk_giao')) return;
    cached('dkg', () => sb.from('docs').select('header').not('header->>dk_giao', 'is', null).order('created_at', { ascending: false }).limit(200), 300000)
      .then(({ data }) => setDkgs([...new Set(((data as { header: Record<string, string> }[]) ?? []).map((x) => String(x.header?.dk_giao ?? '').trim()).filter(Boolean))].slice(0, 20))); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!hFields.some((f) => f.key === 'dia_diem' || f.key === 'noi_giao')) return;
    cached('custs', () => sb.from('customers').select('*'), 60000).then(({ data }) => { const cs = (data as Customer[]) ?? []; setCusts(cs); const { buyer } = parties(o, d.company, proc, cs, h.end_customer_id);
      setShip([...(buyer?.ship_addresses ?? []), buyer?.address ?? ''].filter(Boolean)); }); }, [d.id, h.end_customer_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fFields = fieldsOf(proc, 'file').filter((f) => pm(f) !== 'hide');
  const pjs = useProjects(); const mats = useMaterials(); const kh0 = custs.find((c) => c.id === (o.customer_id ?? o.kh2_id ?? o.kh1_id));
  const refVals: Record<string, string> = { ma_du_an: pjs?.find((p) => p.id === (o as { project_id?: string }).project_id)?.code ?? '', du_an: o.project ?? '', ma_don: docCode(o, b, d.company), ma_noi_bo: o.code,
    khach_hang: kh0?.name ?? '', han_giao: o.due_date ? new Date(o.due_date).toLocaleDateString('vi-VN') : '' };
  const lookOpts = (src?: string) => src === 'materials' ? (mats ?? []).filter((m) => m.active).map((m) => m.name) : src === 'projects' ? (pjs ?? []).map((x) => x.code) : src === 'customers' ? custs.map((x) => x.name) : src === 'people' ? Object.values(people).map((x) => x.full_name).filter(Boolean).sort() : [];
  // Phiếu đang sửa sau khi bị trả về: so với bản lúc trả về để tô phần đã sửa (cho tới khi qua lại bước đã trả về)
  const rs = (() => { const x = d.ret_snap; if (!x || ['da_duyet', 'fail'].includes(d.status)) return null; const fl = FLOW[proc] as string[]; const pos = (s: string) => fl.indexOf(s === 'duyet_them' ? 'duyet' : s);
    return pos(d.status) >= 0 && pos(d.status) < pos(x.from) ? x : null; })();
  const tblDefs = PROC_TABLES[proc].map(([key, def]) => { const fs = fieldsOf(proc, 'col', key);
    const cols = colsOf(proc, key).flatMap((c) => { const f = fs.find((x) => x.key === c.k)!; const p = pm(f); return p === 'hide' || hid.has(key + ':' + c.k) ? [] : [{ ...c, refv: c.ty === 'ref' ? refVals[c.ref ?? ''] ?? '' : undefined, opts: c.ty === 'lookup' ? lookOpts(c.ref) : c.opts, ro: c.ty === 'ref' || closed || (!adm && !(p === 'edit' || p === 'required')), req: p === 'required' }]; });
    const tf = fieldsOf(proc, 'table').find((x) => x.key === key); const treq = !!tf && pm(tf) === 'required'; const thide = !!tf && pm(tf) === 'hide'; const tst = d.status === 'duyet_them' || d.status === 'da_duyet' ? 'duyet' : d.status; const tview = !!tf && tf.perms?.[d.company]?.[tst] === 'view';
    return { key, title: TABLES[def].t, treq, thide, cols: thide ? [] : tview ? cols.map((c) => ({ ...c, ro: true })) : cols, ed: !thide && !tview && !closed && (adm || (can && cols.some((c) => !c.ro && !c.calc) && (proc !== 'QT0' || d.status !== 'tiep_nhan'))) }; });
  const editable = hFields.some(canEd) || fFields.some(canEd) || tblDefs.some((x) => x.ed && !x.thide);
  const totalOf = (): string | undefined => { if (proc !== 'QT1') return undefined; const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const sm = sumOf(t.ds ?? [], c); const v = numIn(h.vat) ?? 8; return String(Math.round(sm + sm * v / 100)); };
  // Admin: nạp nhanh dữ liệu mẫu vào ô trống (đầu phiếu) và bảng trống (3 dòng ví dụ)
  const fillDemo = () => {
    const today = new Date().toISOString().slice(0, 10); const H0: Record<string, string> = { ...h }; let nh = 0, nt = 0;
    const HV: Record<string, string> = { so_lenh: 'D16000' + Math.floor(10 + Math.random() * 89), so_hd: 'HW', ma_dh: '110260HW0001', code_bpmh: 'BPMH-01', nguoi_phat_lenh: 'Huỳnh Thị Viên',
      kho_xuat: 'Công ty CP Phương Nam CNC', kho_nhan: 'Công ty CP Phương Nam CNC', dang_gc: 'SLU-N0096-3mm-TC đợt 1', vat: '8', hao_hut: '5', kenh: 'Email',
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
  const fxHead = (f: { options: string[]; decimals?: number | null }) => { const r = evalFormula(f.options[0] ?? '', (k) => { const x = String(h[k] ?? '').trim(); if (!x) return null; const n = Number(x.replace(',', '.')); return isFinite(n) ? n : null; });
    return r == null ? '' : String(Math.round(r * 10 ** (f.decimals ?? 2)) / 10 ** (f.decimals ?? 2)); };
  const badNums = (): string[] => {
    const out: string[] = [];
    for (const f of hFields) if (headErr(f.type, String(h[f.key] ?? ''))) out.push(f.label);
    for (const tb of tblDefs) for (const c of tb.cols) if (c.n && !c.calc) { const n = (t[tb.key] ?? []).filter((r) => !okNum(c, r[c.k])).length; if (n) out.push(`${c.t} (${n} dòng)`); }
    return out;
  };
  const save = async (quiet = false) => {
    const bad = badNums(); if (bad.length) { setErr('Sai kiểu số: ' + bad.join(', ') + '. Chỉ nhập chữ số, dấu thập phân là "," hoặc ".".'); return false; }
    const hh0 = { ...h }; for (const f of hFields) if (f.type === 'formula') hh0[f.key] = fxHead(f);
    const hh = totalOf() != null ? { ...hh0, tong_tt: totalOf()! } : hh0;
    const tt = { ...t } as Record<string, Row[]>; for (const x of tblDefs) if (x.ed && tt[x.key]?.length && x.cols.some((c) => c.k === 'kg')) tt[x.key] = tt[x.key].map(stampDens);
    for (const x of tblDefs) { const rc = x.cols.filter((c) => c.ty === 'ref'); if (!rc.length || !x.ed || !tt[x.key]?.length) continue;
      tt[x.key] = tt[x.key].map((r) => { const n = { ...r }; for (const c of rc) n[c.k] = c.refv ?? ''; return n; }); }
    const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: hh, p_tables: tt, p_files: files });
    if (error) { setErr(errText(error)); return false; } setDirty(false); if (!quiet) toast('Đã lưu'); return true;
  };
  useUnsavedGuard(dirty);
  useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (editable && dirty && !busy) save(); } }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  useEffect(() => { const k = (e: KeyboardEvent) => {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return; const key = keyOf(e); if (!'tchdng'.includes(key) || key.length !== 1) return;
    const go = () => { const el = document.querySelector<HTMLElement>('[data-sk="' + key + '"]'); if (!el) return; if (el.tagName === 'INPUT') { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } else { el.click(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
    e.preventDefault(); if (key !== 't' && shut) { setShut(false); setTimeout(go, 60); } else go(); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });
  const [rtImgs, setRtImgs] = useState<Blob[]>([]); const [anOpen, setAnOpen] = useState(false);
  const act = async (action: 'next' | 'back' | 'fail', n = '', to?: string) => {
    setErr(''); setBusy(true);
    if (editable && dirty && !(await save(true))) { setBusy(false); return; }
    try {
      const r = await advanceDoc(o, b, { ...d, ...h0(d) }, action, n, to); setBusy(false);
      toast(action === 'next' ? 'Đã ký → ' + (STATUS[r.next] ?? r.next) : action === 'back' ? 'Đã trả về' : 'Đã đánh Thất bại'); if (r.warn) setTimeout(() => toast(r.warn!), 1500);
      setAsk(''); setWhy(''); onChanged();
      if (action === 'next' && (d.status === 'duyet' || d.status === 'duyet_them')) askRating(d.id, proc + ' · ' + b.title + ' · ' + d.company);
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
    let xf: File | null = null; let pf: File | null = null;
    for (const file of Array.from(e.target.files ?? [])) {
      let check: XCheck | undefined;
      if (kind === 'excel') { const r = await checkExcelFile(file); if (!r.ok) { setErr(r.error); e.target.value = ''; return; } check = r.c; xf = file; }
      if ((proc === 'QT2' || proc === 'QT3') && /\.xlsx?$/i.test(file.name)) pf = file;
      const path = `${o.id}/${b.id}/${d.company}/${Date.now()}-${safeName(file.name)}`;
      const r = await sb.storage.from('files').upload(path, file); if (r.error) { setErr(errText(r.error)); return; }
      nf.push({ kind, name: file.name, path, at: new Date().toISOString(), by: meId, step: d.status, ...(check ? { check } : {}) } as (typeof files)[number]);
    }
    e.target.value = '';
    const saved = await persist(nf, replace ? 'Đã thay file' : 'Đã tải file');
    if (saved && old.length) sb.storage.from('files').remove(old.map((x) => x.path));
    // Máy chủ kiểm lại file Excel bóc tách (kết quả dùng để chặn chuyển bước)
    if (saved && kind === 'excel') { for (const x of nf.filter((y) => y.kind === 'excel' && !files.some((z) => z.path === y.path))) await sb.functions.invoke('excel-check', { body: { path: x.path } }); setXv((v) => v + 1); }
    // QT0: điền Danh sách tấm từ file bóc tách vừa tải
    if (saved && xf && proc === 'QT0') await fillFromExcel(xf);
    // QT2: điền bảng NVL + Thành phẩm từ file Lệnh gia công của phần mềm SX
    if (saved && pf) await fillFromPmsx(pf);
    return saved ? nf.filter((x) => !files.includes(x)) : [];
  };
  const fillFromPmsx = async (file: File) => {
    const X = await import('xlsx'); const wb = X.read(await file.arrayBuffer());
    const sheets = wb.SheetNames.map((sn) => X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }));
    const defs = tblDefs.filter((x) => x.ed && !x.thide).map((x) => ({ tbl: x.key, title: x.key === 'nl' ? /xuat hang|nguyen lieu|nvl/ : /nhap hang|thanh pham/, cols: x.cols }));
    const cols3 = (k: string) => tblDefs.find((x) => x.key === 'tp')?.cols.find((c) => c.k === k)?.calc;
    const bb = proc === 'QT3' ? readBbgh(sheets, defs[0] ?? { tbl: 'tp', cols: [] }) : null;
    const got = (bb ? (bb.block ? [bb.block] : []) : readPmsx(sheets, defs)).filter((x) => x.rows.length); if (!got.length) return;
    const hk = new Set(fieldsOf(proc, 'header').filter((f) => canEd(f)).map((f) => f.key));
    const hd = Object.fromEntries(Object.entries(bb ? bb.head : readPmsxHead(sheets)).filter(([k]) => hk.has(k)));
    // QT3: m² / kg do app tự tính → đối chiếu với tổng trong file (lệch > 1%)
    const calcWarn = bb && got[0]?.total ? (['m2', 'kg'] as const).flatMap((k) => { const c = cols3(k); const f = got[0].total![k]; if (!c || f == null || !f) return [];
      const a = got[0].rows.reduce((s, r) => s + (Number(c(r)) || 0), 0); return Math.abs(a - f) / f > 0.01 ? [(k === 'm2' ? 'Tổng m²' : 'Khối lượng') + ' app tính ' + a.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' ≠ file ' + f.toLocaleString('vi-VN', { maximumFractionDigits: 2 })] : []; }) : [];
    // Đối chiếu tổng SL / DT / TL với dòng tổng trong file
    const chk = got.filter((x) => x.total).map((x) => { const bad = (['so_tam', 'm2', 'kg'] as const).filter((k) => x.total![k] != null && Math.abs(x.rows.reduce((a, r) => a + (Number(r[k]) || 0), 0) - x.total![k]) > 0.05);
      return { tbl: x.tbl, bad, n: x.total!.so_tam }; });
    const name = (k: string) => (proc === 'QT3' ? 'Thành phẩm' : k === 'nl' ? 'NVL (xuất hàng)' : 'Thành phẩm (nhập hàng)');
    const miss = [...new Set(got.flatMap((x) => x.unmatched))];
    const has = got.filter((x) => (t[x.tbl as never] as Row[] | undefined ?? []).some((r) => Object.values(r).some((v) => String(v ?? '').trim())));
    const HL: Record<string, string> = { so_phieu: 'Số phiếu', ngay_giao: 'Ngày giao', ma_dh_khach: 'Mã ĐH (khách)', dang_gia_cong: 'Dạng gia công', ten_khach_hang: 'Tên khách hàng', dia_diem: 'Địa điểm giao', tai_xe: 'Tài xế', xe: 'Xe', so_lenh: 'Số lệnh', nguoi_phat_lenh: 'Người phát lệnh', ma_dh: 'Mã ĐH', kho_xuat: 'Kho xuất', kho_nhan: 'Kho nhận', dang_gc: 'Dạng gia công' };
    const warn = [...calcWarn, ...(miss.length ? ['Cột không khớp (bỏ qua): ' + miss.join(', ')] : []), ...chk.filter((c) => c.bad.length).map((c) => name(c.tbl) + ': tổng trong file khác tổng các dòng (' + c.bad.join(', ') + ')')];
    const box = (q: string) => <div className="imp-dlg">
      <div className="imp-h"><span className="imp-ic"><Icon name="upload" size={18} /></span><div><b>{proc === 'QT3' ? 'Nhập Biên bản giao hàng' : 'Nhập Lệnh gia công'}</b><span>{file.name}</span></div></div>
      <div className="imp-cards">{got.map((x) => <div key={x.tbl}><span>{proc === 'QT3' ? 'Danh sách thành phẩm' : x.tbl === 'nl' ? 'Bảng 1 · NVL' : 'Bảng 2 · Thành phẩm'}</span><b>{x.rows.length} dòng</b></div>)}</div>
      {Object.keys(hd).length > 0 && <dl className="imp-kv">{Object.entries(hd).map(([k, v]) => <div key={k}><dt>{HL[k] ?? k}</dt><dd>{v}</dd></div>)}</dl>}
      {warn.map((w) => <p key={w} className="imp-warn"><Icon name="alert" size={14} />{w}</p>)}
      <p className="imp-q">{q}</p></div>;
    let mode: 'thay' | 'them' = 'thay';
    if (has.length) { if (await confirmDialog(box('Bảng đang có dữ liệu. Thay toàn bộ bằng dữ liệu trong file?'), 'Thay toàn bộ', 'calm')) mode = 'thay';
      else if (await confirmDialog('Thêm các dòng từ file vào cuối bảng?', 'Thêm vào cuối', 'calm')) mode = 'them'; else return; }
    else if (!(await confirmDialog(box(''), 'Điền vào bảng', 'calm'))) return;
    const nt = { ...t } as Record<string, Row[]>;
    for (const x of got) { const cur = (nt[x.tbl] ?? []).filter((r) => Object.values(r).some((v) => String(v ?? '').trim())); nt[x.tbl] = mode === 'them' ? [...cur, ...x.rows] : x.rows; }
    setT(nt as typeof t); if (Object.keys(hd).length) setH((x) => ({ ...x, ...hd })); setDirty(true);
    const ck = chk.map((c) => (c.bad.length ? '⚠ ' + name(c.tbl) + ' lệch tổng ' + c.bad.join(', ') + ' so với file' : '✓ ' + name(c.tbl) + ' khớp tổng' + (c.n != null ? ' ' + c.n.toLocaleString('vi-VN') + ' tấm' : ''))).join(' · ');
    toast('Đã điền ' + got.map((x) => x.rows.length + ' dòng ' + name(x.tbl)).join(', ') + (ck ? ' · ' + ck : '') + ' – nhớ bấm Lưu');
  };
  const fillFromExcel = async (file: File) => {
    const tb = tblDefs.find((x) => x.key === 'ds'); if (!tb || !tb.ed) return;
    const X = await import('xlsx'); const wb = X.read(await file.arrayBuffer());
    const keys = new Set(tb.cols.filter((c) => !c.calc).map((c) => c.k));
    const shs = wb.SheetNames.map((sn) => ({ name: sn, rows: X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }) }));
    const raw = bocTachRows(shs); const hh = proc === 'QT0' ? haoHutOf(shs) : null;
    const add = raw.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => (keys.has(k) || k.startsWith('phoi_') || k === 'day' || k === 'mac_thep' || k === '_vat') && v !== '')) as Row).map((r) => (proc === 'QT0' && !String(r.don_vi_tinh ?? '').trim() ? { ...r, don_vi_tinh: 'tấm' } : r));
    const nlT = tblDefs.find((x) => x.key === 'nl'); const nl = proc === 'QT0' && nlT?.ed ? nlFromPhoi(add as never) : [];
    if (!add.length) return;
    const cur = (t.ds ?? []).filter((r) => Object.values(r).some((v) => String(v ?? '').trim()));
    let next = add;
    if (cur.length) {
      if (await confirmDialog(`File có ${add.length} dòng tấm. Thay toàn bộ ${cur.length} dòng đang có trong bảng Thành phẩm${proc === 'QT0' ? ' (và Bảng 1 – NVL)' : ''}?`, 'Thay toàn bộ')) next = add;
      else if (await confirmDialog(`Thêm ${add.length} dòng từ file vào cuối danh sách?`, 'Thêm vào cuối')) next = [...cur, ...add];
      else return; }
    const nlNext = nl.length ? (next === add ? nlFromPhoi(add as never) : nlFromPhoi(next as never)) : null;
    setT((x) => ({ ...x, ds: next, ...(nlNext ? { nl: nlNext } : {}) })); setDirty(true);
    let hm = '';
    if (proc === 'QT0' && hFields.some((f) => f.key === 'hao_hut')) {
      if (!hh) hm = ' · Không tìm thấy tỷ lệ hao hụt trong file';
      else { const cur0 = String(h.hao_hut ?? '').trim(); const nv = String(hh.v);
        if (!cur0 || cur0 === nv || await confirmDialog(`Hao hụt dự kiến đang là ${cur0}%. Thay bằng ${nv}% đọc từ file?`, 'Thay')) { setH((x) => ({ ...x, hao_hut: nv, _hao_src: hh.src, _hao_v: nv })); hm = ' · Hao hụt ' + nv + '%'; } } }
    toast('Đã điền ' + add.length + ' dòng thành phẩm' + (nlNext ? ' và ' + nlNext.length + ' dòng NVL' : '') + hm + ' – bấm Lưu để giữ');
  };
  const who = (id?: string) => (id ? people[id]?.full_name ?? '…' : '');
  const first = FLOW[proc][0] === d.status;
  // Mục bắt buộc còn trống (tính trực tiếp) → báo trên nút trước khi bấm
  const miss = can && !closed ? missingReq(proc, d.company, d.status, { header: h, tables: t, files } as never) : [];
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
          <div className="small muted">{(role || lvName) && <><Assignees proc={proc} company={d.company} role={d.status === 'duyet_them' ? undefined : role} level={d.status === 'duyet_them' ? lvs.find((l) => l.id === apv?.queue[apv.idx]) : undefined} people={people} /></>} · từ {dt(d.status_at)}{(proc === 'QT2' || proc === 'QT3') && <CoLink coOrderId={(b as { co_order_id?: string | null }).co_order_id} company={d.company} />}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {!lockAct && !can && !adm && d.status !== 'da_duyet' && d.status !== 'fail' && <button type="button" className={'btn xs icon-only pp-admi pp-vwi' + (viewInfo ? ' on' : '')} aria-expanded={viewInfo} title="Bạn đang xem (không có quyền làm bước này)" aria-label="Bạn đang xem – xem chi tiết" onClick={() => setViewInfo(!viewInfo)}><Icon name="eye" size={14} /></button>}
          {admEdit && <button type="button" className={'btn xs icon-only pp-admi' + (admInfo ? ' on' : '')} aria-expanded={admInfo} title="Đang sửa với quyền Admin" aria-label="Đang sửa với quyền Admin – xem chi tiết" onClick={() => setAdmInfo(!admInfo)}><Icon name="shield" size={14} /></button>}
          {d.status !== 'da_duyet' && d.status !== 'fail' && <GuideBox compact g={d.status === 'duyet_them' ? guideByKey(guides, 'sim.extra') : guideFor(guides, proc, d.company, d.status)} vars={{ cty: COMPANY[d.company], phieu: PROC_NAME[proc], cap: lvName ?? 'Cấp duyệt thêm' }} />}
          {editable && <button className="btn xs" disabled={!dirty} onClick={() => save()}><Icon name="check" size={13} />{dirty ? 'Lưu' : 'Đã lưu'}</button>}
          <PrintTplButton o={o} b={b} d={d} people={people} fallback={() => printDoc(o, b, d, people)} />
          <details className="pp-more"><summary className="btn xs icon-only" title="Thêm thao tác" aria-label="Thêm thao tác">⋯</summary><div className="pp-more-m" onClick={(e) => { const dt = (e.currentTarget.closest('details') as HTMLDetailsElement); if ((e.target as HTMLElement).closest('button')) dt.open = false; }}>
          <button className="btn xs" title="In bản mặc định của app (không theo mẫu Excel)" onClick={() => printDoc(o, b, d, people)}><Icon name="file" size={13} />In bản mặc định</button>
          {(can || adm) && d.status === FLOW[proc][0] && (proc === 'QT0' || d.company === 'PN') && b.status === 'dang_lam' && <button className="btn xs danger-soft" title={'Xoá ' + b.title + ' để lập lại (chỉ khi còn ở bước đầu)'} aria-label={'Xoá ' + b.title} onClick={async () => {
            if (!(await confirmDialog(`Xoá hẳn “${b.title}” (${PROC_NAME[proc]})? Toàn bộ dữ liệu đã nhập sẽ mất. Sau đó bạn có thể mở lại ${BATCH_WORD[proc]} mới.`, 'Xoá hồ sơ', true))) return;
            const { error } = await sb.rpc('batch_delete', { p_batch: b.id, p_note: '' }); if (error) return toast(errText(error)); toast('Đã xoá ' + b.title); onChanged(); }}><Icon name="trash" size={13} />Xoá hồ sơ</button>}
          {adm && editable && d.status !== 'da_duyet' && <button className="btn xs" title="Admin: nạp dữ liệu mẫu vào ô trống & bảng trống" onClick={fillDemo}><Icon name="bolt" size={13} />Nạp dữ liệu mẫu</button>}
          </div></details>
        </div>
        {proc !== 'QT0' && d.status !== 'fail' && <DocSteps proc={proc} d={d} live={{ header: h, tables: t as never, files } as never} />}
      </div>
      {d.status === 'da_duyet' && proc !== 'QT0' && (proc !== 'QT1' || d.company === 'HW') && <div className="pt-cta"><PrintTplButton o={o} b={b} d={d} people={people} big /></div>}
      {admEdit && admInfo && <InfoChip id="adm-edit" tone="warn" icon="shield" label={'Sửa bằng quyền Admin' + (d.status === 'da_duyet' ? ' · phiếu đã duyệt' : '')}><p>Bạn đang sửa phiếu với quyền Admin. Mọi thay đổi được ghi vào lịch sử đơn hàng.</p></InfoChip>}
      {lockAct && d.status !== 'da_duyet' && d.status !== 'fail' && <div className="msg lock-mini"><Icon name="shield" size={15} /><span>Đơn thật · chỉ xem khi vào vai</span></div>}
      {(() => { const tk = tablesOf(proc)[0]?.key; const rs = (tk && (t as Record<string, Row[]>)[tk]) || []; if (!tk || rs.length === 0) return null; const cs = colsOf(proc, tk);
        const g = (k: string) => { const c = cs.find((x) => x.k === k); return c ? sumOf(rs, c) : null; }; const f = (v: number | null, dd: number, u: string) => v == null ? null : fmtN(v, dd) + u;
        const kg = g('kg'); const parts = [rs.length + ' dòng', f(g('so_tam'), 0, ' tấm'), f(g('m2'), 1, ' m²'), kg == null ? null : kg >= 1000 ? fmtN(kg / 1000, 1) + ' t' : fmtN(kg, 0) + ' kg', f(g('tt'), 0, ' đ')].filter(Boolean);
        return <div className="pp-sum" aria-label="Tóm tắt">{parts.map((x, i) => <span key={i}>{x}</span>)}</div>; })()}
      {!lockAct && !can && !adm && d.status !== 'da_duyet' && d.status !== 'fail' && viewInfo && <InfoChip id="view-only" icon="eye" label="Chỉ xem"><p>Bước này do người phụ trách “{ROLE_NAME[role]}” của {COMPANY[d.company]} làm.</p><p>Đổi người phụ trách: Quản trị → Người phụ trách quy trình.</p></InfoChip>}

      <ReviewPdf docId={d.id} status={d.status} />
      {proc === 'QT3' && d.company === 'HW' && <div className="f qt3-end"><span>Khách nhận hàng <span className="muted small">(Hanwa đổi được; mặc định là khách cuối của dự án)</span></span>
        <CustomerPicker value={h.end_customer_id || o.customer_id || ''} list={custs} canCreate={false} onChange={(c) => { if (!(can || adm)) return; setH({ ...h, end_customer_id: c?.id ?? '' }); setDirty(true); }} /></div>}
      {(() => { const ls = rs ? [...(d.signs ?? [])].reverse().find((x) => x.action === 'tra_ve') : (d.signs ?? []).at(-1); if (!ls || ls.action !== 'tra_ve' || ['da_duyet', 'fail'].includes(d.status)) return null; const im = rtFilesAt({ files }, ls.at);
        return <div className="rt-ban" role="note"><div className="rt-ban-h"><Icon name="back" size={16} /><b>Bị trả về</b><span className="small muted"> · {people[ls.user]?.full_name ?? ''} · {dt(ls.at)}</span></div>
          {ls.note && <div className="rt-ban-t">{ls.note}</div>}<RtThumbs files={im} size={72} />{rs && <div className="small rt-ban-h2">Trả về từ <b>{STATUS[rs.from] ?? rs.from}</b> → <b>{STATUS[rs.to] ?? rs.to}</b> · ô / dòng <span className="rt-chg-key">viền vàng</span> là chỗ đã sửa sau khi bị trả về</div>}</div>; })()}
      {proc === 'QT1' && <CoBar docId={d.id} can={can && !closed} locked={closed} lap={d.status === 'lap'} onTables={(x) => { setT(x as Record<string, Row[]>); }} />}
      <div className="grid2">
        {hFields.map((f) => { const ed = canEd(f); const v = h[f.key] ?? ''; const chg = rs && String(rs.header?.[f.key] ?? '') !== String(v ?? ''); const on = (x: string) => { setH({ ...h, [f.key]: x }); setDirty(true); };
          return <label key={f.key} data-fk={f.key} className={'f' + (f.type === 'textarea' || f.type === 'location' ? ' f-wide' : '') + (can && pm(f) === 'required' && !String(v).trim() ? ' f-miss' : '') + (chg ? ' f-chg' : '')} title={chg ? 'Đã sửa sau khi bị trả về · trước: ' + (rs!.header?.[f.key] || '(trống)') : undefined}><span>{f.label}{pm(f) === 'required' && <b className="req" aria-label="bắt buộc"> *</b>}<VarTag k={f.key} />{f.key === 'hao_hut' && h._hao_src && <ColTip info={['Hao hụt đọc từ file bóc tách', 'Ô ' + h._hao_src, 'Giá trị file: ' + h._hao_v + '%' + (String(v) !== String(h._hao_v) ? ' · đã sửa tay thành ' + v + '%' : '')]} />}</span>
            {f.type === 'carrier' ? <select disabled={!ed} value={v} onChange={(e) => on(e.target.value)}><option value="">— chọn —</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.kind === 'noi_bo' ? ' (tự chở)' : ''}</option>)}</select>
              : !['text', 'number', 'select', 'textarea'].includes(f.type) ? <HeadInput f={f} v={String(v)} on={on} disabled={!ed} opts={f.type === 'lookup' ? lookOpts(f.options[0]) : undefined} calc={f.type === 'formula' ? fxHead(f) : undefined} />
              : f.type === 'select' ? <select disabled={!ed} value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{f.options.map((o2) => <option key={o2}>{o2}</option>)}{v && !f.options.includes(v) && <option>{v}</option>}</select>
              : f.type === 'textarea' ? <textarea rows={2} disabled={!ed} value={v} onChange={(e) => on(e.target.value)} />
              : <NumInput money={f.type === 'number' && /\(đ/.test(f.label)} type={f.type === 'date' ? 'date' : 'text'} list={f.key === 'dk_giao' ? 'dkg-' + d.id : (f.key === 'dia_diem' || f.key === 'noi_giao') && ship.length ? 'ship-' + d.id : f.key === 'xe' && plates.length ? 'xe-' + d.id : f.key === 'tai_xe' && plates.length ? 'tx-' + d.id : undefined} inputMode={f.type === 'number' ? 'decimal' : undefined} disabled={!ed} value={v} aria-invalid={f.type === 'number' && !isNumOk(v) ? true : undefined}
                onChange={(e) => { const x = f.type === 'number' ? numTyping(e.target.value) : e.target.value; const pv = f.key === 'xe' ? plates.find((p) => p.plate === x) : undefined;
                  if (pv?.driver && !h.tai_xe) { setH({ ...h, xe: x, tai_xe: pv.driver }); setDirty(true); } else on(x); }} />}
            {f.key === 'xe' && plates.length > 0 && <datalist id={'xe-' + d.id}>{plates.map((p) => <option key={p.plate} value={p.plate}>{p.driver}</option>)}</datalist>}
            {f.key === 'tai_xe' && plates.length > 0 && <datalist id={'tx-' + d.id}>{[...new Set(plates.map((p) => p.driver).filter(Boolean))].map((x) => <option key={x} value={x} />)}</datalist>}
            {headErr(f.type, String(v)) && <small className="f-err">{headErr(f.type, String(v))}</small>}
            {f.key === 'dk_giao' && <datalist id={'dkg-' + d.id}>{[...new Set([...DKG, ...dkgs])].map((x) => <option key={x} value={x} />)}</datalist>}
            {(f.key === 'dia_diem' || f.key === 'noi_giao') && ship.length > 0 && <datalist id={'ship-' + d.id}>{ship.map((x) => <option key={x} value={x} />)}</datalist>}
            {f.help && <small className="muted">{f.help}</small>}</label>; })}
      </div>

      {proc === 'QT1' && d.status === 'da_duyet' && d.company !== 'HW' && <SignedBox d={d} o={o} b={b} files={files} onDone={(nf) => { setFiles(nf); onChanged(); }} />}
      <div className="pp-files">
        {fFields.map(({ key: k, label: lab, ...f }) => (
          <div key={k} data-fk={k} className={'pp-fk' + (can && pm({ key: k, label: lab, ...f } as FDef) === 'required' && !files.some((x) => x.kind === k) ? ' f-miss' : '')}><span className="small"><b>{lab}</b>{pm({ key: k, label: lab, ...f } as FDef) === 'required' && <b className="req"> *</b>}</span>
            <span className="row pp-fk-r">{(() => { const ed = canEd({ key: k, label: lab, ...f } as FDef); const mine = files.filter((x) => x.kind === k); const dels = mine.filter((x) => ed && canDelF(x as { by?: string; step?: string })); const one = dels.length === 1 ? dels[0] : null; return <>
              {mine.map((x) => { const xx = x as { by?: string; step?: string }; const del = ed && canDelF(xx) && !one; return <span key={x.path} className="pp-file"><span className="row" style={{ gap: 2 }}><FileLink f={x} />
                {k === 'excel' && x === mine[0] && <XStatus key={xv} files={mine as never} ds={(t.ds ?? []) as never} canRecheck={ed} />}
                {del ? <button className="btn xs icon-only" title={'Gỡ ' + x.name} aria-label={'Gỡ ' + x.name} onClick={() => removeFile(x.path, x.name)}><Icon name="trash" size={13} /></button>
                  : ed && !canDelF(xx) && <span className="pp-flock" title="Chỉ người tải file (trong bước đã tải) hoặc admin được gỡ"><Icon name="shield" size={13} /></span>}</span>
                {xx.by && <span className="pp-fby" title={xx.step ? 'Tải ở bước ' + (STATUS[xx.step] ?? xx.step) : undefined}>Tải bởi {who(xx.by)}</span>}</span>; })}
              {mine.length === 0 && <span className="small muted">chưa có</span>}
              {ed && <span className="pp-fact">
                {dels.length > 0 && <label className="btn xs" title="Thay các file bạn đã tải bằng file mới" aria-label="Thay file"><Icon name="refresh" size={13} /><span className="pp-fat">Thay</span><input type="file" multiple hidden onChange={(e) => upload(e, k, true)} /></label>}
                <label className="btn xs" title={mine.length ? 'Thêm file' : 'Tải file lên'} aria-label={mine.length ? 'Thêm file' : 'Tải file lên'}><Icon name="upload" size={13} /><span className="pp-fat">{mine.length ? 'Thêm' : 'Tải lên'}</span><input type="file" multiple hidden onChange={(e) => upload(e, k)} /></label>
                {one && <button type="button" className="btn xs icon-only pp-fdel" title={'Gỡ ' + one.name} aria-label={'Gỡ ' + one.name} onClick={() => removeFile(one.path, one.name)}><Icon name="trash" size={13} /></button>}</span>}</>; })()}</span></div>))}
      </div>

      {tblDefs.filter((x) => !x.thide).map(({ key, title, cols, ed, treq }) => (
        <TableEdit key={key} vk={key} title={title} req={treq} cols={cols} rows={t[key] ?? []} editable={ed} prev={rs ? rs.tables?.[key] ?? [] : undefined}
          onChange={(rows) => { const dv = proc === 'QT0' && (key === 'ds' || key === 'nl'); setT({ ...t, [key]: dv ? rows.map((r) => (String(r.don_vi_tinh ?? '').trim() || !Object.values(r).some((v) => String(v ?? '').trim()) ? r : { ...r, don_vi_tinh: 'tấm' })) : rows }); setDirty(true); }} fname={`${codeFile(docCode(o, b, d.company))}-${proc}-${key}`}
          srcLabel={d.company === 'PN' ? 'Lấy từ QT0' : 'Lấy lại từ phiếu ' + (d.company === 'HW' ? 'IPC' : 'PN')}
          fromQt0={proc === 'QT1' && key === 'ds' && d.company !== 'PN' && (b.checklist as Record<string, unknown> | null)?.auto_from ? async () => { const { data: sd } = await sb.from('docs_v').select('tables').eq('id', String((b.checklist as Record<string, unknown>).auto_from)).limit(1);
            return (((sd?.[0] as { tables?: Record<string, Row[]> } | undefined)?.tables?.ds) ?? []).filter((r) => String(r.ma_tam ?? '').trim()); } : undefined}
          q0src={proc === 'QT1' && key === 'ds' && d.company === 'PN' && (b as Batch & { src_qt0?: string | null }).src_qt0 ? { id: String((b as Batch & { src_qt0?: string }).src_qt0), docId: d.id, orderId: b.order_id } : undefined} />))}
      {proc === 'QT1' && !hid.has('ds:don_gia') && <Qt1Total rows={t.ds ?? []} vat={numIn(h.vat) ?? 8} vc={numIn(h.phi_vc) ?? 0} />}
      {proc === 'QT2' && <Qt2Loss nl={t.nl ?? []} tp={t.tp ?? []} />}
      {proc === 'QT3' && <GiaoAnh d={d} can={can && d.status === 'anh_giao'} files={files} h={h}
        onField={(k, v) => { setH((x) => ({ ...x, [k]: v })); setDirty(true); }} upload={upload} remove={removeFile} />}

      <FixMsg err={err} />
      {coLock && (canRaw || myCos.includes(d.company as Company)) && !['da_duyet', 'fail'].includes(d.status) && <div className="co-lock" role="status"><span>Phiếu của <b>{COMPANY[d.company as Company]}</b>. Bạn đang làm ở <b>{scope === 'ALL' ? 'Tất cả công ty' : COMPANY[scope as Company]}</b> nên chỉ xem.</span>
        <button type="button" className="btn primary" onClick={() => switchCo(d.company as Company)}>Chuyển sang {d.company === 'HW' ? 'Hanwa' : d.company === 'PN' ? 'PNC' : d.company}</button></div>}
      {can && !['da_duyet', 'fail'].includes(d.status) && (
        <div className="pp-act">
          {ask ? (<div className="pp-ask">
            <label className="f">{ask === 'fail' ? 'Lý do thất bại – dừng hẳn lượt này (hao hụt lớn, vượt dự toán, khách huỷ…)' : 'Lý do trả về'} *<textarea rows={2} autoFocus value={why} onChange={(e) => setWhy(e.target.value)}
              onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); setRtImgs((a) => [...a, f]); } }} /></label>
            {ask === 'back' && (() => { const fl = FLOW[proc]; const ci = d.status === 'duyet_them' ? fl.indexOf('duyet') + 1 : fl.indexOf(d.status); const opts = fl.slice(0, ci).filter((s) => s !== 'anh_giao');
              const def = proc === 'QT0' ? ({ boc_tach: 'tiep_nhan', tao_ds: 'boc_tach', kiem_tra: 'boc_tach', duyet: 'kiem_tra', duyet_them: 'kiem_tra' } as Record<string, string>)[d.status] : ({ kiem_tra: 'lap', duyet: 'lap', duyet_them: 'lap', anh_giao: 'duyet' } as Record<string, string>)[d.status];
              if (opts.length < 2) return null; const cur = backTo || def;
              return <div className="pp-bto" role="radiogroup" aria-label="Trả về bước"><span className="small">Trả về bước</span>{opts.map((s) => <button key={s} type="button" role="radio" aria-checked={cur === s} className={cur === s ? 'on' : ''} onClick={() => setBackTo(s)}>{STATUS[s] ?? s}{s === def ? <small> mặc định</small> : null}</button>)}</div>; })()}
            {rtImgs.length > 0 && <div className="rt-imgs">{rtImgs.map((b, i) => <span key={i} className="rt-img"><img src={URL.createObjectURL(b)} alt={'Ảnh ghi chú ' + (i + 1)} />
              <button type="button" aria-label="Bỏ ảnh" onClick={() => setRtImgs((a) => a.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></span>)}</div>}
            {anOpen && <Annotate capture={async () => { const el = document.querySelector('.pp-doc') as HTMLElement | null; if (!el) return null; const { toBlob } = await import('html-to-image');
                return toBlob(el, { pixelRatio: 1, backgroundColor: '#fff', filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('pp-act') || n.classList.contains('an-bg'))) }); }}
              onDone={(b, nt) => { setRtImgs((a) => [...a, b]); if (nt) setWhy((w) => (w.trim() ? w.trim() + '\n' : '') + nt); setAnOpen(false); }} onClose={() => setAnOpen(false)} />}
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn" style={{ marginRight: 'auto' }} onClick={() => setAnOpen(true)}><Icon name="file" size={15} />Ảnh ghi chú</button>
              <button className="btn" onClick={() => { setAsk(''); setRtImgs([]); }}>Huỷ</button>
              <button className="btn rt-go" disabled={!why.trim() || busy} onClick={async () => {
                let note = why.trim();
                if (rtImgs.length) { const nf = [...files]; const at = new Date().toISOString();
                  for (const [i, bl] of rtImgs.entries()) { const path = `${o.id}/${b.id}/${d.company}/tv-${Date.now()}-${i}.png`; const r = await sb.storage.from('files').upload(path, bl, { contentType: 'image/png' }); if (r.error) { setErr(errText(r.error)); return; }
                    nf.push({ kind: 'tra_ve', name: 'Ảnh ghi chú ' + (i + 1) + '.png', path, at, by: meId, step: d.status } as (typeof files)[number]); }
                  if (!(await persist(nf, 'Đã gắn ' + rtImgs.length + ' ảnh ghi chú'))) return; note += ' (kèm ' + rtImgs.length + ' ảnh)'; }
                await act(ask, note, ask === 'back' && backTo ? backTo : undefined); setRtImgs([]); setBackTo(''); }}>{ask === 'fail' ? 'Xác nhận Thất bại' : 'Trả về'}</button></div></div>) : (<>
            <SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} />
            {!first && <button className="btn kb-back pp-sec" onClick={() => setAsk('back')}><Icon name="back" size={16} />Trả về</button>}
            {(d.status === 'duyet' || d.status === 'duyet_them') && <button className="btn rt-go pp-sec" onClick={() => setAsk('fail')}><Icon name="x" size={16} />Thất bại</button>}
            {(!first || d.status === 'duyet' || d.status === 'duyet_them') && <details className="pp-actmore"><summary className="btn icon-btn" aria-label="Thao tác khác"><Icon name="more" size={18} /></summary>
              <div className="odh-menu pp-actmenu" role="menu">
                {!first && <button type="button" role="menuitem" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setAsk('back'); }}><Icon name="back" size={16} />Trả về</button>}
                {(d.status === 'duyet' || d.status === 'duyet_them') && <button type="button" role="menuitem" className="danger-h" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setAsk('fail'); }}><Icon name="x" size={16} />Thất bại</button>}</div></details>}
            <button className="btn primary pp-go" disabled={busy} title={(d.status === 'duyet' || d.status === 'duyet_them') ? 'Duyệt sẽ lưu PDF có dấu “ĐÃ DUYỆT”' + (proc !== 'QT0' ? (d.company === 'HW' ? ' · tiếp theo: khách ký tay' : ' · tiếp theo: ' + COMPANY[d.company === 'PN' ? 'IPC' : 'HW']) : '') : undefined} onClick={() => { if (miss.length) { setErr('Còn trống: ' + miss.map((x) => x.label).join(', ')); jumpField(miss[0].key); return; } act('next'); }}><Icon name="check" size={16} />{busy ? 'Đang ký…' : (d.status === 'duyet_them' ? 'Duyệt (' + (lvName ?? 'cấp thêm') + ')' : NEXT_LABEL[d.status] ?? 'Ký')}{miss.length > 0 && !busy && <span className="pp-miss" title={'Còn trống: ' + miss.map((x) => x.label).join(', ')}>thiếu {miss.length}</span>}</button>{(d.status === 'duyet' || d.status === 'duyet_them') && <span className="pp-hint">Duyệt sẽ lưu PDF có dấu “ĐÃ DUYỆT”</span>}</>)}
        </div>)}
      {editable && !(can && !['da_duyet', 'fail'].includes(d.status)) && <div className="pp-act"><SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} /></div>}
      {d.status === 'da_duyet' && <NextStep o={o} b={b} d={d} />}
      {(d.status === 'da_duyet' || d.status === 'fail') && <CloneBar b={b} d={d} onChanged={onChanged} />}
      {d.status !== 'da_duyet' && d.status !== 'fail' && <StepChecks proc={proc} d={d} people={people} canEdit={can || adm} onChanged={onChanged} live={{ header: h, tables: t as never, files }} />}
      </div>
      <aside className="pp-side">
        <button type="button" className="pp-sidebtn pp-grip" onClick={() => setShut(!shut)} aria-expanded={!shut} title={(shut ? 'Mở' : 'Đóng') + ' ghi chú & hành trình'} data-kbd="]" aria-label={(shut ? 'Mở' : 'Đóng') + ' cột ghi chú và hành trình'}><svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><path d={shut ? 'M7 2 2 7l5 5' : 'M3 2l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <div className="pp-shutter" onClick={() => setShut(false)} aria-hidden={!shut}>
          <button type="button" className="pp-sh-open" tabIndex={shut ? 0 : -1} onClick={(e) => { e.stopPropagation(); setShut(false); }} aria-label="Mở cột ghi chú và hành trình" data-kbd="]" title="Mở ghi chú & hành trình"><svg width="10" height="14" viewBox="0 0 10 14" aria-hidden="true"><path d="M7 2 2 7l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
          {(role || lvName) && !['da_duyet', 'fail'].includes(d.status) && <Assignees mini proc={proc} company={d.company} role={d.status === 'duyet_them' ? undefined : role} level={d.status === 'duyet_them' ? lvs.find((l) => l.id === apv?.queue[apv.idx]) : undefined} people={people} />}
          <span className="pp-sh-i" title="Ghi chú"><Icon name="chat" size={15} />{(d.notes ?? []).length || ''}</span>
          <span className="pp-sh-i" title="Đã chờ ở bước này"><Icon name="clock" size={15} />{waitH < 1 ? Math.round(waitH * 60) + "'" : waitH < 48 ? Math.round(waitH) + 'h' : Math.round(waitH / 24) + 'd'}</span>
        </div>
      <div className="pp-notes">
        <b>Ghi chú nối tiếp</b>
        {d.notes.length === 0 && <span className="small muted">Chưa có ghi chú.</span>}
        {d.notes.map((n, i) => <div key={i} className="pp-note"><span className="small muted">{ROLE_NAME[n.role] ?? n.role} · {who(n.user)} · {dt(n.at)}</span><div>{n.text}</div></div>)}
        {can && !closed && <div className="row"><input data-sk="c" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thêm ghi chú (yêu cầu đặc biệt, vấn đề kỹ thuật, lưu ý…)" />
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

function Qt1Total({ rows, vat, vc = 0 }: { rows: Row[]; vat: number; vc?: number }) {
  const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const s = sumOf(rows, c);
  return <div className="pp-total"><span>Cộng: <b>{fmtN(s)}</b> đ</span><span>Thuế GTGT {vat}%: <b>{fmtN(Math.round(s * vat / 100))}</b> đ</span>{vc > 0 && <span>Phí VC: <b>{fmtN(vc)}</b> đ</span>}<span>Tổng thanh toán: <b>{fmtN(s + Math.round(s * vat / 100) + vc)}</b> đ</span></div>;
}
function Qt2Loss({ nl, tp }: { nl: Row[]; tp: Row[] }) {
  const kg = TABLES.nl.cols.find((x) => x.k === 'kg')!; const a = sumOf(nl, kg), z = sumOf(tp, kg); const l = a ? 1 - z / a : null;
  return <div className="pp-total"><span>Nguyên liệu: <b>{fmtN(a, 1)}</b> kg</span><span>Thành phẩm: <b>{fmtN(z, 1)}</b> kg</span>
    <span className={l != null && l > 0.15 ? 'kb-late' : ''}>Hao hụt: <b>{l == null ? '' : (l * 100).toFixed(1) + '%'}</b> (định mức ~15%)</span>
    <HaoTip a={a} z={z} l={l} m1={sumOf(nl, TABLES.nl.cols.find((x) => x.k === 'm2')!)} m2={sumOf(tp, TABLES.nl.cols.find((x) => x.k === 'm2')!)} /></div>;
}

/** Điện thoại: mỗi dòng một thẻ gọn, bấm để sửa */
const kgTip = (r: Row) => { const { m, how } = matOf(r); return m ? (how === 'mac_dinh' ? '⚠ Chưa rõ vật liệu – đang tính theo ' : 'Vật liệu: ') + m.name + ' · tỷ trọng ' + m.density : undefined; };
const kgWhy = (r: Row): string[] => { const m = m2Of(r), d = numIn(r.day), ds = densOf(r), { m: mt, how } = matOf(r), k = kgOf(r);
  const f = (x: number | null, n: number) => (x == null ? '?' : fmtN(x, n));
  return ['TL (kg) = DT (m²) × Dày (mm) × Tỷ trọng', f(m, 3) + ' m² × ' + f(d, 2) + ' mm × ' + f(ds, 2) + ' = ' + (k == null ? '?' : f(k, 1) + ' kg'),
    (mt ? (how === 'mac_dinh' ? '⚠ Chưa rõ vật liệu – tỷ trọng mặc định ' : 'Vật liệu ') + mt.name : 'Tỷ trọng mặc định') + (d == null ? ' · ⚠ thiếu Dày' : m == null ? ' · ⚠ thiếu DT' : '')]; };
/** Ô bảng theo kiểu: ngày / danh sách chọn / có-không / tham chiếu */
const refOf = (r: Row, c: Col, editable: boolean) => (editable ? c.refv ?? '' : String(r[c.k] ?? '') || (c.refv ?? ''));
const cellTxt = (r: Row, c: Col, editable = false): string => { if (c.ty === 'ref') return refOf(r, c, editable); if (c.ty === 'datetime' || c.ty === 'sub') return fmtCell(c, r[c.k]); const v = String(r[c.k] ?? '');
  if (c.ty === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(8, 10) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4); if (c.ty === 'bool') return v ? '✓' : ''; return v; };
function TyCell({ r, c, on }: { r: Row; c: Col; on: (v: string) => void }) {
  const v = String(r[c.k] ?? '');
  if (c.ty === 'bool') return <input type="checkbox" className="pp-cb" aria-label={c.t} checked={!!v} onChange={(e) => on(e.target.checked ? 'Có' : '')} />;
  if (c.ty === 'datetime') return <input type="datetime-local" className="pp-cd" aria-label={c.t} value={/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? v.slice(0, 16) : ''} onChange={(e) => on(e.target.value)} />;
  if (c.ty === 'multi') return <MultiCell c={c} v={v} on={on} />;
  if (c.ty === 'date') return <input type="date" className="pp-cd" aria-label={c.t} value={/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : ''} onChange={(e) => on(e.target.value)} />;
  return <select className="pp-cs" aria-label={c.t} value={v} onChange={(e) => on(e.target.value)}><option value="">–</option>{(c.opts ?? []).map((o) => <option key={o} value={o}>{o}</option>)}{v && !(c.opts ?? []).includes(v) && <option value={v}>{v}</option>}</select>;
}
const okNum = (c: Col, v: unknown) => isNumOk(v) && (!c.int || v == null || String(v).trim() === '' || Number.isInteger(numIn(v)));
/** Nhiều lựa chọn: lưu "a; b; c", chọn bằng hộp đánh dấu trong menu thả */
function MultiCell({ c, v, on }: { c: Col; v: string; on: (v: string) => void }) {
  const cur = v.split(';').map((x) => x.trim()).filter(Boolean); const opts = [...new Set([...(c.opts ?? []), ...cur])];
  const tog = (o: string) => on((cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join('; '));
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { const f = (e: Event) => { const d = ref.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f); }, []);
  return <details ref={ref} className="pp-multi" onKeyDown={(e) => { if (e.key === 'Escape') (e.currentTarget as HTMLDetailsElement).open = false; }}><summary aria-label={c.t}>{cur.length ? cur.map((x) => <span key={x} className="pp-chip">{x}</span>) : <span className="muted">–</span>}</summary>
    <div className="pp-mpop" role="group" aria-label={c.t}>{opts.map((o) => <label key={o}><input type="checkbox" checked={cur.includes(o)} onChange={() => tog(o)} />{o}</label>)}</div></details>;
}
/** Bảng con của một dòng – dùng lại TableEdit, chỉ 1 cấp */
function SubTable({ r, i, c, rows, editable, onChange, fname }: { r: Row; i: number; c: Col; rows: Row[]; editable: boolean; onChange: (r: Row[]) => void; fname: string }) {
  return <div className="pp-sub"><TableEdit title={c.t + ' · dòng ' + (i + 1)} cols={c.sub ?? []} rows={subRows(r, c.k)} editable={editable} fname={fname + '-' + c.k + '-' + (i + 1)}
    onChange={(rs) => onChange(rows.map((x, j) => (j === i ? ({ ...x, [c.k]: rs } as unknown as Row) : x)))} /></div>;
}
function MList({ cols, rows, shown, editable, open, setOpen, set, onChange, totals, fixed }: { fixed?: Set<number> | null; cols: Col[]; rows: Row[]; shown: number[]; editable: boolean; open: number; setOpen: (i: number) => void; set: (i: number, k: string, v: string) => void; onChange: (r: Row[]) => void; totals: Record<string, number> }) {
  const val = (r: Row, c: Col) => c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.ty ? cellTxt(r, c, editable) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '');
  const head = cols.find((c) => !c.n) ?? cols[0];
  const GS: Record<string, string> = { 'Thông tin khác': '', 'Kích thước hoàn thiện': 'HT', 'Kích thước thực tế trải': 'trải', 'Kích thước phôi': 'phôi' };
  const lb = (c: Col) => (c.g && GS[c.g] && c.k !== 'ma_tam' && c.k !== 'day' ? c.t + ' ' + GS[c.g] : c.t) + (c.k === 'kg' ? ' (kg)' : '');
  const right = cols.find((c) => c.k === 'don_gia') ?? cols.find((c) => c.k === 'tt') ?? cols.find((c) => c.k === 'kg');
  const sub = cols.filter((c) => c !== head && c !== right && ['day', 'so_tam', 'sl', 'm2', 'kg'].includes(c.k)).slice(0, 4);
  return <div className="pp-mlist">
    {rows.length === 0 && <div className="small muted">Chưa có dòng nào.</div>}
    {shown.map((i) => [rows[i], i] as const).map(([r, i]) => <div key={i} data-row={i} className={'pp-mrow' + (open === i ? ' on' : '') + (fixed?.has(i) ? ' pp-mfixed' : '')}>
      <button type="button" className="pp-mrow-h" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
        <span className="pp-mrow-m"><b>{val(r, head) || '(trống) #' + (i + 1)}</b><span className="small muted">{sub.map((c) => { const v = val(r, c); return v ? lb(c) + ' ' + v : ''; }).filter(Boolean).join(' · ')}</span></span>
        {right && <span className="pp-mrow-r"><b>{val(r, right) || '—'}</b><span className="small muted">{/\(([^)]+)\)/.exec(right.t)?.[1] ?? right.t}</span></span>}</button>
      {open === i && <div className="pp-mrow-e">
        {cols.map((c) => <label key={c.k} className="f"><span>{lb(c)}{c.req && <b className="req"> *</b>}</span>
          {c.ty === 'sub' ? <SubTable r={r} i={i} c={c} rows={rows} editable={editable} onChange={onChange} fname="sub" />
            : c.calc || c.ro || !editable ? <output>{val(r, c) || '—'}{c.k === 'kg' && c.calc && <ColTip info={kgWhy(r)} />}</output>
            : c.ty ? <TyCell r={r} c={c} on={(v) => set(i, c.k, v)} />
            : <NumInput money={isMoneyCol(c)} value={typeof r[c.k] === 'number' ? String(r[c.k]) : String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} aria-invalid={c.n && !okNum(c, r[c.k]) ? true : undefined} onChange={(e) => set(i, c.k, c.n ? numTyping(e.target.value) : e.target.value)} />}</label>)}
        {editable && <button type="button" className="btn sm danger-soft" onClick={() => { onChange(rows.filter((_, j) => j !== i)); setOpen(-1); }}><Icon name="trash" size={14} />Bỏ dòng</button>}
      </div>}
    </div>)}
    {editable && <button type="button" className="btn sm" onClick={() => { onChange([...rows, {}]); setOpen(rows.length); }}><Icon name="plus" size={14} />Thêm dòng</button>}
    {rows.length > 0 && Object.keys(totals).length > 0 && <div className="pp-mtot small">Tổng {rows.length} dòng · {Object.entries(totals).filter(([, v]) => v).map(([k, v]) => { const c = cols.find((x) => x.k === k)!; return lb(c) + ' ' + fmtN(v, c.d ?? 0); }).join(' · ')}</div>}
  </div>;
}

/** Bảng nhập liệu: sửa trực tiếp, dán từ Excel, tải file Excel, tải mẫu */
/** Cột được "áp dụng cho toàn bộ dòng" */
const FILL_COLS = ['don_gia'];
function TableEdit({ vk, title, req, cols, rows, editable, onChange, fname, fromQt0, srcLabel = 'Lấy từ QT0', prev, q0src }: { vk?: string; q0src?: { id: string; docId: string; orderId: string }; prev?: Row[]; title: string; req?: boolean; cols: Col[]; rows: Row[]; editable: boolean; onChange: (r: Row[]) => void; fname: string; fromQt0?: () => Promise<Row[]>; srcLabel?: string }) {
  const [q0, setQ0] = useState<{ code: string; rows: Q0Row[] } | null>(null);
  const openQ0 = async () => { if (!q0src) return; const [{ data: rs }, { data: ls }] = await Promise.all([sb.rpc('qt0_rows', { p_qt0: q0src.id, p_doc: q0src.docId }), sb.rpc('qt0_list', { p_order: q0src.orderId })]);
    const l = ((rs ?? []) as Q0Row[]).filter((x) => String(x.r.ma_tam ?? '').trim()); if (!l.length) { toast('QT0 nguồn không có tấm'); return; }
    setQ0({ code: ((ls ?? []) as { id: string; code: string }[]).find((x) => x.id === q0src.id)?.code ?? 'QT0', rows: l }); };
  const q0In = useMemo(() => { const m: Record<string, number> = {}; for (const r of rows) { const k = q0Key(r); const n = Number(String(r.so_tam ?? '').replace(',', '.')) || 0; if (String(r.ma_tam ?? '').trim()) m[k] = (m[k] ?? 0) + n; } return m; }, [rows]);
  const takeQ0 = (p: Q0Pick[]) => { if (!q0) return; const KEEP = new Set(['don_gia', 'tt', 'ghi_chu', '_id']); const next = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim())).map((r) => ({ ...r })); let up = 0, add = 0;
    for (const x of p) { const src = q0.rows.find((y) => y.i === x.i); if (!src) continue; const t = takeRow(src.r, x.q); const k = q0Key(t); const j = next.findIndex((r) => q0Key(r) === k);
      if (j >= 0) { const cur = next[j]; const n0 = Number(String(cur.so_tam ?? '').replace(',', '.')) || 0; const m0 = Number(String(cur.m2 ?? '').replace(',', '.')) || 0; const mt = Number(String(t.m2 ?? '').replace(',', '.')) || 0;
        next[j] = { ...cur, so_tam: n0 + x.q, ...(mt || m0 ? { m2: Math.round((m0 + mt) * 10000) / 10000 } : {}) }; up++; }
      else { next.push(Object.fromEntries(Object.entries(t).filter(([kk]) => !KEEP.has(kk))) as Row); add++; } }
    onChange(next); setQ0(null); toast(`Đã lấy từ ${q0.code}: cộng thêm ${up} dòng, thêm mới ${add} dòng – bấm Lưu để giữ`); };
  const [pick, setPick] = useState<Row[] | null>(null);
  const inCols = cols.filter((c) => !c.calc && !c.ro);
  const isAdm = useAuth().can('admin_it');
  const [paste, setPaste] = useState(''); const [open, setOpen] = useState(false); const [msg, setMsg] = useState('');
  const [subOpen, setSubOpen] = useState<string | null>(null);
  // So với bản lúc bị trả về
  const pv = useMemo(() => (prev ? new Map(prev.map((x) => [String(x._id ?? ''), x])) : null), [prev]);
  const chg = (r: Row, c: Col) => { if (!pv || c.calc || c.ty === 'ref') return false; const p0 = pv.get(String(r._id ?? '')); if (!p0) return true; return JSON.stringify(p0[c.k] ?? '') !== JSON.stringify(r[c.k] ?? '') && String(p0[c.k] ?? '') !== String(r[c.k] ?? ''); };
  const isNew = (r: Row) => !!pv && !pv.has(String(r._id ?? ''));
  const removed = pv ? [...pv.keys()].filter((k) => k && !rows.some((r) => String(r._id ?? '') === k)).length : 0;
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
  const totals = useMemo(() => Object.fromEntries(cols.filter((c) => c.n && (c.sum || ['so_tam', 'm2', 'kg', 'tt', 'm2_dot', 'duong_han', 'm2_ht', 'phoi_sl', 'phoi_m2'].includes(c.k))).map((c) => [c.k, sumOf(rows, c)])), [rows, cols]);
  let skipped = 0;
  const fromAoa = (aoa: string[][]) => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9²]/g, '');
    const hi = aoa.findIndex((r) => r.some((c) => inCols.some((x) => norm(c) === norm(x.t))));
    let map: (string | null)[];
    const hidDay = !cols.some((x) => x.k === 'day') && cols.some((x) => x.k === 'kg');
    if (hi >= 0) { map = aoa[hi].map((c) => cols.find((x) => norm(c) === norm(x.t))?.k ?? (hidDay && ['day', 'daymm', 'doday', 'dodaymm'].includes(norm(c)) ? 'day' : null)); aoa = aoa.slice(hi + 1); }
    else map = cols.map((c) => c.k);
    const out: Row[] = []; skipped = 0;
    for (const r of aoa) {
      const row: Row = {}; r.forEach((v, j) => { const k = map[j]; const c = cols.find((x) => x.k === k); if (k === 'day' && !c) { const n = normNum(String(v ?? '')); if (n !== '') row.day = n; return; } if (k && c && !c.calc && !c.ro) row[k] = c?.n ? normNum(String(v ?? '')) : String(v ?? '').trim(); });
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
    let add = fromAoa(aoa); let how = '';
    // Không khớp tiêu đề bảng → thử đọc như file bóc tách (sheet BOCTACHBANVE)
    if (!add.length) { const keys = new Set(cols.map((c) => c.k)); const br = bocTachRows(wb.SheetNames.map((sn) => ({ name: sn, rows: X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }) })));
      add = br.map((r) => Object.fromEntries(Object.entries(r).filter(([k, v]) => keys.has(k) && v !== '')) as Row); how = ' (đọc theo mẫu bóc tách)'; }
    if (!add.length) { setMsg('Không đọc được dòng nào từ ' + f.name + ': cần tiêu đề giống bảng, hoặc file bóc tách có cột Mã tấm, Độ dày, Số lượng.'); e.target.value = ''; return; }
    onChange([...rows, ...add]); setMsg('Đã nạp ' + add.length + ' dòng từ ' + f.name + how + (skipped ? ` (bỏ qua ${skipped} dòng ví dụ)` : '')); e.target.value = '';
  };
  // File mẫu: đúng các cột của bảng (cột tự tính để trống, ghi chú "tự tính"), 3 dòng ví dụ
  const tpl = async () => { const X = await import('xlsx'); const hd = cols.map((c) => c.calc ? c.t + ' (tự tính)' : c.t);
    const ex = [0, 1, 2].map((i) => cols.map((c) => (c.calc ? '' : sampleRow(c, i))));
    if (!cols.some((c) => c.k === 'day') && cols.some((c) => c.k === 'kg')) { hd.push('Dày (mm)'); ex.forEach((r, i) => r.push(['1.2', '2', '3'][i])); }
    const ws = X.utils.aoa_to_sheet([hd, ...ex]); ws['!cols'] = hd.map((h, j) => ({ wch: Math.max(10, h.length + 2, ...ex.map((r) => String(r[j]).length + 2)) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Mau'); X.writeFile(wb, fname + '-mau.xlsx'); };
  const fileRef = useRef<HTMLInputElement>(null);
  const [asTbl, setAsTbl] = useState(false); const [mi, setMi] = useState(-1);
  const [q, setQ] = useState(''); const [errOnly, setErrOnlyS] = useState(false); const errJ = useRef(-1); const [errSnap, setErrSnap] = useState<Set<number> | null>(null);
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
  const bad = (r: Row) => cols.some((c) => !c.calc && !c.ro && ((c.req && !String(r[c.k] ?? '').trim()) || (c.n && !okNum(c, r[c.k]))));
  const ql = q.trim().toLowerCase();
  // Bấm "Lỗi": giữ cố định danh sách dòng lỗi lúc bấm – sửa xong dòng vẫn ở lại (✓), bấm lại để làm mới
  const setErrOnly = (v: boolean) => { setErrOnlyS(v); setErrSnap(v ? new Set(rows.map((_, i) => i).filter((i) => bad(rows[i]))) : null); };
  const hit = rows.map((_, i) => i).filter((i) => (!errOnly || (errSnap ? errSnap.has(i) : bad(rows[i]))) && (!ql || cols.some((c) => !c.n && String(rows[i][c.k] ?? '').toLowerCase().includes(ql))));
  const [sOpen, setSOpen] = useState(false); const sRef = useRef<HTMLInputElement>(null);
  const openSearch = () => { setSOpen(true); setTimeout(() => sRef.current?.focus(), 0); };
  const fkey = 'pp-fold:' + (editable ? 'e' : 'v') + ':' + title;
  const [fold, setFoldS] = useState(() => { try { const v = localStorage.getItem(fkey); return v == null ? !editable : v === '1'; } catch { return !editable; } });
  const setFold = (v: boolean) => { setFoldS(v); try { localStorage.setItem(fkey, v ? '1' : '0'); } catch { /* */ } };
  const folded = fold && rows.length > 0 && !ql && !errOnly;
  const shown = folded ? [] : hit.slice(0, L); const nBad = rows.filter(bad).length;
  const [fixedAll, setFixedAll] = useState(false);
  useEffect(() => { if (errOnly && nBad === 0) { setErrOnlyS(false); setErrSnap(null); setLim(0); setFixedAll(true); const t = setTimeout(() => setFixedAll(false), 4000); return () => clearTimeout(t); } }, [errOnly, nBad]);
  const clearAll = async () => { if (await confirmDialog(`Xoá hết ${rows.length} dòng của bảng “${title}”? (Chưa lưu thì bấm Huỷ thay đổi để lấy lại)`, 'Xoá hết')) onChange([]); };
  const addSample = () => { onChange([...rows, ...[0, 1, 2].map((i) => Object.fromEntries(inCols.map((c) => [c.k, String(sampleRow(c, i))])) as Row)]); setMsg('Đã nạp 3 dòng mẫu – kiểm tra rồi bấm Lưu'); };
  return (
    <div className={'pp-tbl' + (asTbl ? ' as-tbl' : '')} onPaste={editable ? pasteAny : undefined} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && rows.length) { e.preventDefault(); if (fold) setFold(false); openSearch(); } }}>
      <div className="row between pp-th"><b>{title}{vk && <VarTag k={'#' + vk} />}{req && <span className="req-star" title="Bắt buộc có ít nhất 1 dòng trước khi ký"> *</span>} <span className="small muted">· {rows.length} dòng</span>
        {rows.length > 0 && <span className={'pp-sx' + (sOpen || q ? ' open' : '')}>
          {sOpen || q ? <label className="pp-sx-in"><Icon name="search" size={15} /><input ref={sRef} type="search" placeholder="Tìm mã tấm…" value={q} aria-label="Tìm tấm"
              onChange={(e) => { setQ(e.target.value); setLim(0); }} onKeyDown={(e) => { if (e.key === 'Escape') { setQ(''); setSOpen(false); } }} onBlur={() => { if (!q.trim()) setSOpen(false); }} />
              {ql && <span className="small muted pp-sx-n">{hit.length}/{rows.length}</span>}
              {q && <button type="button" className="pp-sx-x" aria-label="Xoá tìm" onPointerDown={(e) => e.preventDefault()} onClick={() => { setQ(''); setLim(0); sRef.current?.focus(); }}><Icon name="x" size={13} /></button>}</label>
            : <button type="button" className="pp-sx-btn" aria-label="Tìm trong bảng (Ctrl+F)" title="Tìm trong bảng (Ctrl+F)" onClick={openSearch}><Icon name="search" size={16} /></button>}</span>}
        {pv && (() => { const nN = rows.filter(isNew).length; const nC = rows.filter((r) => !isNew(r) && cols.some((c) => chg(r, c))).length; return nN + nC + removed > 0
          ? <span className="pp-chgsum" title="So với lúc bị trả về">Đã sửa: {[nC && nC + ' dòng sửa', nN && nN + ' dòng mới', removed && removed + ' dòng bỏ'].filter(Boolean).join(' · ')}</span> : <span className="pp-chgsum none">Chưa sửa gì so với lúc trả về</span>; })()}
        {rows.length > 0 && <button type="button" className={'pp-fold' + (folded ? ' on' : '')} aria-expanded={!folded} onClick={() => { setFold(!folded); if (ql || errOnly) { setQ(''); setErrOnly(false); } }} title={folded ? 'Hiện các dòng' : 'Chỉ hiện dòng tổng'}><Icon name="caret" size={14} />{folded ? 'Mở rộng' : 'Thu gọn'}</button>}</b>
        {rows.length > 0 && <span className="pp-vt" role="group" aria-label="Kiểu xem"><button type="button" aria-pressed={!asTbl} title="Danh sách" aria-label="Danh sách" onClick={() => setAsTbl(false)}><Icon name="list" size={16} /></button><button type="button" aria-pressed={asTbl} title="Bảng" aria-label="Bảng" onClick={() => setAsTbl(true)}><Icon name="sheet" size={16} /></button></span>}
        {q0 && <Qt0Picker code={q0.code} rows={q0.rows} inTable={q0In} onClose={() => setQ0(null)} onPick={takeQ0} />}
        {pick && <Qt0Pick label={srcLabel} src={pick} onClose={() => setPick(null)} onPick={async (sel) => {
          const KEEP = new Set(['don_gia', 'tt', 'ghi_chu', '_id']); const key = (r: Row) => String(r.ma_tam ?? '').trim().toLowerCase();
          const cur = rows.filter((r) => Object.values(r).some((v) => String(v ?? '').trim()));
          const idx = new Map(cur.map((r, i) => [key(r), i])); const next = cur.map((r) => ({ ...r })); let up = 0, add = 0;
          // m²/tấm: QT0 chỉ có kích thước trải / tổng m² → tự tính khi chưa có
          const n = (v: unknown) => { const x = Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() && isFinite(x) ? x : null; };
          const m2t = (r: Row) => { if (String(r.m2_tam ?? '').trim()) return r.m2_tam; const tr = n(r.trai_rong), td = n(r.trai_dai), m = n(r.m2), st = n(r.so_tam), w = n(r.rong), l = n(r.dai);
            const v = tr != null && td != null ? tr * td / 1e6 : m != null && st ? m / st : w != null && l != null ? w * l / 1e6 : null; return v == null ? '' : String(Math.round(v * 10000) / 10000); };
          for (const s0 of sel) { const s1 = Object.fromEntries(Object.entries(s0).filter(([k]) => !KEEP.has(k))) as Row; s1.m2_tam = m2t(s0); const j = key(s0) ? idx.get(key(s0)) : undefined;
            if (j != null) { next[j] = { ...next[j], ...s1 }; up++; } else { next.push(s1); add++; } }
          if (cur.length && !(await confirmDialog(`Cập nhật ${up} tấm đã có (giữ đơn giá, ghi chú) và thêm ${add} tấm mới?`, 'Lấy từ QT0'))) return;
          onChange(next); setPick(null); toast(`Đã lấy từ QT0: cập nhật ${up}, thêm ${add} tấm – bấm Lưu để giữ`); }} />}
        {editable && <span className="row pp-tools" style={{ gap: 6 }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={doFile} />
          <button className="btn xs" title="Tải file Excel lên (đọc theo tên cột)" onClick={() => fileRef.current?.click()}><Icon name="upload" size={13} />Tải lên</button>
          {q0src && <button className="btn xs" title="Chọn tấm từ QT0 nguồn – lọc theo cột, nhập số tấm, cộng dồn vào bảng" onClick={openQ0}><Icon name="download" size={13} />Lấy từ QT0</button>}
          {fromQt0 && <button className="btn xs" title="Lấy danh sách tấm từ QT0 đã duyệt – khớp theo Mã tấm, giữ đơn giá và ghi chú đã nhập" onClick={async () => { const r = await fromQt0(); if (!r.length) { toast('Không có danh sách tấm để lấy'); return; } setPick(r); }}><Icon name="download" size={13} />{srcLabel}</button>}
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
      {(nBad > 0 || fixedAll || errOnly) && <div className="pp-find">
        {nBad > 0 && <button type="button" className={'pp-chip' + (errOnly ? ' on' : '')} aria-pressed={errOnly} title="Chỉ hiện dòng lỗi" onClick={() => { const fixed = errSnap ? [...errSnap].filter((i) => !bad(rows[i])).length : 0; setErrOnly(!errOnly || fixed > 0); setLim(0); }}>Lỗi {nBad}</button>}
        {nBad > 0 && <button type="button" className="pp-chip nx" title="Đến dòng lỗi tiếp theo" aria-label="Đến dòng lỗi tiếp theo" onClick={() => {
          const bads = rows.map((_, i) => i).filter((i) => bad(rows[i])); const cur = errJ.current; const nx = bads.find((i) => i > cur) ?? bads[0]; errJ.current = nx;
          const pos = hit.indexOf(nx); if (pos < 0) { setQ(''); setErrOnly(false); } setLim((x) => Math.max(x || step, (pos < 0 ? nx : pos) + 1));
          setTimeout(() => { const el = [...document.querySelectorAll<HTMLElement>('[data-row="' + nx + '"]')].find((x) => x.offsetParent) ?? null; if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('pp-flash'); setTimeout(() => el.classList.remove('pp-flash'), 1200); } }, 60); }}><Icon name="arrow" size={13} /></button>}
        {errOnly && <span className="small muted">{errSnap ? <>Đã sửa <b className="pp-okn">{[...errSnap].filter((i) => !bad(rows[i])).length}/{errSnap.size}</b> · bấm “Lỗi” để làm mới</> : hit.length + '/' + rows.length}</span>}
        {fixedAll && <span className="small pp-okmsg" role="status"><Icon name="check" size={14} />Đã sửa hết lỗi</span>}
      </div>}
      {mob && folded && <button type="button" className="pp-ftiles" onClick={() => setFold(false)} aria-label={'Mở ' + rows.length + ' dòng'}>{Object.entries(totals).filter(([, v]) => v).map(([k, v]) => { const c = cols.find((x) => x.k === k)!;
        return <span key={k} className={'pp-ftile' + cgOf(c, cols, cols.indexOf(c))}><b>{fmtN(v, c.d ?? 0)}</b><small>{c.t}{c.g ? ' ' + (c.g.includes('trải') ? 'trải' : c.g.includes('phôi') ? 'phôi' : 'HT') : ''}</small></span>; })}<span className="pp-fmore">{rows.length} dòng · bấm để xem</span></button>}
      {mob && !folded && <MList fixed={errSnap ? new Set([...errSnap].filter((i) => !bad(rows[i]))) : null} cols={cols} rows={rows} shown={shown} editable={editable} open={mi} setOpen={setMi} set={set} onChange={onChange} totals={totals} />}
      {(!mob || asTbl) && <div className="pp-tw">
      {edge.l && <button type="button" className="pp-edge l" aria-label="Cuộn sang trái" onClick={() => glide(-1)}><Icon name="back" size={18} /></button>}
      {edge.r && <button type="button" className="pp-edge r" aria-label="Cuộn sang phải" onClick={() => glide(1)}><Icon name="back" size={18} /></button>}
      <div className={'tbl-wrap' + (edge.l ? ' sl' : '') + (edge.r ? ' sr' : '')} ref={wrapRef} onScroll={syncEdge} onPointerDown={panStart}><table className="tbl pp-grid">
        <thead>{cols.some((c) => c.g) && <tr className="th-grp"><th />{cols.reduce<{ g: string; n: number; k: string; pin?: boolean }[]>((a, c, i) => { const g = c.g ?? ''; const l = a[a.length - 1]; if (i === 0) { a.push({ g, n: 1, k: c.k, pin: true }); return a; } if (l && !l.pin && l.g === g && g) l.n++; else a.push({ g, n: 1, k: c.k }); return a; }, [])
            .map((x, xi, arr) => <th key={'g' + x.k} colSpan={x.n} className={(x.g ? 'g' + (GCLS[x.g] ?? '') + (xi > 0 && arr[xi - 1].g === x.g ? '' : ' cg-first') : '') + (x.pin ? ' g-pin' : '')}>{x.pin && arr[1]?.g === x.g ? '' : x.g}</th>)}{editable && <th />}</tr>}
          <tr><th>#</th>{cols.map((c, ci) => <th key={c.k} className={(c.n ? 'n' : 't') + (c.k === 'so_tam' || c.k === 'phoi_sl' ? ' th-qty' : '') + (c.g ? ' th-in-g' : '') + cgOf(c, cols, ci)}>{editable && !c.calc && !c.ro && FILL_COLS.includes(c.k) && rows.length > 1
          ? <button className="th-fill" onClick={() => setHdr(hdr?.k === c.k ? null : { k: c.k, v: String(rows.find((r) => String(r[c.k] ?? '').trim())?.[c.k] ?? '') })} title={'Đặt cùng giá trị cho cả cột ' + c.t} aria-label={'Đặt chung cột ' + c.t}>
              {c.t}{c.req && <b className="req"> *</b>}<Icon name="list" size={12} /></button> : <>{c.t}{c.req && <b className="req"> *</b>}</>}{c.info && <ColTip info={c.info} />}{c.u && <small className="th-u">{c.u}</small>}{vk && <VarTag k={vk + '.' + c.k} sum={c.n ? 'tong_' + vk + '_' + c.k : undefined} />}</th>)}{editable && <th />}</tr></thead>
        <tbody>
          {shown.map((i) => [rows[i], i] as const).map(([r, i]) => <Fragment key={i}><tr data-row={i} className={(bad(r) ? 'pp-bad' : errSnap?.has(i) ? 'pp-fixed' : '') + (isNew(r) ? ' pp-new' : '') || undefined}><td className="muted">{i + 1}</td>
            {cols.map((c, ci) => <td key={c.k} className={(c.n ? 'n' : 't') + cgOf(c, cols, ci) + (c.k === 'so_tam' || c.k === 'phoi_sl' ? ' td-qty' : '') + (c.k === 'kg' && c.calc && matOf(r).how === 'mac_dinh' && String(r.vat_lieu ?? r.mac_thep ?? '').trim() ? ' pp-kgw' : '') + (!c.calc && !c.ro && ((c.req && !String(r[c.k] ?? '').trim()) || (c.n && !okNum(c, r[c.k]))) ? ' pp-cbad' : '') + (!isNew(r) && chg(r, c) ? ' pp-chg' : '')} title={c.k === 'ma_tam' ? String(r[c.k] ?? '') : c.k === 'kg' ? kgTip(r) : undefined}>{c.ty === 'sub' ? <button type="button" className={'pp-subbtn' + (subOpen === i + ':' + c.k ? ' on' : '')} aria-expanded={subOpen === i + ':' + c.k} onClick={() => setSubOpen(subOpen === i + ':' + c.k ? null : i + ':' + c.k)}><Icon name="caret" size={12} />{subRows(r, c.k).length} dòng</button> : c.ty === 'ref' ? <span className="calc pp-ref">{refOf(r, c, editable)}</span> : c.calc ? <span className="calc">{fmtN(c.calc(r), c.d ?? 0)}{c.k === 'kg' && <ColTip info={kgWhy(r)} />}</span>
              : editable && !c.ro && c.ty ? <TyCell r={r} c={c} on={(v) => set(i, c.k, v)} />
              : editable && !c.ro ? <NumInput money={isMoneyCol(c)} onPaste={(e) => pasteAt(e, i, c.k)} value={typeof r[c.k] === 'number' ? String(Math.round((r[c.k] as number) * 1e6) / 1e6) : String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} aria-invalid={c.n && !okNum(c, r[c.k]) ? true : undefined} title={c.n && !okNum(c, r[c.k]) ? c.t + ' phải là số' : undefined} onChange={(e) => set(i, c.k, c.n ? numTyping(e.target.value) : e.target.value)} onBlur={(e) => offer(c.k, e.target.value)}
                data-cell={i + ':' + c.k} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); // Enter = xuống ô dưới; không bao giờ tự áp dụng cả cột
                  const nx = (e.currentTarget.closest('table') as HTMLElement | null)?.querySelector<HTMLInputElement>('[data-cell="' + (i + 1) + ':' + c.k + '"]'); if (nx) nx.focus(); else (e.target as HTMLInputElement).blur(); } }} className={c.n ? 'num' : undefined} style={{ minWidth: wOf(c) + 'ch' }} />
              : c.ty ? cellTxt(r, c) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '')}</td>)}
            {editable && <td><button className="link-btn" aria-label="Bỏ dòng" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}</tr>
            {(() => { const sc = cols.find((c) => c.ty === 'sub' && subOpen === i + ':' + c.k); return sc ? <tr className="pp-subrow"><td /><td colSpan={cols.length + (editable ? 1 : 0)}><SubTable r={r} i={i} c={sc} rows={rows} editable={editable} onChange={onChange} fname={fname} /></td></tr> : null; })()}</Fragment>)}
          {editable && rows.length === 0 && <tr><td colSpan={cols.length + 2}><div className="pp-dropzone" tabIndex={0} role="textbox" aria-label="Dán dữ liệu từ Excel">
            <Icon name="copy" size={16} /><span><b>Bấm vào đây rồi nhấn Ctrl+V</b> để dán các dòng đã chép từ Excel <span className="muted">(có hoặc không có dòng tiêu đề)</span></span></div></td></tr>}
          {editable && !folded && <tr><td colSpan={cols.length + 2}><button className="link-btn" onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Thêm dòng</button></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan={2} className="pp-tot-lb">Tổng <span>{rows.length} dòng</span>{folded && <button type="button" className="link-btn pp-fx" onClick={() => setFold(false)}>bấm để xem</button>}</td>{cols.slice(1).map((c, ci) => <td key={c.k} className={(c.n ? 'n' : '') + cgOf(c, cols, ci + 1)}>{c.k in totals ? <b>{fmtN(totals[c.k], c.d ?? 0)}</b> : null}</td>)}{editable && <td />}</tr></tfoot>}
      </table></div>
      <div ref={endRef} className="pp-tend" />
      {(edge.l || edge.r) && <div className="pp-hhint small muted">Kéo ✋ ở ô không nhập, ⇧ + lăn chuột, hoặc bấm ‹ › để cuộn ngang</div>}
      </div>}
      {!folded && hit.length > step && <div className="pp-pager">
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
const DKG = ['Giao tại kho bên mua', 'Giao tại xưởng bên bán', 'Bên mua tự vận chuyển'];
const GCLS: Record<string, string> = { 'Thông tin khác': ' cg cg-ot', 'Báo giá': ' cg cg-bg', 'Kích thước hoàn thiện': ' cg cg-ht', 'Kích thước thực tế trải': ' cg cg-tr', 'Kích thước phôi': ' cg cg-ph' };
const cgOf = (c: { g?: string }, cols: { g?: string }[], i: number) => (c.g ? (GCLS[c.g] ?? ' cg') + (i === 0 || cols[i - 1]?.g !== c.g ? ' cg-first' : '') : '');
export function docHtml(o: Order, b: Batch, d: Doc, people: Record<string, Profile>, auto = false): string {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const who = (id?: string) => (id ? people[id]?.full_name ?? '' : '');
  const title = { QT0: 'DANH SÁCH TẤM – BÓC TÁCH BẢN VẼ', QT1: 'XÁC NHẬN ĐƠN HÀNG', QT2: 'LỆNH GIA CÔNG KIÊM BÀN GIAO VẬT LIỆU', QT3: 'PHIẾU XUẤT KHO KIÊM BIÊN BẢN GIAO HÀNG' }[b.proc];
  const meta = [['Mã đơn hàng', docCode(o, b, d.company)], ['Dự án', o.project], ...hdrOf(b.proc).map(([k, l]) => [l, d.header[k] ?? ''])];
  const tbl = PROC_TABLES[b.proc].map(([key, def]) => { const T = { t: TABLES[def].t, cols: colsOf(b.proc, key) }; const rows = d.tables[key] ?? [];
    const grp = T.cols.some((c) => c.g) ? '<tr class="g"><th></th>' + T.cols.reduce<{ g: string; n: number }[]>((a, c, i) => { const g = c.g ?? ''; const l = a[a.length - 1]; if (i > 0 && l && l.g === g && g) l.n++; else a.push({ g, n: 1 }); return a; }, []).map((x) => `<th colspan="${x.n}">${esc(x.g)}</th>`).join('') + '</tr>' : '';
    return `<h3>${esc(T.t)}</h3><table>${grp}<tr><th>STT</th>${T.cols.map((c) => `<th>${esc(c.t)}${c.u ? '<br><small>' + esc(c.u) + '</small>' : ''}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><td>${i + 1}</td>${T.cols.map((c) => `<td class="${c.n ? 'n' : ''}">${esc(c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : fmtCell(c, r[c.k]))}</td>`).join('')}</tr>${T.cols.filter((c) => c.ty === 'sub' && subRows(r, c.k).length).map((c) => `<tr class="sr"><td></td><td colspan="${T.cols.length}"><b>${esc(c.t)}</b><table class="subt"><tr>${(c.sub ?? []).map((x) => `<th>${esc(x.t)}</th>`).join('')}</tr>${subRows(r, c.k).map((x) => `<tr>${(c.sub ?? []).map((y) => `<td class="${y.n ? 'n' : ''}">${esc(y.calc ? fmtN(y.calc(x), y.d ?? 0) : y.n ? fmtN(numIn(x[y.k]), y.d ?? 0) : fmtCell(y, x[y.k]))}</td>`).join('')}</tr>`).join('')}</table></td></tr>`).join('')}`).join('')}
      <tr class="t"><td></td>${T.cols.map((c, j) => `<td class="n">${j === 0 ? 'TỔNG' : c.sum || ['so_tam', 'm2', 'kg', 'tt', 'm2_ht', 'phoi_sl', 'phoi_m2'].includes(c.k) ? fmtN(sumOf(rows, c), c.d ?? 0) : ''}</td>`).join('')}</tr></table>`; }).join('');
  const roles = b.proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet'];
  const sig = roles.map((r) => { const s = [...d.signs].reverse().find((x) => x.role === r && x.action === 'ky');
    return `<td><b>${r === 'admin' ? 'Người tạo' : ROLE_NAME[r]}</b><br><small>ký điện tử</small><div class="sp">${s ? '✔ ' + esc(who(s.user)) + ((s as { by?: string }).by ? ' <small>(' + esc(who((s as { by?: string }).by!)) + ' làm thay)</small>' : '') + '<br><small>' + esc(dt(s.at)) + '</small>' : ''}</div></td>`; }).join('');
  const hand = b.proc === 'QT1' ? ['Khách hàng xác nhận (ký, đóng dấu)'] : b.proc === 'QT2' ? ['Người bàn giao vật liệu', 'Người nhận vật liệu'] : b.proc === 'QT3' ? ['Thủ kho / người giao', 'Tài xế', 'Khách hàng nhận hàng'] : [];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(docCode(o, b, d.company))} ${b.proc} ${esc(COMPANY[d.company])}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"><style>
    @page{size:A4 ${wideDoc(b.proc) ? 'landscape' : 'portrait'};margin:12mm;@top-left{content:''}@top-center{content:''}@top-right{content:''}@bottom-left{content:''}@bottom-center{content:''}@bottom-right{content:''}}thead{display:table-header-group}body{font-family:'Be Vietnam Pro',system-ui,sans-serif;font-size:11px;color:#111}h1{font-size:17px;text-align:center;margin:6px 0 10px}h3{font-size:12px;margin:12px 0 4px}
    .co{font-weight:700;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:3px 5px;vertical-align:top}th{background:#eee}
    td.n{text-align:right}.meta td{border:0;padding:2px 4px}.t td{font-weight:700;background:#f4f4f4}.sig td{text-align:center;width:25%}.sp{height:60px;padding-top:6px}
    .notes{margin-top:8px;font-size:10.5px}tr.g th{background:#ddd;text-transform:uppercase;font-size:10px;letter-spacing:.03em;text-align:center}th small{font-weight:400;font-style:italic;color:#555}tr.sr>td{border-top:0;background:#fafafa}table.subt{margin:3px 0 2px 12px;width:calc(100% - 12px)}table.subt th{background:#f2f2f2;font-size:10px}</style></head><body>
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
  if (!srv) return <XDot tone="wait" lines={['Đang kiểm tra file…']} />;
  const f = files[0]; const r = srv[f.path];
  const again = canRecheck ? recheck : undefined;
  if (!r) return <XDot tone="warn" lines={['Máy chủ chưa kiểm file này']} again={again} busy={busy} />;
  if (!r.ok) return <XDot tone="bad" lines={['File không hợp lệ', String(r.error ?? '')]} again={again} busy={busy} />;
  const lc = files[0].check; void ds;
  return <XDot tone="ok" lines={['File bóc tách hợp lệ', ...(lc?.sheet ? ['Sheet: ' + lc.sheet] : []), r.rows + ' dòng · ' + Number(r.qty).toLocaleString('vi-VN') + ' tấm', ...(lc?.day?.length ? ['Độ dày: ' + lc.day.join(', ') + ' mm'] : [])]} again={again} busy={busy} />;
}

/** Biểu tượng trạng thái file: xanh hợp lệ / đỏ lỗi; rê chuột / chạm để xem chi tiết */
function XDot({ tone, lines, again, busy }: { tone: 'ok' | 'bad' | 'warn' | 'wait'; lines: string[]; again?: () => void; busy?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); const ref = useRef<HTMLButtonElement>(null); const pop = useRef<HTMLSpanElement>(null); const tm = useRef(0);
  const show = () => { clearTimeout(tm.current); const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: Math.min(Math.max(r.left - 20, 12), innerWidth - 312), y: r.bottom + 8 }); };
  const hide = () => { tm.current = window.setTimeout(() => setPos(null), 150); };
  useEffect(() => { if (!pos) return; const f = (e: Event) => { const t = e.target as Node; if (!ref.current?.contains(t) && !pop.current?.contains(t)) setPos(null); }; addEventListener('pointerdown', f); return () => removeEventListener('pointerdown', f); }, [pos]);
  const ic = tone === 'ok' ? 'check' : tone === 'bad' ? 'x' : tone === 'wait' ? 'clock' : 'alert';
  return <><button type="button" ref={ref} className={'xdot ' + tone} aria-label={lines.join('. ')} aria-expanded={!!pos} onClick={() => (pos ? setPos(null) : show())}
    onPointerEnter={(e) => e.pointerType === 'mouse' && show()} onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}><Icon name={ic} size={12} /></button>
    {pos && createPortal(<span ref={pop} className={'xdot-pop ' + tone} role="tooltip" style={{ left: pos.x, top: pos.y }} onPointerEnter={() => clearTimeout(tm.current)} onPointerLeave={hide}>
      <b>{lines[0]}</b>{lines.slice(1).filter(Boolean).map((l, i) => <span key={i}>{l}</span>)}
      {again && <button type="button" className="btn xs" disabled={busy} onClick={again}>{busy ? 'Đang kiểm…' : 'Kiểm tra lại'}</button>}</span>, document.body)}</>;
}

/** Đơn đã duyệt → nút tạo hồ sơ QT kế tiếp (mở sẵn form, chọn sẵn mã tham chiếu) */
function NextStep({ o, b, d }: { o: Order; b: Batch; d: Doc }) {
  const { co: my } = useMyCo(); const [, setSp] = useSearchParams(); const [ok, setOk] = useState(false);
  const prevOf: Record<string, string> = { IPC: 'PN', HW: 'IPC' };
  const code = docCode(o, b, d.company);
  // QT1 của công ty trước → IPC/HW lập XNĐH của mình; còn lại → quy trình kế tiếp
  void prevOf;
  const t = b.proc === 'QT0' ? { proc: 'QT1', co: 'PN', label: 'Tạo XNĐH (QT1)' }
    : b.proc === 'QT1' && d.company === 'PN' ? { proc: 'QT2', co: 'PN', label: 'Tạo lệnh sản xuất (QT2)' }
    : b.proc === 'QT2' && d.company === 'PN' ? { proc: 'QT3', co: 'PN', label: 'Tạo đợt giao (QT3)' } : null;
  useEffect(() => { setOk(false); if (!t) return; let live = true;
    (async () => { const r = await sb.rpc('can_start', { p_proc: t.proc, p_co: t.co }); if (!live || !r.data) return;
      setOk(true); })();
    return () => { live = false; }; }, [d.id, t?.proc, t?.co, code]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = () => t && setSp((p) => { const n = new URLSearchParams(p); n.set('tab', t.proc); n.set('new', '1'); n.set('ref', code); const cid = (b as { co_order_id?: string | null }).co_order_id; if (cid) n.set('refid', cid); else n.delete('refid'); n.delete('b'); n.delete('co'); return n; });
  useEffect(() => { if (!ok) return; const k = (e: KeyboardEvent) => { if (keyOf(e) !== 'n' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return; e.preventDefault(); e.stopImmediatePropagation(); go(); };
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t || !ok) return null;
  return <div className="pp-act pp-next"><span className="pp-next-t"><Icon name="check" size={15} />Đã duyệt · bước tiếp theo</span>
    <button className="btn primary pp-go" onClick={go} data-kbd="N"><Icon name="plus" size={16} />{t.label}</button></div>;
}

/** ⓘ Cách tính của cột tự tính – rê chuột / chạm; hiện nổi để không bị bảng che */
function ColTip({ info }: { info: string[] }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); const ref = useRef<HTMLButtonElement>(null);
  const show = () => { const r = ref.current?.getBoundingClientRect(); if (r) setPos({ x: Math.min(Math.max(r.left + r.width / 2 - 170, 12), innerWidth - 352), y: r.bottom + 8 }); };
  useEffect(() => { if (!pos) return; const f = (e: Event) => { if (e.target !== ref.current && !ref.current?.contains(e.target as Node)) setPos(null); }; addEventListener('pointerdown', f); addEventListener('scroll', f, true); return () => { removeEventListener('pointerdown', f); removeEventListener('scroll', f, true); }; }, [pos]);
  return <><button type="button" ref={ref} className="col-i" aria-label={info[0]} aria-expanded={!!pos} onClick={(e) => { e.stopPropagation(); if (pos) setPos(null); else show(); }}
    onPointerEnter={(e) => e.pointerType === 'mouse' && show()} onPointerLeave={(e) => e.pointerType === 'mouse' && setPos(null)}><Icon name="info" size={13} /></button>
    {pos && createPortal(<span className="hao-pop col-pop" role="tooltip" style={{ left: pos.x, top: pos.y }}><b>{info[0]}</b>{info.slice(1).map((x, i) => <span key={i} className={i === info.length - 2 ? 'hao-ex' : ''}>{x}</span>)}</span>, document.body)}</>;
}

/** ⓘ Cách tính hao hụt – rê chuột (laptop) / chạm (điện thoại) */
function HaoTip({ a, z, l, m1, m2 }: { a: number; z: number; l: number | null; m1: number; m2: number }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const f = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f); }, [open]);
  const n = (v: number, d = 2) => v.toLocaleString('vi-VN', { maximumFractionDigits: d });
  return <span className={'hao-tip' + (open ? ' on' : '')} ref={ref} onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}>
    <button type="button" className="hao-i" aria-label="Cách tính hao hụt" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name="info" size={15} /></button>
    {open && <span className="hao-pop" role="tooltip">
      <b>Cách tính hao hụt</b>
      <span>Hao hụt = 1 − KL thành phẩm ÷ KL nguyên liệu</span>
      <span>KL = m² × dày (mm) × khối lượng riêng<br /><span className="muted">nhôm 2,75 · thép 7,85</span></span>
      <span className="hao-ex">Lệnh này: 1 − {n(z, 1)} kg ÷ {n(a, 1)} kg = <b>{l == null ? '—' : (l * 100).toFixed(1) + '%'}</b>
        {m1 > 0 && <><br /><span className="muted">(cùng vật liệu, cùng độ dày ⇒ ≈ 1 − {n(m2)} m² ÷ {n(m1)} m²)</span></>}</span>
      <span className="muted">Định mức 15%: vượt thì hiện đỏ – chỉ cảnh báo, không chặn gửi.</span>
    </span>}
  </span>;
}

type Bbg = { so: string; trang: string; ky: boolean };
const bbOf = (h: Record<string, unknown>): Record<string, Bbg> => { try { return JSON.parse(String(h._bbgh_ai || '{}')); } catch { return {}; } };
const nSo = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** So số BBGH đọc từ ảnh: trang đầu ↔ trang có chữ ký ↔ Số phiếu nhập trên phiếu */
function bbCheck(bb: Record<string, Bbg>, paths: string[], soPhieu: string): string[] {
  const xs = paths.map((p, i) => ({ i: i + 1, ...(bb[p] ?? { so: '', trang: '', ky: false, none: true }) })) as (Bbg & { i: number; none?: boolean })[];
  if (!xs.length) return []; const w: string[] = [];
  const none = xs.filter((x) => x.none); if (none.length === xs.length) return ['Chưa đọc được ảnh BBGH bằng AI (chụp lại để đọc)'];
  for (const x of xs) if (!x.none && !x.so) w.push(`Ảnh ${x.i}: không đọc được số BBGH`);
  const dau = xs.find((x) => x.trang === 'dau' && x.so), cuoi = xs.find((x) => x.ky && x.so) ?? xs.find((x) => x.trang === 'cuoi' && x.so);
  if (!xs.some((x) => x.ky)) w.push('Chưa thấy trang có chữ ký');
  if (dau && cuoi && dau !== cuoi && nSo(dau.so) !== nSo(cuoi.so)) w.push(`Trang đầu số ${dau.so} ≠ trang ký số ${cuoi.so}`);
  const sp = nSo(soPhieu);
  if (sp) for (const x of xs) if (x.so && nSo(x.so) !== sp && !nSo(x.so).endsWith(sp) && !sp.endsWith(nSo(x.so))) w.push(`Ảnh ${x.i}: BBGH số ${x.so} ≠ Số phiếu ${soPhieu}`);
  return w;
}

/** QT3 · Thủ kho tải ảnh giao hàng: 5 mục, mỗi mục cần ≥ 1 ảnh; điện thoại/tablet mở camera */
function GiaoAnh({ d, can, files, h, onField, upload, remove }: { d: Doc; can: boolean; files: { kind: string; name: string; path: string }[]; h: Record<string, unknown>;
  onField: (k: string, v: string) => void; upload: (e: React.ChangeEvent<HTMLInputElement>, kind: string) => Promise<{ path: string }[] | undefined | void>; remove: (path: string, name: string) => void }) {
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer:coarse)').matches;
  const { can: hasRole } = useAuth(); const seeCccd = can || hasRole('admin_it') || hasRole('admin_cnc') || hasRole('kho_qc');
  type Src = { doc_id: string; files: { kind: string; name: string; path: string }[]; header: Record<string, string | null> };
  const [src, setSrc] = useState<Src | null>(null);
  useEffect(() => { let live = true; setSrc(null); if (d.company !== 'PN') sb.rpc('gh_src', { p_doc: d.id }).then(({ data }) => { if (live && data) setSrc(data as Src); }); return () => { live = false; }; }, [d.id]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { let live = true;
    const ps = [...files.filter((f) => f.kind.startsWith('gh_')).map((f) => (f.kind === 'gh_cccd' && !seeCccd ? f.path + '.blur.jpg' : f.path)),
      ...(src?.files ?? []).flatMap((f) => (f.kind === 'gh_cccd' ? [f.path, f.path + '.blur.jpg'] : [f.path]))].filter((p) => !urls[p]);
    if (ps.length) sb.storage.from('files').createSignedUrls(ps, 3600).then(({ data }) => { if (live && data) setUrls((u) => ({ ...u, ...Object.fromEntries(data.filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl])) })); });
    return () => { live = false; }; }, [files, src]); // eslint-disable-line react-hooks/exhaustive-deps
  const [srev, setSrev] = useState('');
  const [busy, setBusy] = useState(''); const [aiMsg, setAiMsg] = useState(''); const [rev, setRev] = useState('');
  useEffect(() => { setRev(''); }, [h.tx_cccd]);
  // Ảnh → JPEG nhỏ (gửi AI) hoặc bản làm mờ (người không có quyền xem CCCD)
  const toJpeg = (file: File, max: number, blur = 0) => new Promise<Blob>((ok, bad) => { const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d')!; if (blur) x.filter = `blur(${blur}px)`; x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => (b ? ok(b) : bad(new Error('Không xử lý được ảnh'))), 'image/jpeg', 0.85); };
    img.onerror = () => bad(new Error('Không đọc được ảnh')); img.src = u; });
  const b64 = async (b: Blob) => { const a = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
  const ai = async (op: 'cccd' | 'bbgh', file: File) => { const { data, error } = await sb.functions.invoke('gh-ai', { body: { op, doc_id: d.id, image: await b64(await toJpeg(file, 1600)) } });
    const er = (data as { error?: string } | null)?.error ?? (error ? (await (error as { context?: Response }).context?.json?.().catch(() => null))?.error ?? error.message : ''); if (er) throw new Error(er); return data as Record<string, unknown>; };
  const pick = async (e: React.ChangeEvent<HTMLInputElement>, k: string) => { const fl = Array.from(e.target.files ?? []); const added = (await upload(e, k)) || [];
    if (k !== 'gh_cccd' && k !== 'gh_bbgh') return; setAiMsg('');
    let map: Record<string, Bbg> = bbOf(h); const notes: string[] = [];
    for (let i = 0; i < added.length && i < fl.length; i++) { const f = fl[i], p = added[i].path;
      try {
        if (k === 'gh_cccd') { setBusy('Đang làm mờ ảnh CCCD…'); await sb.storage.from('files').upload(p + '.blur.jpg', await toJpeg(f, 480, 14), { upsert: true, contentType: 'image/jpeg' });
          setBusy('Gemini đang đọc CCCD…'); const r = await ai('cccd', f);
          if (r.ho_ten && !String(h.tai_xe ?? '').trim()) { onField('tai_xe', String(r.ho_ten)); notes.push('Tài xế: ' + r.ho_ten); }
          if (r.so_cccd) { onField('tx_cccd', String(r.so_cccd)); notes.push('Số CCCD đã điền (sẽ mã hoá khi Lưu)'); } else notes.push('⚠ Không đọc được số CCCD, nhập tay'); }
        else { setBusy('Gemini đang đọc BBGH…'); const r = await ai('bbgh', f); map = { ...map, [p]: { so: r.so_bbgh ? String(r.so_bbgh) : '', trang: String(r.trang ?? ''), ky: !!r.co_chu_ky } }; }
      } catch (x) { notes.push('⚠ ' + (x as Error).message); } }
    if (k === 'gh_bbgh') onField('_bbgh_ai', JSON.stringify(map));
    setBusy(''); setAiMsg(notes.join(' · ') + (notes.length || k === 'gh_bbgh' ? ' – nhớ bấm Lưu' : '')); };
  const sh = src?.header ?? {}; const sF = src?.files ?? [];
  const bbPaths = files.filter((f) => f.kind === 'gh_bbgh').map((f) => f.path); const bbWarn = bbCheck(bbOf(h), bbPaths, String(h.so_phieu ?? ''));
  const sbbP = sF.filter((f) => f.kind === 'gh_bbgh').map((f) => f.path); const sWarn = bbCheck(bbOf(sh), sbbP, String(sh.so_phieu ?? ''));
  const srcTx = !!String(sh.tx_cccd ?? '').trim();
  const has = (k: string) => files.some((f) => f.kind === k) || sF.some((f) => f.kind === k);
  const done = GH_ITEMS.filter(([k]) => has(k)).length;
  const txOk = srcTx || (String(h.tx_cccd ?? '').trim() && String(h.tx_sdt ?? '').trim());
  if (!can && !done) return null;
  const thumb = (f: { kind: string; name: string; path: string }, lab: string, pn: boolean, see: boolean) => { const clear = urls[f.path], blur = urls[f.path + '.blur.jpg'];
    return <span key={f.path} className={'gh-th' + (pn ? ' gh-pn' : '')}>
      {f.kind === 'gh_cccd' && !(see && clear) ? (blur ? <span className="gh-blur" title="Ảnh CCCD đã làm mờ – chỉ người có quyền xem rõ"><img src={blur} alt="CCCD (đã làm mờ)" loading="lazy" /><Icon name="eyeoff" size={16} /></span> : <span className="gh-ph gh-lock" title="Ảnh CCCD chỉ người có quyền xem"><Icon name="eyeoff" size={18} /></span>)
        : clear ? <a href={clear} target="_blank" rel="noreferrer"><img src={clear} alt={lab} loading="lazy" /></a> : <span className="gh-ph" />}
      {pn && <span className="gh-tag" aria-label="Ảnh của Phương Nam">PN</span>}
      {!pn && can && <button type="button" className="gh-x" aria-label={'Gỡ ' + f.name} onClick={() => remove(f.path, f.name)}><Icon name="x" size={12} /></button>}</span>; };
  const eye = (on: boolean, doc: string, set: (v: string) => void, cur: string) => <button type="button" className="gh-eye" aria-label={cur ? 'Ẩn số CCCD' : 'Xem đầy đủ số CCCD'} title={cur ? 'Ẩn' : 'Xem đầy đủ (có ghi nhật ký)'}
    onClick={async () => { if (cur) { set(''); return; } const { data, error } = await sb.rpc('reveal_cccd', { p_doc: doc }); if (error) setAiMsg('⚠ ' + (error.message.includes('quyền') ? 'Bạn không có quyền xem số CCCD' : error.message)); else set(String(data ?? '')); }}><Icon name={on ? 'eyeoff' : 'eye'} size={18} /></button>;
  return <section className="gh card" aria-label="Ảnh giao hàng">
    <div className="gh-hd"><b>Ảnh giao hàng</b><span className={'chip sm ' + (done === 5 && txOk ? 'ok' : '')}>{done}/5 mục</span>
      <span className="small muted">Thủ kho · {d.company === 'PN' ? 'PNC' : d.company}{sF.length ? ' · kèm ảnh PN' : ''}</span></div>
    <ol className="gh-list">{GH_ITEMS.map(([k, lab], i) => { const mine = files.filter((f) => f.kind === k); const pnF = sF.filter((f) => f.kind === k);
      const ok = (mine.length > 0 || pnF.length > 0) && (k !== 'gh_cccd' || txOk);
      return <li key={k} className={'gh-it' + (ok ? ' ok' : '') + (can && !ok ? ' need' : '')} data-fk={k}>
        <span className="gh-n" aria-hidden="true">{ok ? <Icon name="check" size={14} /> : i + 1}</span>
        <div className="gh-body"><b>{lab}</b>
          {k === 'gh_cccd' && (srcTx ? <div className="gh-tx gh-tx-ro">
              {sh.tai_xe && <span><span className="small muted">Tài xế </span>{sh.tai_xe}</span>}
              <span className="gh-cc"><span className="small muted">CCCD </span><b className="gh-ccn">{srev || sh.tx_cccd}</b>{String(sh.tx_cccd).includes('•') && eye(!!srev, src!.doc_id, setSrev, srev)}</span>
              {sh.tx_sdt && <span><span className="small muted">SĐT </span>{sh.tx_sdt}</span>}<small className="muted">Theo phiếu PN</small></div>
            : <div className="gh-tx">
            <label><span className="small muted">Số CCCD</span><span className="gh-cc"><input inputMode="numeric" autoComplete="off" value={rev || String(h.tx_cccd ?? '')} disabled={!can} readOnly={!!rev} onFocus={(e) => { if (can && String(h.tx_cccd ?? '').includes('•')) e.target.select(); }} onChange={(e) => { const v = e.target.value; if (v.includes('•')) { if (v.replace(/[^•]/g, '').length < String(h.tx_cccd ?? '').replace(/[^•]/g, '').length) onField('tx_cccd', ''); return; } onField('tx_cccd', v.replace(/[^0-9]/g, '')); }} />
              {seeCccd && String(h.tx_cccd ?? '').includes('•') && eye(!!rev, d.id, setRev, rev)}</span></label>
            <label><span className="small muted">Số điện thoại</span><input type="tel" inputMode="tel" autoComplete="off" value={String(h.tx_sdt ?? '')} disabled={!can} onChange={(e) => onField('tx_sdt', e.target.value)} /></label>
            {can && <InfoChip id="gh-cccd" label="Gemini tự đọc CCCD"><p>Chụp mặt trước CCCD: Gemini tự điền tên tài xế và số CCCD.</p><p>Số được mã hoá khi Lưu; chỉ người có quyền bấm con mắt xem đủ số và xem rõ ảnh. Mỗi lần xem được ghi nhật ký.</p></InfoChip>}</div>)}
          {k === 'gh_bbgh' && (() => { const w = [...sWarn.map((x) => 'PN: ' + x), ...bbWarn]; const any = bbPaths.length > 0 || sbbP.some((p) => bbOf(sh)[p]);
            return any ? (w.length ? <div className="msg warn gh-ai" role="status"><Icon name="alert" size={15} /><span>{w.join(' · ')}</span></div> : <div className="msg ok gh-ai" role="status"><Icon name="check" size={15} /><span>Số BBGH khớp số phiếu {String(h.so_phieu || sh.so_phieu || '')}</span></div>) : null; })()}
          <div className="gh-thumbs">
            {pnF.map((f) => thumb(f, lab, true, true))}
            {mine.map((f) => thumb(f, lab, false, seeCccd))}
            {can && <label className={'gh-add' + (mine.length || pnF.length ? '' : ' first')} aria-label={(touch ? 'Chụp ảnh ' : 'Tải ảnh ') + lab}>
              <Icon name="plus" size={20} /><span>{touch ? 'Chụp' : 'Tải ảnh'}</span>
              <input type="file" accept="image/*" {...(touch ? { capture: 'environment' as const } : {})} multiple={!touch} hidden disabled={!!busy} onChange={(e) => pick(e, k)} /></label>}
          </div>
          {busy && (k === 'gh_cccd' || k === 'gh_bbgh') && <small className="gh-busy" role="status"><span className="spin" aria-hidden="true" />{busy}</small>}
          {!busy && aiMsg && (k === 'gh_cccd' ? aiMsg.includes('CCCD') || aiMsg.includes('Tài xế') : k === 'gh_bbgh' && !aiMsg.includes('CCCD')) && <small className="gh-busy">{aiMsg}</small>}
        </div></li>; })}</ol>
  </section>;
}

/** Clone phiếu đã Thành công / Thất bại thành đơn mới (Admin / người Lập của công ty đó) */
function CloneBar({ b, d, onChanged }: { b: Batch; d: Doc; onChanged: () => void }) {
  const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false); const [, setSp] = useSearchParams();
  useEffect(() => { let live = true; setOk(false); sb.rpc('can_start', { p_proc: b.proc, p_co: d.company }).then(({ data }) => { if (live) setOk(!!data); }); return () => { live = false; }; }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ok) return null;
  const go = async () => {
    if (!(await confirmDialog('Tạo đơn mới chép toàn bộ thông tin của phiếu này (' + COMPANY[d.company as Company] + ' · ' + b.title + ')? Đơn mới bắt đầu lại từ bước đầu để chỉnh sửa.', 'Clone thành đơn mới'))) return;
    setBusy(true); const { data, error } = await sb.rpc('doc_clone', { p_doc: d.id }); setBusy(false);
    if (error) { toast(errText(error)); return; }
    toast('Đã tạo đơn mới từ ' + b.title);
    setSp((p) => { const n = new URLSearchParams(p); n.set('tab', b.proc); n.set('b', String(data)); n.set('co', d.company); return n; });
    onChanged();
  };
  return <div className={'pp-clone2' + (d.status === 'fail' ? ' fail' : '')}><span className="pp-clone2-ic" aria-hidden="true"><Icon name="copy" size={18} /></span>
    <span className="pp-clone2-t"><b>{d.status === 'fail' ? 'Phiếu thất bại' : 'Phiếu đã thành công'}</b><small>Làm lại với thông tin tương tự – hồ sơ mới bắt đầu từ bước đầu</small></span>
    <button type="button" className="cl-hero" disabled={busy} onClick={go}><Icon name="copy" size={16} />{busy ? 'Đang tạo…' : 'Clone thành hồ sơ mới'}</button></div>;
}

/** Chọn tấm từ QT0 đã duyệt để đưa vào QT1 */
function Qt0Pick({ src, onClose, onPick, label = 'Lấy từ QT0' }: { src: Row[]; onClose: () => void; onPick: (r: Row[]) => void; label?: string }) {
  const [sel, setSel] = useState<Set<number>>(() => new Set(src.map((_, i) => i))); const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase(); const vis = src.map((r, i) => ({ r, i })).filter(({ r }) => !ql || String(r.ma_tam ?? '').toLowerCase().includes(ql));
  const tog = (i: number) => setSel((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  return <Sheet head={<b>{label}</b>} sub={`${src.length} tấm · khớp theo Mã tấm, giữ đơn giá và ghi chú đã nhập`} label={label} onClose={onClose}>
    <div className="q0p">
      <div className="row" style={{ gap: 8 }}><input type="search" placeholder="Tìm mã tấm…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm mã tấm" style={{ flex: 1 }} />
        <button className="btn xs" onClick={() => setSel(new Set(src.map((_, i) => i)))}>Chọn hết</button><button className="btn xs" onClick={() => setSel(new Set())}>Bỏ hết</button></div>
      <ul className="q0p-l">{vis.map(({ r, i }) => <li key={i}><label><input type="checkbox" checked={sel.has(i)} onChange={() => tog(i)} />
        <b>{String(r.ma_tam ?? '')}</b><span className="small muted">{[r.day && r.day + 'mm', r.rong && r.dai && r.rong + '×' + r.dai, r.so_tam && r.so_tam + ' tấm', r.loai_gc].filter(Boolean).join(' · ')}</span></label></li>)}</ul>
      <div className="row" style={{ gap: 8 }}><button className="btn primary" disabled={!sel.size} onClick={() => onPick(src.filter((_, i) => sel.has(i)))}>Lấy {sel.size} tấm</button><button className="btn" onClick={onClose}>Huỷ</button></div>
    </div></Sheet>;
}

/** IPC / Hanwa: tạo phiếu Lập từ phiếu đã duyệt của công ty trước (khi tự tạo bị lỗi) – mỗi phiếu nguồn chỉ lấy 1 lần */
function PrevPick({ o, proc, co, prev, onClose, onDone }: { o: Order; proc: Proc; co: 'IPC' | 'HW'; prev: string; onClose: () => void; onDone: (id: string) => void }) {
  const [l, setL] = useState<{ doc_id: string; code: string; title: string; at: string; used_code: string | null }[] | null>(null); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { sb.rpc('prev_candidates', { p_order: o.id, p_proc: proc, p_co: co }).then(({ data, error }) => { if (error) setErr(errText(error)); setL((data ?? []) as never); }); }, [o.id, proc, co]);
  const nm = (c: string) => (c === 'HW' ? 'Hanwa' : c === 'PN' ? 'Phương Nam' : c);
  const go = async (id: string) => { setBusy(id); setErr(''); const { data, error } = await sb.rpc('doc_from_prev', { p_src: id }); setBusy('');
    if (error) setErr(errText(error)); else { toast('Đã tạo phiếu ' + nm(co) + ' từ phiếu ' + nm(prev)); onDone(data as string); } };
  return <Sheet head={<b>Tạo phiếu {nm(co)} từ phiếu {nm(prev)}</b>} sub={`Bình thường app tự tạo khi ${nm(prev)} duyệt xong. Dùng khi phiếu chưa được tạo tự động. Mỗi phiếu ${nm(prev)} chỉ lấy được 1 lần.`} label={'Tạo phiếu ' + nm(co)} onClose={onClose}>
    <div className="q0p">
      {l == null ? <p className="muted">Đang tải…</p> : !l.length ? <p className="muted">Chưa có phiếu {nm(prev)} nào đã duyệt cho {PROC_NAME[proc]} của đơn này.</p>
        : <ul className="q0p-l">{l.map((x) => <li key={x.doc_id}><div className={'pv-it' + (x.used_code ? ' used' : '')}>
          <span className="pv-t"><b>{x.code}</b><span className="small muted">{x.title} · duyệt {new Date(x.at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            {x.used_code && <span className="small pv-used"><Icon name="check" size={12} />Đã lấy → {x.used_code}</span>}</span>
          {!x.used_code && <button className="btn sm primary" disabled={!!busy} onClick={() => go(x.doc_id)}>{busy === x.doc_id ? 'Đang tạo…' : 'Tạo phiếu'}</button>}</div></li>)}</ul>}
      <Msg err={err} />
    </div></Sheet>;
}

/** Ô tiền (đơn vị đ): đang gõ hiện số thô, rời ô hiện dấu chấm hàng nghìn (1.250.000) */
const isMoneyCol = (c: { t: string; n?: boolean }) => !!c.n && /\(đ|đ\//.test(c.t);
function NumInput({ money, value, onFocus, onBlur, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { money?: boolean; value: string }) {
  const [f, setF] = useState(false);
  const raw = String(value ?? ''); const n = Number(raw.replace(',', '.'));
  const show = money && !f && raw.trim() !== '' && isFinite(n) ? n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : raw;
  return <input {...p} value={show} onFocus={(e) => { setF(true); onFocus?.(e); }} onBlur={(e) => { setF(false); onBlur?.(e); }} />;
}
