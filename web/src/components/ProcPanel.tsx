import { StepChecks, StepRings } from './StepChecks';
import { createPortal } from 'react-dom';
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
import { Journey } from './Journey';
import { advanceDoc } from '../lib/records';
import { ReviewPdf } from './Records';
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
  const [bid, setBid] = useState(''); const [co, setCo] = useState<Company | ''>('');
  const [creating, setCreating] = useState(autoNew);
  const load = useCallback(async () => {
    const { data: b } = await sb.from('batches').select('*').eq('order_id', o.id).eq('proc', proc).order('seq');
    const bs = (b as Batch[]) ?? []; setBatches(bs);
    if (bs.length) { const { data: d } = await sb.from('docs_v').select('*').in('batch_id', bs.map((x) => x.id)); setDocs((d as Doc[]) ?? []); } else setDocs([]);
  }, [o.id, proc]);
  useEffect(() => { load(); }, [load]);
  const B = batches?.find((x) => x.id === bid) ?? batches?.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches?.at(-1);
  const bDocs = docs.filter((d) => d.batch_id === B?.id);
  const cur = [...bDocs].sort((a, z) => COMPANIES.indexOf(z.company) - COMPANIES.indexOf(a.company))[0];
  const D = bDocs.find((d) => d.company === co) ?? (cur?.can_view === false ? bDocs.filter((x) => x.can_view !== false).at(-1) ?? cur : cur);
  if (!batches) return <div className="card muted">Đang tải {proc}…</div>;
  return (
    <div className="pp">
      <div className="pp-head">
        <div><h2 style={{ margin: 0 }} className="row"><QtTag qt={proc} /> {PROC_NAME[proc]}</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{proc === 'QT0' ? 'Chỉ Phương Nam CNC làm. Danh sách tấm đã duyệt là đầu vào (tuỳ chọn) của XNĐH.'
            : proc === 'QT1' ? 'Phương Nam lập → duyệt → IPC chép danh sách, đổi giá → duyệt → Hanwa → duyệt. Mỗi bên in bộ của mình cho khách ký.'
            : proc === 'QT2' ? 'Đầu vào là Excel lệnh gia công từ phần mềm sản xuất. Một đơn có thể chia nhiều lệnh. Cả 3 công ty đều lập hồ sơ.'
            : 'Mỗi đợt giao một phiếu, qua 3 công ty rồi khách ký nhận. Tổng các đợt khớp lệnh do phần mềm sản xuất kiểm.'}</p></div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{batches.length ? 'Mở ' + BATCH_WORD[proc] + ' mới' : 'Bắt đầu ' + proc}</button>
      </div>
      {creating && <NewBatch o={o} proc={proc} onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); setBid(id); setCo(''); load(); }} />}
      {batches.length === 0 ? <div className="empty"><Icon name="inbox" size={28} /><b>Chưa có hồ sơ {proc} cho đơn này</b><span className="small muted">Bấm “{'Bắt đầu ' + proc}” để mở.</span></div> : (<>
        {batches.length > 1 && <div className="pp-batches" role="tablist">{batches.map((b) => (
          <button key={b.id} role="tab" aria-selected={B?.id === b.id} className={B?.id === b.id ? 'on' : ''} onClick={() => { setBid(b.id); setCo(''); }}>
            {b.title}<span className={'pp-bs ' + b.status}>{b.status === 'dang_lam' ? 'đang làm' : b.status === 'cho_ky' ? 'chờ ký tay' : b.status === 'hoan_tat' ? 'xong' : b.status}</span></button>))}</div>}
        {B && <Chain proc={proc} b={B} docs={bDocs} sel={D?.company} onPick={setCo} />}
        {B && B.status === 'cho_ky' && <Final b={B} o={o} onDone={load} />}
        {B && B.status === 'hoan_tat' && proc !== 'QT0' && <div className="msg ok"><Icon name="check" size={18} /><span>{B.title}: đã xong cả 3 công ty và đã ký tay{B.final_files.length ? ' · ' : ''}{B.final_files.map((f) => <FileLink key={f.path} f={f} />)}</span></div>}
        {B && B.status === 'fail' && <div className="msg err"><Icon name="alert" size={18} /><span>{B.title}: Thất bại – đã dừng. {B.proc === 'QT0' ? 'Mở “lần bóc tách mới”' : 'Mở lượt mới'} nếu cần làm lại.</span></div>}
        {B && B.proc === 'QT2' && <Check5 b={B} />}
        {D && B && D.can_view === false && <div className="card lock-card"><Icon name="shield" size={22} /><div><b>Hồ sơ của {COMPANY[D.company]}</b><br />
          <span className="small muted">Bạn chỉ xem được hồ sơ của công ty mình. Tiến độ: {D.status === 'da_duyet' ? 'đã duyệt' : D.status === 'fail' ? 'thất bại' : 'đang xử lý'}.</span></div></div>}
        {D && B && D.can_view !== false && <DocView key={D.id + D.status} o={o} b={B} d={D} people={people} onChanged={load} />}
      </>)}
    </div>);
}

