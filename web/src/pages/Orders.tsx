import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, type Customer, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, ORDER_STATUS, date } from '../lib/format';
import { Chip, Empty, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { procSummary, type Batch, type Doc, type Proc } from '../lib/proc';

export default function Orders() {
  const { can } = useAuth(); const nav = useNavigate();
  const [rows, setRows] = useState<Order[] | null>(null); const [cust, setCust] = useState<Record<string, Customer>>({});
  const [q, setQ] = useState(''); const [done, setDone] = useState(false);
  const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<Doc[]>([]);
  useEffect(() => {
    sb.from('orders').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data as Order[]) ?? []));
    sb.from('batches').select('*').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs').select('id, batch_id, company, status, status_at').then(({ data }) => setDs((data as Doc[]) ?? []));
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
  }, []);
  const list = useMemo(() => (rows ?? []).filter((o) => (done ? true : !['hoan_tat', 'huy'].includes(o.status)) &&
    (o.code + ' ' + o.project).toLowerCase().includes(q.toLowerCase())), [rows, q, done]);
  return (
    <>
      <div className="page-head">
        <div><h1>Danh sách đơn</h1><p className="muted">Mỗi đơn gom hồ sơ 4 quy trình theo mã đơn / dự án.</p></div>
        <div className="row"><Link className="btn sm hide-m" to="/bang" ><Icon name="kanban" size={18} />Dạng Kanban</Link>
        {(can('kinh_doanh') || can('admin_cnc')) && <Link className="btn primary fab-m" to="/don/moi"><Icon name="plus" size={18} />Tạo đơn mới</Link>}</div>
      </div>
      <div className="row">
        <label className="search"><Icon name="search" size={18} /><input aria-label="Tìm mã đơn, dự án" placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="pill-toggle" aria-pressed={done} onClick={() => setDone(!done)}>{done && <Icon name="check" size={16} />}Gồm đơn đã xong / huỷ</button>
      </div>
      <div className="card flush scroll">
        <table className="tbl tbl-cards">
          <thead><tr><th>Mã đơn</th><th>Khách / dự án</th><th>Ngày giao</th><th>QT0 Bóc tách</th><th>QT1 XNĐH</th><th>QT2 Lệnh GC</th><th>QT3 Giao hàng</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan={7}><Skeleton rows={4} h={40} /></td></tr>}
            {rows && list.length === 0 && <tr><td colSpan={7}><Empty title={q ? 'Không có đơn khớp “' + q + '”' : 'Chưa có đơn'} /></td></tr>}
            {list.map((o) => (
              <tr key={o.id} className="click" onClick={() => nav('/don/' + o.id)}>
                <td data-l="Mã đơn" className="nw"><Link to={'/don/' + o.id} onClick={(e) => e.stopPropagation()}><b>{o.code}</b></Link></td>
                <td data-l="Khách">{[cust[o.kh1_id ?? '']?.name, cust[o.kh2_id ?? '']?.name].filter(Boolean).join(' → ')}<div className="small muted">{o.project}</div></td>
                <td data-l="Ngày giao">{date(o.due_date)}</td>
                {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => { const x = procSummary(p, bs.filter((b) => b.order_id === o.id), ds); return <td key={p} data-l={p}><span className={'chip ' + x.cls}>{x.t}</span></td>; })}
              </tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
