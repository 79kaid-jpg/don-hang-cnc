import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { sb, type Approval, type Order, type Profile } from '../lib/supabase';
import { DOC, dt, qt2Step } from '../lib/format';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';

/** Sơ đồ quy trình sống: mỗi bước hiện số đơn đang ở đó, huy hiệu chờ ai duyệt, chấm F7.
 *  Chế độ một đơn: tô các bước đã qua, bước hiện tại, mờ các bước chưa tới. */
type N = { k: string; t: string; s: string; col: number; lane: number; gate?: string; kind?: 'gate' | 'f7' | 'end' };
const LANES = ['QT0 · Tiếp nhận & bóc tách', 'QT1 · Xác nhận đơn hàng', 'QT2 · Lệnh GC & bàn giao NVL', 'QT2 · Mua & nhập NVL', 'QT3 · Giao hàng'];
const NODES: N[] = [
  { k: 'q0b1', t: 'Tiếp nhận', s: 'F0 · Kinh doanh', col: 0, lane: 0 },
  { k: 'q0b2', t: 'Bóc tách F1', s: 'F1 · Kỹ thuật', col: 1, lane: 0 },
  { k: 'q0b3', t: 'Kiểm tra F1', s: 'ĐK1 · F1 đạt', col: 2, lane: 0, kind: 'gate' },
  { k: 'q1b1', t: 'Lập XNĐH', s: 'F2 · Admin', col: 2, lane: 1 },
  { k: 'q1b2', t: 'Duyệt XNĐH', s: 'F2 · Dung', col: 3, lane: 1 },
  { k: 'q1b3', t: 'KH1 → KH2 ký', s: 'ĐK2 · PDF ký', col: 4, lane: 1, kind: 'gate' },
  { k: 'q2b1', t: 'B1 LGC + dự toán', s: 'F5 + F3', col: 0, lane: 2 },
  { k: 'q2b2', t: 'B2 Duyệt LGC 4 cấp', s: '4 cấp · Dung kèm NVL', col: 1, lane: 2 },
  { k: 'q2b3', t: 'B3 Mua NVL (PO)', s: 'Mua hàng · Dung duyệt', col: 1, lane: 3 },
  { k: 'q2b4', t: 'B4 Nhập kho + QC', s: 'F4 · Kho/QC', col: 2, lane: 3 },
  { k: 'dk3', t: 'ĐK3', s: 'LGC duyệt + NVL đạt', col: 3, lane: 2, kind: 'gate' },
  { k: 'q2b5', t: 'B5 Bàn giao NVL', s: 'F6 · Kho → Xưởng', col: 4, lane: 2 },
  { k: 'q2b6', t: 'B6 Gia công + QC TP', s: 'ĐK4 · số pallet', col: 5, lane: 2, kind: 'gate' },
  { k: 'f7', t: 'Phiếu F7', s: 'xử lý phát sinh', col: 4, lane: 3, kind: 'f7' },
  { k: 'q3b2', t: 'Thông báo + F8', s: 'Packing list', col: 1, lane: 4 },
  { k: 'q3b3', t: 'LGH 2 chặng', s: 'F9 · duyệt 2 chặng', col: 2, lane: 4 },
  { k: 'q3b4', t: 'Giao hàng + ảnh', s: 'F9 · Kho', col: 3, lane: 4 },
  { k: 'q3b5', t: 'Ký & lưu BBGH', s: 'LGH / BBGH', col: 4, lane: 4 },
  { k: 'done', t: 'Hoàn tất', s: 'đơn đóng', col: 5, lane: 4, kind: 'end' }
];
const EDGES: [string, string, string?][] = [
  ['q0b1', 'q0b2'], ['q0b2', 'q0b3', 'kiểm tra'], ['q0b3', 'q1b1', 'đạt'], ['q1b1', 'q1b2'], ['q1b2', 'q1b3', 'gửi KH'],
  ['q1b3', 'q2b1', 'đã ký'], ['q2b1', 'q2b2'], ['q2b2', 'q2b3', 'cần mua'], ['q2b3', 'q2b4', 'hàng về'], ['q2b4', 'dk3', 'QC đạt'],
  ['q2b2', 'dk3', 'tồn kho đủ'], ['dk3', 'q2b5'], ['q2b5', 'q2b6'], ['q2b6', 'q3b2', 'QC đạt'], ['q3b2', 'q3b3'], ['q3b3', 'q3b4', 'duyệt đủ'],
  ['q3b4', 'q3b5'], ['q3b5', 'done']
];
const PATH = ['q0b1', 'q0b2', 'q0b3', 'q1b1', 'q1b2', 'q1b3', 'q2b1', 'q2b2', 'q2b3', 'q2b4', 'dk3', 'q2b5', 'q2b6', 'q3b2', 'q3b3', 'q3b4', 'q3b5', 'done'];
const DOC_NODE: Record<string, string> = { F2: 'q1b2', F5: 'q2b2', PO: 'q2b3', LGH1: 'q3b3', LGH2: 'q3b3' };
const TAB: Record<string, string> = { q0b1: 'F0', q0b2: 'F1', q0b3: 'F1', q1b1: 'F2', q1b2: 'F2', q1b3: 'F2', q2b1: 'QT2', q2b2: 'QT2', q2b3: 'QT2', q2b4: 'QT2', dk3: 'QT2', q2b5: 'QT2', q2b6: 'QT2', f7: 'F7', q3b2: 'GH', q3b3: 'GH', q3b4: 'GH', q3b5: 'GH', done: 'LS' };

