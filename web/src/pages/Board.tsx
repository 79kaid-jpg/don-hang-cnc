import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, type Approval, type Customer, type Order, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, date, num, qt2Step } from '../lib/format';
const val = (o: Order, f: Proc['field']) => (f === 'step' ? qt2Step(o) : o[f]);
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';
import { isTyping, modalOpen } from '../components/Shortcuts';
import { MoveDialog, ReturnDialog } from '../components/MoveDialog';
import { Avatar, DueChip, GroupBadge, useGroups, type OStep } from '../components/StepPeople';

/** Bảng Kanban theo từng quy trình: mỗi quy trình một bảng, cột = bước của quy trình đó (giống sơ đồ).
 *  Đơn nằm ở bước theo trạng thái của đúng nhánh: QT0–QT1 theo trạng thái đơn, QT2 theo nhánh NVL, QT3 theo nhánh gia công.
 *  Kéo thẻ sang cột kế tiếp (hoặc bấm "Chuyển bước"): mở hộp kiểm tra checklist + dữ liệu, đủ mới chuyển. */
export type Col = { key: string; title: string; tab: string; next: string; roles: string[]; gate?: string };
export type Proc = { key: string; title: string; sub: string; field: 'status' | 'nvl_status' | 'gc_status' | 'gh_status' | 'step'; cols: Col[] };
const PROCS: Proc[] = [
  { key: 'qt0', title: 'QT0', sub: 'Tiếp nhận & bóc tách', field: 'status', cols: [
    { key: 'tiep_nhan', title: 'Tiếp nhận', tab: 'F1', next: 'Bắt đầu bóc tách', roles: ['kinh_doanh', 'ky_thuat'] },
    { key: 'boc_tach', title: 'Bóc tách F1', tab: 'F1', next: 'Lập F1, gửi kiểm tra', roles: ['ky_thuat', 'kinh_doanh'] },
    { key: 'kiem_tra_f1', title: 'Kiểm tra F1', tab: 'F1', next: 'Kiểm tra F1', roles: ['kiem_tra_f1'], gate: 'ĐK1 F1 đạt' },
    ] },
  { key: 'qt1', title: 'QT1', sub: 'Xác nhận đơn hàng', field: 'status', cols: [
    { key: 'xndh', title: 'Lập XNĐH (F2)', tab: 'F2', next: 'Nhập giá, gửi duyệt', roles: ['admin_cnc', 'kinh_doanh'] },
    { key: 'cho_duyet_xndh', title: 'Duyệt XNĐH', tab: 'F2', next: 'Duyệt XNĐH', roles: [] },
    { key: 'cho_khach', title: 'KH1 → KH2 xác nhận', tab: 'F2', next: 'Ghi KH1 → KH2, PDF ký', roles: ['admin_cnc', 'kinh_doanh'], gate: 'ĐK2 XNĐH đã ký' }] },
  { key: 'qt2', title: 'QT2', sub: 'Lệnh GC & bàn giao NVL', field: 'step', cols: [
    { key: 'b1', title: 'B1 Lập LGC + dự toán NVL', tab: 'QT2', next: 'Lập F5 + F3', roles: ['admin_cnc', 'ke_hoach'] },
    { key: 'b2', title: 'B2 Duyệt LGC 4 cấp', tab: 'QT2', next: 'Duyệt LGC', roles: [] },
    { key: 'b3', title: 'B3 Mua NVL (PO)', tab: 'QT2', next: 'Lập / duyệt PO', roles: ['mua_hang'] },
    { key: 'b4', title: 'B4 Nhập kho + QC NVL', tab: 'QT2', next: 'Nhập kho, QC NVL', roles: ['kho_qc'], gate: 'ĐK3 LGC duyệt + NVL đạt' },
    { key: 'b5', title: 'B5 Bàn giao NVL (F6)', tab: 'QT2', next: 'Bàn giao F6', roles: ['admin_cnc'] },
    { key: 'b6', title: 'B6 Gia công + QC TP', tab: 'QT2', next: 'QC thành phẩm', roles: ['kho_qc', 'admin_cnc'], gate: 'ĐK4 QC thành phẩm đạt' }] },
  { key: 'qt4', title: 'QT3', sub: 'Giao hàng', field: 'gh_status', cols: [
    { key: 'thong_bao', title: 'B2 Thông báo giao + F8', tab: 'GH', next: 'Lập packing list', roles: ['admin_cnc'] },
    { key: 'lap_lgh', title: 'B3 Lập lệnh giao hàng', tab: 'GH', next: 'Lập F9, gửi duyệt', roles: ['admin_cnc'] },
    { key: 'cho_duyet_lgh', title: 'B3 Duyệt LGH 2 chặng', tab: 'GH', next: 'Duyệt LGH', roles: [] },
    { key: 'giao_hang', title: 'B4 Giao hàng + ảnh', tab: 'GH', next: 'Giao, tải ảnh', roles: ['kho_qc', 'admin_cnc'] },
    { key: 'ky_bbgh', title: 'B5 Ký & lưu BBGH', tab: 'GH', next: 'Tải BBGH, hoàn tất', roles: ['kho_qc', 'admin_cnc'] }] }
];

