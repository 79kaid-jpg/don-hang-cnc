// Tổng quan 3 công ty (khi chọn "Tất cả"): hàng thực giao tính 1 lần, so sánh PN · IPC · HW,
// phiếu đang chờ theo bước, giá trị qua chuỗi. Bấm thẻ → Thống kê riêng của công ty đó.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { setScope, type Co } from '../lib/myco';
import { Skeleton } from './ui';

type ST = { q1: { id: string; order_id: string; created_at: string; o: number[]; r: number[] }[]; q3: { id: string; order_id: string; done_at: string; d: number[] }[]; hasVal: boolean };
type W = { lap: number; kiem_tra: number; duyet: number; anh_giao: number; khoa: number; tong: number; max_h: number | null; max_st: string | null };
type PS = { wait: Partial<Record<Co, W>>; avg_h: Partial<Record<Co, number>> };
const COS: Co[] = ['PN', 'IPC', 'HW'];
const NAME: Record<Co, string> = { PN: 'Phương Nam (PN)', IPC: 'IPC', HW: 'Hanwa (HW)' };
const CLR: Record<Co, string> = { PN: '#7A4DB3', IPC: '#D97706', HW: '#2E7D6B' };
const STN: Record<string, string> = { lap: 'Lập', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', anh_giao: 'Ảnh giao' };
const fmt = (n: number, d = 0) => n.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
const tr = (v: number) => (v >= 1e9 ? fmt(v / 1e9, 2) + ' tỷ' : fmt(v / 1e6, 1) + ' tr');
const addM = (ym: string, k: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + k, 1)).toISOString().slice(0, 7); };
const hh = (h: number | null | undefined) => (h == null ? '—' : h >= 24 ? fmt(h / 24, 1) + ' ngày' : fmt(h, 1) + ' giờ');
type Per = 'M' | 'Q' | 'Y';