function Chain({ proc, b, docs, sel, onPick }: { proc: Proc; b: Batch; docs: Doc[]; sel?: Company; onPick: (c: Company) => void }) {
  if (proc === 'QT0') {
    const d = docs[0]; const i = d ? FLOW.QT0.indexOf(d.status) : -1; const done = d?.status === 'da_duyet';
    return <ol className="pp-chain">{FLOW.QT0.map((s, k) => <li key={s} className={done || k < i ? 'done' : k === i ? 'cur' : ''}><span className="dot">{done || k < i ? <Icon name="check" size={12} /> : k + 1}</span>{STATUS[s]}</li>)}
      <li className={done ? 'done' : d?.status === 'fail' ? 'bad' : ''}><span className="dot">{done ? <Icon name="check" size={12} /> : '★'}</span>{d?.status === 'fail' ? 'Fail' : 'DS tấm đã ký'}</li></ol>;
  }
  return (
    <ol className="pp-chain co">
      {COMPANIES.map((c) => { const d = docs.find((x) => x.company === c); const st = !d ? 'todo' : d.status === 'da_duyet' ? 'done' : 'cur';
        return <li key={c} className={'c-' + c + ' ' + st + (sel === c ? ' sel' : '')}>
          <button disabled={!d} onClick={() => onPick(c)}><span className="dot">{st === 'done' ? <Icon name="check" size={12} /> : c === 'PN' ? 1 : c === 'IPC' ? 2 : 3}</span>
            <b>{COMPANY[c]}</b><span className="small">{!d ? 'chưa tới' : STATUS[d.status]}</span></button></li>; })}
      <li className={b.status === 'hoan_tat' ? 'done' : b.status === 'cho_ky' ? 'cur' : 'todo'}><span className="dot">{b.status === 'hoan_tat' ? <Icon name="check" size={12} /> : '✍'}</span><b>{FINAL[proc]}</b><span className="small">ký tay</span></li>
    </ol>);
}

function Check5({ b }: { b: Batch }) {
  return <details className="pp-ck"><summary><Icon name="check" size={15} /> Đủ 5 điều kiện (tích khi lập lệnh)</summary>
    <ul>{CHECK5.map((t, i) => <li key={t}><Icon name={b.checklist['c' + (i + 1)] ? 'check' : 'x'} size={14} />{t}</li>)}</ul></details>;
}

