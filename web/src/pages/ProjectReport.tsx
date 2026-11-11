import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Customer } from '../lib/supabase';
import { useProjects } from '../lib/projects';
import { m2Of, kgOf, ttOf, type Row } from '../lib/proc';
import { Skeleton, Empty } from '../components/ui';
import { Icon } from '../components/Icon';

type B = { id: string; order_id: string; proc: string; status: string };
type D = { batch_id: string; company: string; status: string; tables: Record<string, Row[]> | null };
type CO = { company: string; code: string; project_id: string | null };
type O = { id: string; project_id: string | null; due_date: string | null; status: string };
const COS = ['PN', 'IPC', 'HW'] as const;
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d });
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Báo cáo theo dự án: số đơn mỗi công ty, khối lượng, giá trị (theo quyền xem giá), tiến độ, trễ */
export default function ProjectReport() {
  const pj = useProjects(); const [st, setSt] = useState<'open' | 'closed' | 'all'>('open'); const [q, setQ] = useState('');
  const [data, setData] = useState<{ o: O[]; b: B[]; d: D[]; co: CO[]; cu: Record<string, Customer> } | null>(null);
  useEffect(() => { Promise.all([sb.from('orders').select('id, project_id, due_date, status'), sb.from('batches').select('id, order_id, proc, status'), sb.from('docs_v').select('batch_id, company, status, tables'),
    sb.from('co_orders').select('company, code, project_id'), sb.from('customers').select('*')]).then(([o, b, d, co, cu]) =>
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
      const late = os.filter((o) => o.due_date && o.due_date < today && !['hoan_tat', 'huy'].includes(o.status)).length;
      void bid;
      return { p, end: data.cu[p.end_customer_id ?? '']?.name ?? '—', n, m2, kg, val, prog, late }; }); }, [pj, data, st, q, today]);
  const csv = () => { if (!rows) return; const H = ['Mã dự án', 'Tên', 'Khách cuối', 'Trạng thái', 'Đơn PN', 'Đơn IPC', 'Đơn HW', 'm²', 'kg', 'Giá trị PN', 'Giá trị IPC', 'Giá trị HW', 'QT0', 'QT1', 'QT2', 'QT3', 'Đơn trễ'];
    const L = rows.map((r) => [r.p.code, r.p.name, r.end, r.p.status === 'open' ? 'Đang mở' : 'Đã đóng', r.n.PN, r.n.IPC, r.n.HW, r.m2.toFixed(2), r.kg.toFixed(1), r.val.PN ?? '', r.val.IPC ?? '', r.val.HW ?? '', ...['QT0', 'QT1', 'QT2', 'QT3'].map((k) => r.prog[k].join('/')), r.late]);
    const t = '﻿' + [H, ...L].map((l) => l.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv' })); a.download = 'bao-cao-du-an.csv'; a.click(); };
  return (
    <div className="prr">
      <div className="page-head"><div><h1>Báo cáo theo dự án</h1><p className="muted">Khối lượng theo đơn PN · giá trị theo quyền xem giá của bạn · tiến độ = xong / tổng hồ sơ.</p></div>
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
        <div className="prr-prog">{['QT0', 'QT1', 'QT2', 'QT3'].map((k) => { const [d, t] = r.prog[k]; return <div key={k} style={{ ['--qc' as string]: ({ QT0: '#3A6EA5', QT1: '#6A3FA0', QT2: '#B4690E', QT3: '#2E6B45' } as Record<string, string>)[k] }}>
          <span>{k}</span><i style={{ ['--w' as string]: t ? (d / t) * 100 + '%' : '0%' }} /><small>{t ? d + '/' + t : '—'}</small></div>; })}</div>
      </li>)}</ul>}
    </div>);
}
