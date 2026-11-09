import { createPortal } from 'react-dom';
import { LoginAs } from '../components/LoginAs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, errText, type Customer, type Order } from '../lib/supabase';
import { dt } from '../lib/format';
import { BATCH_WORD, COMPANY, FINAL, FLOW, NEXT_LABEL, PROC_NAME, STATUS, columnsOf, stepOf, type Batch, type Doc, type Proc } from '../lib/proc';
import { Icon } from '../components/Icon';
import { useHolders, initialOf, waited, isStuck } from '../lib/holders';
import { Skeleton, toast } from '../components/ui';
import { isTyping, modalOpen } from '../components/Shortcuts';
import { useAuth } from '../lib/auth';
import { advanceDoc } from '../lib/records';

/** Kanban theo swimlane: mỗi quy trình một bảng; thẻ = một hồ sơ (lần bóc tách / XNĐH / lệnh / đợt giao).
 *  QT1–QT3: cột = Lập / Kiểm tra / Duyệt của từng công ty PN → IPC → Hanwa, cột cuối là bước ký tay. */
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
type Mine = { doc_id: string | null; batch_id: string };
/** Bước nhập liệu (phải mở hồ sơ) và nhãn hành động chuyển bước */
const ENTRY = ['tiep_nhan', 'boc_tach', 'tao_ds', 'lap'];
const NEXT_BTN: Record<string, string> = { tiep_nhan: 'Chuyển bóc tách', boc_tach: 'Chuyển tạo DS tấm', tao_ds: 'Gửi kiểm tra', lap: 'Gửi kiểm tra', kiem_tra: 'Gửi duyệt', duyet: 'Duyệt', duyet_them: 'Duyệt' };
type Card = { b: Batch; o?: Order; key: string; doc?: Doc; mine: boolean; act: boolean; i: number };

