import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Customer, type Order, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { date, num } from '../lib/format';
import { Icon } from '../components/Icon';
import { Skeleton } from '../components/ui';

/** Cột Kanban = trạng thái đơn. Kéo-thả cố ý không có: chuyển cột phải qua kiểm tra nghiệp vụ (ĐK1, duyệt, ĐK2),
 *  nên mỗi thẻ có nút "Làm bước tiếp" mở đúng tab cần thao tác. */
const COLS: { key: string; title: string; group: string; tab: string; next: string; roles: string[] }[] = [
  { key: 'tiep_nhan', title: 'Tiếp nhận', group: 'QT0', tab: 'F1', next: 'Bắt đầu bóc tách', roles: ['kinh_doanh', 'ky_thuat'] },
  { key: 'boc_tach', title: 'Bóc tách F1', group: 'QT0', tab: 'F1', next: 'Lập F1, gửi kiểm tra', roles: ['ky_thuat', 'kinh_doanh'] },
  { key: 'kiem_tra_f1', title: 'Kiểm tra F1', group: 'QT0', tab: 'F1', next: 'Kiểm tra F1 (ĐK1)', roles: ['kiem_tra_f1'] },
  { key: 'xndh', title: 'Lập XNĐH', group: 'QT1', tab: 'F2', next: 'Nhập giá, gửi duyệt', roles: ['admin_cnc', 'kinh_doanh'] },
  { key: 'cho_duyet_xndh', title: 'Chờ duyệt XNĐH', group: 'QT1', tab: 'F2', next: 'Duyệt XNĐH', roles: [] },
  { key: 'cho_khach', title: 'Chờ khách xác nhận', group: 'QT1', tab: 'F2', next: 'Ghi KH1 → KH2, PDF ký', roles: ['admin_cnc', 'kinh_doanh'] },
  { key: 'san_xuat', title: 'Sản xuất', group: 'QT2–QT4', tab: 'F1', next: 'Xem hồ sơ', roles: [] }
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
  const [col, setCol] = useState('tiep_nhan'); // cột đang xem trên điện thoại

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
    const c = COLS.find((x) => x.key === o.status)!;
    const pend = appr.filter((a) => a.order_id === o.id && a.status === 'cho');
    const lastF2 = appr.filter((a) => a.order_id === o.id && a.doc_type === 'F2').at(-1);
    const myTurn = pend.some((a) => a.approver_id === me?.id) || (!!c && c.roles.some(can));
    const lateAppr = pend.some((a) => a.due_at && new Date(a.due_at) < new Date());
    const due = o.due_date ? new Date(o.due_date) : null;
    const days = due ? Math.round((due.getTime() - today.getTime()) / 864e5) : null;
    return { o, c, pend, myTurn, lateAppr, days, rejected: o.status === 'xndh' && lastF2?.status === 'tu_choi', a: agg[o.id] };
  }).filter((x) => x.c && (!mine || x.myTurn)), [orders, appr, agg, q, mine, me, can]); // eslint-disable-line

  const byCol = (k: string) => cards.filter((x) => x.o.status === k);

  return (
    <>
      <div className="page-head">
        <div><h1>Bảng Kanban</h1><p className="muted">Mỗi cột là một bước. Bấm thẻ để mở hồ sơ, hoặc nút vàng để làm bước tiếp.</p></div>
        <div className="row">
          <Link className="btn sm" to="/don"><Icon name="list" size={18} />Dạng danh sách</Link>
          {(can('kinh_doanh') || can('admin_cnc')) && <Link className="btn sm primary" to="/don/moi"><Icon name="plus" size={18} />Tạo đơn</Link>}
        </div>
      </div>
      <div className="row">
        <label className="search"><Icon name="search" size={18} /><input aria-label="Tìm mã đơn, dự án" placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="pill-toggle" aria-pressed={mine} onClick={() => setMine(!mine)}>{mine && <Icon name="check" size={16} />}Chỉ việc đến lượt tôi</button>
      </div>

      {/* Điện thoại: chọn một cột, không cuộn ngang cả trang */}
      <div className="kb-picker" role="tablist" aria-label="Chọn bước">
        {COLS.map((c) => (
          <button key={c.key} role="tab" aria-selected={col === c.key} className={col === c.key ? 'on' : ''} onClick={() => setCol(c.key)}>
            {c.title} <span className="kb-count">{byCol(c.key).length}</span>
          </button>))}
      </div>

      <div className="kb-board">
        {COLS.map((c, i) => {
          const list = byCol(c.key);
          const firstOfGroup = i === 0 || COLS[i - 1].group !== c.group;
          return (
            <section key={c.key} className={'kb-col' + (col === c.key ? ' show' : '')} aria-label={c.title}>
              <header className="kb-head">
                <span className="kb-group" style={{ visibility: firstOfGroup ? 'visible' : 'hidden' }}>{c.group}</span>
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
                      {o.status === 'san_xuat' && <><span className="chip wait">NVL: dự toán</span><span className="chip wait">GC: lập LGC</span></>}
                    </div>
                    {myTurn && <Link className="btn sm primary kb-next" to={'/don/' + o.id + '?tab=' + c.tab}>{c.next} →</Link>}
                  </article>))}
              </div>
            </section>);
        })}
      </div>
    </>
  );
}
