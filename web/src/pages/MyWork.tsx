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
import { COMPANY, FINAL, STATUS, type Company, type Proc } from '../lib/proc';

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

type M = { doc_id: string | null; batch_id: string; order_id: string; proc: Proc; company: Company; status: string; title: string; code: string; project: string; since: string; kind: string };
export default function MyWork() {
  const { me } = useAuth();
  const [rows, setRows] = useState<M[] | null>(null); const [fq, setFq] = useState('');
  useEffect(() => { if (me) sb.rpc('my_docs').then(({ data }) => setRows((data as M[]) ?? [])); }, [me]);
  const h = new Date().getHours(); const hello = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const shown = (rows ?? []).filter((r) => !fq || r.proc === fq);
  const age = (s: string) => { const hh = (Date.now() - new Date(s).getTime()) / 36e5; return hh < 1 ? Math.max(1, Math.round(hh * 60)) + ' phút' : hh < 48 ? Math.round(hh) + ' giờ' : Math.round(hh / 24) + ' ngày'; };
  return (
    <>
      <div className="page-head"><div><h1>{hello}, {me?.full_name}</h1>
        <p className="muted">{rows ? `${rows.length} việc đến lượt bạn` : 'Đang tải việc của bạn…'}</p></div></div>
      <InstallHint />
      <ZaloLink compact />
      <section className="card flush" aria-labelledby="h-todo">
        <div className="card-head"><h2 id="h-todo">Đến lượt tôi làm</h2>{rows && <span className="chip idle">{rows.length} việc</span>}</div>
        {rows && rows.length > 0 && <div className="qt-filter" role="group" aria-label="Lọc theo quy trình">
          <button className={fq === '' ? 'on' : ''} aria-pressed={fq === ''} onClick={() => setFq('')}>Tất cả <b>{rows.length}</b></button>
          {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((q) => { const n = rows.filter((r) => r.proc === q).length; return n > 0 &&
            <button key={q} className={'qf ' + q.toLowerCase() + (fq === q ? ' on' : '')} aria-pressed={fq === q} onClick={() => setFq(fq === q ? '' : q)}>{q} <b>{n}</b></button>; })}
        </div>}
        <div style={{ padding: rows && rows.length ? 0 : 12 }}>
          {!rows ? <Skeleton rows={3} /> : rows.length === 0 ? <Empty title="Không có việc nào đến lượt bạn"><Link to="/bang">Xem bảng Kanban</Link></Empty> : (
            <ul className="worklist">
              {shown.map((r) => (
                <li key={(r.doc_id ?? '') + r.batch_id}><Link to={'/don/' + r.order_id + '?tab=' + r.proc} className={'work qtl ' + r.proc.toLowerCase()}>
                  <QtTag qt={r.proc} />
                  <span className="work-main"><b>{r.code}</b><span className="small muted">{r.project} · {r.title}</span></span>
                  <span className="small">{r.kind === 'final' ? FINAL[r.proc] : (r.proc !== 'QT0' ? COMPANY[r.company] + ' · ' : '') + STATUS[r.status]}<span className="muted"> · {age(r.since)}</span></span>
                  <Icon name="arrow" size={18} />
                </Link></li>))}
            </ul>)}
        </div>
      </section>
    </>
  );
}