export default function Board() {
  const nav = useNavigate();
  const [orders, setOrders] = useState<Record<string, Order>>({}); const [cust, setCust] = useState<Record<string, Customer>>({});
  const { can: canA, me: meP } = useAuth(); const adm = canA('admin_it');
  // Công ty của người đang dùng (kể cả khi Admin "đăng nhập với tư cách"): chỉ hiện cột của công ty mình
  const myCo = ({ CNC: 'PN', IPC: 'IPC', HANWA: 'HW' } as Record<string, string>)[meP?.unit ?? ''] ?? '';
  const [picking, setPicking] = useState(false);
  const [batches, setBatches] = useState<Batch[] | null>(null); const [docs, setDocs] = useState<Doc[]>([]); const [mine, setMine] = useState<Mine[]>([]);
  const [q, setQ] = useState(''); const [onlyMine, setOnlyMine] = useState(false);
  const [qt, setQt] = useState<Proc>(() => { try { return (localStorage.getItem('kb-proc') as Proc) || 'QT0'; } catch { return 'QT0'; } });
  const [col, setCol] = useState(''); const holder = useHolders();
  const pick = (p: Proc) => { setQt(p); setCol(''); setSel(null); try { localStorage.setItem('kb-proc', p); } catch { /* */ } };
  const load = async () => {
    const [a, b, c, d, e] = await Promise.all([
      sb.from('batches').select('*').or(`status.in.(dang_lam,cho_ky),and(status.in.(hoan_tat,fail),done_at.gte.${new Date(Date.now() - 14 * 864e5).toISOString()})`).order('created_at'),
      sb.from('orders').select('*'), sb.from('customers').select('*'), sb.rpc('my_docs'), sb.from('docs_v').select('*')]);
    setBatches((a.data as Batch[]) ?? []); setOrders(Object.fromEntries(((b.data as Order[]) ?? []).map((x) => [x.id, x])));
    setCust(Object.fromEntries(((c.data as Customer[]) ?? []).map((x) => [x.id, x]))); setMine((d.data as Mine[]) ?? []); setDocs((e.data as Doc[]) ?? []);
  };
  useEffect(() => { load(); }, []);
  // Hai cột kết quả ở cuối (như Base): chỉ hiện hồ sơ kết thúc trong 14 ngày gần nhất
  const COLS = [...columnsOf(qt).filter((c) => adm || qt === 'QT0' || c.key.startsWith(myCo + '.') || (c.key === 'ky' && myCo === 'PN')), { key: 'hoan_tat', title: 'Hoàn thành', group: 'Kết quả' }, { key: 'fail', title: 'Thất bại', group: 'Kết quả' }];
  const cards: Card[] = useMemo(() => (batches ?? []).filter((b) => b.proc === qt).map((b) => {
    const st = stepOf(b, docs); const o = orders[b.order_id];
    return { b, o, key: st.key, doc: st.doc, mine: mine.some((m) => m.batch_id === b.id), act: !['hoan_tat', 'fail'].includes(b.status) && (adm || mine.some((m) => m.batch_id === b.id)), i: COLS.findIndex((c) => c.key === st.key) };
  }).filter((c) => c.i >= 0 && (!onlyMine || c.mine) && (!q || (c.o?.code + ' ' + c.o?.project + ' ' + c.b.title).toLowerCase().includes(q.toLowerCase()))), [batches, docs, orders, mine, qt, q, onlyMine, adm]); // eslint-disable-line
  // Cột Kết quả: hồ sơ vừa xong (duyệt / thất bại) mới nhất nằm trên cùng
  const tEnd = (c: Card) => { const ds = ((Array.isArray(docs) ? docs : Object.values(docs ?? {})) as { batch_id?: string; status_at?: string }[]).filter((x) => x.batch_id === c.b.id);
    return Math.max(+new Date(c.doc?.status_at ?? 0), ...ds.map((x) => +new Date(x.status_at ?? 0)), +new Date((c.b as { updated_at?: string }).updated_at ?? 0)); };
  const byCol = (i: number) => { const l = cards.filter((c) => c.i === i); return ['hoan_tat', 'fail'].includes(COLS[i]?.key) ? l.sort((a, z) => tEnd(z) - tEnd(a)) : l; };
  const countIn = (p: Proc) => (batches ?? []).filter((b) => b.proc === p).length;
  const mineIn = (p: Proc) => (batches ?? []).some((b) => b.proc === p && mine.some((m) => m.batch_id === b.id));
  const auto = useRef(false);
  useEffect(() => { if (auto.current || !batches) return; auto.current = true; if (!mineIn(qt)) { const t = PROCS.find(mineIn) ?? (countIn(qt) ? null : PROCS.find((p) => countIn(p) > 0)); if (t) setQt(t); } }, [batches, mine]); // eslint-disable-line
  const curCol = col || (COLS.find((_, i) => byCol(i).some((c) => c.mine)) ?? COLS.find((_, i) => byCol(i).length) ?? COLS[0]).key;

  // Hộp chuyển / trả về
  const [dlg, setDlg] = useState<{ c: Card; action: 'next' | 'back' } | null>(null);
  const canBack = (c: Card) => !!c.doc && FLOW[qt].indexOf(c.doc.status) > 0;
  const canNext = (c: Card) => !!c.doc && c.key !== 'ky';
  // Phím tắt
  const [sel, setSel] = useState<{ c: number; r: number } | null>(null);
  const selCard = sel ? byCol(sel.c)[sel.r] : undefined;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return;
      const key = e.key.toLowerCase();
      if (['1', '2', '3', '4'].includes(key)) { e.preventDefault(); pick(PROCS[Number(key) - 1]); return; }
      if (key === 'f') { e.preventDefault(); setOnlyMine((v) => !v); return; }
      const cols = COLS.map((_, i) => byCol(i));
      const mv = (dc: number, dr: number) => { e.preventDefault(); setSel((s0) => {
        if (!s0) { const c = cols.findIndex((l) => l.length); return c < 0 ? null : { c, r: 0 }; } let c = s0.c, r = s0.r;
        if (dc) { let n = c + dc; while (n >= 0 && n < cols.length && !cols[n].length) n += dc; if (n >= 0 && n < cols.length) { c = n; r = Math.min(r, cols[n].length - 1); } }
        if (dr) r = Math.max(0, Math.min(cols[c].length - 1, r + dr)); return { c, r }; }); };
      if (key === 'j' || e.key === 'ArrowDown') mv(0, 1); else if (key === 'k' || e.key === 'ArrowUp') mv(0, -1);
      else if (key === 'h' || e.key === 'ArrowLeft') mv(-1, 0); else if (key === 'l' || e.key === 'ArrowRight') mv(1, 0);
      else if (selCard) {
        if (e.key === 'Enter') { e.preventDefault(); nav('/don/' + selCard.b.order_id + '?tab=' + qt); }
        else if (key === 'm' && selCard.act && canNext(selCard)) { e.preventDefault(); setDlg({ c: selCard, action: 'next' }); }
        else if (key === 'r' && selCard.act && canBack(selCard)) { e.preventDefault(); setDlg({ c: selCard, action: 'back' }); }
      }
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });

  // Kéo thả kiểu bỏ thư vào hộp: thả sang cột kế = ký chuyển bước; sang cột trước (cùng công ty) = trả về
  const [drag, setDrag] = useState<Card | null>(null); const [over, setOver] = useState(-1); const [eat, setEat] = useState(-1); const [landed, setLanded] = useState('');
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dr = useRef<{ c: Card; x0: number; y0: number; ox: number; oy: number; w: number; card: HTMLElement; g?: HTMLElement; on: boolean; over: number; px: number; py: number; raf: number } | null>(null);
  const targets = (c: Card) => [canNext(c) ? c.i + 1 : -9, canBack(c) ? c.i - 1 : -9];
  const colAt = (x: number) => { for (const el of document.querySelectorAll<HTMLElement>('[data-col]')) { const r = el.getBoundingClientRect(); if (x >= r.left && x <= r.right) return Number(el.dataset.col); } return -1; };
  const tick = () => { const d = dr.current; if (!d?.on) return;
    const m = 70, vy = d.py < m ? -(m - d.py) / 3 : d.py > innerHeight - m ? (d.py - innerHeight + m) / 3 : 0; if (vy) scrollBy(0, vy);
    const bd = document.querySelector<HTMLElement>('.kb-board'); if (bd) { const r = bd.getBoundingClientRect(); const vx = d.px < r.left + m ? -(r.left + m - d.px) / 3 : d.px > r.right - m ? (d.px - r.right + m) / 3 : 0; if (vx) bd.scrollLeft += vx; }
    const c = colAt(d.px); const ok = targets(d.c).includes(c) ? c : -1; if (ok !== d.over) { d.over = ok; setOver(ok); }
    d.raf = requestAnimationFrame(tick); };
  const onMove = (e: PointerEvent) => { const d = dr.current; if (!d) return; d.px = e.clientX; d.py = e.clientY;
    if (!d.on) { if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return; d.on = true;
      const g = d.card.cloneNode(true) as HTMLElement; g.classList.add('kb-ghost'); g.style.width = d.w + 'px'; document.body.appendChild(g); d.g = g;
      document.body.classList.add('kb-dragging'); setDrag(d.c); d.raf = requestAnimationFrame(tick); }
    if (d.g) d.g.style.transform = `translate(${d.px - d.ox * .6}px,${d.py - d.oy * .6}px) rotate(-5deg) scale(.6)`; };
  const onUp = () => { const d = dr.current; removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
    dr.current = null; if (!d?.on) return; cancelAnimationFrame(d.raf); document.body.classList.remove('kb-dragging');
    const eat1 = (ev: MouseEvent) => { ev.preventDefault(); ev.stopPropagation(); }; addEventListener('click', eat1, { capture: true, once: true }); setTimeout(() => removeEventListener('click', eat1, true), 50);
    const g = d.g!; const slot = d.over >= 0 ? document.querySelector<HTMLElement>(`[data-col="${d.over}"] .kb-slot-mouth`) : null; setDrag(null); setOver(-1);
    if (!slot) { const r = d.card.getBoundingClientRect(); g.animate([{ transform: g.style.transform }, { transform: `translate(${r.left}px,${r.top}px) scale(1)`, opacity: .3 }], { duration: reduce ? 0 : 260 }).finished.then(() => g.remove()); return; }
    const action = d.over > d.c.i ? 'next' : 'back'; const open = () => setDlg({ c: d.c, action }); setEat(d.over);
    if (reduce) { g.remove(); setEat(-1); open(); return; }
    const from = g.getBoundingClientRect(), t = slot.getBoundingClientRect(); const cx = t.left + t.width / 2 - from.width / 2, cy = t.top + t.height / 2 - from.height / 2;
    g.animate([{ transform: g.style.transform }, { transform: `translate(${cx - d.w * .2}px,${cy - 40}px) rotate(-2deg) scale(.42)`, offset: .55 },
      { transform: `translate(${cx - d.w * .2}px,${cy + 4}px) scale(.4,.04)`, opacity: .2 }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' })
      .finished.then(() => { g.remove(); setTimeout(() => setEat(-1), 260); open(); }); };
  // Điện thoại: các cột xếp ngang, vuốt để xem bước trước/sau (scroll-snap), đồng bộ với thanh chọn bước
  const boardRef = useRef<HTMLDivElement>(null); const syncing = useRef(0);
  const mobile = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches;
  const goCol = (i: number) => { const el = boardRef.current; const c = COLS[i]; if (!c) return; setCol(c.key);
    if (el && mobile()) { syncing.current = Date.now(); el.scrollTo({ left: (el.children[i] as HTMLElement).offsetLeft - el.offsetLeft - 0, behavior: reduce ? 'auto' : 'smooth' }); } };
  // Máy tính: bảng cao vừa màn hình (cột tự cuộn dọc) → thanh cuộn ngang luôn thấy; mũi tên, kéo nền để lướt, lăn chuột trên tiêu đề cột = lướt ngang
  const [edge, setEdge] = useState({ l: false, r: false });
  const updEdge = () => { const el = boardRef.current; if (!el) return; const l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4; setEdge((e) => (e.l === l && e.r === r ? e : { l, r })); };
  const panBy = (dir: number) => { const el = boardRef.current; if (!el) return; const w = (el.children[0] as HTMLElement)?.offsetWidth || 260; el.scrollBy({ left: dir * (w + 12) * 2, behavior: reduce ? 'auto' : 'smooth' }); };
  const panStart = (e: React.MouseEvent) => { const el = boardRef.current; if (!el || e.button !== 0 || mobile()) return; const t = e.target as HTMLElement;
    if (t.closest('.kb-card, a, button, input, select')) return; const x0 = e.clientX, s0 = el.scrollLeft; el.classList.add('panning');
    const mv = (ev: MouseEvent) => { el.scrollLeft = s0 - (ev.clientX - x0); }; const up = () => { el.classList.remove('panning'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  useEffect(() => { const el = boardRef.current; if (!el) return;
    const fit = () => { const top = el.getBoundingClientRect().top + (document.querySelector('.app')?.scrollTop ?? scrollY); el.style.setProperty('--kb-top', Math.max(0, top) + 'px'); updEdge(); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); addEventListener('resize', fit);
    const wh = (ev: WheelEvent) => { if (mobile() || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return; if ((ev.target as HTMLElement).closest('.kb-head')) { el.scrollLeft += ev.deltaY; ev.preventDefault(); } };
    el.addEventListener('wheel', wh, { passive: false });
    return () => { ro.disconnect(); removeEventListener('resize', fit); el.removeEventListener('wheel', wh); }; }, [qt, batches]); // eslint-disable-line react-hooks/exhaustive-deps
  const onBoardScroll = () => { const el = boardRef.current; if (!el || !mobile() || Date.now() - syncing.current < 600) return;
    const w = (el.children[0] as HTMLElement)?.offsetWidth || 1; const i = Math.round(el.scrollLeft / (w + 10));
    if (COLS[i] && COLS[i].key !== curCol) setCol(COLS[i].key); };
  useEffect(() => { const el = boardRef.current; if (!el || !mobile()) return; const i = COLS.findIndex((c) => c.key === curCol);
    const t = el.children[i] as HTMLElement | undefined; if (t && Math.abs(el.scrollLeft - (t.offsetLeft - el.offsetLeft)) > 8) { syncing.current = Date.now(); el.scrollTo({ left: t.offsetLeft - el.offsetLeft }); }
    // gợi ý lần đầu: cột nhích nhẹ
    try { if (!localStorage.getItem('kb-swipe-hint') && i < COLS.length - 1 && !reduce) { localStorage.setItem('kb-swipe-hint', '1'); el.classList.add('hint'); setTimeout(() => el.classList.remove('hint'), 1400); } } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qt, batches]);
  useEffect(() => { document.querySelector('.kb-picker .on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' }); }, [curCol, reduce]);
  const startDrag = (e: React.PointerEvent<HTMLElement>, c: Card) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const tg = e.target as HTMLElement; if (tg.closest('button, input, select') || (tg.closest('a') && !tg.closest('a.kb-link'))) return;
    if (!c.act || (!canNext(c) && !canBack(c))) { // không phải lượt mình: báo khi người dùng thử kéo
      const x0 = e.clientX, y0 = e.clientY, card = e.currentTarget;
      const mv = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 10) return; off();
        toast(!c.act ? 'Chưa đến lượt bạn – chỉ người phụ trách bước này mới kéo được thẻ' : 'Hồ sơ này không chuyển bước được từ đây');
        card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 260 }); };
      const off = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', off); };
      addEventListener('pointermove', mv); addEventListener('pointerup', off); return; }
    const r = e.currentTarget.getBoundingClientRect();
    dr.current = { c, x0: e.clientX, y0: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, card: e.currentTarget, on: false, over: -1, px: e.clientX, py: e.clientY, raf: 0 };
    addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp); };

  return (
    <>
      <div className="page-head">
        <div><h1>Bảng Kanban</h1><p className="muted">Mỗi thẻ là một hồ sơ ({qt === 'QT0' ? 'lần bóc tách' : qt === 'QT1' ? 'XNĐH' : qt === 'QT2' ? 'lệnh gia công' : 'đợt giao'}). {qt === 'QT0' ? 'Chỉ Phương Nam CNC.' : 'Đi lần lượt Phương Nam CNC → IPC → Hanwa, cuối cùng ký tay.'}</p></div>
        <div className="row">
          <Link className="btn sm hide-m" to="/so-do"><Icon name="flow" size={18} />Sơ đồ</Link>
          {qt === 'QT0' ? <Link className="btn sm primary fab-m" to="/don/moi" aria-label="Tạo đơn mới"><Icon name="plus" size={20} /><span className="fab-t">Tạo đơn</span></Link>
            : <button className="btn sm primary fab-m" onClick={() => setPicking(true)} aria-label={'Lập ' + BATCH_WORD[qt]}><Icon name="plus" size={20} /><span className="fab-t">Lập {BATCH_WORD[qt]}</span></button>}
          {picking && qt !== 'QT0' && <OrderPick qt={qt} orders={orders} batches={batches ?? []} onClose={() => setPicking(false)} onPick={(id) => nav('/don/' + id + '?tab=' + qt + '&new=1')} />}
        </div>
      </div>
      <div className="row">
        <label className="search"><Icon name="search" size={18} /><input aria-label="Tìm" placeholder="Lọc bảng: mã đơn, dự án, lệnh…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="pill-toggle" aria-pressed={onlyMine} onClick={() => setOnlyMine(!onlyMine)} title="Phím F">{onlyMine && <Icon name="check" size={16} />}Chỉ việc đến lượt tôi</button>
        <button className="kbd-hint" onClick={() => dispatchEvent(new Event('show-shortcuts'))} title="Phím tắt: J K chọn · M chuyển · R trả về" aria-label="Xem phím tắt"><kbd>?</kbd> Phím tắt</button>
      </div>
      <div className="qt-group">
        <div className="qt-tabs" role="tablist" aria-label="Chọn quy trình">
          {PROCS.map((p) => <button key={p} role="tab" aria-selected={qt === p} className={(qt === p ? 'on ' : '') + 'q' + p.slice(2)} onClick={() => pick(p)}>
            <b>{p}</b><span>{PROC_NAME[p].split(' & ')[0].replace('Xuất kho kiêm biên bản giao hàng', 'Giao hàng')}</span><span className="kb-count">{countIn(p)}</span></button>)}
        </div>
        <div className="qt-panel" key={qt}>
          <div className="kb-picker" role="tablist" aria-label="Chọn bước">
            {COLS.map((c, i) => <button key={c.key} role="tab" aria-selected={curCol === c.key} className={curCol === c.key ? 'on' : ''} onClick={() => goCol(i)}>
              {c.group ? c.group.replace('Phương Nam CNC', 'PN') + ' · ' : ''}{c.title} <span className="kb-count">{byCol(i).length}</span></button>)}
          </div>
          <div className="kb-swipe-nav" aria-hidden="true">
            <button tabIndex={-1} disabled={COLS.findIndex((c) => c.key === curCol) <= 0} onClick={() => goCol(COLS.findIndex((c) => c.key === curCol) - 1)}><Icon name="back" size={16} /></button>
            <span className="kb-dots">{COLS.map((c) => <i key={c.key} className={c.key === curCol ? 'on' : ''} />)}</span>
            <span className="small muted">Bước {COLS.findIndex((c) => c.key === curCol) + 1}/{COLS.length} · vuốt ngang</span>
            <button tabIndex={-1} disabled={COLS.findIndex((c) => c.key === curCol) >= COLS.length - 1} onClick={() => goCol(COLS.findIndex((c) => c.key === curCol) + 1)}><Icon name="arrow" size={16} /></button>
          </div>
          <div className="kb-wrap">
          {edge.l && <button className="kb-arrow l" aria-label="Cột bên trái" onClick={() => panBy(-1)}><Icon name="back" size={18} /></button>}
          {edge.r && <button className="kb-arrow r" aria-label="Cột bên phải" onClick={() => panBy(1)}><Icon name="arrow" size={18} /></button>}
          <div ref={boardRef} onScroll={() => { onBoardScroll(); updEdge(); }} onMouseDown={panStart} className={'kb-board' + (qt !== 'QT0' ? ' wide' : '') + (edge.l ? ' fade-l' : '') + (edge.r ? ' fade-r' : '')}>
            {COLS.map((c, i) => { const list = byCol(i); const tgt = drag && targets(drag).includes(i); const isBack = drag ? i < drag.i : false;
              return (
                <section key={c.key} data-col={i} className={'kb-col' + (/^(PN|IPC|HW)\./.test(c.key) ? ' co co-' + c.key.split('.')[0] : '') + (curCol === c.key ? ' show' : '') + (tgt ? ' drop-ok' + (isBack ? ' back' : '') : drag && drag.i !== i ? ' drop-no' : '') + (over === i ? ' drop-over' : '') + (c.key === 'ky' ? ' gated' : '') + (c.key === 'hoan_tat' ? ' kb-end ok' : c.key === 'fail' ? ' kb-end bad' : '')} aria-label={c.title}>
                  <header className="kb-head"><span className={'kb-group qt-c ' + qt.toLowerCase()}>{c.group === 'Kết quả' ? 'Kết quả · 14 ngày gần nhất' : (c.group ?? qt) + ' · bước ' + (qt === 'QT0' ? i + 1 : (i % 3) + 1)}</span>
                    <div className="row between" style={{ gap: 6 }}><h2>{c.title}</h2><span className="kb-count">{list.length}</span></div></header>
                  <div className="kb-list">
                    {(tgt || eat === i) && <div className={'kb-slot open' + (isBack ? ' back' : '') + (eat === i ? ' eat' : '')} aria-hidden="true"><span className="kb-slot-mouth" />
                      <span className="kb-slot-txt"><Icon name={isBack ? 'back' : 'inbox'} size={16} />{isBack ? 'Thả để trả về' : 'Thả để ký, chuyển sang'} {c.title}</span></div>}
                    {!batches ? <Skeleton rows={2} h={110} /> : list.length === 0 && <p className="kb-empty">Không có hồ sơ</p>}
                    {list.map((it) => (
                      <article key={it.b.id} data-card={it.b.id} className={'kb-card' + (it.mine ? ' mine' : '') + (drag?.b.id === it.b.id ? ' dragging' : '') + (landed === it.b.id ? ' landed' : '') + (selCard?.b.id === it.b.id ? ' kb-sel' : '')}
                        onPointerDown={(e) => startDrag(e, it)}>
                        <Link to={'/don/' + it.b.order_id + '?tab=' + qt} className="kb-link" draggable={false}>
                          <span className="kb-top"><span className="kb-code">{it.o?.code}</span>{(() => { const dd = it.o?.due_date; if (!dd) return null;
                            const n = Math.ceil((new Date(dd + 'T23:59:59').getTime() - Date.now()) / 864e5); const done = ['hoan_tat', 'fail'].includes(it.b.status);
                            const cls = done ? '' : n < 0 ? ' late' : n <= 3 ? ' soon' : '';
                            return <span className={'kb-due' + cls} title={'Hạn giao ' + new Date(dd).toLocaleDateString('vi-VN')}><Icon name="clock" size={12} />Giao {new Date(dd).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                              {!done && (n < 0 ? ' · trễ ' + -n + 'n' : n <= 3 ? (n === 0 ? ' · hôm nay' : ' · còn ' + n + 'n') : '')}</span>; })()}</span>
                          <span className="kb-pj">{(it.o?.project ?? '').replace(/^\[(TEST|MẪU)\]\s*/i, '') || '—'}</span>
                          <span className="small muted kb-sub">{[it.b.title, (() => { const c = cust[it.o?.customer_id ?? it.o?.kh2_id ?? it.o?.kh1_id ?? '']; return c ? (c.code || c.name.replace(/^(CÔNG TY|CTY)\s+(TNHH|CỔ PHẦN|CP)\s*/i, '')) : ''; })()].filter(Boolean).join(' · ')}</span></Link>
                        {qt !== 'QT0' && <div className="kb-cos" aria-label="Tiến độ theo công ty">{(['PN', 'IPC', 'HW'] as const).map((co) => { const dd = docs.find((x) => x.batch_id === it.b.id && x.company === co);
                          const st = !dd ? 'off' : dd.status === 'da_duyet' ? 'ok' : dd.status === 'fail' || dd.status === 'tu_choi' && it.b.status === 'fail' ? 'bad' : it.b.status === 'fail' ? 'off' : 'cur';
                          const lb = { PN: 'PN CNC', IPC: 'IPC', HW: 'Hanwa' }[co];
                          return <span key={co} className={'kb-co c-' + co + ' ' + st} title={lb + ': ' + (st === 'ok' ? 'đã duyệt' : st === 'bad' ? 'thất bại' : st === 'cur' ? 'đang xử lý' : 'chưa tới')}>
                            {st === 'ok' ? '✓' : st === 'bad' ? '✕' : st === 'cur' ? '●' : '○'} {co === 'HW' ? 'Hanwa' : co}</span>; })}</div>}
                        <div className="kb-meta">{(() => { const h = holder(it.b, docs); const t = h?.since ?? it.doc?.status_at; return <>
                          {h && <LoginAs uid={h.uid} name={h.who} className="kb-who"><span className="avatar xs">{initialOf(h.who)}</span>{h.who}</LoginAs>}
                          {t && <span className={'kb-age' + (isStuck(t) ? ' stuck' : '')} title={'Tới bước ' + dt(t)}><Icon name={isStuck(t) ? 'hourglass' : 'clock'} size={13} />chờ {waited(t)}</span>}</>; })()}</div>
                        {it.act && <div className="kb-acts">
                          {it.key === 'ky' ? <Link className="btn sm primary kb-next" to={'/don/' + it.b.order_id + '?tab=' + qt}>Tải bản {FINAL[qt].toLowerCase()} →</Link>
                            : ENTRY.includes(it.doc?.status ?? '') ? <>
                              {/* bước nhập liệu: phải mở hồ sơ để nhập; ✓ gửi luôn khi đã nhập xong */}
                              <Link className="btn sm primary kb-next" title="Mở hồ sơ để nhập liệu" to={'/don/' + it.b.order_id + '?tab=' + qt}>Nhập liệu</Link>
                              {canNext(it) && <button className="kb-ib kb-move" aria-label={NEXT_BTN[it.doc?.status ?? ''] ?? 'Chuyển bước'} title={(NEXT_BTN[it.doc?.status ?? ''] ?? 'Chuyển bước') + ' (M)'} onClick={() => setDlg({ c: it, action: 'next' })}><Icon name="check" size={17} /></button>}</>
                            : <>
                              {/* bước kiểm tra / duyệt: nút chính thực hiện luôn, có hộp xác nhận */}
                              {canNext(it) && <button className="btn sm primary kb-next" title={(NEXT_BTN[it.doc?.status ?? ''] ?? 'Chuyển bước') + ' (M)'} onClick={() => setDlg({ c: it, action: 'next' })}>{NEXT_BTN[it.doc?.status ?? ''] ?? 'Chuyển bước'}</button>}
                              <Link className="kb-ib kb-open" aria-label="Xem hồ sơ" title="Xem hồ sơ (Enter)" to={'/don/' + it.b.order_id + '?tab=' + qt}><Icon name="eye" size={17} /></Link></>}
                          {canBack(it) && <button className="kb-ib kb-back" aria-label="Trả về" title="Trả về (R)" onClick={() => setDlg({ c: it, action: 'back' })}><Icon name="back" size={17} /></button>}
                        </div>}
                      </article>))}
                  </div>
                </section>);
            })}
          </div>
          </div>
        </div>
      </div>
      {dlg && <Advance c={dlg.c} action={dlg.action} proc={qt} onClose={() => setDlg(null)} onDone={() => { const id = dlg.c.b.id; setDlg(null); load().then(() => { setLanded(id); setTimeout(() => setLanded(''), 900); }); }} />}
    </>
  );
}

