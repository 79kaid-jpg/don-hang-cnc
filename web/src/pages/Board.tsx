import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Customer, type Order, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, date, num, qt2Step } from '../lib/format';
const val = (o: Order, f: Proc['field']) => (f === 'step' ? qt2Step(o) : o[f]);
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';
import { MoveDialog } from '../components/MoveDialog';
import { Avatar, DueChip, type OStep } from '../components/StepPeople';

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
  const [osteps, setOsteps] = useState<OStep[]>([]);
  const loadSteps = () => sb.from('order_steps').select('*').is('done_at', null).then(({ data }) => setOsteps((data as OStep[]) ?? []));
  useEffect(() => { loadSteps(); }, []); // eslint-disable-line
  const stepOf = (id: string, colKey: string) => osteps.find((x) => x.order_id === id && x.step === ({ qt0: 'qt0.', qt1: 'qt1.', qt2: 'qt2.', qt4: 'qt3.' } as Record<string, string>)[P.key] + colKey);
  const [landed, setLanded] = useState(''); const [eat, setEat] = useState(-1);
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Ảnh kéo: thẻ thu nhỏ, nghiêng như phong bì
  const startDrag = (e: React.DragEvent<HTMLElement>, id: string, i: number) => {
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id);
    const src = e.currentTarget; const g = src.cloneNode(true) as HTMLElement;
    g.classList.add('kb-ghost'); g.style.width = src.offsetWidth + 'px'; document.body.appendChild(g);
    e.dataTransfer.setDragImage(g, 40, 24); setTimeout(() => g.remove(), 0);
    setDrag({ id, i });
  };
  // Thả: thẻ bay vào khe hộp thư rồi mới mở hộp kiểm tra
  const dropInto = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    const o = (orders ?? []).find((x) => x.id === drag?.id); const d = drag;
    setDrag(null); setOver(-1);
    if (!o || !d) return;
    const card = document.querySelector<HTMLElement>('[data-card="' + o.id + '"]');
    const slot = e.currentTarget.querySelector<HTMLElement>('.kb-slot-mouth');
    if (reduce || !card || !slot) { setMove({ o, i: d.i }); return; }
    const r = card.getBoundingClientRect(), t = slot.getBoundingClientRect();
    const f = card.cloneNode(true) as HTMLElement; f.classList.add('kb-fly');
    Object.assign(f.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' }); document.body.appendChild(f);
    const sx = e.clientX - r.left - r.width / 2, sy = e.clientY - r.top - r.height / 2;
    const dx = t.left + t.width / 2 - r.left - r.width / 2, dy = t.top + t.height / 2 - r.top - r.height / 2;
    const col = d.i + 1; setEat(col);
    f.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.55) rotate(-6deg)`, opacity: 1 },
      { transform: `translate(${dx}px,${dy - 40}px) scale(.42) rotate(-2deg)`, opacity: 1, offset: .55 },
      { transform: `translate(${dx}px,${dy + 6}px) scale(.38,.05) rotate(0)`, opacity: .2 }
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.then(() => {
      f.remove(); setTimeout(() => setEat(-1), 260); setMove({ o, i: d.i });
    });
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
        <button className="pill-toggle" aria-pressed={mine} onClick={() => setMine(!mine)}>{mine && <Icon name="check" size={16} />}Chỉ việc đến lượt tôi</button>
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
              + (drag ? (drag.i + 1 === i ? ' drop-ok' : drag.i === i ? '' : ' drop-no') : '') + (over === i && drag?.i === i - 1 ? ' drop-over' : '')} aria-label={c.title}
              onDragOver={(e) => { if (drag && drag.i + 1 === i) { e.preventDefault(); setOver(i); } }}
              onDragLeave={() => setOver(-1)}
              onDrop={dropInto}>
              <header className="kb-head">
                <span className="kb-group">{P.title} · bước {i + 1}</span>
                <div className="row between" style={{ gap: 6 }}><h2>{c.title}</h2><span className="kb-count">{list.length}</span></div>
              </header>
              <div className="kb-list">
                {((drag && drag.i + 1 === i) || eat === i) && (
                  <div className={'kb-slot' + (over === i || eat === i ? ' open' : '') + (eat === i ? ' eat' : '')} aria-hidden="true">
                    <span className="kb-slot-mouth" /><span className="kb-slot-txt"><Icon name="inbox" size={16} />Thả vào đây để chuyển sang {c.title}</span>
                  </div>)}
                {!orders ? <Skeleton rows={2} h={120} /> : list.length === 0 && <p className="kb-empty">Không có đơn ở bước này</p>}
                {list.map(({ o, pend, myTurn, lateAppr, days, rejected, a }) => (
                  <article key={o.id} className={'kb-card' + (myTurn ? ' mine' : '') + (drag?.id === o.id ? ' dragging' : '') + (landed === o.id ? ' landed' : '')} data-card={o.id}
                    draggable={i < COLS.length - 1} onDragStart={(e) => startDrag(e, o.id, i)} onDragEnd={() => { setDrag(null); setOver(-1); }}>
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
                    {(() => { const st = stepOf(o.id, c.key); if (!st) return null; const d = st.doer_id ? people[st.doer_id] : undefined; return (
                      <div className="kb-people">
                        {d ? <span className="kb-doer"><Avatar p={d} />{d.full_name}</span> : c.roles.length ? <span className="chip bad">Chưa giao người</span> : <span className="small muted">Theo chuỗi duyệt</span>}
                        {st.supervisor_ids.length > 0 && <span className="kb-sup" title={'Giám sát: ' + st.supervisor_ids.map((x) => people[x]?.full_name).join(', ')}>
                          <Icon name="eye" size={13} />{st.supervisor_ids.map((x) => <Avatar key={x} p={people[x]} />)}</span>}
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
                    </div>
                  </article>))}
              </div>
              {c.gate && <div className="kb-gate" title="Điều kiện để sang bước sau"><Icon name="alert" size={14} />{c.gate}</div>}
            </section>);
        })}
      </div>
      </div>
      </div>
      {move && <MoveDialog o={move.o} proc={P} i={move.i} onClose={() => setMove(null)} onMoved={() => { const id = move.o.id; setMove(null); reload().then(() => { loadSteps(); setLanded(id); setTimeout(() => setLanded(''), 900); }); }} />}
    </>
  );
}
