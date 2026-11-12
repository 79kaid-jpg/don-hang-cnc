import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { m2Of, kgOf, type Row } from '../lib/proc';
import { useMyCo, setViewCo, CO_NAME, type Co } from '../lib/myco';
import { Skeleton } from '../components/ui';

type P = { id: string; code: string; name: string; end_customer_id: string | null; status: string };
type O = { id: string; project_id: string | null; due_date: string | null; customer_id: string | null };
type B = { id: string; order_id: string; proc: string; status: string; title: string; created_at: string; done_at: string | null; co_order_id: string | null };
type D = { batch_id: string; company: string; tables: Record<string, Row[]> | null };
type CO = { id: string; batch_id: string | null; company: string; code: string };
type Unit = 't' | 'm2' | 'tam';
type Per = 'M' | 'Q' | 'Y';
type Q = { kg: number; m2: number; tam: number; val: number };
const Z = (): Q => ({ kg: 0, m2: 0, tam: 0, val: 0 });
const add = (a: Q, b: Q) => { a.kg += b.kg; a.m2 += b.m2; a.tam += b.tam; a.val += b.val; return a; };
const num = (v: unknown) => { const s = String(v ?? '').trim(); if (!s) return null; const n = Number(s.replace(',', '.')); return isFinite(n) ? n : null; };
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
const mk = (d: string) => d.slice(0, 7);
const UNAME: Record<Unit, string> = { t: 'tấn', m2: 'm²', tam: 'tấm' };
const uv = (q: Q, u: Unit) => (u === 't' ? q.kg / 1000 : u === 'm2' ? q.m2 : q.tam);
const ufmt = (q: Q, u: Unit) => fmt(uv(q, u), u === 't' ? 1 : 0);
const tỷ = (v: number) => (v >= 1e9 ? fmt(v / 1e9, 2) + ' tỷ' : fmt(v / 1e6, 0) + ' tr');
const today = () => new Date().toISOString().slice(0, 10);
const addM = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };
const MN = (ym: string) => 'T' + Number(ym.slice(5));

