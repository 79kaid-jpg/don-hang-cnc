import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Customer } from '../lib/supabase';
import { useProjects } from '../lib/projects';
import { m2Of, kgOf, ttOf, type Row } from '../lib/proc';
import { Skeleton, Empty } from '../components/ui';
import { Icon } from '../components/Icon';
import { useMyCo } from '../lib/myco';

type B = { id: string; order_id: string; proc: string; status: string; title: string; co_order_id: string | null; done_at: string | null };
type D = { batch_id: string; company: string; status: string; tables: Record<string, Row[]> | null; header: Record<string, string> | null };
type CO = { id: string; company: string; code: string; project_id: string | null; batch_id: string | null };
type O = { id: string; code: string; project_id: string | null; due_date: string | null; status: string };
type Agg = { tam: number; kg: number; val: number | null };
const numv = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const COS = ['PN', 'IPC', 'HW'] as const;
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d });
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Báo cáo theo dự án: số đơn mỗi công ty, khối lượng, giá trị (theo quyền xem giá), tiến độ, trễ */
export default function ProjectReport() {
  const pj = useProjects(); const { co: myCo0 } = useMyCo(); const myCo = myCo0 || 'PN'; const [openId, setOpenId] = useState(''); const [st, setSt] = useState<'open' | 'closed' | 'all'>('open'); const [q, setQ] = useState('');
  const [data, setData] = useState<{ o: O[]; b: B[]; d: D[]; co: CO[]; cu: Record<string, Customer> } | null>(null);
  useEffect(() => { Promise.all([sb.from('orders').select('id, code, project_id, due_date, status'), sb.from('batches').select('id, order_id, proc, status, title, co_order_id, done_at'), sb.from('docs_v').select('batch_id, company, status, tables, header'),
    sb.from('co_orders').select('id, company, code, project_id, batch_id'), sb.from('customers').select('*')]).then(([o, b, d, co, cu]) =>
    setData({ o: (o.data ?? []) as O[], b: (b.data ?? []) as B[], d: (d.data ?? []) as D[], co: (co.data ?? []) as CO[], cu: Object.fromEntries(((cu.data ?? []) as Customer[]).map((c) => [c.id, c])) })); }, []);
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => { if (!pj || !data) return null;
    return pj.filter((p) => (st === 'all' || p.status === st) && (!q.trim() || fold(p.code + ' ' + p.name).includes(fold(q.trim())))).map((p) => {
      const os = data.o.filter((o) => o.project_id === p.id); const oid = new Set(os.map((o) => o.id)); const bs = data.b.filter((b) => oid.has(b.order_id)); const bid = new Set(bs.map((b) => b.id));
      const n = Object.fromEntries(COS.map((c) => [c, data.co.filter((x) => x.project_id === p.id && x.company === c).length])) as Record<string, number>;
      const q1 = new Set(bs.filter((b) => b.proc === 'QT1').map((b) => b.id));
      let m2 = 0, kg = 0; const val: Record<string, number | null> = { PN: 0, IPC: 0, HW: 0 };
      data.d.filter((d) => q1.has(d.batch_id)).forEach((d) => { const ds = d.tables?.ds ?? [];
        if (d.company === 'PN') ds.forEach((r) => { m2 += m2Of(r) ?? 0; kg += kgOf(r) ?? 0; });
        const v = ds.reduce((a, r) => a + (ttOf(r) ?? 0), 0); const hidden = ds.length > 0 && ds.every((r) => r.don_gia == null);
        val[d.company] = hidden ? null : (val[d.company] ?? 0) + v; });
      const prog = Object.fromEntries(['QT0', 'QT1', 'QT2', 'QT3'].map((pr) => { const x = bs.filter((b) => b.proc === pr); return [pr, [x.filter((b) => b.status === 'hoan_tat').length, x.filter((b) => b.status !== 'fail').length]]; })) as Record<string, number[]>;
      const docOf = (bid: string, c: string) => data.d.find((d) => d.batch_id === bid && d.company === c);
      const coById = Object.fromEntries(data.co.map((x) => [x.id, x]));
      const q1b = bs.filter((b) => b.proc === 'QT1' && !['fail', 'huy'].includes(b.status)); const q3done = bs.filter((b) => b.proc === 'QT3' && b.status === 'hoan_tat');
      const priceOf = (q1id: string) => { const m = new Map<string, number | null>(); (docOf(q1id, myCo)?.tables?.ds ?? []).forEach((r) => m.set(String(r.ma_tam ?? ''), numv(r.don_gia))); return m; };
      const kgR = (r: Row) => numv(r.kg) ?? kgOf(r) ?? 0;
      const ord: Agg = { tam: 0, kg: 0, val: 0 }; let ordHidden = true;
      q1b.forEach((b) => { (docOf(b.id, 'PN')?.tables?.ds ?? []).forEach((r) => { ord.tam += numv(r.so_tam) ?? 0; ord.kg += kgR(r); });
        const md = docOf(b.id, myCo)?.tables?.ds ?? []; if (md.some((r) => r.don_gia != null)) ordHidden = false; ord.val = (ord.val ?? 0) + md.reduce((a, r) => a + (ttOf(r) ?? 0), 0); });
      if (ordHidden) ord.val = null;
      const q1ofQ3 = (b: B) => { const c = b.co_order_id ? coById[b.co_order_id] : undefined; return c?.batch_id ?? null; };
      const delivBy: Record<string, Map<string, number>> = {};
      const dlv: Agg = { tam: 0, kg: 0, val: ordHidden ? null : 0 };
      const trips = q3done.map((b) => { const d = docOf(b.id, 'PN') ?? data.d.find((x) => x.batch_id === b.id); const rs = d?.tables?.tp ?? []; const q1 = q1ofQ3(b);
        const pm = q1 ? priceOf(q1) : null; let tam = 0, kg = 0, val = 0;
        rs.forEach((r) => { const n = numv(r.so_tam) ?? 0; tam += n; kg += kgR(r); const g = pm?.get(String(r.ma_tam ?? '')); if (g != null) val += (m2Of(r) ?? 0) * g;
          if (q1) { const mm = (delivBy[q1] ??= new Map()); const k = String(r.ma_tam ?? ''); mm.set(k, (mm.get(k) ?? 0) + n); } });
        dlv.tam += tam; dlv.kg += kg; if (dlv.val != null) dlv.val += val;
        return { id: b.id, t: b.title, ngay: d?.header?.ngay_giao ?? (b.done_at ?? '').slice(0, 10), phieu: d?.header?.so_phieu ?? '', tam, kg, val: ordHidden ? null : Math.round(val) }; })
        .sort((a, z) => String(z.ngay).localeCompare(String(a.ngay)));
      const pend = q1b.map((b) => { const rs = docOf(b.id, 'PN')?.tables?.ds ?? []; const got = delivBy[b.id] ?? new Map(); let tam = 0, kg = 0;
        rs.forEach((r) => { const n = numv(r.so_tam) ?? 0; const k = String(r.ma_tam ?? ''); const g = Math.min(n, got.get(k) ?? 0); got.set(k, (got.get(k) ?? 0) - g); const rem = n - g; tam += rem; kg += n ? kgR(r) * rem / n : 0; });
        const o = data.o.find((x) => x.id === b.order_id); const code = data.co.find((c) => c.batch_id === b.id && c.company === myCo)?.code ?? data.co.find((c) => c.batch_id === b.id)?.code ?? b.title;
        return { id: b.id, t: b.title, code, tam, kg, due: o?.due_date ?? '', oid: b.order_id }; }).filter((x) => x.tam > 0);
      const going = bs.filter((b) => b.proc === 'QT3' && ['dang_lam', 'cho_ky'].includes(b.status)).length;
      const late = os.filter((o) => o.due_date && o.due_date < today && !['hoan_tat', 'huy'].includes(o.status)).length;
      void bid;
      return { p, end: data.cu[p.end_customer_id ?? '']?.name ?? '—', n, m2, kg, val, prog, late, ord, dlv, trips, pend, going }; }); }, [pj, data, st, q, today, myCo]);
  const csv = () => { if (!rows) return; const H = ['Mã dự án', 'Tên', 'Khách cuối', 'Trạng thái', 'Đơn PN', 'Đơn IPC', 'Đơn HW', 'm²', 'kg', 'Giá trị PN', 'Giá trị IPC', 'Giá trị HW', 'QT0', 'QT1', 'QT2', 'QT3', 'Đơn trễ', 'Tấm đặt', 'Tấn đặt', 'Tấm đã giao', 'Tấn đã giao', 'Trị giá đã giao (' + myCo + ')', 'Tấm còn lại'];
    const L = rows.map((r) => [r.p.code, r.p.name, r.end, r.p.status === 'open' ? 'Đang mở' : 'Đã đóng', r.n.PN, r.n.IPC, r.n.HW, r.m2.toFixed(2), r.kg.toFixed(1), r.val.PN ?? '', r.val.IPC ?? '', r.val.HW ?? '', ...['QT0', 'QT1', 'QT2', 'QT3'].map((k) => r.prog[k].join('/')), r.late, r.ord.tam, (r.ord.kg / 1000).toFixed(3), r.dlv.tam, (r.dlv.kg / 1000).toFixed(3), r.dlv.val ?? '', r.ord.tam - r.dlv.tam]);
    const t = '﻿' + [H, ...L].map((l) => l.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'bao-cao-du-an.csv'; a.click(); };
  return (
    <div className="prr">
      <div className="page-head"><div><h1>Báo cáo theo dự án</h1><p className="muted">Khối lượng theo đơn PN · đã giao = đợt QT3 khách đã ký nhận · giá trị theo quyền xem giá của bạn.</p></div>
        <button className="btn" onClick={csv} disabled={!rows?.length}><Icon name="download" size={18} />Tải CSV</button></div>
      <div className="pja-bar">
        <input className="pja-q" placeholder="Tìm mã, tên dự án…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm dự án" />
        <div className="seg" role="group" aria-label="Trạng thái">{([['open', 'Đang mở'], ['closed', 'Đã đóng'], ['all', 'Tất cả']] as const).map(([k, t]) =>
          <button key={k} type="button" aria-pressed={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{t}</button>)}</div>
      </div>
      {!rows ? <Skeleton rows={3} h={120} /> : rows.length === 0 ? <Empty title="Không có dự án" /> :
      <ul className="prr-list">{rows.map((r) => <li key={r.p.id} className={'card prr-it' + (r.p.status === 'closed' ? ' is-closed' : '')}>
        <div className="prr-h"><b className="pj-code">{r.p.code}</b><div className="prr-t"><b>{r.p.name}</b><span className="small muted">{r.end}{r.p.status === 'closed' && ' · Đã đóng ' + (r.p.closed_at ?? '').slice(0, 10)}</span></div>
          {r.late > 0 && <span className="chip bad"><Icon name="alert" size={13} />{r.late} đơn trễ</span>}
          <Link className="btn sm" to={'/don?q=' + encodeURIComponent(r.p.name)}>Xem đơn</Link></div>
        <div className="prr-kpi">
          {COS.map((c) => <div key={c}><span>Đơn {c}</span><b>{r.n[c]}</b><small>{r.val[c] == null ? 'Ẩn giá' : r.val[c] ? fmt(r.val[c] as number) + ' đ' : '—'}</small></div>)}
          <div><span>Khối lượng</span><b>{fmt(r.m2, 1)} m²</b><small>{fmt(r.kg)} kg</small></div>
        </div>
        {r.ord.tam > 0 && <div className="prr-dl">
          <div className="prr-dl-h"><b>Giao hàng</b><span className="small muted">{r.going > 0 ? r.going + ' đợt đang giao · ' : ''}giá theo {myCo}</span></div>
          <div className="prr-bar" role="img" aria-label={'Đã giao ' + Math.round(r.dlv.tam / r.ord.tam * 100) + '%'}><i style={{ width: Math.min(100, r.dlv.tam / r.ord.tam * 100) + '%' }} /><span>{Math.round(r.dlv.tam / r.ord.tam * 100)}%</span></div>
          <div className="prr-3">{([['Đặt', r.ord], ['Đã giao', r.dlv], ['Còn lại', { tam: r.ord.tam - r.dlv.tam, kg: r.ord.kg - r.dlv.kg, val: r.ord.val == null || r.dlv.val == null ? null : r.ord.val - r.dlv.val }]] as [string, Agg][]).map(([t, a]) =>
            <div key={t}><span>{t}</span><b>{fmt(a.tam)} tấm</b><small>{fmt(a.kg / 1000, 2)} t · {a.val == null ? 'ẩn giá' : fmt(a.val) + ' đ'}</small></div>)}</div>
          <button type="button" className="link-btn prr-more" aria-expanded={openId === r.p.id} onClick={() => setOpenId(openId === r.p.id ? '' : r.p.id)}>{openId === r.p.id ? 'Thu gọn' : 'Chi tiết: ' + r.trips.length + ' đợt đã giao · ' + r.pend.length + ' XNĐH chờ giao'}</button>
          {openId === r.p.id && <div className="prr-det">
            <div><b className="small">Đơn chờ giao</b>{r.pend.length === 0 ? <p className="small muted">Đã giao đủ.</p> :
              <table className="tbl prr-t"><thead><tr><th>Đơn</th><th className="n">Tấm còn</th><th className="n">Tấn</th><th>Hạn</th></tr></thead><tbody>
                {r.pend.map((x) => <tr key={x.id}><td><Link to={'/don/' + x.oid + '?tab=QT1'}>{x.code}</Link><div className="small muted">{x.t}</div></td><td className="n">{fmt(x.tam)}</td><td className="n">{fmt(x.kg / 1000, 2)}</td><td className={x.due && x.due < today ? 'prr-late' : ''}>{x.due ? x.due.split('-').reverse().join('/') : '—'}</td></tr>)}</tbody></table>}</div>
            <div><b className="small">Các đợt đã giao</b>{r.trips.length === 0 ? <p className="small muted">Chưa có đợt nào được khách ký nhận.</p> :
              <table className="tbl prr-t"><thead><tr><th>Ngày</th><th>Đợt / phiếu</th><th className="n">Tấm</th><th className="n">Tấn</th><th className="n">Trị giá</th></tr></thead><tbody>
                {r.trips.map((x) => <tr key={x.id}><td>{x.ngay ? String(x.ngay).split('-').reverse().join('/') : '—'}</td><td>{x.t}{x.phieu && <div className="small muted">{x.phieu}</div>}</td><td className="n">{fmt(x.tam)}</td><td className="n">{fmt(x.kg / 1000, 2)}</td><td className="n">{x.val == null ? '—' : fmt(x.val)}</td></tr>)}</tbody></table>}</div>
          </div>}
        </div>}
        <div className="prr-prog">{['QT0', 'QT1', 'QT2', 'QT3'].map((k) => { const [d, t] = r.prog[k]; return <div key={k} style={{ ['--qc' as string]: ({ QT0: '#3A6EA5', QT1: '#6A3FA0', QT2: '#B4690E', QT3: '#2E6B45' } as Record<string, string>)[k] }}>
          <span>{k}</span><i style={{ ['--w' as string]: t ? (d / t) * 100 + '%' : '0%' }} /><small>{t ? d + '/' + t : '—'}</small></div>; })}</div>
      </li>)}</ul>}
    </div>);
}