function NewBatch({ o, proc, onClose, onDone }: { o: Order; proc: Proc; onClose: () => void; onDone: (id: string) => void }) {
  const [title, setTitle] = useState(''); const [use0, setUse0] = useState(true); const [ck, setCk] = useState<Record<string, boolean>>({}); const [err, setErr] = useState('');
  const n = Object.values(ck).filter(Boolean).length;
  const go = async () => {
    setErr('');
    const { data, error } = await sb.rpc('batch_create', { p_order: o.id, p_proc: proc, p_title: title, p_opts: proc === 'QT1' ? { use_qt0: use0 } : proc === 'QT2' ? { checklist: ck } : {} });
    if (error) setErr(errText(error)); else { toast('Đã mở ' + proc); onDone(data as string); }
  };
  return (
    createPortal(<div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Mở {BATCH_WORD[proc]} mới · {o.code}</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <label className="f">Tên (để trống thì tự đánh số)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={proc === 'QT2' ? 'Ví dụ: Lệnh 1 – 250 tấm' : proc === 'QT3' ? 'Ví dụ: Đợt 1 – 50 tấm' : ''} /></label>
      {proc === 'QT1' && <label className="ck-item"><input type="checkbox" checked={use0} onChange={() => setUse0(!use0)} /><span>Lấy danh sách tấm từ QT0 đã duyệt <span className="small muted">(tắt khi phải tách đơn: khác giá cong/thẳng, hàn/không hàn, đơn quá lớn)</span></span></label>}
      {proc === 'QT2' && <div className="f">Đủ 5 điều kiện mới được lập lệnh ({n}/5)
        {CHECK5.map((t, i) => <label key={t} className={'ck-item' + (ck['c' + (i + 1)] ? ' on' : '')}><input type="checkbox" checked={!!ck['c' + (i + 1)]} onChange={() => setCk({ ...ck, ['c' + (i + 1)]: !ck['c' + (i + 1)] })} /><span>{t}</span></label>)}</div>}
      {err && <div className="msg err"><Icon name="alert" size={18} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn primary" disabled={proc === 'QT2' && n < 5} onClick={go}>{proc === 'QT2' && n < 5 ? 'Chưa đủ 5 điều kiện · chờ' : 'Mở ' + BATCH_WORD[proc]}</button></div>
    </div></div>, document.body));
}

function FileLink({ f }: { f: { name: string; path: string } }) {
  const open = async () => { const { data } = await sb.storage.from('files').createSignedUrl(f.path, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); };
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

function DocView({ o, b, d, people, onChanged }: { o: Order; b: Batch; d: Doc; people: Record<string, Profile>; onChanged: () => void }) {
  const proc = b.proc;
  const [can, setCan] = useState(false);
  const [h, setH] = useState<Record<string, string>>(d.header ?? {}); const [t, setT] = useState<Record<string, Row[]>>(d.tables ?? {}); const [files, setFiles] = useState(d.files ?? []);
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState<'' | 'back' | 'fail'>(''); const [why, setWhy] = useState('');
  useEffect(() => { sb.rpc('can_act', { p_doc: d.id }).then(({ data }) => setCan(!!data)); }, [d.id, d.status]);
  const [lvs, setLvs] = useState<{ id: string; name: string; user_id: string | null; group_id: string | null; sla_h: number }[]>([]);
  const apv = (d as Doc & { apv?: { queue: string[]; idx: number } }).apv;
  useEffect(() => { if (apv?.queue?.length) sb.from('approval_levels').select('id, name, user_id, group_id, sla_h').in('id', apv.queue).then(({ data }) => setLvs((data as never[]) ?? [])); }, [apv?.queue?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const lvName = d.status === 'duyet_them' && apv ? lvs.find((l) => l.id === apv.queue[apv.idx])?.name : undefined;
  useFields();
  const pm = (f: FDef) => permOf(f, d.company, d.status, proc);
  const adm = useAuth().can('admin_it');
  const canEd = (f: FDef) => (adm && !f.sys) || (can && (pm(f) === 'edit' || pm(f) === 'required'));
  const hid = new Set(d.hidden ?? []); // trường bị ẩn theo phân quyền (máy chủ đã xoá giá trị)
  const hFields = fieldsOf(proc, 'header').filter((f) => pm(f) !== 'hide' && !hid.has('h:' + f.key));
  // Gợi ý địa chỉ giao: địa chỉ của bên nhận (PN→IPC, IPC→Hanwa, Hanwa→khách cuối)
  const [ship, setShip] = useState<string[]>([]); const [carriers, setCarriers] = useState<Customer[]>([]);
  const hasCarrier = hFields.some((f) => f.type === 'carrier');
  useEffect(() => { if (hasCarrier) sb.from('customers').select('*').in('kind', ['van_chuyen', 'noi_bo']).eq('active', true).order('name').then(({ data }) => setCarriers((data as Customer[]) ?? [])); }, [proc, hasCarrier]); // eslint-disable-line react-hooks/exhaustive-deps
  const plates = carriers.find((c) => c.id === h.dvvc)?.vehicles ?? [];
  useEffect(() => { if (!hFields.some((f) => f.key === 'dia_diem' || f.key === 'dk_giao')) return;
    sb.from('customers').select('*').then(({ data }) => { const cs = (data as Customer[]) ?? []; const { buyer } = parties(o, d.company, proc, cs);
      setShip([...(buyer?.ship_addresses ?? []), buyer?.address ?? ''].filter(Boolean)); }); }, [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const fFields = fieldsOf(proc, 'file').filter((f) => pm(f) !== 'hide');
  const tblDefs = PROC_TABLES[proc].map(([key, def]) => { const fs = fieldsOf(proc, 'col', key);
    const cols = colsOf(proc, key).flatMap((c) => { const f = fs.find((x) => x.key === c.k)!; const p = pm(f); return p === 'hide' || hid.has(key + ':' + c.k) ? [] : [{ ...c, ro: !adm && !(p === 'edit' || p === 'required'), req: p === 'required' }]; });
    const tf = fieldsOf(proc, 'table').find((x) => x.key === key); const treq = !!tf && pm(tf) === 'required';
    return { key, title: TABLES[def].t, treq, cols, ed: adm || (can && cols.some((c) => !c.ro && !c.calc) && (proc !== 'QT0' || d.status !== 'tiep_nhan')) }; });
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
  const act = async (action: 'next' | 'back' | 'fail', n = '') => {
    setErr(''); setBusy(true);
    if (editable && dirty && !(await save(true))) { setBusy(false); return; }
    try {
      const r = await advanceDoc(o, b, { ...d, ...h0(d) }, action, n); setBusy(false);
      toast(action === 'next' ? 'Đã ký → ' + (STATUS[r.next] ?? r.next) : action === 'back' ? 'Đã trả về' : 'Đã đánh Thất bại'); if (r.warn) setTimeout(() => toast(r.warn!), 1500);
      setAsk(''); setWhy(''); onChanged();
    } catch (e) { setBusy(false); setErr(errText(e as Error)); }
  };
  const addNote = async () => { const { error } = await sb.rpc('doc_note', { p_doc: d.id, p_text: note }); if (error) setErr(errText(error)); else { setNote(''); onChanged(); } };
  const persist = async (nf: typeof files, msg: string) => { setFiles(nf); const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: h, p_tables: t, p_files: nf }); if (error) { setErr(errText(error)); return false; } toast(msg); return true; };
  const removeFile = async (path: string, name: string) => {
    if (!(await confirmDialog(`Gỡ file “${name}”?`, 'Gỡ file'))) return;
    if (await persist(files.filter((x) => x.path !== path), 'Đã gỡ ' + name)) sb.storage.from('files').remove([path]);
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>, kind: string, replace = false) => {
    const old = replace ? files.filter((x) => x.kind === kind) : [];
    const nf = files.filter((x) => !old.includes(x));
    for (const file of Array.from(e.target.files ?? [])) {
      const path = `${o.id}/${b.id}/${d.company}/${Date.now()}-${safeName(file.name)}`;
      const r = await sb.storage.from('files').upload(path, file); if (r.error) { setErr(errText(r.error)); return; }
      nf.push({ kind, name: file.name, path, at: new Date().toISOString() });
    }
    e.target.value = '';
    if (await persist(nf, replace ? 'Đã thay file' : 'Đã tải file') && old.length) sb.storage.from('files').remove(old.map((x) => x.path));
  };
  const who = (id?: string) => (id ? people[id]?.full_name ?? '…' : '');
  const first = FLOW[proc][0] === d.status;
  const role = ROLE_OF[d.status];

  return (
    <section className="card pp-doc">
      <div className="pp-doc-head">
        <div><b style={{ fontSize: 17 }}>{proc === 'QT0' ? b.title : COMPANY[d.company] + ' · ' + b.title}</b>
          <div className="small muted">Bước: <b>{d.status === 'duyet_them' ? lvName ?? 'Duyệt thêm' : STATUS[d.status]}</b>{role ? ' · phụ trách: ' + ROLE_NAME[role] : ''} · từ {dt(d.status_at)}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {editable && <button className="btn xs" disabled={!dirty} onClick={() => save()}><Icon name="check" size={13} />{dirty ? 'Lưu' : 'Đã lưu'}</button>}
          <PrintTplButton o={o} b={b} d={d} people={people} fallback={() => printDoc(o, b, d, people)} />
          <button className="btn xs icon-only" title="In bản mặc định của app (không theo mẫu Excel)" aria-label="In bản mặc định" onClick={() => printDoc(o, b, d, people)}><Icon name="file" size={13} /></button>
          {adm && editable && d.status !== 'da_duyet' && <button className="btn xs icon-only" title="Admin: nạp dữ liệu mẫu vào ô trống & bảng trống" aria-label="Nạp dữ liệu mẫu" onClick={fillDemo}><Icon name="bolt" size={13} /></button>}
        </div>
      </div>
      {d.status === 'da_duyet' && proc !== 'QT0' && <div className="pt-cta"><PrintTplButton o={o} b={b} d={d} people={people} big /></div>}
      {adm && (d.status === 'da_duyet' || !FLOW[proc].slice(0, proc === 'QT0' ? 3 : 1).includes(d.status)) && <div className="msg warn"><Icon name="shield" size={16} /><span>Bạn đang sửa với quyền Admin{d.status === 'da_duyet' ? ' trên phiếu đã duyệt' : ''}. Mọi thay đổi được ghi vào lịch sử đơn hàng.</span></div>}
      {!can && !adm && d.status !== 'da_duyet' && d.status !== 'fail' && <div className="msg info"><Icon name="eye" size={16} /><span>Bạn đang xem. Bước này do người phụ trách “{ROLE_NAME[role]}” của {COMPANY[d.company]} làm (Quản trị → Người phụ trách quy trình).</span></div>}

      <StepRings proc={proc} d={d} />
      {d.status !== 'da_duyet' && d.status !== 'fail' && <StepChecks proc={proc} d={d} people={people} canEdit={can || adm} onChanged={onChanged} live={{ header: h, tables: t as never, files }} />}
      <ReviewPdf docId={d.id} status={d.status} />
      <div className="grid2">
        {hFields.map((f) => { const ed = canEd(f); const v = h[f.key] ?? ''; const on = (x: string) => { setH({ ...h, [f.key]: x }); setDirty(true); };
          return <label key={f.key} className={'f' + (f.type === 'textarea' ? ' f-wide' : '')}><span>{f.label}{pm(f) === 'required' && <b className="req" aria-label="bắt buộc"> *</b>}</span>
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

      <div className="pp-files">
        {fFields.map(({ key: k, label: lab, ...f }) => (
          <div key={k} className="pp-fk"><span className="small"><b>{lab}</b>{pm({ key: k, label: lab, ...f } as FDef) === 'required' && <b className="req"> *</b>}</span>
            <span className="row" style={{ gap: 6 }}>{(() => { const ed = canEd({ key: k, label: lab, ...f } as FDef); const mine = files.filter((x) => x.kind === k); return <>
              {mine.map((x) => <span key={x.path} className="row" style={{ gap: 2 }}><FileLink f={x} />
                {ed && <button className="btn xs icon-only" title={'Gỡ ' + x.name} aria-label={'Gỡ ' + x.name} onClick={() => removeFile(x.path, x.name)}><Icon name="trash" size={13} /></button>}</span>)}
              {mine.length === 0 && <span className="small muted">chưa có</span>}
              {ed && mine.length > 0 && <label className="btn xs" title="Thay toàn bộ file hiện có bằng file mới"><Icon name="refresh" size={13} />Thay<input type="file" multiple hidden onChange={(e) => upload(e, k, true)} /></label>}
              {ed && <label className="btn xs" title={mine.length ? 'Thêm file' : 'Tải file lên'}><Icon name="upload" size={13} />{mine.length ? 'Thêm' : 'Tải lên'}<input type="file" multiple hidden onChange={(e) => upload(e, k)} /></label>}</>; })()}</span></div>))}
      </div>

      {tblDefs.map(({ key, title, cols, ed, treq }) => (
        <TableEdit key={key} title={title} req={treq} cols={cols} rows={t[key] ?? []} editable={ed}
          onChange={(rows) => { setT({ ...t, [key]: rows }); setDirty(true); }} fname={`${o.code}-${proc}-${key}`} />))}
      {proc === 'QT1' && !hid.has('ds:don_gia') && <Qt1Total rows={t.ds ?? []} vat={numIn(h.vat) ?? 8} />}
      {proc === 'QT2' && <Qt2Loss nl={t.nl ?? []} tp={t.tp ?? []} />}

      <div className="pp-notes">
        <b>Ghi chú nối tiếp</b>
        {d.notes.length === 0 && <span className="small muted">Chưa có ghi chú.</span>}
        {d.notes.map((n, i) => <div key={i} className="pp-note"><span className="small muted">{ROLE_NAME[n.role] ?? n.role} · {who(n.user)} · {dt(n.at)}</span><div>{n.text}</div></div>)}
        {can && <div className="row"><input style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thêm ghi chú (yêu cầu đặc biệt, vấn đề kỹ thuật, lưu ý…)" />
          <button className="btn sm" disabled={!note.trim()} onClick={addNote}>Ghi</button></div>}
      </div>

      <div className="pp-signs">
        {(proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet']).map((r) => {
          const s = [...d.signs].reverse().find((x) => x.role === r && x.action === 'ky');
          return <div key={r} className={'pp-sign' + (s ? ' on' : '')}><span className="small muted">{r === 'admin' ? 'Người tạo' : ROLE_NAME[r]}</span>{s ? <><b>{who(s.user)}</b><span className="small muted">{dt(s.at)}</span></> : <span className="small muted">chưa ký</span>}</div>;
        })}
      </div>

      {err && <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>}
      {can && !['da_duyet', 'fail'].includes(d.status) && (
        <div className="pp-act">
          {ask ? (<div className="pp-ask">
            <label className="f">{ask === 'fail' ? 'Lý do thất bại – dừng hẳn lượt này (hao hụt lớn, vượt dự toán, khách huỷ…)' : 'Lý do trả về'} *<textarea rows={2} autoFocus value={why} onChange={(e) => setWhy(e.target.value)} /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setAsk('')}>Huỷ</button>
              <button className="btn rt-go" disabled={!why.trim() || busy} onClick={() => act(ask, why.trim())}>{ask === 'fail' ? 'Xác nhận Thất bại' : 'Trả về'}</button></div></div>) : (<>
            <SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} />
            {!first && <button className="btn kb-back" onClick={() => setAsk('back')}><Icon name="back" size={16} />Trả về</button>}
            {(d.status === 'duyet' || d.status === 'duyet_them') && <button className="btn rt-go" onClick={() => setAsk('fail')}><Icon name="x" size={16} />Thất bại</button>}
            <button className="btn primary" disabled={busy} onClick={() => act('next')}><Icon name="check" size={16} />{busy ? 'Đang ký…' : (d.status === 'duyet_them' ? 'Duyệt (' + (lvName ?? 'cấp thêm') + ')' : NEXT_LABEL[d.status] ?? 'Ký') + ((d.status === 'duyet' || d.status === 'duyet_them') && proc !== 'QT0' ? (d.company === 'HW' ? ' → chờ ký tay' : ' → chuyển ' + COMPANY[d.company === 'PN' ? 'IPC' : 'HW']) : '')}</button></>)}
        </div>)}
      {editable && !(can && !['da_duyet', 'fail'].includes(d.status)) && <div className="pp-act"><SaveState editable={editable} dirty={dirty} busy={busy} onSave={() => save()} /></div>}
      <Journey d={d} proc={proc} people={people} />
    </section>);
}

/** Trạng thái lưu + nút Lưu nháp cạnh nút Ký */
function SaveState({ editable, dirty, busy, onSave }: { editable: boolean; dirty: boolean; busy: boolean; onSave: () => void }) {
  if (!editable) return null;
  return <span className="pp-save">
    <span className={'pp-dirty' + (dirty ? ' on' : '')} role="status">{dirty ? <><i aria-hidden="true" />Có thay đổi chưa lưu</> : <><Icon name="check" size={14} />Đã lưu</>}</span>
    <button className="btn" disabled={!dirty || busy} onClick={onSave}>Lưu nháp</button></span>;
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
  const clearAll = async () => { if (await confirmDialog(`Xoá hết ${rows.length} dòng của bảng “${title}”? (Chưa lưu thì bấm Huỷ thay đổi để lấy lại)`, 'Xoá hết')) onChange([]); };
  const addSample = () => { onChange([...rows, ...[0, 1, 2].map((i) => Object.fromEntries(inCols.map((c) => [c.k, String(sampleRow(c, i))])) as Row)]); setMsg('Đã nạp 3 dòng mẫu – kiểm tra rồi bấm Lưu'); };
  return (
    <div className="pp-tbl" onPaste={editable ? pasteAny : undefined}>
      <div className="row between pp-th"><b>{title}{req && <span className="req-star" title="Bắt buộc có ít nhất 1 dòng trước khi ký"> *</span>} <span className="small muted">· {rows.length} dòng</span></b>
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
        <input autoFocus value={hdr.v} inputMode="decimal" onChange={(e) => setHdr({ ...hdr, v: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && hdr.v.trim()) applyCol(hdr.k, hdr.v); if (e.key === 'Escape') setHdr(null); }} placeholder="Nhập giá trị" />
        <button className="btn sm primary" disabled={!hdr.v.trim()} onClick={() => applyCol(hdr.k, hdr.v)}>Áp dụng tất cả</button>
        <button className="btn sm" disabled={!hdr.v.trim()} onClick={() => applyCol(hdr.k, hdr.v, true)}>Chỉ ô trống</button>
        <button className="btn sm icon-btn" onClick={() => setHdr(null)} aria-label="Đóng"><Icon name="x" size={15} /></button></div>}
      {fill && !hdr && <div className="fill-bar sug" role="status">
        <span className="fill-t"><Icon name="list" size={15} /><span>Áp dụng <b>{fill.v}</b> cho cả {rows.length} dòng · <b>{colT(fill.k)}</b>?</span></span>
        <button className="btn sm primary" onClick={() => applyCol(fill.k, fill.v)}>Tất cả</button>
        {rows.some((r) => !String(r[fill.k] ?? '').trim()) && <button className="btn sm" onClick={() => applyCol(fill.k, fill.v, true)}>Chỉ ô trống</button>}
        <button className="btn sm icon-btn" onClick={() => setFill(null)} aria-label="Bỏ qua"><Icon name="x" size={15} /></button></div>}
      <div className="tbl-wrap"><table className="tbl pp-grid">
        <thead><tr><th>#</th>{cols.map((c) => <th key={c.k} className={c.n ? 'n' : 't'}>{editable && !c.calc && !c.ro && FILL_COLS.includes(c.k) && rows.length > 1
          ? <button className="th-fill" onClick={() => setHdr(hdr?.k === c.k ? null : { k: c.k, v: String(rows.find((r) => String(r[c.k] ?? '').trim())?.[c.k] ?? '') })} title={'Đặt cùng giá trị cho cả cột ' + c.t} aria-label={'Đặt chung cột ' + c.t}>
              {c.t}{c.req && <b className="req"> *</b>}<Icon name="list" size={12} /></button> : <>{c.t}{c.req && <b className="req"> *</b>}</>}</th>)}{editable && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}><td className="muted">{i + 1}</td>
            {cols.map((c) => <td key={c.k} className={c.n ? 'n' : 't'}>{c.calc ? <span className="calc">{fmtN(c.calc(r), c.d ?? 0)}</span>
              : editable && !c.ro ? <input onPaste={(e) => pasteAt(e, i, c.k)} value={typeof r[c.k] === 'number' ? String(Math.round((r[c.k] as number) * 1e6) / 1e6) : String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} aria-invalid={c.n && !isNumOk(r[c.k]) ? true : undefined} title={c.n && !isNumOk(r[c.k]) ? c.t + ' phải là số' : undefined} onChange={(e) => set(i, c.k, c.n ? numTyping(e.target.value) : e.target.value)} onBlur={(e) => offer(c.k, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} className={c.n ? 'num' : undefined} style={{ minWidth: wOf(c) + 'ch' }} />
              : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '')}</td>)}
            {editable && <td><button className="link-btn" aria-label="Bỏ dòng" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}</tr>)}
          {editable && rows.length === 0 && <tr><td colSpan={cols.length + 2}><div className="pp-dropzone" tabIndex={0} role="textbox" aria-label="Dán dữ liệu từ Excel">
            <Icon name="copy" size={16} /><span><b>Bấm vào đây rồi nhấn Ctrl+V</b> để dán các dòng đã chép từ Excel <span className="muted">(có hoặc không có dòng tiêu đề)</span></span></div></td></tr>}
          {editable && <tr><td colSpan={cols.length + 2}><button className="link-btn" onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Thêm dòng</button></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td colSpan={2} className="pp-tot-lb">Tổng <span>{rows.length} dòng</span></td>{cols.slice(1).map((c) => <td key={c.k} className={c.n ? 'n' : ''}>{c.k in totals ? <b>{fmtN(totals[c.k], c.d ?? 0)}</b> : null}</td>)}{editable && <td />}</tr></tfoot>}
      </table></div>
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
  const meta = [['Mã đơn hàng', o.code], ['Dự án', o.project], ...hdrOf(b.proc).map(([k, l]) => [l, d.header[k] ?? ''])];
  const tbl = PROC_TABLES[b.proc].map(([key, def]) => { const T = { t: TABLES[def].t, cols: colsOf(b.proc, key) }; const rows = d.tables[key] ?? [];
    return `<h3>${esc(T.t)}</h3><table><tr><th>STT</th>${T.cols.map((c) => `<th>${esc(c.t)}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><td>${i + 1}</td>${T.cols.map((c) => `<td class="${c.n ? 'n' : ''}">${esc(c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : r[c.k])}</td>`).join('')}</tr>`).join('')}
      <tr class="t"><td></td>${T.cols.map((c, j) => `<td class="n">${j === 0 ? 'TỔNG' : ['so_tam', 'm2', 'kg', 'tt'].includes(c.k) ? fmtN(sumOf(rows, c), c.d ?? 0) : ''}</td>`).join('')}</tr></table>`; }).join('');
  const roles = b.proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet'];
  const sig = roles.map((r) => { const s = [...d.signs].reverse().find((x) => x.role === r && x.action === 'ky');
    return `<td><b>${r === 'admin' ? 'Người tạo' : ROLE_NAME[r]}</b><br><small>ký điện tử</small><div class="sp">${s ? '✔ ' + esc(who(s.user)) + '<br><small>' + esc(dt(s.at)) + '</small>' : ''}</div></td>`; }).join('');
  const hand = b.proc === 'QT1' ? ['Khách hàng xác nhận (ký, đóng dấu)'] : b.proc === 'QT2' ? ['Người bàn giao vật liệu', 'Người nhận vật liệu'] : b.proc === 'QT3' ? ['Thủ kho / người giao', 'Tài xế', 'Khách hàng nhận hàng'] : [];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.code)} ${b.proc} ${esc(COMPANY[d.company])}</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap"><style>
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
  const w = window.open('', '_blank'); if (!w) return; w.document.write(docHtml(o, b, d, people, true)); w.document.close();
}
