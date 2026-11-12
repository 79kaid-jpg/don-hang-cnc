import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { useMyCo } from '../lib/myco';
import { cached } from '../lib/qcache';

type Unit = 't' | 'm2' | 'tam';
type ST = { q1: { id: string; order_id: string; title: string; created_at: string; o: number[]; r: number[] }[]; q3: { id: string; order_id: string; done_at: string; d: number[] }[] };
const UN: Record<Unit, string> = { t: 'tấn', m2: 'm²', tam: 'tấm' };
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
const ld = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addM = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };

/** Khối sản lượng gọn cho "Việc của tôi": 6 tháng, đã giao / kế hoạch, tồn, đúng hạn, cần giao 14 ngày */
export function ProdMini() {
  const { co } = useMyCo(); const nav = useNavigate();
  const [u, setU] = useState<Unit>(() => { try { return (localStorage.getItem('prod-u') as Unit) || 't'; } catch { return 't'; } });
  const [d, setD] = useState<{ st: ST; o: { id: string; project_id: string | null; due_date: string | null }[]; p: { id: string; code: string }[]; plan: Record<string, number> } | null>(null);
  useEffect(() => { try { localStorage.setItem('prod-u', u); } catch { /* */ } }, [u]);
  useEffect(() => {
    let on = true;
    Promise.all([cached('prod:' + co, () => sb.rpc('prod_stats', { p_co: co || 'PN' }), 60000), cached('pm:o', () => sb.from('orders').select('id, project_id, due_date'), 60000),
      cached('pm:p', () => sb.from('projects').select('id, code'), 60000), cached('pm:pl', () => sb.from('monthly_plans').select('month, tons'), 60000)])
      .then(([s, o, p, pl]) => { if (!on) return; setD({ st: (s.data ?? { q1: [], q3: [] }) as ST, o: (o.data ?? []) as never, p: (p.data ?? []) as never,
        plan: Object.fromEntries(((pl.data ?? []) as { month: string; tons: number }[]).map((x) => [x.month.slice(0, 7), Number(x.tons)])) }); });
    return () => { on = false; };
  }, [co]);
  const M = useMemo(() => {
    if (!d) return null;
    const td = ld(), cur = td.slice(0, 7), months = Array.from({ length: 6 }, (_, i) => addM(cur, i - 5));
    const ix = u === 't' ? 0 : u === 'm2' ? 1 : 2; const k = u === 't' ? 1 / 1000 : 1;
    const ord = new Map(d.o.map((o) => [o.id, o]));
    const del = new Map<string, number>(); let on = 0, tot = 0;
    d.st.q3.forEach((x) => { const m = x.done_at.slice(0, 7); del.set(m, (del.get(m) ?? 0) + (+x.d[ix] || 0) * k);
      if (m === cur) { const due = ord.get(x.order_id)?.due_date; if (due) { tot++; if (x.done_at.slice(0, 10) <= due) on++; } } });
    const kgM = (m: string) => d.st.q3.filter((x) => x.done_at.startsWith(m)).reduce((a, x) => a + (+x.d[0] || 0), 0);
    const avg3 = [1, 2, 3].reduce((a, i) => a + kgM(addM(cur, -i)), 0) / 3;
    const backKg = d.st.q1.reduce((a, x) => a + (+x.r[0] || 0), 0); const back = d.st.q1.reduce((a, x) => a + (+x.r[ix] || 0), 0) * k;
    const pc = new Map(d.p.map((p) => [p.id, p.code]));
    const soon = d.st.q1.filter((x) => +x.r[2] > 0).map((x) => { const o = ord.get(x.order_id); return { ...x, due: o?.due_date ?? null, code: o?.project_id ? pc.get(o.project_id) ?? '—' : '—' }; })
      .filter((x) => x.due && (Date.parse(x.due) - Date.parse(td)) / 864e5 <= 14).sort((a, z) => String(a.due).localeCompare(String(z.due)));
    const series = months.map((m) => ({ m, v: del.get(m) ?? 0, plan: u === 't' ? d.plan[m] ?? null : null }));
    return { cur, td, series, delCur: del.get(cur) ?? 0, planCur: d.plan[cur] ?? null, back, months: avg3 ? backKg / avg3 : null, onTime: tot ? on / tot : null, soon };
  }, [d, u]);
  if (!M) return <section className="card pm pm-skel" aria-busy="true"><div className="skel" style={{ height: 180 }} /></section>;
  const dp = u === 't' ? 1 : 0; const mx = Math.max(1, ...M.series.map((s) => Math.max(s.v, s.plan ?? 0))) * 1.12;
  const W = 360, H = 120, bw = 34, step = W / 6, y = (v: number) => 8 + H - (v / mx) * H, x = (i: number) => i * step + (step - bw) / 2;
  const plan = M.series.map((s, i) => (s.plan == null ? '' : (i && M.series[i - 1].plan != null ? 'L' : 'M') + (x(i) + bw / 2) + ' ' + y(s.plan).toFixed(1))).join(' ');
  const pp = M.planCur ? Math.round(M.delCur / M.planCur * 100) : null;
  return (
    <section className="card pm" aria-labelledby="h-prod">
      <div className="card-head"><h2 id="h-prod">Sản lượng</h2><span className="muted small">tháng {Number(M.cur.slice(5))} · đến {M.td.slice(8)}/{M.td.slice(5, 7)}</span>
        <span className="pd-seg pm-u" role="group" aria-label="Đơn vị">{(['t', 'm2', 'tam'] as Unit[]).map((k) => <button key={k} aria-pressed={u === k} onClick={() => setU(k)}>{k === 't' ? 'Tấn' : k === 'm2' ? 'm²' : 'Tấm'}</button>)}</span></div>
      <div className="pm-b">
        <div className="pm-chart">
          <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label="Sản lượng đã giao 6 tháng">
            {M.series.map((s, i) => <g key={s.m} className="pm-col" role="button" tabIndex={0} aria-label={'Tháng ' + Number(s.m.slice(5)) + ': ' + fmt(s.v, dp) + ' ' + UN[u]}
              onClick={() => nav('/thong-ke?m=' + s.m)} onKeyDown={(e) => { if (e.key === 'Enter') nav('/thong-ke?m=' + s.m); }}>
              <rect x={i * step} y={0} width={step} height={H + 8} className="hit" />
              <rect x={x(i)} y={y(s.v)} width={bw} height={Math.max(0, 8 + H - y(s.v))} rx={3} className={s.m === M.cur ? 'b cur' : 'b'} />
              <text x={x(i) + bw / 2} y={y(s.v) - 5} textAnchor="middle" className="v">{fmt(s.v, s.v >= 100 || u !== 't' ? 0 : 1)}</text>
              <text x={x(i) + bw / 2} y={H + 26} textAnchor="middle">T{Number(s.m.slice(5))}</text><title>{'Tháng ' + Number(s.m.slice(5)) + ': đã giao ' + fmt(s.v, dp) + ' ' + UN[u] + (s.plan ? ' · kế hoạch ' + fmt(s.plan) : '')}</title></g>)}
            {plan && <path d={plan} className="p" />}
          </svg>
          <div className="pm-leg small muted"><span><i className="sq" />Đã giao</span>{u === 't' && <span><i className="ds" />Kế hoạch</span>}</div>
        </div>
        <div className="pm-side">
          <div className="pm-kpis">
            <div className="pm-k hero"><span>Đã giao</span><b>{fmt(M.delCur, dp)}<small>{UN[u]}</small></b>{pp != null && <><i className="pm-bar"><b style={{ width: Math.min(100, pp) + '%' }} /></i><em>{pp}% kế hoạch</em></>}</div>
            <div className="pm-k"><span>Tồn chưa giao</span><b>{fmt(M.back, dp)}<small>{UN[u]}</small></b><em>{M.months != null ? '≈ ' + fmt(M.months, 1) + ' tháng' : ''}</em></div>
            <div className="pm-k"><span>Đúng hạn</span><b>{M.onTime == null ? '—' : Math.round(M.onTime * 100)}<small>%</small></b><em>mục tiêu 95%</em></div>
          </div>
          <div className="pm-soon"><b className="small">Cần giao ≤ 14 ngày / đã trễ</b>
            {M.soon.length === 0 ? <span className="muted small">Không có.</span> : M.soon.slice(0, 3).map((x) => <Link key={x.id} to={'/don/' + x.order_id + '?tab=QT3'} className="pm-s">
              <span className={x.due! < M.td ? 'pd-late' : 'muted'}>{x.due!.slice(8)}/{x.due!.slice(5, 7)}</span><b>{x.code}</b><span className="pd-ell">{x.title}</span><b>{fmt((+x.r[u === 't' ? 0 : u === 'm2' ? 1 : 2] || 0) * (u === 't' ? 1 / 1000 : 1), dp)} {UN[u]}</b></Link>)}
            {M.soon.length > 3 && <span className="muted small">+{M.soon.length - 3} XNĐH khác</span>}
          </div>
          <Link to="/thong-ke" className="small pm-all">Xem thống kê đầy đủ →</Link>
        </div>
      </div>
    </section>);
}
