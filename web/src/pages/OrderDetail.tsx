import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { sb, errText, type Approval, type Customer, type Line, type Order, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, ORDER_STATUS, date, dt, money, num } from '../lib/format';
import { Chip, Msg, Skeleton, confirmDialog } from '../components/ui';
import { Icon } from '../components/Icon';
import { ApprovalChain } from '../components/Approvals';
import { QT2Merged, F7 } from './Phase2';

type Conf = { order_id: string; vat_rate: number; terms: string; kh1_confirmed_at: string | null; kh1_channel: string | null;
  kh2_confirmed_at: string | null; kh2_channel: string | null; signed_pdf_path: string | null };
type Price = { line_id: string; order_id: string; unit_price: number; price_unit: string };
type Step = { doc_type: string; step_no: number; label: string; approver_id: string | null };
type Ev = { id: number; at: string; actor: string | null; acting_as: string | null; action: string };

const TABS = [['F0', 'F0 Tiếp nhận'], ['F1', 'F1 Chi tiết'], ['F2', 'F2 XNĐH'], ['QT2', 'QT2 Lệnh GC & NVL'], ['F7', 'F7 Phát sinh'], ['LS', 'Lịch sử']] as const;

export default function OrderDetail() {
  const { id = '' } = useParams(); const [sp, setSp] = useSearchParams();
  const tab = ((t) => (t === 'QT3' ? 'QT2' : t))(sp.get('tab') ?? 'F1');
  const { me, can } = useAuth();
  const [o, setO] = useState<Order | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const [conf, setConf] = useState<Conf | null>(null);
  const [appr, setAppr] = useState<Approval[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [cust, setCust] = useState<Record<string, Customer>>({});
  const [events, setEvents] = useState<Ev[]>([]);
  const [err, setErr] = useState(''); const [ok, setOk] = useState('');

  const load = useCallback(async () => {
    const [a, b, c, d, e, f, g, h, i] = await Promise.all([
      sb.from('orders').select('*').eq('id', id).single(),
      sb.from('order_lines').select('*').eq('order_id', id).order('line_no'),
      sb.from('order_prices').select('*').eq('order_id', id),
      sb.from('confirmations').select('*').eq('order_id', id).maybeSingle(),
      sb.from('approvals').select('*').eq('order_id', id).order('created_at'),
      sb.from('approval_steps').select('*').order('step_no'),
      sb.from('profiles').select('*'),
      sb.from('customers').select('*'),
      sb.from('audit_log').select('id, at, actor, acting_as, action').eq('order_id', id).eq('table_name', 'event').order('at', { ascending: false })
    ]);
    setO(a.data as Order); setLines((b.data as Line[]) ?? []);
    setPrices(Object.fromEntries(((c.data as Price[]) ?? []).map((p) => [p.line_id, p])));
    setConf(d.data as Conf); setAppr((e.data as Approval[]) ?? []); setSteps((f.data as Step[]) ?? []);
    setPeople(Object.fromEntries(((g.data as Profile[]) ?? []).map((p) => [p.id, p])));
    setCust(Object.fromEntries(((h.data as Customer[]) ?? []).map((x) => [x.id, x])));
    setEvents((i.data as Ev[]) ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>, msg: string) => {
    setErr(''); setOk('');
    const { error } = await sb.rpc(fn, args);
    if (error) setErr(errText(error)); else { setOk(msg); load(); }
  };

  if (!o) return <Skeleton rows={4} h={72} />;
  const tot = lines.reduce((s, l) => ({ qty: s.qty + l.qty, m2: s.m2 + Number(l.area_m2), kg: s.kg + Number(l.weight_kg) }), { qty: 0, m2: 0, kg: 0 });
  const chain = [cust[o.kh1_id ?? '']?.name, cust[o.kh2_id ?? '']?.name].filter(Boolean).join(' → ');
  const props = { o, lines, run, can, load, setErr, setOk };

  return (
    <>
      <Link to="/bang" className="small" style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32 }}><Icon name="back" size={16} />Bảng đơn hàng</Link>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row between">
          <div><h1>{o.code}</h1><div className="muted">{chain} · {o.project}{o.due_date ? ' · giao ' + date(o.due_date) : ''}</div></div>
          <span className="small muted">{tot.qty} tấm · {num(tot.m2, 1)} m² · {num(tot.kg, 1)} kg</span>
        </div>
        <Flow status={o.status} f1={o.f1_result} />
        <div className="grid2">
          <div><div className="small muted">Trạng thái đơn</div><Chip s={o.status} text={ORDER_STATUS[o.status]} /></div>
          <div><div className="small muted">QT2 · NVL</div><Chip s={o.nvl_status} text={BRANCH[o.nvl_status] ?? o.nvl_status} /></div>
          <div><div className="small muted">QT2 · Lệnh gia công</div><Chip s={o.gc_status} text={BRANCH[o.gc_status] ?? o.gc_status} /></div>
          <div><div className="small muted">QT3 · Giao hàng</div><Chip s={o.gh_status} text={BRANCH[o.gh_status] ?? o.gh_status} /></div>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, t]) => <button style={{ whiteSpace: 'nowrap' }} key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setSp({ tab: k })}>{t}</button>)}
      </div>
      <Msg err={err} ok={ok} />
      {tab === 'F0' && <F0 {...props} cust={cust} people={people} />}
      {tab === 'F1' && <F1 {...props} tot={tot} />}
      {tab === 'F2' && <F2 {...props} prices={prices} conf={conf} appr={appr.filter((a) => a.doc_type === 'F2')}
        steps={steps.filter((s) => s.doc_type === 'F2')} people={people} meId={me!.id} />}
      {(tab === 'QT2' || tab === 'QT3' || tab === 'F7') && (() => { const q = { ...props, appr, steps, people, meId: me!.id };
        return tab === 'F7' ? <F7 {...q} /> : <QT2Merged {...q} />; })()}
      {tab === 'LS' && (
        <div className="card steps">
          {events.length === 0 && <span className="muted">Chưa có sự kiện.</span>}
          {events.map((e) => <div key={e.id}><span className="small muted">{dt(e.at)} · {people[e.actor ?? '']?.full_name ?? 'hệ thống'}{e.acting_as ? ' (với tư cách ' + (people[e.acting_as]?.full_name ?? '?') + ')' : ''}</span><div>{e.action}</div></div>)}
        </div>
      )}
    </>
  );
}

