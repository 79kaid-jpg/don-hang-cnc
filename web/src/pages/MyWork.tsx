import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DOC, ORDER_STATUS, dt } from '../lib/format';
import { Chip, Empty, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';

/** Việc đến lượt mỗi vai trò, theo trạng thái đơn */
export const TODO: Record<string, { roles: string[]; text: string; tab: string }> = {
  tiep_nhan: { roles: ['kinh_doanh', 'ky_thuat'], text: 'Bắt đầu bóc tách F1', tab: 'F1' },
  boc_tach: { roles: ['ky_thuat', 'kinh_doanh'], text: 'Lập F1 rồi gửi kiểm tra', tab: 'F1' },
  kiem_tra_f1: { roles: ['kiem_tra_f1'], text: 'Kiểm tra F1 (ĐK1)', tab: 'F1' },
  xndh: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Nhập đơn giá, gửi duyệt XNĐH', tab: 'F2' },
  cho_khach: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Ghi xác nhận KH1 → KH2, tải PDF ký', tab: 'F2' }
};

type A = Approval & { orders: Pick<Order, 'code' | 'project'> };

export default function MyWork() {
  const { me, can } = useAuth();
  const [appr, setAppr] = useState<A[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    if (!me) return;
    sb.from('approvals').select('*, orders(code, project)').eq('approver_id', me.id).eq('status', 'cho').order('due_at')
      .then(({ data }) => setAppr((data as never) ?? []));
    sb.from('orders').select('*').in('status', Object.keys(TODO)).order('due_date', { nullsFirst: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [me]);
  const mine = (orders ?? []).filter((o) => TODO[o.status].roles.some(can));
  const late = (d: string | null) => !!d && new Date(d) < new Date();
  const hello = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return (
    <>
      <div className="page-head"><div><h1>{hello}, {me?.full_name}</h1>
        <p className="muted">{appr && orders ? `${appr.length} phiếu chờ duyệt · ${mine.length} việc đến lượt` : 'Đang tải việc của bạn…'}</p></div></div>

      <section className="card flush" aria-labelledby="h-appr">
        <div className="card-head"><h2 id="h-appr">Chờ tôi duyệt</h2>{appr && <span className="chip wait">{appr.length} phiếu</span>}</div>
        <div style={{ padding: appr && appr.length ? 0 : 12 }}>
          {!appr ? <Skeleton rows={2} /> : appr.length === 0 ? <Empty title="Không có phiếu chờ duyệt" /> : (
            <ul className="worklist">
              {appr.map((a) => (
                <li key={a.id}><Link to={'/don/' + a.order_id + '?tab=' + a.doc_type} className="work">
                  <span className="chip idle">{DOC[a.doc_type] ?? a.doc_type}</span>
                  <span className="work-main"><b>{a.orders?.code}</b><span className="small muted">{a.orders?.project} · cấp {a.step_no} · {a.label}</span></span>
                  <span className={late(a.due_at) ? 'kb-late small' : 'small muted'}>{late(a.due_at) && <Icon name="alert" size={14} />}{late(a.due_at) ? 'Quá hạn · ' : 'Hạn '}{dt(a.due_at)}</span>
                  <Icon name="arrow" size={18} />
                </Link></li>))}
            </ul>)}
        </div>
      </section>

      <section className="card flush" aria-labelledby="h-todo">
        <div className="card-head"><h2 id="h-todo">Đến lượt tôi làm</h2>{orders && <span className="chip idle">{mine.length} việc</span>}</div>
        <div style={{ padding: orders && mine.length ? 0 : 12 }}>
          {!orders ? <Skeleton rows={3} /> : mine.length === 0 ? <Empty title="Không có việc nào đến lượt bạn"><Link to="/bang">Xem bảng Kanban</Link></Empty> : (
            <ul className="worklist">
              {mine.map((o) => (
                <li key={o.id}><Link to={'/don/' + o.id + '?tab=' + TODO[o.status].tab} className="work">
                  <Chip s={o.status} text={ORDER_STATUS[o.status]} />
                  <span className="work-main"><b>{o.code}</b><span className="small muted">{o.project}</span></span>
                  <span className="small">{TODO[o.status].text}</span>
                  <Icon name="arrow" size={18} />
                </Link></li>))}
            </ul>)}
        </div>
      </section>
    </>
  );
}