export default function AllOverview() {
  const [st, setSt] = useState<Partial<Record<Co, ST>> | null>(null);
  const [ps, setPs] = useState<PS | null>(null);
  const [due, setDue] = useState<Map<string, string | null>>(new Map());
  const [per, setPer] = useState<Per>('M');
  useEffect(() => {
    let on = true;
    Promise.all([...COS.map((c) => sb.rpc('prod_stats', { p_co: c })), sb.rpc('pipeline_stats'), sb.from('orders').select('id, due_date')]).then((r) => {
      if (!on) return;
      setSt(Object.fromEntries(COS.map((c, i) => [c, (r[i].data ?? { q1: [], q3: [], hasVal: false }) as ST])));
      setPs((r[3].data ?? { wait: {}, avg_h: {} }) as PS);
      setDue(new Map(((r[4].data ?? []) as { id: string; due_date: string | null }[]).map((o) => [o.id, o.due_date])));
    });
    return () => { on = false; };
  }, []);

  const M = useMemo(() => {
    if (!st || !ps) return null;
    const now = new Date().toISOString().slice(0, 7);
    const inPer = (ym: string) => per === 'M' ? ym === now : per === 'Q' ? ym.slice(0, 4) === now.slice(0, 4) && Math.ceil(+ym.slice(5) / 3) === Math.ceil(+now.slice(5) / 3) : ym.slice(0, 4) === now.slice(0, 4);
    const months = Array.from({ length: 12 }, (_, i) => addM(now, i - 11));
    const co = Object.fromEntries(COS.map((c) => {
      const s = st[c]!; const q3 = s.q3.filter((x) => inPer(x.done_at.slice(0, 7)));
      const tp = q3.filter((x) => due.get(x.order_id)); const ok = tp.filter((x) => x.done_at.slice(0, 10) <= String(due.get(x.order_id)));
      return [c, {
        val: q3.reduce((a, x) => a + (+x.d[3] || 0), 0), tam: q3.reduce((a, x) => a + (+x.d[2] || 0), 0), trips: q3.length,
        ord: s.q1.filter((x) => inPer(x.created_at.slice(0, 7))).reduce((a, x) => a + (+x.o[2] || 0), 0),
        rem: s.q1.reduce((a, x) => a + (+x.r[2] || 0), 0),
        onTime: tp.length ? ok.length / tp.length : null,
        avg: ps.avg_h[c] ?? null, w: ps.wait[c] ?? null,
        series: months.map((m) => s.q3.filter((x) => x.done_at.startsWith(m)).reduce((a, x) => a + (+x.d[3] || 0), 0)),
      }];
    })) as Record<Co, { val: number; tam: number; trips: number; ord: number; rem: number; onTime: number | null; avg: number | null; w: W | null; series: number[] }>;
    // Hàng thực giao: lấy theo PN (xe hàng thật), tính 1 lần
    const real = { tam: co.PN.tam, trips: co.PN.trips, bars: months.map((m) => st.PN!.q3.filter((x) => x.done_at.startsWith(m)).reduce((a, x) => a + (+x.d[2] || 0), 0)) };
    // tốt nhất / kém nhất theo chỉ số
    const rank = (f: (c: Co) => number | null, hi: boolean) => { const v = COS.map((c) => [c, f(c)] as const).filter(([, x]) => x != null) as [Co, number][]; if (v.length < 2) return { best: null, worst: null };
      const s = [...v].sort((a, z) => (hi ? z[1] - a[1] : a[1] - z[1])); return s[0][1] === s.at(-1)![1] ? { best: null, worst: null } : { best: s[0][0], worst: s.at(-1)![0] }; };
    const rk = { val: rank((c) => co[c].val, true), onTime: rank((c) => co[c].onTime, true), avg: rank((c) => co[c].avg, false), wait: rank((c) => co[c].w?.tong ?? 0, false) };
    const hasVal = COS.some((c) => st[c]!.hasVal);
    return { co, real, months, rk, hasVal, now };
  }, [st, ps, due, per]);

  if (!M) return <Skeleton rows={4} h={140} />;
  const tone = (k: keyof typeof M.rk, c: Co) => (M.rk[k].best === c ? ' ok' : M.rk[k].worst === c ? ' bad' : '');
  const title = per === 'M' ? 'Tháng ' + Number(M.now.slice(5)) + '/' + M.now.slice(0, 4) : per === 'Q' ? 'Quý ' + Math.ceil(+M.now.slice(5) / 3) + '/' + M.now.slice(0, 4) : 'Năm ' + M.now.slice(0, 4);
  // biểu đồ
  const W0 = 760, H0 = 220, L = 8, bw = 40, step = (W0 - L * 2) / 12;
  const maxB = Math.max(1, ...M.real.bars), maxV = Math.max(1, ...COS.flatMap((c) => M.co[c].series));
  const xs = (i: number) => L + i * step + (step - bw) / 2;
  return (
    <div className="ao">
      <div className="ao-head">
        <div><div className="pd-eyebrow">TỔNG QUAN 3 CÔNG TY · TẤT CẢ</div><h2 className="pd-title">{title}</h2>
          <span className="muted small">Hàng thực giao tính 1 lần · giá trị theo giá XNĐH của từng công ty</span></div>
        <span className="pd-seg">{(['M', 'Q', 'Y'] as Per[]).map((p) => <button key={p} type="button" aria-pressed={per === p} onClick={() => setPer(p)}>{p === 'M' ? 'Tháng' : p === 'Q' ? 'Quý' : 'Năm'}</button>)}</span>
      </div>
      <div className="ao-top">
        <div className="ao-real"><span>Hàng thực giao (1 lần)</span><b>{fmt(M.real.tam)} <small>tấm</small></b><span>{M.real.trips} đợt giao</span></div>
        <div className="ao-cards">{COS.map((c) => { const x = M.co[c]; return (
          <button key={c} type="button" className="ao-card" onClick={() => setScope(c)} title={'Xem Thống kê riêng ' + NAME[c]}>
            <div className="ao-ch"><i style={{ background: CLR[c] }} /><b>{NAME[c]}</b><span>Xem riêng ›</span></div>
            <dl>
              <dt>Giá trị đã giao</dt><dd className={tone('val', c)}>{M.hasVal ? tr(x.val) : '—'}</dd>
              <dt>Đặt mới</dt><dd>{fmt(x.ord)} tấm</dd>
              <dt>Tồn chưa giao</dt><dd>{fmt(x.rem)} tấm</dd>
              <dt>Đúng hạn</dt><dd className={tone('onTime', c)}>{x.onTime == null ? '—' : Math.round(x.onTime * 100) + '%'}</dd>
              <dt>TB / bước</dt><dd className={tone('avg', c)}>{hh(x.avg)}</dd>
              <dt>Đang chờ</dt><dd className={tone('wait', c)}>{x.w?.tong ?? 0} phiếu</dd>
            </dl></button>); })}</div>
      </div>
      <div className="ao-row">
        <div className="pd-card">
          <div className="pd-ch"><b>12 tháng · giá trị theo công ty</b><span className="pd-leg"><span><i className="sq" />Tấm thực giao</span>{COS.map((c) => <span key={c} style={{ color: CLR[c] }}>━ {c}</span>)}</span></div>
          <svg className="ao-chart" viewBox={`0 0 ${W0} ${H0 + 24}`} role="img" aria-label="Biểu đồ 12 tháng: tấm thực giao và giá trị 3 công ty">
            {M.real.bars.map((v, i) => <rect key={i} x={xs(i)} y={H0 - v / maxB * (H0 - 20)} width={bw} height={v / maxB * (H0 - 20)} rx={4} className={i === 11 ? 'b cur' : 'b'}><title>{'T' + Number(M.months[i].slice(5)) + ': ' + fmt(v) + ' tấm'}</title></rect>)}
            {M.hasVal && COS.map((c) => <polyline key={c} fill="none" stroke={CLR[c]} strokeWidth={2.5} points={M.co[c].series.map((v, i) => `${xs(i) + bw / 2},${H0 - v / maxV * (H0 - 20)}`).join(' ')} />)}
            {M.months.map((m, i) => (i % 2 === 1 || i === 11) && <text key={m} x={xs(i) + bw / 2} y={H0 + 18} textAnchor="middle">{'T' + Number(m.slice(5))}</text>)}
          </svg>
        </div>
        <div className="pd-card">
          <div className="pd-ch"><b>Đang chờ ở đâu</b><span className="muted">phiếu đang làm</span></div>
          <div className="ao-tbl" role="table">
            <div className="ao-tr ao-th" role="row"><span /><span>Lập</span><span>Kiểm tra</span><span>Duyệt</span><span>Ảnh giao</span><span>Khoá chờ</span></div>
            {COS.map((c) => { const w = M.co[c].w; const hot = (k: string) => w?.max_st === k && (w?.max_h ?? 0) >= 24;
              return <Link key={c} to="/bang" onClick={() => setScope(c)} className="ao-tr" role="row" title={'Mở Kanban ' + NAME[c]}><b>{c}</b>
                {(['lap', 'kiem_tra', 'duyet', 'anh_giao'] as const).map((k) => <span key={k} className={hot(k) ? 'hot' : ''}>{w?.[k] ?? 0}{hot(k) ? ' · ' + hh(w?.max_h) : ''}</span>)}
                <span className={w?.khoa ? 'lk' : 'muted'}>{w?.khoa || '—'}</span></Link>; })}
          </div>
          <span className="muted small">Ô đỏ: bước có phiếu chờ lâu nhất (≥ 1 ngày) · {Object.keys(STN).length} bước. Bấm dòng → Kanban của công ty.</span>
          {M.hasVal && <><div className="pd-ch" style={{ marginTop: 12 }}><b>Giá trị qua chuỗi</b><span className="muted">kỳ đang xem</span></div>
            <div className="ao-chain">{COS.map((c, i) => <Fragment key={c}><div className="ao-cc" style={{ borderColor: CLR[c] }}><span>{c}</span><b>{tr(M.co[c].val)}</b></div>
              {i < 2 && <em className={M.co[COS[i + 1]].val >= M.co[c].val ? 'up' : 'dn'}>{M.co[c].val ? (M.co[COS[i + 1]].val >= M.co[c].val ? '+' : '') + Math.round((M.co[COS[i + 1]].val / M.co[c].val - 1) * 100) + '%' : '—'}</em>}</Fragment>)}</div></>}
        </div>
      </div>
    </div>
  );
}