type P = { o: Order; lines: Line[]; can: (r: string) => boolean; load: () => void;
  run: (fn: string, a: Record<string, unknown>, m: string) => Promise<void>; setErr: (s: string) => void; setOk: (s: string) => void };

function F0({ o, can, load, setErr, setOk, cust, people }: P & { cust: Record<string, Customer>; people: Record<string, Profile> }) {
  const editable = (can('kinh_doanh') || can('admin_cnc')) && ['tiep_nhan', 'boc_tach', 'kiem_tra_f1', 'xndh'].includes(o.status);
  const [f, setF] = useState({ project: o.project, contact: o.contact, channel: o.channel, description: o.description, due_date: o.due_date ?? '', quote_due: o.quote_due ?? '' });
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const listFiles = useCallback(async () => {
    const { data } = await sb.storage.from('files').list(o.id + '/f0');
    const names = (data ?? []).map((x) => x.name);
    if (!names.length) { setFiles([]); return; }
    const { data: urls } = await sb.storage.from('files').createSignedUrls(names.map((n) => `${o.id}/f0/${n}`), 3600);
    setFiles(names.map((name, i) => ({ name, url: urls?.[i]?.signedUrl ?? '' })));
  }, [o.id]);
  useEffect(() => { listFiles(); }, [listFiles]);
  const save = async () => {
    const { error } = await sb.from('orders').update({ ...f, due_date: f.due_date || null, quote_due: f.quote_due || null }).eq('id', o.id);
    if (error) setErr(errText(error)); else { setOk('Đã lưu F0.'); load(); }
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) {
      const { error } = await sb.storage.from('files').upload(`${o.id}/f0/${Date.now()}-${file.name}`, file);
      if (error) { setErr(errText(error)); return; }
    }
    setOk('Đã tải file.'); listFiles();
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="grid2">
        <div><div className="small muted">KH1 → KH2</div><b>{cust[o.kh1_id ?? '']?.name} → {cust[o.kh2_id ?? '']?.name ?? '—'}</b></div>
        <div><div className="small muted">Người bóc tách</div><b>{people[o.extractor_id ?? '']?.full_name ?? '[chưa giao]'}</b></div>
        <label className="f">Dự án<input disabled={!editable} value={f.project} onChange={set('project')} /></label>
        <label className="f">Người liên hệ<input disabled={!editable} value={f.contact} onChange={set('contact')} /></label>
        <label className="f">Kênh<select disabled={!editable} value={f.channel} onChange={set('channel')}><option>Email</option><option>Điện thoại</option><option>Hệ thống</option></select></label>
        <label className="f">Ngày cần báo giá<input type="date" disabled={!editable} value={f.quote_due} onChange={set('quote_due')} /></label>
        <label className="f">Ngày cần giao<input type="date" disabled={!editable} value={f.due_date} onChange={set('due_date')} /></label>
        <label className="f" style={{ gridColumn: '1 / -1' }}>Mô tả yêu cầu<textarea rows={3} disabled={!editable} value={f.description} onChange={set('description')} /></label>
      </div>
      {o.supplement_note && <div className="msg err"><b>Nội dung cần bổ sung (F1 không đạt):</b> {o.supplement_note}</div>}
      <div>
        <h3>Bản vẽ, file kỹ thuật</h3>
        <ul>{files.map((x) => <li key={x.name} style={{ marginBottom: 6 }}><a className="btn sm" href={x.url} target="_blank" rel="noopener"><Icon name="file" size={16} />{x.name.replace(/^\d+-/, '')}</a></li>)}</ul>
        {editable && <input type="file" multiple onChange={upload} aria-label="Tải bản vẽ" />}
      </div>
      {editable && <div className="row"><button className="btn primary" onClick={save}>Lưu F0</button></div>}
    </div>
  );
}

