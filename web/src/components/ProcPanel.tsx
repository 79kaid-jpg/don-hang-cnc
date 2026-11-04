import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb, errText, type Order, type Profile } from '../lib/supabase';
import { dt, num as fnum } from '../lib/format';
import {
  BATCH_WORD, CHECK5, COMPANIES, COMPANY, FINAL, FLOW, HEADER, NEXT_LABEL, PROC_NAME, PROC_TABLES, ROLE_NAME, ROLE_OF, STATUS, TABLES,
  sumOf, numIn, type Batch, type Col, type Company, type Doc, type Proc, type Row
} from '../lib/proc';
import { Icon } from './Icon';
import { Journey } from './Journey';
import { QtTag } from './QtTag';
import { toast } from './ui';

const fmtN = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? '' : fnum(v, d));

/** Một quy trình của một đơn: danh sách hồ sơ (lần / lệnh / đợt) → chuỗi công ty → bản đang chọn */
export default function ProcPanel({ o, proc, people }: { o: Order; proc: Proc; people: Record<string, Profile> }) {
  const [batches, setBatches] = useState<Batch[] | null>(null); const [docs, setDocs] = useState<Doc[]>([]);
  const [bid, setBid] = useState(''); const [co, setCo] = useState<Company | ''>('');
  const [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    const { data: b } = await sb.from('batches').select('*').eq('order_id', o.id).eq('proc', proc).order('seq');
    const bs = (b as Batch[]) ?? []; setBatches(bs);
    if (bs.length) { const { data: d } = await sb.from('docs').select('*').in('batch_id', bs.map((x) => x.id)); setDocs((d as Doc[]) ?? []); } else setDocs([]);
  }, [o.id, proc]);
  useEffect(() => { load(); }, [load]);
  const B = batches?.find((x) => x.id === bid) ?? batches?.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky').at(-1) ?? batches?.at(-1);
  const bDocs = docs.filter((d) => d.batch_id === B?.id);
  const cur = [...bDocs].sort((a, z) => COMPANIES.indexOf(z.company) - COMPANIES.indexOf(a.company))[0];
  const D = bDocs.find((d) => d.company === co) ?? cur;
  if (!batches) return <div className="card muted">Đang tải {proc}…</div>;
  return (
    <div className="pp">
      <div className="pp-head">
        <div><h2 style={{ margin: 0 }} className="row"><QtTag qt={proc} /> {PROC_NAME[proc]}</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>{proc === 'QT0' ? 'Chỉ Phương Nam CNC làm. Danh sách tấm đã duyệt là đầu vào (tuỳ chọn) của XNĐH.'
            : proc === 'QT1' ? 'Phương Nam lập → duyệt → IPC chép danh sách, đổi giá → duyệt → Hanwha → duyệt. Mỗi bên in bộ của mình cho khách ký.'
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
        {B && B.status === 'fail' && <div className="msg err"><Icon name="alert" size={18} /><span>{B.title}: Fail. Mở “lần bóc tách mới” nếu cần làm lại.</span></div>}
        {B && B.proc === 'QT2' && <Check5 b={B} />}
        {D && B && <DocView key={D.id + D.status} o={o} b={B} d={D} people={people} onChanged={load} />}
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
        return <li key={c} className={st + (sel === c ? ' sel' : '')}>
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
    <div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Mở {BATCH_WORD[proc]} mới · {o.code}</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <label className="f">Tên (để trống thì tự đánh số)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={proc === 'QT2' ? 'Ví dụ: Lệnh 1 – 250 tấm' : proc === 'QT3' ? 'Ví dụ: Đợt 1 – 50 tấm' : ''} /></label>
      {proc === 'QT1' && <label className="ck-item"><input type="checkbox" checked={use0} onChange={() => setUse0(!use0)} /><span>Lấy danh sách tấm từ QT0 đã duyệt <span className="small muted">(tắt khi phải tách đơn: khác giá cong/thẳng, hàn/không hàn, đơn quá lớn)</span></span></label>}
      {proc === 'QT2' && <div className="f">Đủ 5 điều kiện mới được lập lệnh ({n}/5)
        {CHECK5.map((t, i) => <label key={t} className={'ck-item' + (ck['c' + (i + 1)] ? ' on' : '')}><input type="checkbox" checked={!!ck['c' + (i + 1)]} onChange={() => setCk({ ...ck, ['c' + (i + 1)]: !ck['c' + (i + 1)] })} /><span>{t}</span></label>)}</div>}
      {err && <div className="msg err"><Icon name="alert" size={18} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={onClose}>Huỷ</button>
        <button className="btn primary" disabled={proc === 'QT2' && n < 5} onClick={go}>{proc === 'QT2' && n < 5 ? 'Chưa đủ 5 điều kiện · chờ' : 'Mở ' + BATCH_WORD[proc]}</button></div>
    </div></div>);
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
      const path = `${o.id}/${b.id}/ky-tay/${Date.now()}-${file.name}`;
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
  const editable = can && (proc === 'QT0' ? ['tiep_nhan', 'boc_tach', 'tao_ds'].includes(d.status) : d.status === 'lap');
  const totalOf = (): string | undefined => { if (proc !== 'QT1') return undefined; const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const sm = sumOf(t.ds ?? [], c); const v = numIn(h.vat) ?? 8; return String(Math.round(sm + sm * v / 100)); };
  const save = async (quiet = false) => {
    const hh = totalOf() != null ? { ...h, tong_tt: totalOf()! } : h;
    const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: hh, p_tables: t, p_files: files });
    if (error) { setErr(errText(error)); return false; } setDirty(false); if (!quiet) toast('Đã lưu'); return true;
  };
  const act = async (action: 'next' | 'back' | 'fail', n = '') => {
    setErr(''); setBusy(true);
    if (editable && dirty && !(await save(true))) { setBusy(false); return; }
    const { data, error } = await sb.rpc('doc_advance', { p_doc: d.id, p_action: action, p_note: n });
    setBusy(false);
    if (error) setErr(errText(error)); else { toast(action === 'next' ? 'Đã ký → ' + (STATUS[data as string] ?? data) : action === 'back' ? 'Đã trả về' : 'Đã đánh Fail'); setAsk(''); setWhy(''); onChanged(); }
  };
  const addNote = async () => { const { error } = await sb.rpc('doc_note', { p_doc: d.id, p_text: note }); if (error) setErr(errText(error)); else { setNote(''); onChanged(); } };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>, kind: string) => {
    const nf = [...files];
    for (const file of Array.from(e.target.files ?? [])) {
      const path = `${o.id}/${b.id}/${d.company}/${Date.now()}-${file.name}`;
      const r = await sb.storage.from('files').upload(path, file); if (r.error) { setErr(errText(r.error)); return; }
      nf.push({ kind, name: file.name, path, at: new Date().toISOString() });
    }
    setFiles(nf); const { error } = await sb.rpc('doc_save', { p_doc: d.id, p_header: h, p_tables: t, p_files: nf }); if (error) setErr(errText(error)); else toast('Đã tải file');
  };
  const who = (id?: string) => (id ? people[id]?.full_name ?? '…' : '');
  const first = FLOW[proc][0] === d.status;
  const role = ROLE_OF[d.status];
  const kinds = proc === 'QT0' ? [['ban_ve', 'Bản vẽ / tài liệu khách gửi'], ['excel', 'Excel bóc tách chi tiết (bắt buộc)']] : [['dinh_kem', 'File đính kèm (Excel từ phần mềm SX…)']];
  return (
    <section className="card pp-doc">
      <div className="pp-doc-head">
        <div><b style={{ fontSize: 17 }}>{proc === 'QT0' ? b.title : COMPANY[d.company] + ' · ' + b.title}</b>
          <div className="small muted">Bước: <b>{d.status === 'duyet_them' ? lvName ?? 'Duyệt thêm' : STATUS[d.status]}</b>{role ? ' · phụ trách: ' + ROLE_NAME[role] : ''} · từ {dt(d.status_at)}</div></div>
        <div className="row" style={{ gap: 6 }}>
          {editable && <button className="btn sm" disabled={!dirty} onClick={() => save()}><Icon name="check" size={15} />{dirty ? 'Lưu' : 'Đã lưu'}</button>}
          <button className="btn sm" onClick={() => printDoc(o, b, d, people)}><Icon name="print" size={15} />In / PDF</button>
        </div>
      </div>
      <Journey d={d} proc={proc} people={people} />
      {!can && d.status !== 'da_duyet' && d.status !== 'fail' && <div className="msg info"><Icon name="eye" size={16} /><span>Bạn đang xem. Bước này do người phụ trách “{ROLE_NAME[role]}” của {COMPANY[d.company]} làm (Quản trị → Người phụ trách quy trình).</span></div>}

      <div className="grid2">
        {HEADER[proc].map(([k, lab, ty]) => (
          <label key={k} className="f">{lab}<input type={ty === 'date' ? 'date' : 'text'} inputMode={ty === 'num' ? 'decimal' : undefined} disabled={!editable}
            value={h[k] ?? ''} onChange={(e) => { setH({ ...h, [k]: e.target.value }); setDirty(true); }} /></label>))}
      </div>

      <div className="pp-files">
        {kinds.map(([k, lab]) => (
          <div key={k} className="pp-fk"><span className="small"><b>{lab}</b></span>
            <span className="row" style={{ gap: 6 }}>{files.filter((f) => f.kind === k).map((f) => <FileLink key={f.path} f={f} />)}
              {files.filter((f) => f.kind === k).length === 0 && <span className="small muted">chưa có</span>}
              {editable && <label className="btn sm"><Icon name="upload" size={14} />Tải lên<input type="file" multiple hidden onChange={(e) => upload(e, k)} /></label>}</span></div>))}
      </div>

      {PROC_TABLES[proc].map(([key, def]) => (
        <TableEdit key={key} title={TABLES[def].t} cols={TABLES[def].cols} rows={t[key] ?? []} editable={editable && (proc !== 'QT0' || d.status !== 'tiep_nhan')}
          onChange={(rows) => { setT({ ...t, [key]: rows }); setDirty(true); }} fname={`${o.code}-${proc}-${key}`} />))}
      {proc === 'QT1' && <Qt1Total rows={t.ds ?? []} vat={numIn(h.vat) ?? 8} />}
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
            <label className="f">{ask === 'fail' ? 'Lý do Fail (hao hụt lớn, vượt dự toán, không sản xuất được…)' : 'Lý do trả về'} *<textarea rows={2} autoFocus value={why} onChange={(e) => setWhy(e.target.value)} /></label>
            <div className="row" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setAsk('')}>Huỷ</button>
              <button className="btn rt-go" disabled={!why.trim() || busy} onClick={() => act(ask, why.trim())}>{ask === 'fail' ? 'Đánh Fail' : 'Trả về'}</button></div></div>) : (<>
            {!first && <button className="btn kb-back" onClick={() => setAsk('back')}><Icon name="back" size={16} />Trả về</button>}
            {proc === 'QT0' && d.status === 'duyet' && <button className="btn rt-go" onClick={() => setAsk('fail')}><Icon name="x" size={16} />Từ chối · Fail</button>}
            <button className="btn primary" disabled={busy} onClick={() => act('next')}><Icon name="check" size={16} />{busy ? 'Đang ký…' : (d.status === 'duyet_them' ? 'Duyệt (' + (lvName ?? 'cấp thêm') + ')' : NEXT_LABEL[d.status] ?? 'Ký') + ((d.status === 'duyet' || d.status === 'duyet_them') && proc !== 'QT0' ? (d.company === 'HW' ? ' → chờ ký tay' : ' → chuyển ' + COMPANY[d.company === 'PN' ? 'IPC' : 'HW']) : '')}</button></>)}
        </div>)}
    </section>);
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
function TableEdit({ title, cols, rows, editable, onChange, fname }: { title: string; cols: Col[]; rows: Row[]; editable: boolean; onChange: (r: Row[]) => void; fname: string }) {
  const inCols = cols.filter((c) => !c.calc);
  const [paste, setPaste] = useState(''); const [open, setOpen] = useState(false); const [msg, setMsg] = useState('');
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  // Áp dụng một giá trị cho cả cột: từ ô vừa sửa (gợi ý) hoặc từ nút ở tiêu đề cột
  const [fill, setFill] = useState<{ k: string; v: string } | null>(null); const [hdr, setHdr] = useState<{ k: string; v: string } | null>(null);
  const applyCol = (k: string, v: string, onlyEmpty = false) => {
    const n = rows.filter((r) => (onlyEmpty ? !String(r[k] ?? '').trim() : String(r[k] ?? '') !== v)).length;
    onChange(rows.map((r) => (onlyEmpty && String(r[k] ?? '').trim() ? r : { ...r, [k]: v }))); setFill(null); setHdr(null);
    setMsg(`Đã áp dụng ${v} cho ${n} dòng · cột ${cols.find((c) => c.k === k)?.t}`);
  };
  const offer = (k: string, v: string) => { if (!v.trim() || rows.length < 2) return; if (rows.some((r) => String(r[k] ?? '') !== v)) setFill({ k, v }); };
  const colT = (k: string) => cols.find((c) => c.k === k)?.t ?? '';
  const totals = useMemo(() => Object.fromEntries(cols.filter((c) => c.n && ['so_tam', 'm2', 'kg', 'tt', 'm2_dot', 'duong_han'].includes(c.k)).map((c) => [c.k, sumOf(rows, c)])), [rows, cols]);
  const fromAoa = (aoa: string[][]) => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9²]/g, '');
    const hi = aoa.findIndex((r) => r.some((c) => inCols.some((x) => norm(c) === norm(x.t))));
    let map: (string | null)[];
    if (hi >= 0) { map = aoa[hi].map((c) => cols.find((x) => norm(c) === norm(x.t))?.k ?? null); aoa = aoa.slice(hi + 1); }
    else map = inCols.map((c) => c.k);
    const out: Row[] = [];
    for (const r of aoa) {
      const row: Row = {}; r.forEach((v, j) => { const k = map[j]; if (k && !cols.find((x) => x.k === k)?.calc) row[k] = String(v ?? '').trim(); });
      if (!Object.values(row).some((v) => v)) continue;
      if (String(Object.values(row)[0] ?? '').toUpperCase() === 'TỔNG') continue;
      out.push(row);
    }
    return out;
  };
  const doPaste = () => { const add = fromAoa(paste.trim().split(/\r?\n/).map((l) => l.split('\t'))); onChange([...rows, ...add]); setPaste(''); setOpen(false); setMsg('Đã thêm ' + add.length + ' dòng'); };
  const doFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return; const X = await import('xlsx');
    const wb = X.read(await f.arrayBuffer()); const aoa = X.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '', raw: false });
    const add = fromAoa(aoa); onChange([...rows, ...add]); setMsg('Đã nạp ' + add.length + ' dòng từ ' + f.name); e.target.value = '';
  };
  const tpl = async () => { const X = await import('xlsx'); const ws = X.utils.aoa_to_sheet([inCols.map((c) => c.t)]); ws['!cols'] = inCols.map((c) => ({ wch: Math.max(10, c.t.length + 2) }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Mau'); X.writeFile(wb, fname + '-mau.xlsx'); };
  return (
    <div className="pp-tbl">
      <div className="row between pp-th"><b>{title} <span className="small muted">· {rows.length} dòng</span></b>
        {editable && <span className="row pp-tools" style={{ gap: 6 }}>
          <button className="btn sm" onClick={tpl}><Icon name="download" size={14} />Mẫu Excel</button>
          <label className="btn sm"><Icon name="upload" size={14} />Tải Excel<input type="file" accept=".xlsx,.xls,.csv" hidden onChange={doFile} /></label>
          <button className="btn sm" onClick={() => setOpen(!open)}><Icon name="copy" size={14} />Dán từ Excel</button>
          {rows.length > 0 && <button className="btn sm pp-clear" onClick={() => onChange([])}><Icon name="x" size={14} />Xoá hết</button>}</span>}</div>
      {open && <div className="pp-paste"><textarea rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Chép các dòng trong Excel (có hoặc không có dòng tiêu đề) rồi dán vào đây.\nThứ tự cột: ' + inCols.map((c) => c.t).join(' · ')} />
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
        <thead><tr><th>#</th>{cols.map((c) => <th key={c.k} className={c.n ? 'n' : ''}>{editable && !c.calc && rows.length > 1
          ? <button className="th-fill" onClick={() => setHdr(hdr?.k === c.k ? null : { k: c.k, v: String(rows.find((r) => String(r[c.k] ?? '').trim())?.[c.k] ?? '') })} title={'Đặt cùng giá trị cho cả cột ' + c.t} aria-label={'Đặt chung cột ' + c.t}>
              {c.t}<Icon name="list" size={12} /></button> : c.t}</th>)}{editable && <th />}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}><td className="muted">{i + 1}</td>
            {cols.map((c) => <td key={c.k} className={c.n ? 'n' : ''}>{c.calc ? <span className="calc">{fmtN(c.calc(r), c.d ?? 0)}</span>
              : editable ? <input value={String(r[c.k] ?? '')} inputMode={c.n ? 'decimal' : undefined} onChange={(e) => set(i, c.k, e.target.value)} onBlur={(e) => offer(c.k, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }} style={{ width: (c.w ?? 7) + 'ch' }} />
              : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : String(r[c.k] ?? '')}</td>)}
            {editable && <td><button className="link-btn" aria-label="Bỏ dòng" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button></td>}</tr>)}
          {editable && <tr><td colSpan={cols.length + 2}><button className="link-btn" onClick={() => onChange([...rows, {}])}><Icon name="plus" size={14} />Thêm dòng</button></td></tr>}
        </tbody>
        {rows.length > 0 && <tfoot><tr><td /><td><b>Tổng</b></td>{cols.slice(1).map((c) => <td key={c.k} className="n"><b>{c.k in totals ? fmtN(totals[c.k], c.d ?? 0) : ''}</b></td>)}{editable && <td />}</tr></tfoot>}
      </table></div>
    </div>);
}

