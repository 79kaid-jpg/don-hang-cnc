import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sb, type Order } from '../lib/supabase';
import { COMPANIES, COMPANY, FINAL, FLOW, PROC_NAME, STATUS, stepOf, type Batch, type Doc, type Proc } from '../lib/proc';
import { Icon } from '../components/Icon';
import { QtTag } from '../components/QtTag';

/** Sơ đồ swimlane: 4 quy trình chạy riêng. QT0 một làn (Phương Nam). QT1–QT3 ba làn PN → IPC → Hanwha rồi ký tay.
 *  Mỗi ô ghi số hồ sơ đang ở bước đó; chọn một đơn để thấy đơn đó đang ở đâu. Bấm ô để xem danh sách. */
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export default function FlowMap() {
  const [sp, setSp] = useSearchParams(); const one = sp.get('don') ?? '';
  const [orders, setOrders] = useState<Order[]>([]); const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<Doc[]>([]);
  const [q, setQ] = useState(''); const [sel, setSel] = useState('');
  useEffect(() => {
    sb.from('orders').select('*').neq('status', 'huy').order('created_at', { ascending: false }).then(({ data }) => setOrders((data as Order[]) ?? []));
    sb.from('batches').select('*').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs').select('id, batch_id, company, status, status_at').then(({ data }) => setDs((data as Doc[]) ?? []));
  }, []);
  const O = orders.find((o) => o.id === one);
  const live = bs.filter((b) => (b.status === 'dang_lam' || b.status === 'cho_ky') && (!one || b.order_id === one));
  const at = useMemo(() => { const m: Record<string, Batch[]> = {};
    for (const b of live) { const s = stepOf(b, ds); const k = b.proc + ':' + s.key; (m[k] ??= []).push(b); } return m; }, [live, ds]);
  const passed = (p: Proc, key: string) => { // chế độ một đơn: bước đã qua
    if (!one) return false; const list = bs.filter((b) => b.order_id === one && b.proc === p); if (!list.length) return false;
    if (list.some((b) => b.status === 'hoan_tat')) return true;
    const b = list[list.length - 1]; const s = stepOf(b, ds); const cols = colKeys(p); return cols.indexOf(key) < cols.indexOf(s.key);
  };
  const hits = q.trim() ? orders.filter((o) => norm(o.code + ' ' + o.project).includes(norm(q.trim()))).slice(0, 8) : [];
  const Box = ({ p, k, t, sub }: { p: Proc; k: string; t: string; sub?: string }) => { const n = at[p + ':' + k]?.length ?? 0; const id = p + ':' + k;
    return <button className={'fm2-box' + (n ? ' has' : '') + (passed(p, k) ? ' done' : '') + (sel === id ? ' sel' : '') + (k === 'ky' ? ' final' : '')} onClick={() => setSel(sel === id ? '' : id)}>
      <b>{t}</b>{sub && <span className="small muted">{sub}</span>}{n > 0 && <span className="fm2-n">{one ? 'đang ở đây' : n}</span>}{passed(p, k) && <Icon name="check" size={14} />}</button>; };
  const selList = sel ? at[sel] ?? [] : [];
  return (
    <>
      <div className="page-head"><div><h1>Sơ đồ quy trình</h1><p className="muted">Bốn quy trình chạy riêng, hồ sơ gom theo mã đơn / dự án. Số trên mỗi ô là số hồ sơ đang ở bước đó.</p></div>
        <Link className="btn sm hide-m" to="/bang"><Icon name="kanban" size={18} />Bảng Kanban</Link></div>
      <div className="fm2-search">
        <label className="search" style={{ maxWidth: 'none' }}><Icon name="search" size={18} />
          <input placeholder={O ? O.code + ' · ' + O.project : 'Xem một đơn: gõ mã đơn hoặc dự án (không dấu cũng được)'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {O && <button className="btn sm" onClick={() => { setSp({}); setSel(''); }}><Icon name="x" size={16} />Xem tất cả đơn</button>}
        {hits.length > 0 && <ul className="fm2-hits">{hits.map((o) => <li key={o.id}><button onClick={() => { setSp({ don: o.id }); setQ(''); setSel(''); }}><b>{o.code}</b> <span className="small muted">{o.project}</span></button></li>)}</ul>}
      </div>
      {O && <div className="msg info"><Icon name="eye" size={18} /><span>Đang xem <b>{O.code}</b> · {O.project}. Ô có dấu ✓ là bước đã qua. <Link to={'/don/' + O.id}>Mở đơn →</Link></span></div>}
      {PROCS.map((p) => (
        <section key={p} className={'card fm2 ' + p.toLowerCase()}>
          <h2 className="row" style={{ margin: 0 }}><QtTag qt={p} />{PROC_NAME[p]}</h2>
          {p === 'QT0' ? (
            <div className="fm2-lane"><span className="fm2-who">Phương Nam CNC</span>
              <div className="fm2-steps">{FLOW.QT0.map((s) => <Box key={s} p={p} k={s} t={STATUS[s]} />)}<span className="fm2-end">DS tấm đã ký → QT1 · hoặc Fail</span></div></div>
          ) : (<>
            {COMPANIES.map((c) => <div key={c} className="fm2-lane"><span className="fm2-who">{COMPANY[c]}</span>
              <div className="fm2-steps">{FLOW[p].map((s) => <Box key={s} p={p} k={c + '.' + s} t={STATUS[s]} />)}<span className="fm2-arrow small muted">{c === 'HW' ? '↓' : '↓ chép sang ' + (c === 'PN' ? 'IPC' : 'Hanwha')}</span></div></div>)}
            <div className="fm2-lane"><span className="fm2-who">Ngoài BASE</span><div className="fm2-steps"><Box p={p} k="ky" t={FINAL[p]} sub="ký tay, tải bản ký" />
              {p === 'QT3' && <span className="fm2-end">↺ lặp lại mỗi đợt giao đến khi đủ lệnh</span>}{p === 'QT2' && <span className="fm2-end">Đầu vào: Excel lệnh gia công từ phần mềm SX · đủ 5 điều kiện mới lập</span>}</div></div>
          </>)}
          {sel.startsWith(p + ':') && <ul className="fm2-list">{selList.length === 0 ? <li className="muted">Không có hồ sơ ở bước này.</li> : selList.map((b) => { const o = orders.find((x) => x.id === b.order_id);
            return <li key={b.id}><Link to={'/don/' + b.order_id + '?tab=' + p}><b>{o?.code}</b> · {b.title} <span className="small muted">{o?.project}</span><Icon name="arrow" size={16} /></Link></li>; })}</ul>}
        </section>))}
    </>
  );
}
function colKeys(p: Proc) { return p === 'QT0' ? [...FLOW.QT0, 'hoan_tat'] : [...COMPANIES.flatMap((c) => FLOW[p].map((s) => c + '.' + s)), 'ky', 'hoan_tat']; }