const XL_HEAD = ['Mã TP', 'Vật liệu', 'Dày (mm)', 'Dài (mm)', 'Rộng (mm)', 'Số tấm', 'Quy cách'];
async function downloadTemplate(code: string) {
  const X = await import('xlsx');
  const ws = X.utils.aoa_to_sheet([XL_HEAD, ['VÍ DỤ', 'SS400', 8, 1500, 1400, 40, 'Dòng VÍ DỤ được bỏ qua khi tải lên'], ['TP-01', '', '', '', '', '', '']]);
  ws['!cols'] = [12, 12, 10, 10, 10, 9, 28].map((w) => ({ wch: w }));
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'F1');
  X.writeFile(wb, `F1-mau-${code}.xlsx`);
}
type XlRow = { product_code: string; material: string; thickness_mm: string; length_mm: string; width_mm: string; qty: string; spec: string };
async function readExcel(file: File): Promise<{ rows: XlRow[]; bad: string[] }> {
  const X = await import('xlsx');
  const wb = X.read(await file.arrayBuffer());
  const aoa = X.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  const rows: XlRow[] = []; const bad: string[] = [];
  aoa.forEach((r, i) => {
    const c = r.map((v) => String(v ?? '').trim());
    if (i === 0 && isNaN(Number(c[2]?.replace(',', '.')))) return; // dòng tiêu đề
    if (c.every((v) => !v) || c[0].toUpperCase() === 'VÍ DỤ') return;
    if (!c[2] && !c[3] && !c[4] && !c[5]) return; // dòng chỉ có mã, chưa điền
    const n = (v: string) => Number(v.replace(',', '.'));
    if (!(n(c[2]) > 0 && n(c[3]) > 0 && n(c[4]) > 0 && Number.isInteger(n(c[5])) && n(c[5]) > 0)) { bad.push('dòng ' + (i + 1)); return; }
    rows.push({ product_code: c[0], material: c[1] || 'SS400', thickness_mm: c[2], length_mm: c[3], width_mm: c[4], qty: c[5], spec: c[6] ?? '' });
  });
  return { rows, bad };
}