/** Bản in theo mẫu form (A4) */
function printDoc(o: Order, b: Batch, d: Doc, people: Record<string, Profile>) {
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  const who = (id?: string) => (id ? people[id]?.full_name ?? '' : '');
  const title = { QT0: 'DANH SÁCH TẤM – BÓC TÁCH BẢN VẼ', QT1: 'XÁC NHẬN ĐƠN HÀNG', QT2: 'LỆNH GIA CÔNG KIÊM BÀN GIAO VẬT LIỆU', QT3: 'PHIẾU XUẤT KHO KIÊM BIÊN BẢN GIAO HÀNG' }[b.proc];
  const meta = [['Mã đơn hàng', o.code], ['Dự án', o.project], ...HEADER[b.proc].map(([k, l]) => [l, d.header[k] ?? ''])];
  const tbl = PROC_TABLES[b.proc].map(([key, def]) => { const T = TABLES[def]; const rows = d.tables[key] ?? [];
    return `<h3>${esc(T.t)}</h3><table><tr><th>STT</th>${T.cols.map((c) => `<th>${esc(c.t)}</th>`).join('')}</tr>${rows.map((r, i) => `<tr><td>${i + 1}</td>${T.cols.map((c) => `<td class="${c.n ? 'n' : ''}">${esc(c.calc ? fmtN(c.calc(r), c.d ?? 0) : c.n ? fmtN(numIn(r[c.k]), c.d ?? 0) : r[c.k])}</td>`).join('')}</tr>`).join('')}
      <tr class="t"><td></td>${T.cols.map((c, j) => `<td class="n">${j === 0 ? 'TỔNG' : ['so_tam', 'm2', 'kg', 'tt'].includes(c.k) ? fmtN(sumOf(rows, c), c.d ?? 0) : ''}</td>`).join('')}</tr></table>`; }).join('');
  const roles = b.proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet'];
  const sig = roles.map((r) => { const s = [...d.signs].reverse().find((x) => x.role === r && x.action === 'ky');
    return `<td><b>${r === 'admin' ? 'Người tạo' : ROLE_NAME[r]}</b><br><small>ký điện tử</small><div class="sp">${s ? '✔ ' + esc(who(s.user)) + '<br><small>' + esc(dt(s.at)) + '</small>' : ''}</div></td>`; }).join('');
  const hand = b.proc === 'QT1' ? ['Khách hàng xác nhận (ký, đóng dấu)'] : b.proc === 'QT2' ? ['Người bàn giao vật liệu', 'Người nhận vật liệu'] : b.proc === 'QT3' ? ['Thủ kho / người giao', 'Tài xế', 'Khách hàng nhận hàng'] : [];
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.code)} ${b.proc} ${esc(COMPANY[d.company])}</title><style>
    @page{size:A4;margin:12mm}body{font-family:Arial,sans-serif;font-size:11px;color:#111}h1{font-size:17px;text-align:center;margin:6px 0 10px}h3{font-size:12px;margin:12px 0 4px}
    .co{font-weight:700;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:3px 5px;vertical-align:top}th{background:#eee}
    td.n{text-align:right}.meta td{border:0;padding:2px 4px}.t td{font-weight:700;background:#f4f4f4}.sig td{text-align:center;width:25%}.sp{height:60px;padding-top:6px}
    .notes{margin-top:8px;font-size:10.5px}</style></head><body>
    <div class="co">${esc(COMPANY[d.company])}</div><h1>${title}</h1>
    <table class="meta">${meta.map((m, i) => (i % 2 === 0 ? '<tr>' : '') + `<td><b>${esc(m[0])}:</b> ${esc(m[1])}</td>` + (i % 2 ? '</tr>' : '')).join('')}</table>
    ${tbl}
    ${d.notes.length ? `<div class="notes"><b>Ghi chú:</b><br>${d.notes.map((n) => esc((ROLE_NAME[n.role] ?? n.role) + ': ' + n.text)).join('<br>')}</div>` : ''}
    <h3>Ký xác nhận</h3><table class="sig"><tr>${sig}</tr></table>
    ${hand.length ? `<h3>Ký tay</h3><table class="sig"><tr>${hand.map((x) => `<td><b>${x}</b><div class="sp"></div>Họ tên: ……………………</td>`).join('')}</tr></table>` : ''}
    <script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}
