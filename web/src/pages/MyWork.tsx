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
import { COMPANY, FINAL, STATUS, type Batch, type Company, type Doc, type Proc } from '../lib/proc';
import { isStuck } from '../lib/holders';
import { PerfCard } from '../components/Perf';

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
  const [st, setSt] = useState<{ run: number; late: number; stuck: number } | null>(null);
  const [mine, setMine] = useState<{ id: string; order_id: string; proc: Proc; code: string; title: string; action: string; at: string }[]>([]);
  useEffect(() => { if (!me) return;
    Promise.all([sb.from('orders').select('id, code, due_date, status'), sb.from('batches').select('id, order_id, proc, title, status'), sb.from('docs_v').select('id, batch_id, status_at, signs')]).then(([o, b, d]) => {
      const os = (o.data ?? []) as Pick<Order, 'id' | 'code' | 'due_date' | 'status'>[]; const bs = (b.data ?? []) as Batch[]; const ds = (d.data ?? []) as Doc[];
      const live = bs.filter((x) => x.status === 'dang_lam' || x.status === 'cho_ky');
      const last = (id: string) => ds.filter((x) => x.batch_id === id).map((x) => x.status_at).sort().pop();
      const today = new Date().toISOString().slice(0, 10);
      setSt({ run: live.length, stuck: live.filter((x) => isStuck(last(x.id))).length,
        late: os.filter((x) => x.due_date && x.due_date < today && !['hoan_tat', 'huy'].includes(x.status) && bs.some((y) => y.order_id === x.id && (y.status === 'dang_lam' || y.status === 'cho_ky'))).length });
      const sg = ds.flatMap((x) => (x.signs ?? []).filter((g) => g.user === me.id).map((g) => ({ x, g }))).sort((a, z) => z.g.at.localeCompare(a.g.at)).filter((v, i, arr) => arr.findIndex((w) => w.x.batch_id === v.x.batch_id) === i).slice(0, 8);
      setMine(sg.map(({ x, g }) => { const bb = bs.find((y) => y.id === x.batch_id); const oo = os.find((y) => y.id === bb?.order_id);
        return { id: x.id + g.at, order_id: bb?.order_id ?? '', proc: (bb?.proc ?? 'QT0') as Proc, code: oo?.code ?? '', title: bb?.title ?? '', action: g.action, at: g.at }; }));
    }); }, [me]);
  useEffect(() => { if (me) sb.rpc('my_docs').then(({ data }) => setRows((data as M[]) ?? [])); }, [me]);
  const h = new Date().getHours(); const hello = h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const ago = (t: string) => { const m = (Date.now() - new Date(t).getTime()) / 6e4; return m < 60 ? Math.max(1, Math.round(m)) + ' phút' : m < 1440 ? Math.round(m / 60) + ' giờ' : Math.round(m / 1440) + ' ngày'; };
  const shown = (rows ?? []).filter((r) => !fq || r.proc === fq);
  const age = (s: string) => { const hh = (Date.now() - new Date(s).getTime()) / 36e5; return hh < 1 ? Math.max(1, Math.round(hh * 60)) + ' phút' : hh < 48 ? Math.round(hh) + ' giờ' : Math.round(hh / 24) + ' ngày'; };
  return (
    <>
      <div className="mw-hello"><h1>{hello}, {me?.full_name}</h1>
        <span className={'mw-count' + (rows?.length ? ' on' : '')}>{rows ? (rows.length ? rows.length + ' việc đến lượt bạn' : 'Không có việc chờ bạn') : 'Đang tải…'}</span></div>
      {st && <div className="mw-kpi">
        <Link to="/so-do?qt=TQ"><i className="ov-ic run"><Icon name="run" size={16} /></i><b>{st.run}</b><span>Đang chạy</span></Link>
        <Link to="/so-do?qt=TQ" className={st.stuck ? 'bad' : ''}><i className={'ov-ic ' + (st.stuck ? 'stuck' : 'ok')}><Icon name={st.stuck ? 'hourglass' : 'check'} size={16} /></i><b>{st.stuck}</b><span>Kẹt ≥ 2 ngày</span></Link>
        <Link to="/don" className={st.late ? 'bad' : ''}><i className={'ov-ic ' + (st.late ? 'stuck' : 'ok')}><Icon name="alert" size={16} /></i><b>{st.late}</b><span>Quá hạn giao</span></Link>
      </div>}
      <InstallHint />
      <ZaloLink compact />
      <section className="card flush" aria-labelledby="h-todo">
        <div className="card-head"><h2 id="h-todo">Đến lượt tôi làm</h2>{rows && <span className="chip idle">{rows.length} việc</span>}</div>
        {rows && rows.length > 0 && <div className="qt-filter" role="group" aria-label="Lọc theo quy trình">
          <button className={fq === '' ? 'on' : ''} aria-pressed={fq === ''} onClick={() => setFq('')}>Tất cả <b>{rows.length}</b></button>
          {(['QT0', 'QT1', 'QT2', 'QT3'] as Proc[]).map((q) => { const n = rows.filter((r) => r.proc === q).length; return n > 0 &&
            <button key={q} className={'qf ' + q.toLowerCase() + (fq === q ? ' on' : '')} aria-pressed={fq === q} onClick={() => setFq(fq === q ? '' : q)}>{q} <b>{n}</b></button>; })}
        </div>}
        <div>
          {!rows ? <Skeleton rows={3} /> : rows.length === 0 ? <div className="mw-empty"><span className="mw-empty-ic"><Icon name="check" size={18} /></span><span><b>Đã xong hết việc</b><span className="small muted">Không có hồ sơ nào đang chờ bạn.</span></span><Link className="btn sm" to="/bang">Kanban</Link></div> : (
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
      {mine.length > 0 && <details className="card flush mw-done">
        <summary className="card-head"><h2>Đã xử lý gần đây <span className="chip idle">{mine.length}</span></h2></summary>
        <ul className="worklist">{mine.map((r) => (
          <li key={r.id}><Link to={'/don/' + r.order_id + '?tab=' + r.proc} className="mw-rec">
            <QtTag qt={r.proc} /><span className="mw-rec-t"><b>{r.code}</b><span className="muted"> · {r.title}</span></span>
            <span className={'mw-act a-' + r.action}>{({ ky: 'Đã ký', tra_ve: 'Trả về', fail: 'Từ chối' } as Record<string, string>)[r.action] ?? r.action}</span>
            <span className="mw-time">{ago(r.at)}</span></Link></li>))}</ul>
        <div style={{ padding: '8px 16px 12px' }}><Link className="small" to="/thong-ke">Thống kê →</Link></div>
      </details>}
      <PerfCard />
    </>
  );
}