function Advance({ c, action, proc, onClose, onDone }: { c: Card; action: 'next' | 'back'; proc: Proc; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const st = c.doc?.status ?? '';
  const go = async () => { setBusy(true); setErr('');
    try { const r = await advanceDoc(c.o!, c.b, c.doc!, action, note.trim()); setBusy(false); toast(action === 'next' ? 'Đã ký' : 'Đã trả về'); if (r.warn) setTimeout(() => toast(r.warn!), 1500); onDone(); }
    catch (e) { setBusy(false); setErr(errText(e as Error)); } };
  return (
    <div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>{action === 'next' ? 'Ký' : 'Trả về'} · {c.o?.code}</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <div className="mv-route"><span className="chip idle">{proc !== 'QT0' && c.doc ? COMPANY[c.doc.company] + ' · ' : ''}{STATUS[st]}</span><Icon name={action === 'next' ? 'arrow' : 'back'} size={16} />
        <span className="chip wait">{action === 'next' ? (st === 'duyet' ? (proc === 'QT0' ? 'Đã duyệt' : c.doc?.company === 'HW' ? FINAL[proc] : (c.doc?.company === 'PN' ? 'IPC' : 'Hanwa') + ' · Lập') : STATUS[FLOW[proc][FLOW[proc].indexOf(st) + 1]]) : STATUS[FLOW[proc][FLOW[proc].indexOf(st) - 1]]}</span></div>
      <p className="small muted" style={{ margin: 0 }}>{c.b.title}. {action === 'next' ? 'Ký xác nhận bước này. Cần sửa số liệu, đính kèm file thì bấm “Mở hồ sơ”.' : 'Hồ sơ quay lại bước trước, người phụ trách được báo kèm lý do.'}</p>
      <label className="f">{action === 'back' ? 'Lý do trả về *' : 'Ghi chú (tuỳ chọn)'}<textarea rows={2} autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {err && <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Link className="btn" to={'/don/' + c.b.order_id + '?tab=' + proc}>Mở hồ sơ</Link>
        <button className={action === 'next' ? 'btn primary' : 'btn rt-go'} disabled={busy || (action === 'back' && !note.trim())} onClick={go}>{busy ? 'Đang xử lý…' : action === 'next' ? 'Ký' : 'Trả về'}</button>
      </div>
    </div></div>);
}

/** Chọn đơn hàng để lập hồ sơ mới của QT1/QT2/QT3 (đơn phải xong quy trình trước) */
function OrderPick({ qt, orders, batches, onClose, onPick }: { qt: Proc; orders: Record<string, Order>; batches: Batch[]; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const prev: Proc = qt === 'QT1' ? 'QT0' : qt === 'QT2' ? 'QT1' : 'QT2';
  const ready = (id: string) => batches.some((b) => b.order_id === id && b.proc === prev && b.status === 'hoan_tat');
  const n = (id: string) => batches.filter((b) => b.order_id === id && b.proc === qt).length;
  const list = Object.values(orders).filter((o) => !q || (o.code + ' ' + (o.project ?? '')).toLowerCase().includes(q.toLowerCase()))
    .sort((a, z) => Number(ready(z.id)) - Number(ready(a.id)) || n(a.id) - n(z.id) || z.code.localeCompare(a.code));
  return (
    createPortal(<div className="modal-bg" onClick={onClose}><div className="modal mv" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><h2 style={{ margin: 0 }}>Lập {BATCH_WORD[qt]} – chọn đơn hàng</h2><button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <input autoFocus placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="small muted" style={{ margin: 0 }}>Đơn đã hoàn thành {prev} được xếp lên trước. Đơn mới chưa có thì bấm “Tạo đơn” ở tab QT0.</p>
      <ul className="op-list">{list.slice(0, 60).map((o) => { const ok = ready(o.id); const k = n(o.id);
        return <li key={o.id}><button className={'op-it' + (ok ? '' : ' off')} onClick={() => onPick(o.id)}>
          <b>{o.code}</b><span className="op-p">{o.project}</span>
          <span className={'op-tag' + (ok ? ' ok' : '')}>{ok ? (k ? 'đã có ' + k + ' ' + BATCH_WORD[qt] : 'sẵn sàng') : 'chưa xong ' + prev}</span></button></li>; })}
        {list.length === 0 && <li className="small muted">Không tìm thấy đơn.</li>}</ul>
    </div></div>, document.body));
}