export function nodeOf(o: Order): string | null {
  const S: Record<string, string> = { tiep_nhan: 'q0b1', boc_tach: 'q0b2', kiem_tra_f1: 'q0b3', xndh: 'q1b1', cho_duyet_xndh: 'q1b2', cho_khach: 'q1b3', hoan_tat: 'done' };
  if (S[o.status]) return S[o.status];
  if (o.status === 'san_xuat') { const b = qt2Step(o); return b ? 'q2' + b : null; }
  if (o.status === 'giao_hang') return ({ thong_bao: 'q3b2', lap_lgh: 'q3b3', cho_duyet_lgh: 'q3b3', giao_hang: 'q3b4', ky_bbgh: 'q3b5' } as Record<string, string>)[o.gh_status] ?? null;
  return null;
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Tìm tương đối: mọi từ gõ vào đều phải xuất hiện (không dấu, không phân biệt hoa thường) trong mã, dự án, người liên hệ, mô tả */
const match = (o: Order, q: string) => { const hay = norm([o.code, o.project, o.contact, o.description].join(' ')).replace(/-/g, ' ');
  return norm(q).replace(/-/g, ' ').split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || hay.replace(/\s/g, '').includes(w)); };

function OrderSearch({ orders, value, onPick }: { orders: Order[]; value: Order | null; onPick: (id: string) => void }) {
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [hi, setHi] = useState(0);
  const res = (q.trim() ? orders.filter((o) => match(o, q)) : orders).slice(0, 8);
  const pick = (o: Order) => { onPick(o.id); setQ(''); setOpen(false); };
  return (
    <div className="fm-search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <Icon name="search" size={18} />
      <input role="combobox" aria-expanded={open} aria-controls="fm-search-list" aria-label="Tìm đơn hàng"
        placeholder={value ? value.code + ' · ' + value.project : 'Tìm đơn: mã, dự án, người liên hệ… (không cần dấu)'}
        value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(Math.min(hi + 1, res.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(Math.max(hi - 1, 0)); }
          else if (e.key === 'Enter' && res[hi]) pick(res[hi]); else if (e.key === 'Escape') setOpen(false); }} />
      {open && (
        <ul id="fm-search-list" role="listbox" className="fm-search-list">
          {res.map((o, i) => <li key={o.id} role="option" aria-selected={i === hi}>
            <button tabIndex={-1} className={i === hi ? 'on' : ''} onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
              <b>{o.code}</b><span className="small muted">{o.project}</span></button></li>)}
          {res.length === 0 && <li className="small muted" style={{ padding: '8px 12px' }}>Không tìm thấy đơn nào.</li>}
        </ul>)}
    </div>);
}