function F1({ o, lines, can, run, load, setErr, setOk, tot }: P & { tot: { qty: number; m2: number; kg: number } }) {
  const editable = (can('ky_thuat') || can('kinh_doanh')) && ['tiep_nhan', 'boc_tach'].includes(o.status);
  const blank = { product_code: '', material: 'SS400', thickness_mm: '', length_mm: '', width_mm: '', qty: '', spec: '' };
  const [n, setN] = useState(blank); const [paste, setPaste] = useState(''); const [note, setNote] = useState('');
  const [xl, setXl] = useState<{ name: string; rows: XlRow[]; bad: string[] } | null>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    try { const r = await readExcel(f); setXl({ name: f.name, ...r }); if (!r.rows.length) setErr('Không đọc được dòng hợp lệ nào. Kiểm tra lại theo file mẫu.'); }
    catch { setErr('Không mở được file. Hãy dùng file .xlsx hoặc .csv theo mẫu.'); }
  };
  const add = async (rows: typeof blank[]) => {
    const base = lines.length;
    const payload = rows.map((r, i) => ({ order_id: o.id, line_no: base + i + 1, product_code: r.product_code, material: r.material || 'SS400',
      thickness_mm: Number(String(r.thickness_mm).replace(',', '.')), length_mm: Number(String(r.length_mm).replace(',', '.')),
      width_mm: Number(String(r.width_mm).replace(',', '.')), qty: Number(r.qty), spec: r.spec }));
    const { error } = await sb.from('order_lines').insert(payload);
    if (error) setErr(errText(error)); else { setOk('Đã thêm ' + payload.length + ' dòng.'); setN(blank); setPaste(''); setXl(null); load(); }
  };
  const fromPaste = () => {
    // Cột: Mã TP | Vật liệu | Dày | Dài | Rộng | Số tấm  (dán thẳng từ Excel)
    const rows = paste.trim().split(/\r?\n/).map((l) => l.split('\t')).filter((c) => c.length >= 6)
      .map((c) => ({ product_code: c[0], material: c[1], thickness_mm: c[2], length_mm: c[3], width_mm: c[4], qty: c[5], spec: c[6] ?? '' }));
    if (!rows.length) { setErr('Không đọc được dòng nào. Cần 6 cột: Mã TP, Vật liệu, Dày, Dài, Rộng, Số tấm.'); return; }
    add(rows);
  };
  const del = async (lid: string) => { if (!(await confirmDialog('Xoá dòng này khỏi F1?', 'Xoá dòng'))) return; const { error } = await sb.from('order_lines').delete().eq('id', lid); if (error) setErr(errText(error)); else load(); };
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setN({ ...n, [k]: e.target.value });
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row between"><h2>F1 · Chi tiết đơn hàng</h2>
        <span className="small muted">m² và kg tự tính (thép 7,85 kg/dm³) · kết quả kiểm tra: <Chip s={o.f1_result} text={{ chua: 'chưa kiểm tra', dat: 'Đạt', khong_dat: 'Không đạt' }[o.f1_result]} /></span></div>
      <div className="scroll"><table className="tbl" style={{ minWidth: 760 }}>
        <thead><tr><th>#</th><th>Mã TP</th><th>Vật liệu</th><th className="n">Dày (mm)</th><th className="n">Dài</th><th className="n">Rộng</th><th className="n">Số tấm</th><th className="n">m²</th><th className="n">kg</th><th></th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}><td>{l.line_no}</td><td>{l.product_code}</td><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td>
              <td className="n">{num(l.length_mm, 0)}</td><td className="n">{num(l.width_mm, 0)}</td><td className="n">{l.qty}</td>
              <td className="n">{num(l.area_m2, 2)}</td><td className="n">{num(l.weight_kg, 1)}</td>
              <td>{editable && <button className="btn sm danger" onClick={() => del(l.id)} aria-label={'Xoá dòng ' + l.line_no}><Icon name="trash" size={16} /></button>}</td></tr>))}
          {editable && (
            <tr><td></td><td><input aria-label="Mã TP" value={n.product_code} onChange={set('product_code')} /></td>
              <td><input aria-label="Vật liệu" value={n.material} onChange={set('material')} /></td>
              <td><input aria-label="Dày" inputMode="decimal" value={n.thickness_mm} onChange={set('thickness_mm')} /></td>
              <td><input aria-label="Dài" inputMode="decimal" value={n.length_mm} onChange={set('length_mm')} /></td>
              <td><input aria-label="Rộng" inputMode="decimal" value={n.width_mm} onChange={set('width_mm')} /></td>
              <td><input aria-label="Số tấm" inputMode="numeric" value={n.qty} onChange={set('qty')} /></td>
              <td colSpan={3}><button className="btn sm primary" onClick={() => add([n])}>+ Thêm</button></td></tr>)}
          <tr style={{ fontWeight: 700 }}><td colSpan={6}>Tổng</td><td className="n">{tot.qty}</td><td className="n">{num(tot.m2, 2)}</td><td className="n">{num(tot.kg, 1)}</td><td></td></tr>
        </tbody>
      </table></div>
      {editable && (
        <section className="xl-box" aria-labelledby="h-xl">
          <div className="row between" style={{ gap: 8 }}>
            <div><h3 id="h-xl" style={{ margin: 0 }}>Nhập nhiều dòng từ Excel</h3>
              <span className="small muted">Cột: Mã TP · Vật liệu · Dày · Dài · Rộng · Số tấm · Quy cách (tuỳ chọn)</span></div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={() => downloadTemplate(o.code)}><Icon name="download" size={18} />Tải file mẫu</button>
              <label className="btn primary" style={{ cursor: 'pointer' }}><Icon name="upload" size={18} />Tải Excel lên
                <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="sr-only" /></label>
            </div>
          </div>
          {xl && (
            <div className="xl-preview" role="status">
              <Icon name="file" size={20} />
              <span style={{ flex: '1 1 220px' }}><b>{xl.name}</b><br />
                <span className="small">{xl.rows.length} dòng hợp lệ · {num(xl.rows.reduce((a, r) => a + Number(r.qty), 0), 0)} tấm
                  {xl.bad.length > 0 && <span className="kb-late"> · bỏ qua {xl.bad.length} dòng sai ({xl.bad.slice(0, 5).join(', ')}{xl.bad.length > 5 ? '…' : ''})</span>}</span></span>
              <button className="btn sm" onClick={() => setXl(null)}>Huỷ</button>
              <button className="btn sm primary" disabled={!xl.rows.length} onClick={() => add(xl.rows)}>Thêm {xl.rows.length} dòng vào F1</button>
            </div>)}
          <details><summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Hoặc dán trực tiếp từ Excel</summary>
            <textarea rows={4} style={{ width: '100%', marginTop: 8 }} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Dán từ Excel" placeholder="Chọn các ô trong Excel → Ctrl+C → dán vào đây" />
            <button className="btn ghost" onClick={fromPaste}>Thêm các dòng đã dán</button>
          </details>
        </section>)}
      <div className="row">
        {o.status === 'tiep_nhan' && (can('ky_thuat') || can('kinh_doanh')) &&
          <button className="btn primary" onClick={() => run('start_extraction', { p_order: o.id }, 'Đã chuyển sang bóc tách.')}>Bắt đầu bóc tách</button>}
        {o.status === 'boc_tach' && (can('ky_thuat') || can('kinh_doanh')) &&
          <button className="btn primary" disabled={!lines.length} onClick={() => run('submit_f1', { p_order: o.id }, 'Đã gửi kiểm tra F1.')}>Gửi kiểm tra F1</button>}
      </div>
      {o.status === 'kiem_tra_f1' && can('kiem_tra_f1') && (
        <div className="card" style={{ background: 'var(--soft)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Kiểm tra F1 (ĐK1)</h3>
          <label className="f">Nội dung cần bổ sung (bắt buộc khi Không đạt)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="row">
            <button className="btn primary" onClick={() => run('check_f1', { p_order: o.id, p_ok: true, p_note: note }, 'ĐK1 đạt – chuyển sang lập XNĐH.')}>Đạt</button>
            <button className="btn danger" onClick={() => run('check_f1', { p_order: o.id, p_ok: false, p_note: note }, 'Đã trả về bóc tách.')}>Không đạt</button>
          </div>
        </div>)}
    </div>
  );
}

