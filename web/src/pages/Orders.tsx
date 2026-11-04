import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, type Customer, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { BRANCH, ORDER_STATUS, date } from '../lib/format';
import { Chip, Empty, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { procSummary, stepOf, ROLE_OF, ROLE_NAME, type Batch, type Doc, type Proc } from '../lib/proc';

export default function Orders() {
  const { can } = useAuth(); const nav = useNavigate();
  const [rows, setRows] = useState<Order[] | null>(null); const [cust, setCust] = useState<Record<string, Customer>>({});
  const [q, setQ] = useState(''); const [done, setDone] = useState(false);
  const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<Doc[]>([]);
  const [cp, setCp] = useState<{ proc: string; company: string; role: string; user_id: string | null; group_id: string | null }[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    sb.from('orders').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data as Order[]) ?? []));
    sb.from('batches').select('*').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs').select('id, batch_id, company, status, status_at').then(({ data }) => setDs((data as Doc[]) ?? []));
    sb.from('chain_people').select('proc, company, role, user_id, group_id').then(({ data }) => setCp((data as never[]) ?? []));
    Promise.all([sb.from('profiles').select('id, full_name'), sb.from('work_groups').select('id, name')]).then(([a, b]) =>
      setNames(Object.fromEntries([...((a.data as { id: string; full_name: string }[]) ?? []).map((x) => [x.id, x.full_name]), ...((b.data as { id: string; name: string }[]) ?? []).map((x) => [x.id, x.name])])));
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
  }, []);
  const list = useMemo(() => (rows ?? []).filter((o) => (done ? true : !['hoan_tat', 'huy'].includes(o.status)) &&
    (o.code + ' ' + o.project).toLowerCase().includes(q.toLowerCase())), [rows, q, done]);
  /** Ai đang giữ việc: bước đang mở của từng QT → người/nhóm phụ trách trong chain_people */
  const waiting = (oid: string) => {
    const out: { who: string; what: string; since?: string }[] = [];
    for (const b of bs.filter((x) => x.order_id === oid && (x.status === 'dang_lam' || x.status === 'cho_ky'))) {
      const st = stepOf(b, ds);
      const company = st.key === 'ky' ? 'PN' : st.company ?? 'PN';
      const role = st.key === 'ky' ? 'hoan_tat' : ROLE_OF[st.doc?.status ?? ''];
      if (!role) continue;
      const r = cp.find((c) => c.proc === b.proc && c.company === company && c.role === role);
      const who = r ? names[r.user_id ?? r.group_id ?? ''] ?? '?' : 'Chưa giao người';
      out.push({ who, what: b.proc + ' · ' + ROLE_NAME[role], since: st.doc?.status_at });
    }
    return out;
  };
  const dueInfo = (o: Order) => {
    if (o.status === 'hoan_tat') return { cls: 'st-done', tag: <span className="chip done"><Icon name="check" size={14} />Hoàn tất</span> };
    if (o.status === 'huy') return { cls: 'st-off', tag: <span className="chip idle">Đã huỷ</span> };
    if (!o.due_date) return { cls: '', tag: null };
    const d = Math.ceil((new Date(o.due_date + 'T23:59:59').getTime() - Date.now()) / 864e5);
    if (d < 0) return { cls: 'st-late', tag: <span className="chip bad"><Icon name="alert" size={14} />Quá hạn {-d} ngày</span> };
    if (d <= 3) return { cls: 'st-soon', tag: <span className="chip warn"><Icon name="clock" size={14} />{d === 0 ? 'Hạn hôm nay' : 'Còn ' + d + ' ngày'}</span> };
    return { cls: '', tag: null };
  };
  const allDone = (oid: string) => { const l = bs.filter((b) => b.order_id === oid); return l.length > 0 && l.some((b) => b.proc === 'QT3' && b.status === 'hoan_tat') && !l.some((b) => b.status === 'dang_lam' || b.status === 'cho_ky'); };
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
          <thead><tr><th>Mã đơn</th><th>Khách / dự án</th><th>Ngày giao</th><th>Đang chờ</th><th>QT0 Bóc tách</th><th>QT1 XNĐH</th><th>QT2 Lệnh GC</th><th>QT3 Giao hàng</th></tr></thead>
          <tbody>
            {!rows && <tr><td colSpan={8}><Skeleton rows={4} h={40} /></td></tr>}
            {rows && list.length === 0 && <tr><td colSpan={8}><Empty title={q ? 'Không có đơn khớp “' + q + '”' : 'Chưa có đơn'} /></td></tr>}
            {list.map((o) => { const di = allDone(o.id) && o.status !== 'huy' ? { cls: 'st-done', tag: <span className="chip done"><Icon name="check" size={14} />Hoàn tất</span> } : dueInfo(o); const w = waiting(o.id); return (
              <tr key={o.id} className={'click ' + di.cls} onClick={() => nav('/don/' + o.id)}>
                <td data-l="Mã đơn" className="nw"><Link to={'/don/' + o.id} onClick={(e) => e.stopPropagation()}><b>{o.code}</b></Link></td>
                <td data-l="Khách">{[cust[o.kh1_id ?? '']?.name, cust[o.kh2_id ?? '']?.name].filter(Boolean).join(' → ')}<div className="small muted">{o.project}</div></td>
                <td data-l="Ngày giao"><span className="due-cell">{date(o.due_date)}{di.tag}</span></td>
                <td data-l="Đang chờ">{w.length ? <span className="wait-list">{w.map((x, i) => <span key={i} className="wait-who"><span className="avatar xs">{x.who.split(' ').filter(Boolean).slice(-1)[0]?.[0]?.toUpperCase()}</span><span><b>{x.who}</b><span className="small muted">{x.what}{x.since ? ' · từ ' + date(x.since) : ''}</span></span></span>)}</span> : <span className="muted">—</span>}</td>
                {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((p) => { const x = procSummary(p, bs.filter((b) => b.order_id === o.id), ds); return <td key={p} data-l={p}><span className={'chip ' + x.cls}>{x.t}</span></td>; })}
              </tr>); })}
          </tbody>
        </table>
      </div>
    </>
  );
}
