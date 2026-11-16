import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { toast } from './ui';
import { sb, errText } from '../lib/supabase';
import type { Row } from '../lib/proc';

/** Một dòng tấm của QT0 kèm tình trạng phân bổ (RPC qt0_rows) */
export type Q0Row = { i: number; k: string; r: Row; tot: number; used: number; orders: { code: string; q: number; doc: string }[] };
export type Q0Pick = { i: number; q: number };

const nrm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
const num = (v: unknown) => { const x = Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() !== '' && isFinite(x) ? x : null; };
/** Khoá tấm giống máy chủ (_ds_key): mã tấm | vật liệu | dày */
export const q0Key = (r: Row) => [String(r.ma_tam ?? '').trim().toUpperCase(), String(r.vat_lieu ?? '').trim().toUpperCase(), String(r.day ?? '').replace(',', '.').trim()].join('|');

/** Điều kiện lọc 1 cột: nhiều từ (và), `!từ` = không chứa, `*` = bất kỳ, số: `>10` `<10` `10-20` */
function match(v: unknown, q: string) {
  const qs = q.trim(); if (!qs) return true; const sv = nrm(v); const nv = num(v);
  return qs.split(/\s+/).every((t0) => { const neg = t0.startsWith('!'); const t = nrm(neg ? t0.slice(1) : t0); if (!t) return true; let ok: boolean;
    const m = /^([<>]=?)(\d+(?:[.,]\d+)?)$/.exec(t); const rg = /^(\d+(?:[.,]\d+)?)-(\d+(?:[.,]\d+)?)$/.exec(t);
    if (m && nv != null) { const x = Number(m[2].replace(',', '.')); ok = m[1] === '>' ? nv > x : m[1] === '>=' ? nv >= x : m[1] === '<' ? nv < x : nv <= x; }
    else if (rg && nv != null) ok = nv >= Number(rg[1].replace(',', '.')) && nv <= Number(rg[2].replace(',', '.'));
    else if (t.includes('*')) ok = new RegExp('^' + t.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(sv) || new RegExp(t.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')).test(sv);
    else ok = sv.includes(t);
    return neg ? !ok : ok; });
}

const COLS: { k: string; t: string; w?: number; n?: boolean; list?: boolean }[] = [
  { k: 'ma_tam', t: 'Mã tấm', w: 110 }, { k: 'vat_lieu', t: 'Vật liệu', w: 80, list: true }, { k: 'day', t: 'Dày', w: 56, n: true },
  { k: 'rong', t: 'Rộng', w: 64, n: true }, { k: 'dai', t: 'Dài', w: 64, n: true }, { k: 'loai_gc', t: 'Loại gia công', w: 120, list: true },
  { k: 'ma_mau', t: 'Màu', w: 90, list: true }];

type St = 'all' | 'con' | 'da' | 'bang';

export function Qt0Picker({ code, rows, inTable, onPick, onClose }: { code: string; rows: Q0Row[]; inTable: Record<string, number>; onPick: (p: Q0Pick[]) => void; onClose: () => void }) {
  const [q, setQ] = useState(''); const [f, setF] = useState<Record<string, string>>({}); const [st, setSt] = useState<St>('con'); const [sel, setSel] = useState<Record<number, string>>({});
  const [fOpen, setFOpen] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  // còn lại theo khoá (trừ đơn khác + đang có trong bảng này + đã chọn ở các dòng trùng khoá khác)
  const keyLeft = useMemo(() => { const m: Record<string, number> = {}; for (const x of rows) m[x.k] = x.tot - x.used - (inTable[x.k] ?? 0); return m; }, [rows, inTable]);
  const selN = (i: number) => num(sel[i]) ?? 0;
  const leftOf = (x: Q0Row) => { const other = rows.filter((y) => y.k === x.k && y.i !== x.i).reduce((a, y) => a + selN(y.i), 0);
    return Math.max(0, Math.min(num(x.r.so_tam) ?? 0, keyLeft[x.k] - other)); };
  const opts = useMemo(() => Object.fromEntries(COLS.filter((c) => c.list).map((c) => [c.k, [...new Set(rows.map((x) => String(x.r[c.k] ?? '').trim()).filter(Boolean))].sort()])), [rows]);
  const vis = rows.filter((x) => { const base = keyLeft[x.k];
    if (st === 'con' && base <= 0 && !selN(x.i)) return false; if (st === 'da' && !x.used) return false; if (st === 'bang' && !inTable[x.k]) return false;
    if (q.trim() && !match(COLS.map((c) => x.r[c.k]).join(' '), q)) return false;
    return COLS.every((c) => match(x.r[c.k], f[c.k] ?? '')); });
  const nf = Object.values(f).filter((v) => v.trim()).length;
  const picks = Object.entries(sel).map(([i, v]) => ({ i: +i, q: num(v) ?? 0 })).filter((p) => p.q > 0);
  const bad = picks.filter((p) => { const x = rows.find((y) => y.i === p.i); return !x || p.q > leftOf(x); });
  const sumQ = picks.reduce((a, p) => a + p.q, 0);
  const toggle = (x: Q0Row) => setSel((s) => { const n = { ...s }; if (num(n[x.i]) && num(n[x.i])! > 0) delete n[x.i]; else { const l = leftOf(x); if (l > 0) n[x.i] = String(l); } return n; });
  const pickVis = () => setSel((s) => { const n = { ...s }; for (const x of vis) if (!num(n[x.i])) { const l = (() => { const other = rows.filter((y) => y.k === x.k && y.i !== x.i).reduce((a, y) => a + (num(n[y.i]) ?? 0), 0); return Math.max(0, Math.min(num(x.r.so_tam) ?? 0, keyLeft[x.k] - other)); })(); if (l > 0) n[x.i] = String(l); } return n; });
  const step = (x: Q0Row, d: number) => setSel((s) => { const v = Math.max(0, Math.min((num(s[x.i]) ?? 0) + d, leftOf(x))); const n = { ...s }; if (v) n[x.i] = String(v); else delete n[x.i]; return n; });

  const xlsxOut = async () => {
    const X = await import('xlsx');
    const data = rows.map((x) => ({ 'Mã QT0': code, 'Mã tấm': x.r.ma_tam ?? '', 'Vật liệu': x.r.vat_lieu ?? '', 'Dày (mm)': num(x.r.day) ?? x.r.day ?? '', 'Rộng (mm)': num(x.r.rong) ?? '', 'Dài (mm)': num(x.r.dai) ?? '',
      'Loại gia công': x.r.loai_gc ?? '', 'Màu': x.r.ma_mau ?? x.r.mau_son ?? '', 'm²/tấm': num(x.r.m2_tam) ?? '', 'SL QT0': num(x.r.so_tam) ?? 0,
      'Đã lên đơn': x.orders.map((o) => `${o.code} (${o.q})`).join(', '), 'Trong bảng này': inTable[x.k] ?? 0, 'Còn lại': leftOf(x), 'SL lấy': selN(x.i) || '' }));
    const ws = X.utils.json_to_sheet(data); ws['!cols'] = [14, 16, 10, 8, 9, 9, 18, 14, 8, 8, 28, 10, 8, 8].map((w) => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Tam QT0'); X.writeFile(wb, `${code}-tam-con-lai.xlsx`);
    toast('Đã tải file – điền cột "SL lấy" rồi bấm "Tải Excel lên"'); };
  const xlsxIn = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
    const X = await import('xlsx'); const wb = X.read(await file.arrayBuffer()); const json = X.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const col = (r: Record<string, unknown>, ...names: string[]) => { const k = Object.keys(r).find((h) => names.some((n) => nrm(h) === nrm(n))); return k ? r[k] : ''; };
    if (json.length && nrm(col(json[0], 'Mã QT0')) && nrm(col(json[0], 'Mã QT0')) !== nrm(code)) { toast(`File thuộc ${String(col(json[0], 'Mã QT0'))}, không phải ${code}`); return; }
    const n: Record<number, string> = {}; const err: string[] = []; const used = new Map<string, number>(); let ok = 0;
    for (const r of json) { const qv = num(col(r, 'SL lấy', 'SL lay', 'So luong lay')); if (!qv) continue;
      const k = q0Key({ ma_tam: col(r, 'Mã tấm') as string, vat_lieu: col(r, 'Vật liệu') as string, day: col(r, 'Dày (mm)', 'Dày') as string });
      const cand = rows.filter((x) => x.k === k); if (!cand.length) { err.push(`${String(col(r, 'Mã tấm'))}: không có trong ${code}`); continue; }
      let need = qv; for (const x of cand) { const left = Math.max(0, Math.min(num(x.r.so_tam) ?? 0, keyLeft[x.k] - (used.get(x.k) ?? 0))) - (num(n[x.i]) ?? 0); const t = Math.min(left, need); if (t > 0) { n[x.i] = String((num(n[x.i]) ?? 0) + t); used.set(x.k, (used.get(x.k) ?? 0) + t); need -= t; } if (!need) break; }
      if (need > 0) err.push(`${String(col(r, 'Mã tấm'))}: lấy ${qv}, chỉ còn ${qv - need}`); else ok++; }
    setSel(n); setSt('all');
    toast(`Đã đọc ${ok} dòng từ file` + (err.length ? ` · ${err.length} dòng lỗi: ${err.slice(0, 3).join('; ')}${err.length > 3 ? '…' : ''}` : '')); };

  const stTag = (x: Q0Row) => { const left = keyLeft[x.k]; const it = inTable[x.k] ?? 0;
    return <span className="qp-st">
      {it > 0 && <em className="in">Trong bảng này ({it})</em>}
      {left <= 0 ? <em className="out">Hết</em> : x.used || it ? <em className="part">Còn {left}/{x.tot}</em> : <em className="ok">Còn {left}/{x.tot}</em>}
      {x.orders.length > 0 && <small>Đã lên đơn {x.orders.map((o) => `${o.code} (${o.q})`).join(', ')}</small>}
    </span>; };

  return createPortal(<div className="modal-bg qp-bg" onClick={onClose}><div className="modal qp" role="dialog" aria-modal="true" aria-label={'Lấy tấm từ ' + code} onClick={(e) => e.stopPropagation()}>
    <header className="qp-h"><div><b>Lấy tấm từ {code}</b><span className="small muted">{rows.length} dòng · {rows.reduce((a, x) => a + (num(x.r.so_tam) ?? 0), 0)} tấm · còn {Object.entries(keyLeft).reduce((a, [, v]) => a + Math.max(0, v), 0)} tấm chưa lên đơn</span></div>
      <button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></header>
    <div className="qp-tools">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mọi cột: b.0* 1.2 !hàn" aria-label="Tìm" />
      <div className="qp-chips" role="group" aria-label="Tình trạng">{([['con', 'Còn hàng'], ['da', 'Đã lên đơn'], ['bang', 'Trong bảng này'], ['all', 'Tất cả']] as [St, string][]).map(([k, t]) =>
        <button key={k} type="button" aria-pressed={st === k} onClick={() => setSt(k)}>{t}</button>)}</div>
      <button type="button" className={'btn sm qp-fbtn' + (nf ? ' on' : '')} aria-expanded={fOpen} onClick={() => setFOpen(!fOpen)}><Icon name="list" size={14} />Lọc{nf ? ` (${nf})` : ''}</button>
      {nf > 0 && <button type="button" className="btn sm" onClick={() => setF({})}>Xoá lọc</button>}
    </div>
    {fOpen && <div className="qp-fpanel">{COLS.map((c) => <label key={c.k} className="f">{c.t}<input list={c.list ? 'qp-' + c.k : undefined} value={f[c.k] ?? ''} placeholder={c.n ? '>1000 · 500-900' : c.k === 'loai_gc' ? 'hàn · !hàn' : 'chứa…'} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} /></label>)}</div>}
    {COLS.filter((c) => c.list).map((c) => <datalist key={c.k} id={'qp-' + c.k}>{(opts[c.k] ?? []).map((v) => <option key={v} value={v} />)}</datalist>)}
    <div className="qp-tbl">
      <table>
        <thead><tr><th className="ck"><span className="sr">Chọn</span></th>{COLS.map((c) => <th key={c.k} style={{ minWidth: c.w }}>{c.t}</th>)}<th>SL QT0</th><th>Tình trạng</th><th>SL lấy</th></tr>
          <tr className="qp-frow"><td />{COLS.map((c) => <td key={c.k}><input list={c.list ? 'qp-' + c.k : undefined} aria-label={'Lọc ' + c.t} value={f[c.k] ?? ''} placeholder={c.n ? '>,<,a-b' : 'lọc…'} onChange={(e) => setF({ ...f, [c.k]: e.target.value })} /></td>)}<td /><td /><td /></tr></thead>
        <tbody>{vis.map((x) => { const v = selN(x.i); const left = leftOf(x); const over = v > left; const dis = left <= 0 && !v;
          return <tr key={x.i} className={(v ? 'on' : '') + (dis ? ' dis' : '')}>
            <td className="ck"><input type="checkbox" checked={v > 0} disabled={dis} onChange={() => toggle(x)} aria-label={'Chọn ' + String(x.r.ma_tam ?? '')} /></td>
            {COLS.map((c) => <td key={c.k} className={(c.n ? 'n' : '') + (c.k === 'ma_tam' ? ' mt' : '')}>{String(x.r[c.k] ?? '')}{c.k === 'ma_tam' && <span className="qp-m">{stTag(x)}</span>}</td>)}
            <td className="n">{String(x.r.so_tam ?? '')}</td>
            <td className="qp-stc">{stTag(x)}</td>
            <td><span className="qp-q"><button type="button" aria-label="Bớt" disabled={!v} onClick={() => step(x, -1)}>−</button>
              <input inputMode="decimal" className={over ? 'bad' : ''} value={sel[x.i] ?? ''} placeholder="0" aria-label={'Số tấm lấy – ' + String(x.r.ma_tam ?? '')}
                onChange={(e) => setSel({ ...sel, [x.i]: e.target.value })} />
              <button type="button" aria-label="Thêm" disabled={left <= 0} onClick={() => step(x, 1)}>+</button></span></td></tr>; })}
          {!vis.length && <tr><td colSpan={COLS.length + 4} className="muted qp-empty">Không có tấm nào khớp bộ lọc.</td></tr>}</tbody>
      </table>
    </div>
    <footer className="qp-f">
      <span className="qp-sum"><b>Đã chọn {picks.length} dòng · {sumQ.toLocaleString('vi-VN')} tấm</b>{bad.length > 0 && <span className="qp-bad">{bad.length} dòng vượt số còn lại</span>}</span>
      <div className="qp-fbtns">
        <button type="button" className="btn sm" onClick={pickVis} disabled={!vis.length}>Chọn hết kết quả</button>
        {picks.length > 0 && <button type="button" className="btn sm" onClick={() => setSel({})}>Bỏ chọn</button>}
        <button type="button" className="btn sm" onClick={xlsxOut}><Icon name="download" size={14} />Tải Excel</button>
        <button type="button" className="btn sm" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} />Tải Excel lên</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={xlsxIn} />
        <button type="button" className="btn primary" disabled={!picks.length || bad.length > 0} onClick={() => onPick(picks)}>Lấy {sumQ.toLocaleString('vi-VN')} tấm</button>
      </div>
    </footer>
  </div></div>, document.body);
}