type Agg = { qty: number; kg: number };

export default function Board() {
  const { me, can } = useAuth();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  const [appr, setAppr] = useState<Approval[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [cust, setCust] = useState<Record<string, Customer>>({});
  const [q, setQ] = useState(''); const [mine, setMine] = useState(false);
  const [qt, setQt] = useState(() => { try { return localStorage.getItem('kb-qt') ?? 'qt0'; } catch { return 'qt0'; } });
  const P = PROCS.find((x) => x.key === qt) ?? PROCS[0]; const COLS = P.cols;
  const [col, setCol] = useState(''); // cột đang xem trên điện thoại
  const pick = (k: string) => { setQt(k); setCol(''); try { localStorage.setItem('kb-qt', k); } catch { /* */ } };
  const curCol = col || COLS[0].key;

  const [drag, setDrag] = useState<{ id: string; i: number } | null>(null);
  const [over, setOver] = useState(-1);
  const [move, setMove] = useState<{ o: Order; i: number } | null>(null);
  const [groups] = useGroups();
  const [osteps, setOsteps] = useState<OStep[]>([]);
  const loadSteps = () => sb.from('order_steps').select('*').is('done_at', null).then(({ data }) => setOsteps((data as OStep[]) ?? []));
  useEffect(() => { loadSteps(); }, []); // eslint-disable-line
  const stepOf = (id: string, colKey: string) => osteps.find((x) => x.order_id === id && x.step === ({ qt0: 'qt0.', qt1: 'qt1.', qt2: 'qt2.', qt4: 'qt3.' } as Record<string, string>)[P.key] + colKey);
  const [slotFix, setSlotFix] = useState<{ c: number; l: number; w: number } | null>(null); const [back, setBack] = useState<{ o: Order; i: number } | null>(null); const fixRef = useRef('');
  const [landed, setLanded] = useState(''); const [backEat, setBackEat] = useState(false); const [eat, setEat] = useState(-1);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Kéo bằng chuột (pointer events): thẻ thu nhỏ như phong bì bám theo con trỏ, tự cuộn trang khi gần mép,
  // thả ở bất kỳ đâu trong cột kế tiếp; khe hộp thư dính ở đầu phần cột đang thấy.
  const dr = useRef<{ id: string; i: number; x0: number; y0: number; ox: number; oy: number; w: number; card: HTMLElement; g?: HTMLElement; on: boolean; over: number; px: number; py: number; raf: number } | null>(null);
  // chỉ xét theo chiều ngang: con trỏ ở trên/dưới cột vẫn tính là thả vào cột đó
  const colAt = (x: number, y: number) => {
    const bd = document.querySelector('.kb-board')?.getBoundingClientRect(); if (!bd || y < bd.top - 40) return -1;
    for (const el of document.querySelectorAll<HTMLElement>('[data-col]')) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right) return Number(el.dataset.col); }
    return -1; };
  const place = (d: NonNullable<typeof dr.current>) => { if (d.g) d.g.style.transform = `translate(${d.px - d.ox * .6}px,${d.py - d.oy * .6}px) rotate(-5deg) scale(.6)`; };
  const tick = () => {
    const d = dr.current; if (!d?.on) return;
    const m = 70, vy = d.py < m ? -(m - d.py) / 3 : d.py > innerHeight - m ? (d.py - innerHeight + m) / 3 : 0;
    if (vy) window.scrollBy(0, vy);
    const bd = document.querySelector<HTMLElement>('.kb-board'); if (bd) { const r = bd.getBoundingClientRect();
      const vx = d.px < r.left + m ? -(r.left + m - d.px) / 3 : d.px > r.right - m ? (d.px - r.right + m) / 3 : 0; if (vx) bd.scrollLeft += vx; }
    const c = colAt(d.px, d.py); const ok = c === d.i + 1 || (c === d.i - 1 && c >= 0) ? c : -1; if (ok !== d.over) { d.over = ok; setOver(ok); }
    // cột đích cuộn khuất đầu → hộp thư bám mép trên màn hình, ngay trên cột
    const tci = d.over >= 0 ? d.over : d.i + 1;
    const tc = document.querySelector<HTMLElement>(`[data-col="${tci}"]`)?.getBoundingClientRect();
    const fx = tc && tc.top + 64 < 16 && tc.bottom > 140 ? { c: tci, l: Math.round(tc.left + 10), w: Math.round(tc.width - 20) } : null;
    const key = JSON.stringify(fx); if (key !== fixRef.current) { fixRef.current = key; setSlotFix(fx); }
    d.raf = requestAnimationFrame(tick);
  };
  const onMove = (e: PointerEvent) => {
    const d = dr.current; if (!d) return; d.px = e.clientX; d.py = e.clientY;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.on = true; const g = d.card.cloneNode(true) as HTMLElement; g.classList.add('kb-ghost'); g.style.width = d.w + 'px';
      document.body.appendChild(g); d.g = g; document.body.classList.add('kb-dragging'); setDrag({ id: d.id, i: d.i }); d.raf = requestAnimationFrame(tick);
    }
    place(d);
  };
  const onUp = () => {
    const d = dr.current; removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
    dr.current = null; if (!d?.on) return;
    cancelAnimationFrame(d.raf); document.body.classList.remove('kb-dragging');
    const eat1 = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); }; // không mở đơn sau khi kéo
    addEventListener('click', eat1, { capture: true, once: true }); setTimeout(() => removeEventListener('click', eat1, true), 50);
    const o = (orders ?? []).find((x) => x.id === d.id); const g = d.g!;
    const slot = d.over >= 0 ? document.querySelector<HTMLElement>(`[data-col="${d.over}"] .kb-slot-mouth`) : null;
    setDrag(null); setOver(-1);
    const from = g.getBoundingClientRect();
    if (!o || !slot) { // thả sai chỗ: phong bì bay về
      const r = d.card.getBoundingClientRect();
      g.animate([{ transform: g.style.transform, opacity: 1 }, { transform: `translate(${r.left}px,${r.top}px) rotate(0) scale(1)`, opacity: .3 }], { duration: reduce ? 0 : 260, easing: 'ease-in' })
        .finished.then(() => g.remove());
      setSlotFix(null); fixRef.current = ''; return;
    }
    const col = d.over; setEat(col); setBackEat(col < d.i);
    const open = () => (col < d.i ? setBack({ o, i: d.i }) : setMove({ o, i: d.i }));
    if (reduce) { g.remove(); setEat(-1); open(); return; }
    const t = slot.getBoundingClientRect(); const cx = t.left + t.width / 2 - from.width / 2, cy = t.top + t.height / 2 - from.height / 2;
    g.animate([
      { transform: g.style.transform, opacity: 1 },
      { transform: `translate(${cx - d.w * .2}px,${cy - 40}px) rotate(-2deg) scale(.42)`, opacity: 1, offset: .55 },
      { transform: `translate(${cx - d.w * .2}px,${cy + 4}px) rotate(0) scale(.4,.04)`, opacity: .2 }
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).finished.then(() => {
      g.remove(); setTimeout(() => { setEat(-1); setSlotFix(null); fixRef.current = ''; }, 260); open();
    });
  };
  const startDrag = (e: React.PointerEvent<HTMLElement>, id: string, i: number) => {
    if (e.button !== 0 || e.pointerType === 'touch' || i >= COLS.length - 1) return; // điện thoại dùng nút "Chuyển bước"
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    const r = e.currentTarget.getBoundingClientRect();
    dr.current = { id, i, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, card: e.currentTarget, on: false, over: -1, px: e.clientX, py: e.clientY, raf: 0 };
    addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  };
  const reload = () => sb.from('orders').select('*').not('status', 'in', '(hoan_tat,huy)').order('due_date', { nullsFirst: false })
    .then(({ data }) => setOrders((data as Order[]) ?? []));
  useEffect(() => {
    sb.from('orders').select('*').not('status', 'in', '(hoan_tat,huy)').order('due_date', { nullsFirst: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
    sb.from('order_lines').select('order_id, qty, weight_kg').then(({ data }) => {
      const m: Record<string, Agg> = {};
      for (const l of (data as { order_id: string; qty: number; weight_kg: number }[]) ?? []) {
        const a = (m[l.order_id] ??= { qty: 0, kg: 0 }); a.qty += l.qty; a.kg += Number(l.weight_kg);
      }
      setAgg(m);
    });
    sb.from('approvals').select('*').order('created_at').then(({ data }) => setAppr((data as Approval[]) ?? []));
    sb.from('profiles').select('*').then(({ data }) => setPeople(Object.fromEntries(((data as Profile[]) ?? []).map((p) => [p.id, p]))));
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
  }, []);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const cards = useMemo(() => (orders ?? []).filter((o) => (o.code + ' ' + o.project).toLowerCase().includes(q.toLowerCase())).map((o) => {
    const c = COLS.find((x) => x.key === val(o, P.field))!;
    const pend = appr.filter((a) => a.order_id === o.id && a.status === 'cho');
    const lastF2 = appr.filter((a) => a.order_id === o.id && a.doc_type === 'F2').at(-1);
    const myTurn = pend.some((a) => a.approver_id === me?.id) || (!!c && c.roles.some(can));
    const lateAppr = pend.some((a) => a.due_at && new Date(a.due_at) < new Date());
    const due = o.due_date ? new Date(o.due_date) : null;
    const days = due ? Math.round((due.getTime() - today.getTime()) / 864e5) : null;
    return { o, c, pend, myTurn, lateAppr, days, rejected: o.status === 'xndh' && lastF2?.status === 'tu_choi', a: agg[o.id] };
  }).filter((x) => x.c && (!mine || x.myTurn)), [orders, appr, agg, q, mine, me, can, P]); // eslint-disable-line

  const byCol = (k: string) => cards.filter((x) => val(x.o, P.field) === k);
  // Phím tắt Kanban: 1–4 đổi quy trình, J/K/H/L (hoặc mũi tên) chọn thẻ, Enter mở, M chuyển, R trả về, F lọc việc của tôi
  const [sel, setSel] = useState<{ c: number; r: number } | null>(null);
  const navg = useNavigate();
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return;
      const key = e.key.toLowerCase();
      if (['1', '2', '3', '4'].includes(key)) { e.preventDefault(); pick(PROCS[Number(key) - 1].key); setSel(null); return; }
      if (key === 'f') { e.preventDefault(); setMine((v) => !v); return; }
      const cols = COLS.map((c) => byCol(c.key));
      const first = () => { const c = cols.findIndex((l) => l.length); return c < 0 ? null : { c, r: 0 }; };
      const mv = (dc: number, dr: number) => { e.preventDefault();
        setSel((s0) => { if (!s0) return first(); let c = s0.c, r = s0.r;
          if (dc) { let n = c + dc; while (n >= 0 && n < cols.length && !cols[n].length) n += dc; if (n >= 0 && n < cols.length) { c = n; r = Math.min(r, cols[n].length - 1); } }
          if (dr) r = Math.max(0, Math.min(cols[c].length - 1, r + dr));
          return { c, r }; }); };
      if (key === 'j' || e.key === 'ArrowDown') mv(0, 1); else if (key === 'k' || e.key === 'ArrowUp') mv(0, -1);
      else if (key === 'h' || e.key === 'ArrowLeft') mv(-1, 0); else if (key === 'l' || e.key === 'ArrowRight') mv(1, 0);
      else if (sel && cols[sel.c]?.[sel.r]) {
        const it = cols[sel.c][sel.r];
        if (e.key === 'Enter') { e.preventDefault(); navg('/don/' + it.o.id); }
        else if (key === 'm' && sel.c < COLS.length - 1) { e.preventDefault(); setMove({ o: it.o, i: sel.c }); }
        else if (key === 'r' && sel.c > 0) { e.preventDefault(); setBack({ o: it.o, i: sel.c }); }
        else if (e.key === 'Escape') setSel(null);
      }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  const selId = sel ? byCol(COLS[sel.c]?.key ?? '')[sel.r]?.o.id : undefined;
  useEffect(() => { if (selId) document.querySelector(`[data-card="${selId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [selId]);
  const countIn = (pr: Proc) => (orders ?? []).filter((o) => pr.cols.some((c) => c.key === val(o, pr.field))).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Bảng Kanban</h1><p className="muted">Chọn quy trình. Mỗi cột là một bước; vạch đỏ là điều kiện chuyển (ĐK).</p></div>
        <div className="row">
          <Link className="btn sm" to="/so-do"><Icon name="flow" size={18} />Sơ đồ</Link>
          <Link className="btn sm" to="/don"><Icon name="list" size={18} />Dạng danh sách</Link>
          {(can('kinh_doanh') || can('admin_cnc')) && <Link className="btn sm primary" to="/don/moi"><Icon name="plus" size={18} />Tạo đơn</Link>}
        </div>
      </div>
      <div className="row">
        <label className="search"><Icon name="search" size={18} /><input aria-label="Tìm mã đơn, dự án" placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="pill-toggle" aria-pressed={mine} onClick={() => setMine(!mine)} title="Phím F">{mine && <Icon name="check" size={16} />}Chỉ việc đến lượt tôi</button>
        <button className="kbd-hint" onClick={() => dispatchEvent(new Event('show-shortcuts'))} title="Xem phím tắt"><kbd>J</kbd><kbd>K</kbd> chọn · <kbd>M</kbd> chuyển · <kbd>R</kbd> trả về · <kbd>?</kbd></button>
      </div>

      <div className="qt-group">
      <div className="qt-tabs" role="tablist" aria-label="Chọn quy trình">
        {PROCS.map((pr) => (
          <button key={pr.key} role="tab" aria-selected={qt === pr.key} className={qt === pr.key ? 'on' : ''} onClick={() => pick(pr.key)}>
            <b>{pr.title}</b><span>{pr.sub}</span><span className="kb-count">{countIn(pr)}</span>
          </button>))}
      </div>

      {/* Điện thoại: chọn một cột, không cuộn ngang cả trang */}
      <div className="qt-panel" key={qt}>
      <div className="kb-picker" role="tablist" aria-label="Chọn bước">
        {COLS.map((c) => (
          <button key={c.key} role="tab" aria-selected={curCol === c.key} className={curCol === c.key ? 'on' : ''} onClick={() => setCol(c.key)}>
            {c.title} <span className="kb-count">{byCol(c.key).length}</span>
          </button>))}
      </div>

      <div className="kb-board">
        {COLS.map((c, i) => {
          const list = byCol(c.key);
          return (
            <section key={c.key} className={'kb-col' + (curCol === c.key ? ' show' : '') + (c.gate ? ' gated' : '')
              + (drag ? (drag.i + 1 === i ? ' drop-ok' : drag.i - 1 === i ? ' drop-ok back' : drag.i === i ? '' : ' drop-no') : '') + (over === i && drag ? ' drop-over' : '')} aria-label={c.title}
              data-col={i}>
              <header className="kb-head">
                <span className="kb-group">{P.title} · bước {i + 1}</span>
                <div className="row between" style={{ gap: 6 }}><h2>{c.title}</h2><span className="kb-count">{list.length}</span></div>
              </header>
              <div className="kb-list">
                {((drag && (drag.i + 1 === i || drag.i - 1 === i)) || eat === i) && (() => { const isBack = drag ? drag.i - 1 === i : backEat; const fx = slotFix?.c === i ? slotFix : null; return (
                  <div className={'kb-slot' + (isBack ? ' back' : '') + (over === i || eat === i ? ' open' : '') + (eat === i ? ' eat' : '') + (fx ? ' fixed' : '')} aria-hidden="true"
                    style={fx ? { left: fx.l, width: fx.w } : undefined}>
                    <span className="kb-slot-mouth" /><span className="kb-slot-txt"><Icon name={isBack ? 'back' : 'inbox'} size={16} />{isBack ? 'Thả vào đây để trả về ' : 'Thả vào đây để chuyển sang '}{c.title}</span>
                  </div>); })()}
                {!orders ? <Skeleton rows={2} h={120} /> : list.length === 0 && <p className="kb-empty">Không có đơn ở bước này</p>}
                {list.map(({ o, pend, myTurn, lateAppr, days, rejected, a }) => (
                  <article key={o.id} className={'kb-card' + (myTurn ? ' mine' : '') + (drag?.id === o.id ? ' dragging' : '') + (landed === o.id ? ' landed' : '') + (selId === o.id ? ' kb-sel' : '')} data-card={o.id}
                    onPointerDown={(e) => startDrag(e, o.id, i)} onDragStart={(e) => e.preventDefault()}>
                    <Link to={'/don/' + o.id} className="kb-link">
                      <span className="kb-code">{o.code}</span>
                      <span className="kb-proj">{o.project}</span>
                      <span className="small muted">{[cust[o.kh1_id ?? '']?.name, cust[o.kh2_id ?? '']?.name].filter(Boolean).join(' → ')}</span>
                    </Link>
                    <div className="kb-meta">
                      {a && <span>{a.qty} tấm · {num(a.kg, 0)} kg</span>}
                      {o.due_date && <span className={days != null && days < 0 ? 'kb-late' : days != null && days <= 3 ? 'kb-soon' : ''}>
                        {days != null && days < 0 && <><Icon name="alert" size={14} />Trễ {-days} ngày · </>}Giao {date(o.due_date)}</span>}
                    </div>
                    {(() => { const st = stepOf(o.id, c.key); if (!st) return null; const d = st.doer_id ? people[st.doer_id] : undefined; const dg = groups.find((g) => g.id === st.doer_group_id);
                      const supN = [...st.supervisor_group_ids.map((x) => 'Nhóm ' + (groups.find((g) => g.id === x)?.name ?? '?')), ...st.supervisor_ids.map((x) => people[x]?.full_name)]; return (
                      <div className="kb-people">
                        {dg ? <span className="kb-doer"><GroupBadge g={dg} />Nhóm {dg.name}{d ? <> · <Avatar p={d} />{d.full_name}</> : <span className="chip wait">Chưa ai nhận</span>}</span> : d ? <span className="kb-doer"><Avatar p={d} />{d.full_name}</span> : c.roles.length ? <span className="chip bad">Chưa giao người</span> : <span className="small muted">Theo chuỗi duyệt</span>}
                        {supN.length > 0 && <span className="kb-sup" title={'Giám sát: ' + supN.join(', ')}>
                          <Icon name="eye" size={13} />{st.supervisor_group_ids.map((x) => <GroupBadge key={x} g={groups.find((g) => g.id === x)} />)}{st.supervisor_ids.map((x) => <Avatar key={x} p={people[x]} />)}</span>}
                        <DueChip due={st.due_at} />
                      </div>); })()}
                    <div className="kb-tags">
                      {o.f1_result === 'khong_dat' && <span className="chip bad">F1 không đạt</span>}
                      {rejected && <span className="chip bad">XNĐH bị từ chối</span>}
                      {pend.map((p) => <span key={p.id} className={'chip ' + (lateAppr ? 'bad' : 'wait')}>
                        {lateAppr ? <><Icon name="alert" size={13} />Quá hạn · </> : <><Icon name="clock" size={13} />Chờ </>}{people[p.approver_id ?? '']?.full_name ?? 'người duyệt'}</span>)}
                      {P.field === 'status' && o.status === 'san_xuat' && <span className="chip idle">QT2: {BRANCH[o.gc_status]}</span>}
                      {P.field === 'step' && o.gc_status === 'cho_nvl' && <span className="chip idle">NVL: {BRANCH[o.nvl_status]}</span>}
                    </div>
                    <div className="kb-acts">
                      {myTurn && <Link className="btn sm primary kb-next" to={'/don/' + o.id + '?tab=' + c.tab}>{c.next} →</Link>}
                      {i < COLS.length - 1 && <button className="btn sm kb-move" onClick={() => setMove({ o, i })} aria-label={'Chuyển ' + o.code + ' sang ' + COLS[i + 1].title}
                        title="Chuyển sang bước sau (hoặc kéo thẻ)"><Icon name="arrow" size={16} />Chuyển bước</button>}
                      {i > 0 && <button className="btn sm kb-back" onClick={() => setBack({ o, i })} aria-label={'Trả ' + o.code + ' về ' + COLS[i - 1].title}
                        title="Trả về bước trước (hoặc kéo thẻ sang trái)"><Icon name="back" size={16} />Trả về</button>}
                    </div>
                  </article>))}
              </div>
              {c.gate && <div className="kb-gate" title="Điều kiện để sang bước sau"><Icon name="alert" size={14} />{c.gate}</div>}
            </section>);
        })}
      </div>
      </div>
      </div>
      {back && <ReturnDialog o={back.o} proc={P} i={back.i} onClose={() => setBack(null)} onDone={() => { const id = back.o.id; setBack(null); reload().then(() => { loadSteps(); setLanded(id); setTimeout(() => setLanded(''), 900); }); }} />}
      {move && <MoveDialog o={move.o} proc={P} i={move.i} onClose={() => setMove(null)} onMoved={() => { const id = move.o.id; setMove(null); reload().then(() => { loadSteps(); setLanded(id); setTimeout(() => setLanded(''), 900); }); }} />}
    </>
  );
}
