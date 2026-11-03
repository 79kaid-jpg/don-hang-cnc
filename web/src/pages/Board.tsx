import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Customer, type Order, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, date, num, qt2Step } from '../lib/format';
const val = (o: Order, f: Proc['field']) => (f === 'step' ? qt2Step(o) : o[f]);
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';

/** Bảng Kanban theo từng quy trình: mỗi quy trình một bảng, cột = bước của quy trình đó (giống sơ đồ).
 *  Đơn nằm ở bước theo trạng thái của đúng nhánh: QT0–QT1 theo trạng thái đơn, QT2 theo nhánh NVL, QT3 theo nhánh gia công.
 *  Không kéo-thả: chuyển bước phải qua điều kiện (ĐK) và duyệt, nên mỗi thẻ có nút "Làm bước tiếp". */
type Col = { key: string; title: string; tab: string; next: string; roles: string[]; gate?: string };
type Proc = { key: string; title: string; sub: string; field: 'status' | 'nvl_status' | 'gc_status' | 'gh_status' | 'step'; cols: Col[] };
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

      <div className="qt-tabs" role="tablist" aria-label="Chọn quy trình">
        {PROCS.map((pr) => (
          <button key={pr.key} role="tab" aria-selected={qt === pr.key} className={qt === pr.key ? 'on' : ''} onClick={() => pick(pr.key)}>
            <b>{pr.title}</b><span>{pr.sub}</span><span className="kb-count">{countIn(pr)}</span>
          </button>))}
      </div>

      {/* Điện thoại: chọn một cột, không cuộn ngang cả trang */}
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
            <section key={c.key} className={'kb-col' + (curCol === c.key ? ' show' : '') + (c.gate ? ' gated' : '')} aria-label={c.title}>
              <header className="kb-head">
                <span className="kb-group">{P.title} · bước {i + 1}</span>
                <div className="row between" style={{ gap: 6 }}><h2>{c.title}</h2><span className="kb-count">{list.length}</span></div>
              </header>
              <div className="kb-list">
                {!orders ? <Skeleton rows={2} h={120} /> : list.length === 0 && <p className="kb-empty">Không có đơn ở bước này</p>}
                {list.map(({ o, pend, myTurn, lateAppr, days, rejected, a }) => (
                  <article key={o.id} className={'kb-card' + (myTurn ? ' mine' : '')}>
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
                    <div className="kb-tags">
                      {o.f1_result === 'khong_dat' && <span className="chip bad">F1 không đạt</span>}
                      {rejected && <span className="chip bad">XNĐH bị từ chối</span>}
                      {pend.map((p) => <span key={p.id} className={'chip ' + (lateAppr ? 'bad' : 'wait')}>
                        {lateAppr ? <><Icon name="alert" size={13} />Quá hạn · </> : <><Icon name="clock" size={13} />Chờ </>}{people[p.approver_id ?? '']?.full_name ?? 'người duyệt'}</span>)}
                      {P.field === 'status' && o.status === 'san_xuat' && <span className="chip idle">QT2: {BRANCH[o.gc_status]}</span>}
                      {P.field === 'step' && o.gc_status === 'cho_nvl' && <span className="chip idle">NVL: {BRANCH[o.nvl_status]}</span>}
                    </div>
                    {myTurn && <Link className="btn sm primary kb-next" to={'/don/' + o.id + '?tab=' + c.tab}>{c.next} →</Link>}
                  </article>))}
              </div>
              {c.gate && <div className="kb-gate" title="Điều kiện để sang bước sau"><Icon name="alert" size={14} />{c.gate}</div>}
            </section>);
        })}
      </div>
    </>
  );
}