const W = 158, H = 62, X0 = 24, COLW = 208, LANE0 = 44, LANEH = 124;
const pos = (n: N) => ({ x: X0 + 8 + n.col * COLW, y: LANE0 + 34 + n.lane * LANEH });
const byK = Object.fromEntries(NODES.map((n) => [n.k, n]));
function edgePath(a: N, b: N) {
  const p = pos(a), q = pos(b);
  if (a.lane === b.lane) return `M${p.x + W} ${p.y + H / 2}H${q.x}`;
  if (a.col === b.col) return `M${p.x + W / 2} ${p.y + (q.y > p.y ? H : 0)}V${q.y + (q.y > p.y ? 0 : H)}`;
  const down = q.y > p.y; const midY = down ? q.y - 14 : p.y - (LANEH - H) / 2;
  if (q.x > p.x) return down ? `M${p.x + W / 2} ${p.y + H}V${midY}H${q.x + W / 2}V${q.y}` : `M${p.x + W} ${p.y + H / 2}H${q.x + W / 2 - 12}V${q.y + H}`;
  return `M${p.x + W / 2} ${p.y + H}V${midY}H${q.x + W / 2}V${q.y}`;
}
type Pend = Approval & { who: string; late: boolean };

export default function FlowMap() {
  const [sp, setSp] = useSearchParams(); const one = sp.get('don') ?? '';
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pend, setPend] = useState<Pend[]>([]); const [f7, setF7] = useState<Record<string, number>>({});
  const [poDone, setPoDone] = useState<Set<string>>(new Set());
  const nav = useNavigate();
  const [sel, setSel] = useState<string | null>(null); const [showMap, setShowMap] = useState(false);
  const [z, setZ] = useState(1); const [full, setFull] = useState(false); // phóng to sơ đồ: 1 = vừa khung
  useEffect(() => {
    Promise.all([
      sb.from('orders').select('*').neq('status', 'huy').order('code', { ascending: false }),
      sb.from('approvals').select('*').order('created_at'),
      sb.from('profiles').select('id, full_name'),
      sb.from('issues').select('order_id, status').eq('status', 'mo')
    ]).then(([o, a, p, i]) => {
      const people = Object.fromEntries(((p.data as Profile[]) ?? []).map((x) => [x.id, x.full_name]));
      const all = (a.data as Approval[]) ?? [];
      setPend(all.filter((x) => x.status === 'cho').map((x) => ({ ...x, who: people[x.approver_id ?? ''] ?? 'chưa gán', late: !!x.due_at && new Date(x.due_at) < new Date() })));
      setPoDone(new Set(all.filter((x) => x.doc_type === 'PO').map((x) => x.order_id)));
      const m: Record<string, number> = {}; for (const r of (i.data as { order_id: string }[]) ?? []) m[r.order_id] = (m[r.order_id] ?? 0) + 1; setF7(m);
      setOrders((o.data as Order[]) ?? []);
    });
  }, []);

  const at = useMemo(() => { const m: Record<string, Order[]> = {}; for (const o of orders ?? []) { const k = nodeOf(o); if (k) (m[k] ??= []).push(o); } return m; }, [orders]);
  const pendAt = useMemo(() => { const m: Record<string, Pend[]> = {}; for (const a of pend) { const k = DOC_NODE[a.doc_type]; if (k && (orders ?? []).some((o) => o.id === a.order_id && nodeOf(o) === k)) (m[k] ??= []).push(a); } return m; }, [pend, orders]);
  const f7At = (k: string) => (at[k] ?? []).filter((o) => f7[o.id]).length;
  const O = (orders ?? []).find((o) => o.id === one || o.code === one) ?? null;
  const cur = O ? nodeOf(O) : null; const ci = cur ? PATH.indexOf(cur) : -1;
  const state = (k: string): 'done' | 'cur' | 'todo' | 'skip' | '' => {
    if (!O) return '';
    if (k === 'f7') return f7[O.id] ? 'cur' : 'todo';
    const i = PATH.indexOf(k); if (i < 0) return '';
    if ((k === 'q2b3' || k === 'q2b4') && i < ci && !poDone.has(O.id)) return 'skip';
    return i < ci ? 'done' : i === ci ? 'cur' : 'todo';
  };
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null); window.addEventListener('keydown', h);
    const d = (e: MouseEvent) => { const t = e.target as Element; if (!t.closest?.('.fm-pop') && !t.closest?.('.fm-node')) setSel(null); };
    document.addEventListener('mousedown', d); return () => { window.removeEventListener('keydown', h); document.removeEventListener('mousedown', d); }; }, []);
  /** Tất cả đơn: mở danh sách ở bước. Một đơn: mở đơn ở đúng thẻ của bước đó */
  const clickNode = (k: string) => { if (O) { nav('/don/' + O.id + '?tab=' + TAB[k]); return; } setSel(sel === k ? null : k); };
  const pickOrder = (id: string) => { setSel(null); setSp(id ? { don: id } : {}); };
  const oPend = O ? pend.filter((a) => a.order_id === O.id) : [];

  if (!orders) return <Skeleton rows={3} h={120} />;
  const nodeOrders = sel ? (at[sel] ?? []) : [];
  const vbW = X0 * 2 + 6 * COLW, vbH = LANE0 + LANES.length * LANEH + 8;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="page-head">
        <div><h1>Sơ đồ đơn hàng</h1><p className="muted">{O ? 'Bấm một bước trên sơ đồ để mở đơn ở đúng phần đó.' : 'Đơn đang ở đâu trong toàn bộ quy trình. Bấm một bước để xem các đơn, hoặc tìm một đơn để xem đường đi.'}</p></div>
        <Link className="btn sm" to="/bang"><Icon name="kanban" size={18} />Bảng Kanban</Link>
      </div>
      <div className="row">
        <div className="seg" role="group" aria-label="Chế độ xem">
          <button aria-pressed={!O} onClick={() => pickOrder('')}>Tất cả đơn</button>
          <button aria-pressed={!!O} onClick={() => !O && orders[0] && pickOrder(orders[0].id)}>Một đơn</button>
        </div>
        <OrderSearch orders={orders} value={O} onPick={pickOrder} />
        <div className="fm-legend small">
          <span><i className="fm-badge-dot" />Chờ duyệt</span><span><i className="fm-badge-dot late" />Quá hạn</span><span><i className="fm-f7-dot" />Có F7 mở</span>
          {O && <><span><i className="fm-sw done" />Đã qua</span><span><i className="fm-sw cur" />Đang ở</span></>}
        </div>
      </div>

      {O && (
        <div className="card fm-summary" role="status">
          <div><b>{O.code}</b> · {O.project}</div>
          <div className="small">Đang ở: <b>{cur ? byK[cur].t : '—'}</b>{f7[O.id] ? <span className="kb-late"> · {f7[O.id]} phiếu F7 đang mở</span> : null}</div>
          {oPend.map((a) => <div key={a.id} className={'fm-wait' + (a.late ? ' late' : '')}><Icon name={a.late ? 'alert' : 'clock'} size={16} />
            <span><b>{a.late ? 'Quá hạn' : 'Chờ duyệt'}</b> {DOC[a.doc_type] ?? a.doc_type} · cấp {a.step_no}: <b>{a.who}</b> · hạn {dt(a.due_at)}</span></div>)}
          <Link className="btn sm primary" to={'/don/' + O.id + '?tab=' + (cur ? TAB[cur] : 'F1')}>Mở đơn →</Link>
        </div>)}

      {/* Sơ đồ (máy tính; điện thoại bấm "Xem sơ đồ") */}
      <div className={'fm-map card flush' + (showMap ? ' force' : '') + (full ? ' full' : '')}>
        <div className="fm-zoom" role="group" aria-label="Phóng to thu nhỏ sơ đồ">
          <button onClick={() => setZ((v) => Math.max(1, +(v - 0.5).toFixed(1)))} disabled={z <= 1} aria-label="Thu nhỏ">−</button>
          <button onClick={() => setZ(1)} className="fit" aria-label="Vừa khung">{Math.round(z * 100)}%</button>
          <button onClick={() => setZ((v) => Math.min(4, +(v + 0.5).toFixed(1)))} disabled={z >= 4} aria-label="Phóng to">+</button>
          <button onClick={() => setFull(!full)} aria-label={full ? 'Thoát toàn màn hình' : 'Xem toàn màn hình'}><Icon name={full ? 'x' : 'eye'} size={16} /></button>
        </div>
        <div className="fm-inner" style={{ ['--z' as string]: z }}>
        <svg viewBox={`0 0 ${vbW} ${vbH}`} role="img" aria-label="Sơ đồ quy trình đơn hàng với số đơn ở từng bước" className="fm-svg">
          <defs><marker id="fm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9A8F7A" /></marker>
            <marker id="fm-arr-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#2C5F8A" /></marker></defs>
          {LANES.map((l, i) => <g key={l}><rect x={X0 - 12} y={LANE0 + i * LANEH + 4} width={vbW - 2 * X0 + 24} height={LANEH - 8} rx="10" className={'fm-lane' + (i === 3 ? ' alt' : '')} />
            <text x={X0} y={LANE0 + i * LANEH + 22} className="fm-lane-t">{l}</text></g>)}
          {EDGES.map(([a, b, lb]) => { const A = byK[a], B = byK[b]; const on = O && state(a) === 'done' && ['done', 'cur'].includes(state(b)) && (lb !== 'tồn kho đủ' || state('q2b3') === 'skip') && (!['q2b3', 'q2b4'].includes(b) || state(b) !== 'skip');
            const d = edgePath(A, B); const p = pos(A), q = pos(B);
            const lx = A.lane === B.lane ? (p.x + W + q.x) / 2 : (p.x + q.x) / 2 + W / 2, ly = A.lane === B.lane ? p.y + H / 2 - 7 : (p.y + H + q.y) / 2 - 4;
            return <g key={a + b}><path d={d} className={'fm-edge' + (on ? ' on' : '') + (lb === 'tồn kho đủ' ? ' dash' : '')} markerEnd={on ? 'url(#fm-arr-on)' : 'url(#fm-arr)'} />
              {lb && <text x={lx} y={ly} textAnchor="middle" className="fm-edge-t">{lb}</text>}</g>; })}
          {NODES.map((n) => { const { x, y } = pos(n); const c = (at[n.k] ?? []).length; const pa = pendAt[n.k] ?? []; const late = pa.some((a) => a.late);
            const s = state(n.k); const nf7 = n.k === 'f7' ? Object.keys(f7).length : f7At(n.k);
            return (
              <g key={n.k} className={`fm-node ${n.kind ?? ''} ${s} ${sel === n.k ? 'sel' : ''}`} tabIndex={0} role="button"
                aria-label={`${n.t}: ${c} đơn${pa.length ? ', ' + pa.length + ' chờ duyệt' : ''}`}
                onClick={() => clickNode(n.k)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && clickNode(n.k)}>
                <rect x={x} y={y} width={W} height={H} rx="10" className="fm-box" />
                <text x={x + 12} y={y + 24} className="fm-t">{n.t}</text>
                <text x={x + 12} y={y + 44} className="fm-s">{n.s}</text>
                {!O && c > 0 && <g><rect x={x + W - 34} y={y - 10} width="40" height="22" rx="11" className="fm-count" /><text x={x + W - 14} y={y + 5} textAnchor="middle" className="fm-count-t">{c}</text></g>}
                {pa.length > 0 && (!O || s === 'cur') && <g className={'fm-badge' + (late ? ' late' : '')}>
                  <rect x={x + 6} y={y + H - 8} width={W - 12} height="24" rx="12" />
                  <text x={x + W / 2} y={y + H + 8} textAnchor="middle">{(late ? 'Quá hạn · ' : 'Chờ ') + (O ? (oPend[0]?.who ?? pa[0].who) : pa[0].who) + (pa.length > 1 && !O ? ` +${pa.length - 1}` : '')}</text></g>}
                {nf7 > 0 && n.k !== 'f7' && <circle cx={x + 10} cy={y + 4} r="6" className="fm-f7" />}
                {n.k === 'f7' && nf7 > 0 && <g><rect x={x + W - 34} y={y - 10} width="40" height="22" rx="11" className="fm-count f7c" /><text x={x + W - 14} y={y + 5} textAnchor="middle" className="fm-count-t">{nf7}</text></g>}
              </g>); })}
        </svg>
        {sel && !O && (() => { const n = byK[sel]; const { x, y } = pos(n); const right = n.col < 4;
          const list = sel === 'f7' ? orders.filter((o) => f7[o.id]) : nodeOrders;
          return (
            <div className="fm-pop" role="dialog" aria-label={'Các đơn ở bước ' + n.t}
              style={{ top: `${Math.min(y / vbH * 100, 62)}%`, left: right ? `${(x + W + 10) / vbW * 100}%` : `${(x - 10) / vbW * 100}%`, transform: right ? 'none' : 'translateX(-100%)' }}>
              <div className="fm-pop-head"><b>{n.t}</b><span className="chip idle">{list.length} đơn</span>
                <button className="btn sm icon-btn" aria-label="Đóng" onClick={() => setSel(null)}><Icon name="x" size={16} /></button></div>
              <ul className="fm-pop-list">
                {list.map((o) => { const pa = pend.filter((a) => a.order_id === o.id);
                  return <li key={o.id}><div className="fm-pop-row">
                    <button className="fm-pop-main" onClick={() => pickOrder(o.id)} title="Xem đường đi trên sơ đồ"><b>{o.code}</b><span className="small muted">{o.project}</span></button>
                    <Link className="btn sm" to={'/don/' + o.id + '?tab=' + TAB[sel]} aria-label={'Mở đơn ' + o.code}><Icon name="arrow" size={16} /></Link></div>
                    {(pa.length > 0 || f7[o.id]) && <div className="fm-pop-tags">
                      {pa.map((a) => <span key={a.id} className={'chip ' + (a.late ? 'bad' : 'wait')}><Icon name={a.late ? 'alert' : 'clock'} size={13} />{a.late ? 'Quá hạn · ' : 'Chờ '}{a.who} · cấp {a.step_no}</span>)}
                      {f7[o.id] ? <span className="chip bad">F7 · {f7[o.id]}</span> : null}</div>}</li>; })}
                {list.length === 0 && <li className="muted small" style={{ padding: '8px 4px' }}>Không có đơn ở bước này.</li>}
              </ul>
              <div className="small muted">Bấm mã đơn để xem đường đi · mũi tên để mở đơn</div>
            </div>); })()}
        </div>
      </div>

      {/* Danh sách đơn ở bước đã chọn (điện thoại) */}
      {sel && !O && (
        <section className="card flush fm-sel-list" aria-labelledby="fm-sel">
          <div className="card-head"><h2 id="fm-sel">{byK[sel].t}</h2><span className="chip idle">{sel === 'f7' ? Object.keys(f7).length : nodeOrders.length} đơn</span></div>
          <ul className="worklist">
            {(sel === 'f7' ? orders.filter((o) => f7[o.id]) : nodeOrders).map((o) => { const pa = pend.filter((a) => a.order_id === o.id);
              return <li key={o.id}><button className="work" style={{ width: '100%', border: 0, background: 'none', font: 'inherit', textAlign: 'left' }} onClick={() => pickOrder(o.id)}>
                <span className="work-main"><b>{o.code}</b><span className="small muted">{o.project}</span></span>
                {pa.map((a) => <span key={a.id} className={'chip ' + (a.late ? 'bad' : 'wait')}><Icon name={a.late ? 'alert' : 'clock'} size={13} />{a.late ? 'Quá hạn · ' : 'Chờ '}{a.who} · cấp {a.step_no}</span>)}
                {f7[o.id] ? <span className="chip bad">F7 · {f7[o.id]}</span> : null}
                <Icon name="arrow" size={18} /></button></li>; })}
            {(sel === 'f7' ? Object.keys(f7).length : nodeOrders.length) === 0 && <li className="muted" style={{ padding: 12 }}>Không có đơn ở bước này.</li>}
          </ul>
        </section>)}

      {/* Điện thoại: dòng thời gian / danh sách theo bước */}
      <div className="fm-mobile">
        <button className="btn sm" onClick={() => setShowMap(!showMap)}>{showMap ? 'Ẩn sơ đồ' : 'Xem sơ đồ toàn bộ'}</button>
        {O ? (
          <ol className="fm-tl">
            {PATH.map((k) => { const s = state(k); if (s === 'skip') return null; const pa = s === 'cur' ? oPend : [];
              return <li key={k} className={s}><span className="fm-tl-dot">{s === 'done' ? <Icon name="check" size={13} /> : null}</span>
                <div><b>{byK[k].t}</b><div className="small muted">{byK[k].s}</div>
                  {pa.map((a) => <div key={a.id} className={'fm-wait' + (a.late ? ' late' : '')}><Icon name={a.late ? 'alert' : 'clock'} size={14} />{a.late ? 'Quá hạn · ' : 'Chờ '}<b>{a.who}</b> · cấp {a.step_no}</div>)}</div></li>; })}
          </ol>) : (
          <ul className="fm-steps">
            {PATH.filter((k) => (at[k] ?? []).length || (pendAt[k] ?? []).length).map((k) => <li key={k}><button className="work" style={{ width: '100%', border: 0, background: 'none', font: 'inherit', textAlign: 'left' }} onClick={() => setSel(k)}>
              <span className="work-main"><b>{byK[k].t}</b><span className="small muted">{byK[k].s}</span></span>
              {(pendAt[k] ?? []).length > 0 && <span className={'chip ' + ((pendAt[k] ?? []).some((a) => a.late) ? 'bad' : 'wait')}><Icon name="clock" size={13} />Chờ {(pendAt[k] ?? [])[0].who}</span>}
              <span className="kb-count">{(at[k] ?? []).length}</span></button></li>)}
          </ul>)}
      </div>
    </div>);
}
