import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, type Approval, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { DOC, ORDER_STATUS, dt } from '../lib/format';
import { Chip, Empty, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { InstallHint } from './Install';
import { ZaloLink } from '../components/ZaloLink';
import { QtTag, qtOfDoc, qtOfTab } from '../components/QtTag';
import { StepInbox } from '../components/StepPeople';

/** Việc đến lượt mỗi vai trò, theo trạng thái đơn */
export const TODO: Record<string, { roles: string[]; text: string; tab: string }> = {
  tiep_nhan: { roles: ['kinh_doanh', 'ky_thuat'], text: 'Bắt đầu bóc tách F1', tab: 'F1' },
  boc_tach: { roles: ['ky_thuat', 'kinh_doanh'], text: 'Lập F1 rồi gửi kiểm tra', tab: 'F1' },
  kiem_tra_f1: { roles: ['kiem_tra_f1'], text: 'Kiểm tra F1 (ĐK1)', tab: 'F1' },
  xndh: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Nhập đơn giá, gửi duyệt XNĐH', tab: 'F2' },
  cho_khach: { roles: ['admin_cnc', 'kinh_doanh'], text: 'Ghi xác nhận KH1 → KH2, tải PDF ký', tab: 'F2' }
};
/** Việc của nhánh QT2 / QT3 khi đơn đang sản xuất */
export const BRANCH_TODO: Record<string, { roles: string[]; text: string; tab: string }> = {
  lap_lgc: { roles: ['admin_cnc', 'ke_hoach'], text: 'B1 Lập LGC + dự toán NVL, gửi duyệt', tab: 'QT2' },
  mua_hang: { roles: ['mua_hang'], text: 'B3 Lập PO, gửi duyệt', tab: 'QT2' },
  nhap_kho: { roles: ['kho_qc'], text: 'B4 Nhập kho & QC NVL (F4)', tab: 'QT2' },
  ban_giao: { roles: ['admin_cnc'], text: 'B5 Bàn giao NVL (F6)', tab: 'QT2' },
  gia_cong: { roles: ['kho_qc', 'admin_cnc'], text: 'B6 QC thành phẩm (ĐK4)', tab: 'QT2' },
  thong_bao: { roles: ['admin_cnc'], text: 'QT3 Lập packing list F8, thông báo giao', tab: 'GH' },
  lap_lgh: { roles: ['admin_cnc'], text: 'QT3 Lập lệnh giao hàng F9, gửi duyệt', tab: 'GH' },
  giao_hang: { roles: ['kho_qc', 'admin_cnc'], text: 'QT3 Giao hàng, tải ảnh', tab: 'GH' },
  ky_bbgh: { roles: ['kho_qc', 'admin_cnc'], text: 'QT3 Tải BBGH ký, hoàn tất đơn', tab: 'GH' }
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
    sb.from('orders').select('*').in('status', [...Object.keys(TODO), 'san_xuat', 'giao_hang']).order('due_date', { nullsFirst: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [me]);
  type W = { o: Order; text: string; tab: string; key: string };
  const mine: W[] = [];
  for (const o of orders ?? []) {
    if (TODO[o.status]?.roles.some(can)) mine.push({ o, ...TODO[o.status], key: o.id });
    for (const b of o.status === 'giao_hang' ? [o.gh_status] : [o.nvl_status, o.gc_status]) if (['san_xuat', 'giao_hang'].includes(o.status) && BRANCH_TODO[b]?.roles.some(can)) mine.push({ o, ...BRANCH_TODO[b], key: o.id + b });
  }
  const [fq, setFq] = useState('');
  const shown = mine.filter((w) => !fq || qtOfTab(w.tab) === fq);
  const late = (d: string | null) => !!d && new Date(d) < new Date();
  const hello = new Date().getHours() < 12 ? 'Chào buổi sáng' : new Date().getHours() < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  return (
    <>
      <div className="page-head"><div><h1>{hello}, {me?.full_name}</h1>
        <p className="muted">{appr && orders ? `${appr.length} phiếu chờ duyệt · ${mine.length} việc đến lượt` : 'Đang tải việc của bạn…'}</p></div></div>

      <InstallHint />
      <ZaloLink compact />
      <StepInbox />
      <section className="card flush" aria-labelledby="h-appr">
        <div className="card-head"><h2 id="h-appr">Chờ tôi duyệt</h2>{appr && <span className="chip wait">{appr.length} phiếu</span>}</div>
        <div style={{ padding: appr && appr.length ? 0 : 12 }}>
          {!appr ? <Skeleton rows={2} /> : appr.length === 0 ? <Empty title="Không có phiếu chờ duyệt" /> : (
            <ul className="worklist">
              {appr.map((a) => (
                <li key={a.id}><Link to={'/don/' + a.order_id + '?tab=' + a.doc_type} className={'work qtl ' + qtOfDoc(a.doc_type).toLowerCase()}>
                  <QtTag qt={qtOfDoc(a.doc_type)} /><span className="chip idle">{DOC[a.doc_type] ?? a.doc_type}</span>
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
          {orders && mine.length > 0 && <div className="qt-filter" role="group" aria-label="Lọc theo quy trình">
            <button className={fq === '' ? 'on' : ''} aria-pressed={fq === ''} onClick={() => setFq('')}>Tất cả <b>{mine.length}</b></button>
            {['QT0', 'QT1', 'QT2', 'QT3'].map((q) => { const n = mine.filter((w) => qtOfTab(w.tab) === q).length; return n > 0 &&
              <button key={q} className={'qf ' + q.toLowerCase() + (fq === q ? ' on' : '')} aria-pressed={fq === q} onClick={() => setFq(fq === q ? '' : q)}>{q} <b>{n}</b></button>; })}
          </div>}
          {!orders ? <Skeleton rows={3} /> : mine.length === 0 ? <Empty title="Không có việc nào đến lượt bạn"><Link to="/bang">Xem bảng Kanban</Link></Empty> : (
            <ul className="worklist">
              {shown.map(({ o, text, tab, key }) => (
                <li key={key}><Link to={'/don/' + o.id + '?tab=' + tab} className={'work qtl ' + qtOfTab(tab).toLowerCase()}>
                  <QtTag qt={qtOfTab(tab)} />
                  <span className="work-main"><b>{o.code}</b><span className="small muted">{o.project}</span></span>
                  <span className="small">{text}</span>
                  <Icon name="arrow" size={18} />
                </Link></li>))}
            </ul>)}
        </div>
      </section>
    </>
  );
}