function F2({ o, lines, can, run, load, setErr, setOk, prices, conf, appr, steps, people, meId }: P & {
  prices: Record<string, { unit_price: number; price_unit: string }>; conf: Conf | null; appr: Approval[]; steps: Step[];
  people: Record<string, Profile>; meId: string }) {
  const seesPrice = can('admin_cnc') || can('kinh_doanh') || can('duyet') || can('xem');
  const editable = (can('admin_cnc') || can('kinh_doanh')) && o.status === 'xndh';
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [vat, setVat] = useState(String(conf?.vat_rate ?? 8));
  useEffect(() => { setVat(String(conf?.vat_rate ?? 8)); }, [conf?.vat_rate]);
  const price = (l: Line) => Number(draft[l.id] ?? prices[l.id]?.unit_price ?? 0);
  const amount = (l: Line) => price(l) * Number(l.weight_kg);
  const sub = useMemo(() => lines.reduce((s, l) => s + amount(l), 0), [lines, prices, draft]); // eslint-disable-line
  const after = sub * (1 + Number(vat || 0) / 100);
  const savePrices = async () => {
    const rows = lines.map((l) => ({ line_id: l.id, order_id: o.id, unit_price: price(l), price_unit: 'kg' }));
    const a = await sb.from('order_prices').upsert(rows);
    const b = await sb.from('confirmations').update({ vat_rate: Number(vat) }).eq('order_id', o.id);
    if (a.error || b.error) setErr(errText(a.error ?? b.error)); else { setOk('Đã lưu đơn giá.'); setDraft({}); load(); }
  };
  const uploadPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const path = `${o.id}/f2/${Date.now()}-${file.name}`;
    const up = await sb.storage.from('files').upload(path, file);
    if (up.error) { setErr(errText(up.error)); return; }
    const { error } = await sb.from('confirmations').update({ signed_pdf_path: path }).eq('order_id', o.id);
    if (error) setErr(errText(error)); else { setOk('Đã tải PDF XNĐH đã ký.'); load(); }
  };
  const [pdfUrl, setPdfUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!conf?.signed_pdf_path) { setPdfUrl(undefined); return; }
    sb.storage.from('files').createSignedUrl(conf.signed_pdf_path, 3600).then(({ data }) => setPdfUrl(data?.signedUrl ?? null));
  }, [conf?.signed_pdf_path]);
  const before = ['tiep_nhan', 'boc_tach', 'kiem_tra_f1'].includes(o.status);
  if (before) return <div className="card muted">XNĐH mở sau khi F1 đạt (ĐK1).</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row between"><h2>F2 · Xác nhận đơn hàng</h2><button className="btn sm ghost" onClick={() => window.print()}><Icon name="print" size={16} />In / Lưu PDF</button></div>
        {seesPrice ? (
          <div className="scroll"><table className="tbl" style={{ minWidth: 640 }}>
            <thead><tr><th>#</th><th>Vật liệu</th><th className="n">Dày</th><th className="n">Số tấm</th><th className="n">kg</th><th className="n">Đơn giá (đ/kg)</th><th className="n">Thành tiền</th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}><td>{l.line_no}</td><td>{l.material}</td><td className="n">{num(l.thickness_mm, 2)}</td><td className="n">{l.qty}</td><td className="n">{num(l.weight_kg, 1)}</td>
                  <td className="n">{editable ? <input aria-label={'Đơn giá dòng ' + l.line_no} inputMode="numeric" value={draft[l.id] ?? String(prices[l.id]?.unit_price ?? '')}
                    onChange={(e) => setDraft({ ...draft, [l.id]: e.target.value.replace(/\D/g, '') })} style={{ textAlign: 'right' }} /> : num(price(l), 0)}</td>
                  <td className="n">{money(amount(l))}</td></tr>))}
              <tr><td colSpan={6}>Cộng trước VAT</td><td className="n">{money(sub)}</td></tr>
              <tr><td colSpan={6}>VAT {editable ? <input aria-label="VAT %" value={vat} onChange={(e) => setVat(e.target.value)} style={{ width: 70, display: 'inline-block' }} /> : vat} %</td><td className="n">{money(after - sub)}</td></tr>
              <tr style={{ fontWeight: 700 }}><td colSpan={6}>Tổng sau VAT</td><td className="n">{money(after)}</td></tr>
            </tbody>
          </table></div>) : <div className="msg info">Đơn giá và tổng tiền không hiển thị với vai trò của bạn.</div>}
        {editable && <div className="row"><button className="btn" onClick={savePrices}>Lưu đơn giá</button>
          <button className="btn primary" onClick={() => run('submit_for_approval', { p_order: o.id, p_doc: 'F2' }, 'Đã gửi duyệt XNĐH.')}>Gửi duyệt XNĐH</button></div>}
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Duyệt nội bộ</h3>
        <ApprovalChain rows={appr} steps={steps} people={people} meId={meId} onDone={() => { setOk('Đã ghi kết quả duyệt.'); load(); }} />
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Khách xác nhận · KH1 rồi KH2 (ĐK2)</h3>
        <div className="grid2">
          <div><div className="small muted">KH1 – IPC</div>{conf?.kh1_confirmed_at ? <Chip s="dat" text={'Đã xác nhận ' + dt(conf.kh1_confirmed_at) + ' · ' + conf.kh1_channel} /> : <Chip s="chua" text="Chưa xác nhận" />}</div>
          <div><div className="small muted">KH2 – Hanwa</div>{conf?.kh2_confirmed_at ? <Chip s="dat" text={'Đã xác nhận ' + dt(conf.kh2_confirmed_at) + ' · ' + conf.kh2_channel} /> : <Chip s="chua" text="Chưa xác nhận" />}</div>
          <div><div className="small muted">PDF XNĐH đã ký</div>{!conf?.signed_pdf_path ? <span className="muted">Chưa có</span>
            : pdfUrl === undefined ? <span className="muted small">Đang chuẩn bị…</span>
            : pdfUrl === null ? <span className="kb-late small"><Icon name="alert" size={14} />Không tìm thấy file, tải lại PDF</span>
            : <a className="btn sm" href={pdfUrl} target="_blank" rel="noopener"><Icon name="file" size={16} />Mở PDF</a>}</div>
        </div>
        {o.status === 'cho_khach' && (can('admin_cnc') || can('kinh_doanh')) && (
          <div className="row">
            {!conf?.kh1_confirmed_at && <button className="btn" onClick={() => run('confirm_customer', { p_order: o.id, p_which: 1, p_channel: 'Email' }, 'Đã ghi KH1 xác nhận.')}>Ghi KH1 (IPC) xác nhận</button>}
            {conf?.kh1_confirmed_at && !conf?.kh2_confirmed_at && <button className="btn" onClick={() => run('confirm_customer', { p_order: o.id, p_which: 2, p_channel: 'Email' }, 'Đã ghi KH2 xác nhận.')}>Ghi KH2 (Hanwa) xác nhận</button>}
            <label className="btn ghost" ><Icon name="upload" size={18} />Tải PDF đã ký<input type="file" accept="application/pdf" onChange={uploadPdf} style={{ display: 'none' }} /></label>
            <button className="btn primary" disabled={!conf?.kh1_confirmed_at || !conf?.kh2_confirmed_at || !conf?.signed_pdf_path}
              onClick={() => run('close_qt1', { p_order: o.id }, 'ĐK2 đạt – đã mở nhánh NVL và gia công.')}>Hoàn tất QT1 (ĐK2)</button>
          </div>)}
      </div>
    </div>
  );
}

