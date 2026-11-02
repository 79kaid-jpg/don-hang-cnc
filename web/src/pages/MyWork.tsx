import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DOC, ORDER_STATUS, dt } from '../lib/format';
import { Chip } from '../components/ui';

/** Việc đến lượt mỗi vai trò, theo trạng thái đơn */
const TODO: Record<string, { roles: string[]; text: string }> = {
  tiep_nhan: { roles: ['kinh_doanh', 'ky_thuat'], text: 'Bắt đầu bóc tách F1' },
  boc_tach: { roles: ['ky_thuat', 'kinh_doanh'], text: 'Lập F1 rồi gửi kiểm tra' },
  kiem_tra_f1: { roles: ['kiem_tra_f1'], text: 'Kiểm tra F1 (ĐK1)' },
  xndh: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Nhập đơn giá, gửi duyệt XNĐH' },
  cho_khach: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Ghi xác nhận KH1 → KH2, tải PDF ký' }
};

export default function MyWork() {
  const { me, can } = useAuth();
  const [appr, setAppr] = useState<(Approval & { orders: Pick<Order, 'code' | 'project'> })[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    if (!me) return;
    sb.from('approvals').select('*, orders(code, project)').eq('approver_id', me.id).eq('status', 'cho').order('due_at')
      .then(({ data }) => setAppr((data as never) ?? []));
    sb.from('orders').select('*').in('status', Object.keys(TODO)).order('due_date', { nullsFirst: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [me]);
  const mine = orders.filter((o) => TODO[o.status].roles.some(can));
  const late = (d: string | null) => !!d && new Date(d) < new Date();
  return (
    <>
      <div><h1>Việc của tôi</h1><p className="muted" style={{ margin: '4px 0 0' }}>Sắp theo hạn. Bấm để mở hồ sơ đơn.</p></div>
      <section className="card flush">
        <div className="row between" style={{ padding: '12px 16px', background: 'var(--soft)' }}><h2>Chờ tôi duyệt</h2><span className="chip wait">{appr.length} phiếu</span></div>
        <div className="scroll"><table className="tbl"><tbody>
          {appr.length === 0 && <tr><td className="muted">Không có phiếu chờ duyệt.</td></tr>}
          {appr.map((a) => (
            <tr key={a.id}>
              <td><span className="chip idle">{DOC[a.doc_type] ?? a.doc_type}</span></td>
              <td><Link to={'/don/' + a.order_id + '?tab=' + a.doc_type}><b>{a.orders?.code}</b></Link><div className="small muted">{a.orders?.project} · cấp {a.step_no} · {a.label}</div></td>
              <td className="n"><span style={{ color: late(a.due_at) ? 'var(--red)' : undefined, fontWeight: late(a.due_at) ? 600 : 400 }}>hạn {dt(a.due_at)}</span></td>
            </tr>))}
        </tbody></table></div>
      </section>
      <section className="card flush">
        <div style={{ padding: '12px 16px', background: 'var(--soft)' }}><h2>Đến lượt tôi làm</h2></div>
        <div className="scroll"><table className="tbl"><tbody>
          {mine.length === 0 && <tr><td className="muted">Không có việc.</td></tr>}
          {mine.map((o) => (
            <tr key={o.id}>
              <td><Chip s={o.status} text={ORDER_STATUS[o.status]} /></td>
              <td><Link to={'/don/' + o.id}><b>{o.code}</b></Link><div className="small muted">{o.project}</div></td>
              <td>{TODO[o.status].text}</td>
            </tr>))}
        </tbody></table></div>
      </section>
    </>
  );
}