/** Thống kê sản lượng dự án cho lãnh đạo: đã giao (QT3 khách ký), đặt mới (XNĐH), tồn chưa giao, dự án, khách hàng */
export default function Production() {
  const { co: co0, canSwitch } = useMyCo(); const [co, setCo] = useState<Co>(co0);
  const [u, setU] = useState<Unit>(() => { try { return (localStorage.getItem('prod-u') as Unit) || 't'; } catch { return 't'; } });
  const [per, setPer] = useState<Per>('M');
  const [data, setData] = useState<{ p: P[]; o: O[]; b: B[]; d: D[]; co: CO[]; cu: Record<string, string>; plan: Record<string, number> } | null>(null);
  useEffect(() => { try { localStorage.setItem('prod-u', u); } catch { /* */ } }, [u]);
  useEffect(() => {
    Promise.all([sb.from('projects').select('id, code, name, end_customer_id, status'), sb.from('orders').select('id, project_id, due_date, customer_id'),
      sb.from('batches').select('id, order_id, proc, status, title, created_at, done_at, co_order_id').in('proc', ['QT1', 'QT3']),
      sb.from('docs_v').select('batch_id, company, tables'), sb.from('co_orders').select('id, batch_id, company, code'), sb.from('customers').select('id, name'), sb.from('monthly_plans').select('month, tons')])
      .then(([p, o, b, d, c, cu, pl]) => setData({ p: (p.data ?? []) as P[], o: (o.data ?? []) as O[], b: (b.data ?? []) as B[], d: (d.data ?? []) as D[], co: (c.data ?? []) as CO[],
        cu: Object.fromEntries(((cu.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])), plan: Object.fromEntries(((pl.data ?? []) as { month: string; tons: number }[]).map((x) => [mk(x.month), Number(x.tons)])) }));
  }, []);

  const M = useMemo(() => {
    if (!data) return null;
    const td = today(), cur = mk(td);
    const docOf = new Map<string, D>(); data.d.forEach((d) => docOf.set(d.batch_id + ':' + d.company, d));
    const coById = new Map(data.co.map((x) => [x.id, x]));
    const ord = new Map(data.o.map((o) => [o.id, o]));
    const q1 = data.b.filter((b) => b.proc === 'QT1' && !['fail', 'huy'].includes(b.status));
    const q3 = data.b.filter((b) => b.proc === 'QT3' && b.status === 'hoan_tat' && b.done_at);
    const rowQ = (r: Row, price: number | null): Q => { const m2 = m2Of(r) ?? 0, tam = num(r.so_tam) ?? 0; return { kg: num(r.kg) ?? kgOf(r) ?? 0, m2, tam, val: price != null ? m2 * price : 0 }; };
    const priceMap = new Map<string, Map<string, number>>();
    const priceOf = (q1id: string) => { let m = priceMap.get(q1id); if (!m) { m = new Map(); (docOf.get(q1id + ':' + co)?.tables?.ds ?? []).forEach((r) => { const g = num(r.don_gia); if (g != null) m!.set(String(r.ma_tam ?? ''), g); }); priceMap.set(q1id, m); } return m; };
    // đặt (theo XNĐH)
    const byMonthOrd = new Map<string, Q>(); const ordByB = new Map<string, Q>(); const ordRows = new Map<string, Row[]>();
    q1.forEach((b) => { const rs = docOf.get(b.id + ':PN')?.tables?.ds ?? docOf.get(b.id + ':' + co)?.tables?.ds ?? []; ordRows.set(b.id, rs); const pm = priceOf(b.id);
      const s = rs.reduce<Q>((a, r) => add(a, rowQ(r, pm.get(String(r.ma_tam ?? '')) ?? null)), Z()); ordByB.set(b.id, s); const k = mk(b.created_at); byMonthOrd.set(k, add(byMonthOrd.get(k) ?? Z(), s)); });
    // đã giao (QT3 khách ký)
    const byMonthDel = new Map<string, Q>(); const delByB = new Map<string, Map<string, number>>(); const delQByB = new Map<string, Q>(); const trips: { b: B; q: Q; onTime: boolean | null }[] = [];
    q3.forEach((b) => { const d = docOf.get(b.id + ':PN') ?? data.d.find((x) => x.batch_id === b.id); const rs = d?.tables?.tp ?? []; const q1id = b.co_order_id ? coById.get(b.co_order_id)?.batch_id ?? null : null;
      const pm = q1id ? priceOf(q1id) : new Map<string, number>(); const s = Z();
      rs.forEach((r) => { add(s, rowQ(r, pm.get(String(r.ma_tam ?? '')) ?? null)); if (q1id) { const mm = delByB.get(q1id) ?? new Map(); const k = String(r.ma_tam ?? ''); mm.set(k, (mm.get(k) ?? 0) + (num(r.so_tam) ?? 0)); delByB.set(q1id, mm); } });
      if (q1id) delQByB.set(q1id, add(delQByB.get(q1id) ?? Z(), s));
      const k = mk(b.done_at!); byMonthDel.set(k, add(byMonthDel.get(k) ?? Z(), s)); const due = ord.get(b.order_id)?.due_date; trips.push({ b, q: s, onTime: due ? b.done_at!.slice(0, 10) <= due : null }); });
    // còn lại theo XNĐH
    const rem = q1.map((b) => { const got = new Map(delByB.get(b.id) ?? []); const pm = priceOf(b.id); const s = Z();
      (ordRows.get(b.id) ?? []).forEach((r) => { const n = num(r.so_tam) ?? 0; if (!n) return; const k = String(r.ma_tam ?? ''); const g = Math.min(n, got.get(k) ?? 0); got.set(k, (got.get(k) ?? 0) - g); const f = (n - g) / n; if (f <= 0) return;
        const q = rowQ(r, pm.get(k) ?? null); add(s, { kg: q.kg * f, m2: q.m2 * f, tam: n - g, val: q.val * f }); });
      const o = ord.get(b.order_id); return { b, o, q: s, due: o?.due_date ?? null }; }).filter((x) => x.q.tam > 0);
    // kỳ
    const months = Array.from({ length: 12 }, (_, i) => addM(cur, i - 11));
    const inPer = (ym: string) => per === 'M' ? ym === cur : per === 'Q' ? ym.slice(0, 4) === cur.slice(0, 4) && Math.ceil(Number(ym.slice(5)) / 3) === Math.ceil(Number(cur.slice(5)) / 3) : ym.slice(0, 4) === cur.slice(0, 4);
    const prevOf = (ym: string) => per === 'M' ? ym === addM(cur, -1) : per === 'Q' ? (() => { const p = addM(cur, -3); return ym.slice(0, 4) === p.slice(0, 4) && Math.ceil(Number(ym.slice(5)) / 3) === Math.ceil(Number(p.slice(5)) / 3); })() : ym.slice(0, 4) === String(Number(cur.slice(0, 4)) - 1);
    const sumP = (m: Map<string, Q>, f: (ym: string) => boolean) => [...m].filter(([k]) => f(k)).reduce((a, [, q]) => add(a, q), Z());
    const del = sumP(byMonthDel, inPer), delPrev = sumP(byMonthDel, prevOf), ordP = sumP(byMonthOrd, inPer);
    const back = rem.reduce((a, x) => add(a, x.q), Z());
    const last3 = [1, 2, 3].map((i) => byMonthDel.get(addM(cur, -i)) ?? Z()); const avg3 = last3.reduce((a, q) => a + q.kg, 0) / 3;
    const tp = trips.filter((t) => inPer(mk(t.b.done_at!)) && t.onTime != null); const onTime = tp.length ? tp.filter((t) => t.onTime).length / tp.length : null;
    const tpPrev = trips.filter((t) => prevOf(mk(t.b.done_at!)) && t.onTime != null); const onTimePrev = tpPrev.length ? tpPrev.filter((t) => t.onTime).length / tpPrev.length : null;
    const planP = months.filter(inPer).reduce((a, m) => a + (data.plan[m] ?? 0), 0);
    const series = months.map((m) => ({ m, del: byMonthDel.get(m) ?? Z(), ord: byMonthOrd.get(m) ?? Z(), plan: data.plan[m] ?? null }));
    // tuổi tồn theo hạn
    const dd = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
    const aging = [Z(), Z(), Z(), Z()]; rem.forEach((x) => { const left = x.due ? dd(x.due, td) : 999; add(aging[left < 0 ? 3 : left <= 14 ? 2 : left <= 30 ? 1 : 0], x.q); });
    const soon = rem.filter((x) => x.due && dd(x.due, td) <= 14).sort((a, z) => String(a.due).localeCompare(String(z.due))).slice(0, 6);
    // dự án
    const pjById = new Map(data.p.map((p) => [p.id, p]));
    const proj = new Map<string, { p: P; ord: Q; del: Q; rem: Q; due: string | null; late: boolean; oid: string }>();
    q1.forEach((b) => { const o = ord.get(b.order_id); const p = o?.project_id ? pjById.get(o.project_id) : undefined; if (!p) return;
      const e = proj.get(p.id) ?? { p, ord: Z(), del: Z(), rem: Z(), due: null as string | null, late: false, oid: b.order_id }; add(e.ord, ordByB.get(b.id) ?? Z()); add(e.del, delQByB.get(b.id) ?? Z()); proj.set(p.id, e); });
    rem.forEach((x) => { const p = x.o?.project_id ? proj.get(x.o.project_id) : undefined; if (!p) return; add(p.rem, x.q); if (x.due && (!p.due || x.due < p.due)) p.due = x.due; if (x.due && x.due < td) p.late = true; });
    const projects = [...proj.values()].filter((x) => x.p.status !== 'closed').sort((a, z) => z.rem.kg - a.rem.kg);
    // khách hàng (năm nay)
    const custM = new Map<string, Q>(); trips.filter((t) => t.b.done_at!.slice(0, 4) === cur.slice(0, 4)).forEach((t) => { const o = ord.get(t.b.order_id); const p = o?.project_id ? pjById.get(o.project_id) : undefined; const cid = p?.end_customer_id ?? o?.customer_id ?? '';
      custM.set(cid, add(custM.get(cid) ?? Z(), t.q)); });
    const cust = [...custM].map(([id, q]) => ({ n: data.cu[id] ?? '—', q })).sort((a, z) => z.q.kg - a.q.kg);
    const custTop = cust.slice(0, 5); if (cust.length > 5) custTop.push({ n: 'Khác (' + (cust.length - 5) + ')', q: cust.slice(5).reduce((a, c) => add(a, c.q), Z()) });
    const hasVal = q1.some((b) => priceOf(b.id).size > 0);
    return { cur, del, delPrev, ordP, back, avg3, onTime, onTimePrev, planP, series, aging, soon, projects, custTop, hasVal, months };
  }, [data, co, per]);

  if (!M) return <Skeleton rows={4} h={140} />;
  const pct = (a: number, b: number) => (b ? Math.round((a / b - 1) * 100) : null);
  const ch = pct(M.del.kg, M.delPrev.kg), chV = pct(M.del.val, M.delPrev.val);
  const perName = per === 'M' ? 'tháng trước' : per === 'Q' ? 'quý trước' : 'năm trước';
  const title = per === 'M' ? 'Tháng ' + Number(M.cur.slice(5)) + '/' + M.cur.slice(0, 4) : per === 'Q' ? 'Quý ' + Math.ceil(Number(M.cur.slice(5)) / 3) + '/' + M.cur.slice(0, 4) : 'Năm ' + M.cur.slice(0, 4);
  const bb = M.del.kg ? M.ordP.kg / M.del.kg : null;
  const Delta = ({ v, inv }: { v: number | null; inv?: boolean }) => v == null ? <span className="muted">—</span> : <span className={(v >= 0) !== !!inv ? 'pd-up' : 'pd-dn'}>{v >= 0 ? '▲' : '▼'} {Math.abs(v)}%</span>;
  // biểu đồ
  const W = 820, H = 220, top = 14, L = 44, bw = 36, step = (W - L - 10) / 12;
  const vals = M.series.flatMap((s) => [uv(s.del, u), uv(s.ord, u), s.plan != null && u === 't' ? s.plan : 0]); const mx = Math.max(1, ...vals) * 1.1;
  const y = (v: number) => top + H - (v / mx) * H, x = (i: number) => L + i * step + (step - bw) / 2;
  const S = M.series; const line = (f: (s: (typeof S)[0]) => number | null) => S.map((s, i) => { const v = f(s); return v == null ? '' : (i && f(S[i - 1]) != null ? 'L' : 'M') + (x(i) + bw / 2).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * mx / 1.1);
  const spark = (k: 'del' | 'ord', f: (q: Q) => number) => { const a = M.series.map((s) => f(s[k])); const mn = Math.min(...a), mxx = Math.max(...a); return a.map((v, i) => (i ? 'L' : 'M') + (i * 120 / 11).toFixed(1) + ' ' + (25 - (v - mn) / (mxx - mn || 1) * 22).toFixed(1)).join(' '); };
  const agT = M.aging.reduce((a, q) => a + uv(q, u), 0) || 1; const AG = [['Còn > 30 ngày', '#2E6B45'], ['15–30 ngày', '#8DBB9C'], ['≤ 14 ngày', '#E0A43A'], ['Đã trễ hạn', '#C2412F']] as const;
  const cm = Math.max(1, ...M.custTop.map((c) => uv(c.q, u)));
  const dmy = (d: string | null) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) : '—');

  return (
    <div className="pd">
      <div className="pd-head">
        <div><div className="pd-eyebrow">SẢN LƯỢNG DỰ ÁN</div><h2 className="pd-title">{title}</h2><span className="muted small">số liệu đến {today().slice(8, 10)}/{today().slice(5, 7)} · đã giao = đợt QT3 khách ký nhận</span></div>
        <div className="pd-seg" role="group" aria-label="Đơn vị">{(['t', 'm2', 'tam'] as Unit[]).map((k) => <button key={k} aria-pressed={u === k} onClick={() => setU(k)}>{k === 't' ? 'Tấn' : k === 'm2' ? 'm²' : 'Tấm'}</button>)}</div>
        <div className="pd-seg" role="group" aria-label="Kỳ">{([['M', 'Tháng'], ['Q', 'Quý'], ['Y', 'Năm']] as [Per, string][]).map(([k, t]) => <button key={k} aria-pressed={per === k} onClick={() => setPer(k)}>{t}</button>)}</div>
        {canSwitch && <label className="pd-co">Giá theo<select value={co} onChange={(e) => { const c = e.target.value as Co; setCo(c); setViewCo(c); }}>{(['PN', 'IPC', 'HW'] as Co[]).map((c) => <option key={c} value={c}>{CO_NAME[c]}</option>)}</select></label>}
      </div>

      <section className="pd-kpis">
        <div className="pd-k hero"><span>Đã giao</span><b>{ufmt(M.del, u)}<small>{UNAME[u]}</small></b>
          <div><Delta v={ch} /> <span className="muted">so với {perName}</span></div>
          {u === 't' && M.planP > 0 && <><div className="pd-plan"><i style={{ width: Math.min(100, M.del.kg / 10 / M.planP) + '%' }} /></div><span className="muted small">{Math.round(M.del.kg / 10 / M.planP)}% kế hoạch ({fmt(M.planP)} t)</span></>}
          <svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><path d={spark('del', (q) => q.kg)} /></svg></div>
        <div className="pd-k"><span>Giá trị đã giao</span><b>{M.hasVal ? tỷ(M.del.val) : '—'}<small>đ</small></b><div><Delta v={chV} /> <span className="muted">theo giá {co}</span></div>
          <svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><path d={spark('del', (q) => q.val)} /></svg></div>
        <div className="pd-k"><span>Đặt mới (XNĐH)</span><b>{ufmt(M.ordP, u)}<small>{UNAME[u]}</small></b><div><span className="muted">đặt / giao </span><b className={bb != null && bb >= 1 ? 'pd-up' : 'pd-dn'}>{bb == null ? '—' : fmt(bb, 2)}</b></div>
          <svg viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true" className="o"><path d={spark('ord', (q) => q.kg)} /></svg></div>
        <div className="pd-k"><span>Tồn chưa giao</span><b>{ufmt(M.back, u)}<small>{UNAME[u]}</small></b><div><span className="pd-wa">≈ {M.avg3 ? fmt(M.back.kg / M.avg3, 1) : '—'} tháng</span> <span className="muted">giao</span></div>
          <span className="muted small">{M.hasVal ? tỷ(M.back.val) + ' đ' : ''}</span></div>
        <div className="pd-k"><span>Giao đúng hạn</span><b>{M.onTime == null ? '—' : Math.round(M.onTime * 100)}<small>%</small></b>
          <div>{M.onTime != null && M.onTimePrev != null ? <Delta v={Math.round((M.onTime - M.onTimePrev) * 100)} /> : <span className="muted">—</span>} <span className="muted">điểm · mục tiêu 95%</span></div></div>
      </section>

      <section className="pd-row">
        <div className="pd-card">
          <div className="pd-ch"><b>Sản lượng theo tháng</b><span className="muted">12 tháng · {UNAME[u]}</span>
            <span className="pd-leg"><span><i className="sq" />Đã giao</span><span><i className="ln" />Đặt mới</span>{u === 't' && <span><i className="ds" />Kế hoạch</span>}</span></div>
          <svg className="pd-chart" viewBox={`0 0 ${W} ${H + 40}`} role="img" aria-label="Biểu đồ sản lượng 12 tháng">
            {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} className="g" /><text x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(t, t < 10 ? 1 : 0)}</text></g>)}
            {M.series.map((s, i) => { const v = uv(s.del, u); return <g key={s.m}><rect x={x(i)} y={y(v)} width={bw} height={Math.max(0, top + H - y(v))} rx={4} className={s.m === M.cur ? 'b cur' : 'b'}><title>{MN(s.m) + ': đã giao ' + ufmt(s.del, u) + ' ' + UNAME[u] + ' · đặt ' + ufmt(s.ord, u)}</title></rect>
              <text x={x(i) + bw / 2} y={top + H + 18} textAnchor="middle">{MN(s.m)}</text>{s.m === M.cur && <text x={x(i) + bw / 2} y={y(v) - 6} textAnchor="middle" className="v">{fmt(v, u === 't' ? 1 : 0)}</text>}</g>; })}
            <path d={line((s) => uv(s.ord, u))} className="o" />
            {u === 't' && <path d={line((s) => s.plan)} className="p" />}
          </svg>
        </div>
        <div className="pd-card">
          <div className="pd-ch"><b>Tồn chưa giao</b><span className="muted">theo hạn giao</span></div>
          <div className="pd-stack">{M.aging.map((q, i) => uv(q, u) > 0 && <div key={i} style={{ flexGrow: uv(q, u), background: AG[i][1] }} title={AG[i][0]}>{Math.round(uv(q, u) / agT * 100)}%</div>)}</div>
          <div className="pd-ag">{M.aging.map((q, i) => <div key={i}><i style={{ background: AG[i][1] }} /><span>{AG[i][0]}</span><b>{ufmt(q, u)} {UNAME[u]}</b></div>)}</div>
          <div className="pd-soon"><b>Cần giao trong 14 ngày / đã trễ</b>
            {M.soon.length === 0 ? <p className="muted small">Không có.</p> : M.soon.map((x) => <Link key={x.b.id} to={'/don/' + x.b.order_id + '?tab=QT3'} className="pd-s">
              <span className={x.due! < today() ? 'pd-late' : 'muted'}>{dmy(x.due)}</span><b>{data!.p.find((p) => p.id === x.o?.project_id)?.code ?? '—'}</b><span className="pd-ell">{x.b.title}</span><b>{ufmt(x.q, u)} {UNAME[u]}</b></Link>)}</div>
        </div>
      </section>

      <section className="pd-row">
        <div className="pd-card pd-proj">
          <div className="pd-ch"><b>Dự án đang chạy</b><span className="muted">xếp theo khối lượng còn lại</span><Link className="pd-all" to="/bao-cao-du-an">Chi tiết từng dự án →</Link></div>
          <div className="pd-tr pd-th"><span>Mã</span><span>Tên dự án</span><span>Tiến độ giao</span><span className="r">Đặt</span><span className="r">Còn lại</span><span className="r">Giá trị còn</span><span className="r">Hạn gần nhất</span></div>
          {M.projects.slice(0, 8).map((x) => { const a = x.ord.kg ? x.del.kg / x.ord.kg : 0; return <Link key={x.p.id} className="pd-tr" to={'/don/' + x.oid}>
            <b className="pj-code">{x.p.code}</b><span className="pd-ell">{x.p.name}</span>
            <span className="pd-prog"><i><b style={{ width: a * 100 + '%' }} /></i><em>{Math.round(a * 100)}%</em></span>
            <span className="r">{ufmt(x.ord, u)}</span><b className="r">{ufmt(x.rem, u)}</b><span className="r">{M.hasVal ? tỷ(x.rem.val) : '—'}</span><span className={'r' + (x.late ? ' pd-late' : '')}>{x.late ? 'Trễ ' : ''}{dmy(x.due)}</span></Link>; })}
        </div>
        <div className="pd-card">
          <div className="pd-ch"><b>Đã giao theo khách hàng</b><span className="muted">năm {M.cur.slice(0, 4)}</span></div>
          <div className="pd-cust">{M.custTop.map((c) => <div key={c.n}><span className="pd-ell">{c.n}</span><i><b style={{ width: uv(c.q, u) / cm * 100 + '%' }} /></i><b className="r">{ufmt(c.q, u)}</b></div>)}</div>
        </div>
      </section>
    </div>);
}