/** Tiến trình QT0 → QT1 → ĐK2: bước đã qua, bước hiện tại, bước sau */
const FLOW = [['tiep_nhan', 'Tiếp nhận'], ['boc_tach', 'Bóc tách F1'], ['kiem_tra_f1', 'Kiểm tra F1'], ['xndh', 'Lập XNĐH'],
  ['cho_duyet_xndh', 'Duyệt XNĐH'], ['cho_khach', 'Khách xác nhận'], ['san_xuat', 'Sản xuất'], ['giao_hang', 'Giao hàng']] as const;
function Flow({ status, f1 }: { status: string; f1: string }) {
  if (status === 'huy') return <div className="msg err" role="status"><Icon name="x" size={18} />Đơn đã huỷ</div>;
  const cur = FLOW.findIndex(([k]) => k === status);
  return (
    <ol className="flow" aria-label="Tiến trình đơn" style={{ listStyle: 'none', margin: 0 }}>
      {FLOW.map(([k, t], i) => {
        const cls = i < cur || (cur === -1 && status !== 'tiep_nhan') ? 'done' : i === cur ? 'cur' : '';
        return (
          <li key={k} className={'flow-step ' + cls} aria-current={i === cur ? 'step' : undefined}>
            <span className="fdot">{cls === 'done' ? <Icon name="check" size={14} /> : i + 1}</span>
            <span>{t}{k === 'boc_tach' && f1 === 'khong_dat' && i === cur ? ' (bổ sung)' : ''}</span>
          </li>);
      })}
    </ol>
  );
}
