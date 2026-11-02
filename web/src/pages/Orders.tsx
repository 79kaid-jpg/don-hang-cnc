import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, type Customer, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, ORDER_STATUS, date } from '../lib/format';
import { Chip } from '../components/ui';

export default function Orders() {
  const { can } = useAuth(); const nav = useNavigate();
  const [rows, setRows] = useState<Order[]>([]); const [cust, setCust] = useState<Record<string, Customer>>({});
  const [q, setQ] = useState(''); const [done, setDone] = useState(false);
  useEffect(() => {
    sb.from('orders').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data as Order[]) ?? []));
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
  }, []);
  const list = useMemo(() => rows.filter((o) => (done ? true : !['hoan_tat', 'huy'].includes(o.status)) &&
    (o.code + ' ' + o.project).toLowerCase().includes(q.toLowerCase())), [rows, q, done]);
  return (
    <>
      <div className="row between">
        <div><h1>Đơn hàng</h1><p className="muted" style={{ margin: '4px 0 0' }}>Mỗi đơn là một hồ sơ từ tiếp nhận đến giao hàng.</p></div>
        {(can('kinh_doanh') || can('admin_cnc')) && <Link className="btn primary" to="/don/moi" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>+ Tạo đơn mới</Link>}
      </div>
      <div className="row">
        <input aria-label="Tìm" placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: '1 1 260px', maxWidth: 420 }} />
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} style={{ minHeight: 0 }} /> Gồm đơn đã xong / huỷ</label>
      </div>
      <div className="card flush scroll">
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead><tr><th>Mã đơn</th><th>Khách / dự án</th><th>Ngày giao</th><th>Trạng thái</th><th>NVL</th><th>Gia công</th><th>Giao hàng</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="muted">Chưa có đơn.</td></tr>}
            {list.map((o) => (
              <tr key={o.id} className="click" onClick={() => nav('/don/' + o.id)}>
                <td><Link to={'/don/' + o.id} onClick={(e) => e.stopPropagation()}><b>{o.code}</b></Link></td>
                <td>{[cust[o.kh1_id ?? '']?.name, cust[o.kh2_id ?? '']?.name].filter(Boolean).join(' → ')}<div className="small muted">{o.project}</div></td>
                <td>{date(o.due_date)}</td>
                <td><Chip s={o.status} text={ORDER_STATUS[o.status]} /></td>
                <td><Chip s={o.nvl_status} text={BRANCH[o.nvl_status] ?? o.nvl_status} /></td>
                <td><Chip s={o.gc_status} text={BRANCH[o.gc_status] ?? o.gc_status} /></td>
                <td><Chip s={o.gh_status} text={BRANCH[o.gh_status] ?? o.gh_status} /></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