/** Lấy q tấm của một dòng QT0: chia m² theo tỉ lệ (giống _qt0_take ở máy chủ) */
export function takeRow(r: Row, q: number): Row {
  const s = num(r.so_tam) ?? 0; const o: Row = { ...r, so_tam: q };
  if (s > 0 && q !== s) { for (const k of ['m2', 'm2_ht']) { const v = num(r[k]); if (v != null) o[k] = Math.round(v * q / s * 10000) / 10000; } }
  return o;
}

/** Thanh phân bổ: QT0 đã lên đơn bao nhiêu tấm, còn bao nhiêu (chống thiếu) */
export function Qt0Alloc({ qt0, order }: { qt0: string; order: string }) {
  const [st, setSt] = useState<{ code: string; rows: Q0Row[] } | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { Promise.all([sb.rpc('qt0_rows', { p_qt0: qt0 }), sb.rpc('qt0_list', { p_order: order })]).then(([a, b]) => {
    const rows = ((a.data ?? []) as Q0Row[]); if (!rows.length) return; setSt({ code: ((b.data ?? []) as { id: string; code: string }[]).find((x) => x.id === qt0)?.code ?? 'QT0', rows }); }); }, [qt0, order]);
  if (!st) return null;
  const byK = new Map<string, Q0Row>(); for (const x of st.rows) if (!byK.has(x.k)) byK.set(x.k, x);
  const ks = [...byK.values()]; const tot = ks.reduce((a, x) => a + x.tot, 0); const used = ks.reduce((a, x) => a + Math.min(x.used, x.tot), 0); const left = ks.filter((x) => x.tot > x.used);
  const pct = tot ? Math.round(used / tot * 100) : 0;
  return <section className={'q0a' + (left.length ? '' : ' done')} aria-label="Phân bổ tấm QT0">
    <div className="q0a-top"><span className="q0a-lbl">QT0 nguồn</span><b className="q0a-code" title={st.code}>{st.code}</b>
      <span className={'q0a-pill' + (left.length ? '' : ' ok')}>{left.length ? pct + '%' : 'Đủ'}</span></div>
    <div className="q0a-num"><b>{used.toLocaleString('vi-VN')}</b><span>/ {tot.toLocaleString('vi-VN')} tấm đã lên đơn</span></div>
    <div className="q0a-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Tỉ lệ đã lên đơn"><span style={{ width: Math.max(pct, used ? 2 : 0) + '%' }} /></div>
    {left.length > 0 && <div className="q0a-ft"><span>Còn <b>{(tot - used).toLocaleString('vi-VN')}</b> tấm · {left.length} mã</span>
      <button type="button" className="q0a-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Thu gọn' : 'Xem còn lại'}<Icon name="caret" size={14} /></button></div>}
    {open && <ul className="q0a-l">{left.map((x) => <li key={x.k}><b>{String(x.r.ma_tam ?? '')}</b><span className="small muted">{[x.r.vat_lieu, x.r.day && x.r.day + 'mm', x.r.loai_gc].filter(Boolean).join(' · ')}</span><em>{x.tot - x.used}/{x.tot}</em></li>)}</ul>}
  </section>;
}

/** Đơn PN thất bại → tạo đơn mới (chép bảng, chỉ lấy phần QT0 còn lại) */
export function ReClone({ docId, onDone }: { docId: string; onDone: (batch: string) => void }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); const { data, error } = await sb.rpc('qt1_reclone', { p_doc: docId }); setBusy(false);
    if (error) { toast(errText(error)); return; } const r = data as { batch: string; short: { ma_tam: string; cu: number; lay: number }[]; from: string };
    if (r.short?.length) toast(`Đã tạo đơn mới từ ${r.from}. Thiếu ${r.short.length} mã do đơn khác đã lấy: ` + r.short.slice(0, 4).map((x) => `${x.ma_tam} ${x.cu}→${x.lay}`).join(', ') + (r.short.length > 4 ? '…' : ''));
    else toast(`Đã tạo đơn mới từ ${r.from} – đủ tấm`);
    onDone(r.batch); };
  return <button type="button" className="btn sm primary" disabled={busy} onClick={go}><Icon name="copy" size={14} />{busy ? 'Đang tạo…' : 'Tạo đơn mới từ đơn này'}</button>;
}
