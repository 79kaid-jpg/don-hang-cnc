import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { useMyCo, useAllView, setScope, type Co } from '../lib/myco';
import { cached } from '../lib/qcache';

type Unit = 't' | 'm2' | 'tam';
type ST = { q1: { id: string; order_id: string; title: string; created_at: string; o: number[]; r: number[] }[]; q3: { id: string; order_id: string; done_at: string; title?: string; d: number[] }[] };
const UN: Record<Unit, string> = { t: 'tấn', m2: 'm²', tam: 'tấm' };
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
const ld = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const addM = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };

/** Khối sản lượng gọn cho "Việc của tôi": 6 tháng, đã giao / kế hoạch, tồn, đúng hạn, cần giao 14 ngày */
export function ProdMini() { return useAllView() ? <ProdMiniAll /> : <ProdMiniCo />; }

/** Tất cả: 3 thẻ gọn PN · IPC · HW trong tháng này, bấm → xem riêng công ty đó */
function ProdMiniAll() {
  const COS: Co[] = ['PN', 'IPC', 'HW'];
  const [s, setS] = useState<Record<string, { tam: number; val: number; trips: number; rem: number }> | null>(null);
  useEffect(() => { let on = true; const cur = new Date().toISOString().slice(0, 7);
    Promise.all(COS.map((c) => cached('prod:' + c, () => sb.rpc('prod_stats', { p_co: c }), 60000))).then((r) => { if (!on) return;
      setS(Object.fromEntries(COS.map((c, i) => { const st = (r[i].data ?? { q1: [], q3: [] }) as ST; const q3 = st.q3.filter((x) => x.done_at.startsWith(cur));
        return [c, { tam: q3.reduce((a, x) => a + (+x.d[2] || 0), 0), val: q3.reduce((a, x) => a + (+x.d[3] || 0), 0), trips: q3.length, rem: st.q1.reduce((a, x) => a + (+(x as { r?: number[] }).r?.[2]! || 0), 0) }]; }))); });
    return () => { on = false; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const f = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return <section className="pm pm-all" aria-label="Sản lượng tháng này · 3 công ty">
    <div className="pm-h"><b>Sản lượng tháng này · 3 công ty</b><span className="muted small">bấm thẻ để xem riêng</span></div>
    <div className="pm-all-g">{COS.map((c) => <button key={c} type="button" className="pm-all-c" onClick={() => setScope(c)}>
      <span className={'co-chip c-' + c}>{c === 'HW' ? 'Hanwa' : c}</span>
      {!s ? <span className="muted">…</span> : <><b>{f(s[c].tam)} <small>tấm</small></b><span>{s[c].val ? f(s[c].val / 1e6) + ' tr' : '—'} · {s[c].trips} đợt</span><span className="muted small">Tồn {f(s[c].rem)} tấm</span></>}
    </button>)}</div></section>;
}

function ProdMiniCo() {
  const { co } = useMyCo(); const nav = useNavigate(); void nav;
  const [dr, setDr] = useState<{ t: string; sub?: string; rows: { id: string; to: string; a: string; b: string; c: string; v: number[]; late?: boolean }[] } | null>(null);
  useEffect(() => { if (!dr) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setDr(null); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [dr]);
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
    const tripRow = (x: ST['q3'][number]) => { const o = ord.get(x.order_id); const due = o?.due_date ?? null;
      return { id: x.id, to: '/don/' + x.order_id + '?tab=QT3', a: x.done_at.slice(8, 10) + '/' + x.done_at.slice(5, 7), b: o?.project_id ? pc.get(o.project_id) ?? '—' : '—', c: x.title ?? 'Đợt giao', v: x.d, late: !!due && x.done_at.slice(0, 10) > due }; };
    const trips = (m: string) => d.st.q3.filter((x) => x.done_at.startsWith(m)).sort((a, z) => z.done_at.localeCompare(a.done_at)).map(tripRow);
    const remRows = d.st.q1.filter((x) => +x.r[2] > 0).map((x) => { const o = ord.get(x.order_id); return { id: x.id, to: '/don/' + x.order_id + '?tab=QT1', a: o?.due_date ? o.due_date.slice(8) + '/' + o.due_date.slice(5, 7) : '—', b: o?.project_id ? pc.get(o.project_id) ?? '—' : '—', c: x.title, v: x.r, late: !!o?.due_date && o.due_date < td }; })
      .sort((a, z) => a.a.localeCompare(z.a));
    return { trips, remRows, cur, td, series, delCur: del.get(cur) ?? 0, planCur: d.plan[cur] ?? null, back, months: avg3 ? backKg / avg3 : null, onTime: tot ? on / tot : null, soon };
  }, [d, u]);
  if (!M) return <section className="card pm pm-skel" aria-busy="true"><div className="skel" style={{ height: 180 }} /></section>;
  const mLbl = (m: string) => 'tháng ' + Number(m.slice(5)) + '/' + m.slice(0, 4);
  const openM = (m: string) => setDr({ t: 'Đã giao ' + mLbl(m), sub: 'các đợt giao đã duyệt', rows: M.trips(m) });
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
              onClick={() => openM(s.m)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openM(s.m); } }}>
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
            <button type="button" className="pm-k hero" title="Xem chi tiết" onClick={() => openM(M.cur)}><span>Đã giao</span><b>{fmt(M.delCur, dp)}<small>{UN[u]}</small></b>{pp != null && <><i className="pm-bar"><b style={{ width: Math.min(100, pp) + '%' }} /></i><em>{pp}% kế hoạch</em></>}</button>
            <button type="button" className="pm-k" title="Xem chi tiết" onClick={() => setDr({ t: 'Tồn chưa giao', sub: 'XNĐH còn tấm chưa giao', rows: M.remRows })}><span>Tồn chưa giao</span><b>{fmt(M.back, dp)}<small>{UN[u]}</small></b><em>{M.months != null ? '≈ ' + fmt(M.months, 1) + ' tháng' : ''}</em></button>
            <button type="button" title="Xem chi tiết" className={"pm-k" + (M.onTime != null && M.onTime >= .95 ? " ok" : "")} onClick={() => setDr({ t: 'Đúng hạn ' + mLbl(M.cur), sub: 'đợt trễ hạn đưa lên đầu', rows: M.trips(M.cur).sort((a, z) => Number(!!z.late) - Number(!!a.late)) })}><span>Đúng hạn</span><b>{M.onTime == null ? '—' : Math.round(M.onTime * 100)}<small>%</small></b><em>mục tiêu 95%</em></button>
          </div>
          <div className="pm-soon"><b className="small">Cần giao ≤ 14 ngày / đã trễ</b>
            {M.soon.length === 0 ? <span className="muted small">Không có.</span> : M.soon.slice(0, 3).map((x) => <Link key={x.id} to={'/don/' + x.order_id + '?tab=QT3'} className="pm-s">
              <span className={x.due! < M.td ? 'pd-late' : 'muted'}>{x.due!.slice(8)}/{x.due!.slice(5, 7)}</span><b>{x.code}</b><span className="pd-ell">{x.title}</span><b>{fmt((+x.r[u === 't' ? 0 : u === 'm2' ? 1 : 2] || 0) * (u === 't' ? 1 / 1000 : 1), dp)} {UN[u]}</b></Link>)}
            {M.soon.length > 3 && <button type="button" className="pm-more small" onClick={() => setDr({ t: 'Cần giao ≤ 14 ngày / đã trễ', rows: M.remRows.filter((r) => M.soon.some((x) => x.id === r.id)) })}>+{M.soon.length - 3} XNĐH khác ›</button>}
          </div>
          <Link to="/thong-ke" className="small pm-all">Xem thống kê đầy đủ →</Link>
        </div>
      </div>
      {dr && createPortal(<div className="pd-dr-bg pm-dr-bg" onClick={() => setDr(null)}>
        <aside className="pd-dr pm-dr" role="dialog" aria-modal="true" aria-label={dr.t} onClick={(e) => e.stopPropagation()}>
          <header><div><b>{dr.t}</b> <span className="muted small">{dr.rows.length} dòng{dr.sub ? ' · ' + dr.sub : ''}</span></div><button type="button" className="btn sm" onClick={() => setDr(null)} aria-label="Đóng">✕</button></header>
          <div className="pd-dr-b">{dr.rows.length === 0 ? <p className="muted">Không có.</p> : dr.rows.map((r) => <Link key={r.id} className="pd-dr-r pm-dr-r" to={r.to} onClick={() => setDr(null)}>
            <span className={r.late ? 'pd-late' : 'muted'}>{r.a}{r.late ? ' · trễ' : ''}</span><b>{r.b}</b><span className="pd-ell">{r.c}</span><b>{fmt((+r.v[u === 't' ? 0 : u === 'm2' ? 1 : 2] || 0) * (u === 't' ? 1 / 1000 : 1), dp)} {UN[u]}</b></Link>)}</div>
          <footer><Link to={'/thong-ke'} className="btn sm" onClick={() => setDr(null)}>Xem đầy đủ ở Thống kê ›</Link></footer>
        </aside></div>, document.body)}
    </section>);
}
