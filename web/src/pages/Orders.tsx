import { LoginAs } from '../components/LoginAs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, type Customer, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useMyCo, useCoIdx } from '../lib/myco';
import { date } from '../lib/format';
import { Empty, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { procSummary, PROC_NAME, type Batch, type Doc, type Proc } from '../lib/proc';
import { useHolders, initialOf, waited, isStuck } from '../lib/holders';

const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3']; const PAGE = 30;

export default function Orders() {
  const { can } = useAuth(); const nav = useNavigate(); const { co: myCo } = useMyCo(); const CI = useCoIdx(); const adm = can('admin_it');
  const [rows, setRows] = useState<Order[] | null>(null); const [cust, setCust] = useState<Record<string, Customer>>({});
  const [q, setQ] = useState(''); const [qq, setQq] = useState(''); const [done, setDone] = useState(false); const [f, setF] = useState<'' | 'late' | 'soon' | 'stuck'>('');
  const [kq, setKq] = useState<'' | 'ok' | 'fail'>('');
  const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<Doc[]>([]);
  const [more, setMore] = useState(false); const [busy, setBusy] = useState(false); const [srv, setSrv] = useState({ late: 0, soon: 0 });
  const holder = useHolders(); const gen = useRef(0); const sent = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => setQq(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  // Tải theo trang (30 đơn) – lọc mã/dự án, quá hạn, sắp hạn, đơn đã xong ngay trên máy chủ
  const today = new Date().toISOString().slice(0, 10); const in3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const query = (head = false) => { let x = sb.from('orders').select('*', head ? { count: 'exact', head: true } : undefined);
    if (qq) { const ids = [...new Set(CI.match(qq))].slice(0, 100); x = x.or(`code.ilike.%${qq.replace(/[%,()]/g, ' ')}%,project.ilike.%${qq.replace(/[%,()]/g, ' ')}%` + (ids.length ? `,id.in.(${ids.join(',')})` : '')); }
    if (!done && !kq) x = x.not('status', 'in', '(hoan_tat,huy)');
    return x; };
  const load = async (reset: boolean) => {
    const g = reset ? ++gen.current : gen.current; setBusy(true);
    const from = reset ? 0 : rows?.length ?? 0;
    let x = query(); if (f === 'late') x = x.lt('due_date', today); if (f === 'soon') x = x.gte('due_date', today).lte('due_date', in3);
    const { data } = await x.order('created_at', { ascending: false }).range(from, from + PAGE - 1);
    const os = (data as Order[]) ?? []; const ids = os.map((o) => o.id);
    const [b, c] = await Promise.all([ids.length ? sb.from('batches').select('*').in('order_id', ids) : { data: [] },
      sb.from('customers').select('*').in('id', [...new Set(os.map((o) => o.customer_id ?? o.kh2_id ?? o.kh1_id).filter(Boolean))] as string[])]);
    const nb = (b.data as Batch[]) ?? []; const { data: d } = nb.length ? await sb.from('docs_v').select('id, batch_id, company, status, status_at').in('batch_id', nb.map((y) => y.id)) : { data: [] };
    if (g !== gen.current) return;
    setRows((r) => reset ? os : [...(r ?? []), ...os]); setBs((r) => reset ? nb : [...r, ...nb]); setDs((r) => reset ? (d as Doc[]) ?? [] : [...r, ...((d as Doc[]) ?? [])]);
    setCust((m) => ({ ...(reset ? {} : m), ...Object.fromEntries(((c.data as Customer[]) ?? []).map((y) => [y.id, y])) }));
    setMore(os.length === PAGE); setBusy(false);
  };
  useEffect(() => { setRows(null); load(true);
    Promise.all([query(true).lt('due_date', today), query(true).gte('due_date', today).lte('due_date', in3)]).then(([l, so]) => setSrv({ late: l.count ?? 0, soon: so.count ?? 0 }));
  }, [qq, done, kq, f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const el = sent.current; if (!el || !more) return; const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !busy) load(false); }, { rootMargin: '400px' }); io.observe(el); return () => io.disconnect(); }); // eslint-disable-line react-hooks/exhaustive-deps
  const info = (o: Order) => {
    const l = bs.filter((b) => b.order_id === o.id);
    const done = o.status === 'hoan_tat' || (l.some((b) => b.proc === 'QT3' && b.status === 'hoan_tat') && !l.some((b) => b.status === 'dang_lam' || b.status === 'cho_ky'));
    const hs = l.map((b) => holder(b, ds)).filter(Boolean) as NonNullable<ReturnType<typeof holder>>[];
    const stuck = hs.some((h) => isStuck(h.since));
    let due: { cls: string; t: string; ic: string } | null = null;
    if (o.status === 'huy') due = { cls: 'off', t: 'Đã huỷ', ic: 'x' };
    else if (done) due = { cls: 'done', t: 'Hoàn tất', ic: 'check' };
    else if (o.due_date) { const d = Math.ceil((new Date(o.due_date + 'T23:59:59').getTime() - Date.now()) / 864e5);
      if (d < 0) due = { cls: 'late', t: 'Quá hạn ' + -d + ' ngày', ic: 'alert' }; else if (d <= 3) due = { cls: 'soon', t: d === 0 ? 'Hạn hôm nay' : 'Còn ' + d + ' ngày', ic: 'clock' }; }
    const fail = l.some((b) => b.status === 'fail');
    return { l, done, fail, hs, stuck, due, steps: PROCS.map((p) => ({ p, ...procSummary(p, l, ds) })) };
  };
  const all = useMemo(() => (rows ?? []).map((o) => ({ o, ...info(o) })), [rows, bs, ds, holder]); // eslint-disable-line react-hooks/exhaustive-deps
  const base = all.filter((x) => (kq === 'ok' ? x.done : kq === 'fail' ? x.fail : true) && (done || kq ? true : !['hoan_tat', 'huy'].includes(x.o.status) && !x.done) );
  const cnt = { late: srv.late, soon: srv.soon, stuck: base.filter((x) => x.stuck).length };
  const list = base.filter((x) => !f || (f === 'stuck' ? x.stuck : x.due?.cls === f));
  return (
    <>
      <div className="page-head">
        <div><h1>Danh sách đơn</h1><p className="muted">Mỗi đơn gom hồ sơ 4 quy trình theo mã đơn / dự án.</p></div>
        <div className="row"><Link className="btn sm hide-m" to="/bang"><Icon name="kanban" size={18} />Dạng Kanban</Link>
          {(can('kinh_doanh') || can('admin_cnc')) && <Link className="btn primary fab-m" to="/don/moi" aria-label="Tạo đơn mới"><Icon name="plus" size={20} /><span className="fab-t">Tạo đơn mới</span></Link>}</div>
      </div>
      <div className="row">
        <label className="search"><Icon name="search" size={18} /><input aria-label="Tìm mã đơn, dự án" placeholder="Tìm mã đơn, dự án…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="adm-chips" role="group" aria-label="Lọc nhanh">
        {([['late', 'Quá hạn', 'alert'], ['soon', 'Sắp đến hạn', 'clock'], ['stuck', 'Kẹt ≥ 2 ngày', 'hourglass']] as const).map(([k, t, ic]) => (
          <button key={k} className={'pill-toggle f-' + k + (f === k ? ' on' : '')} aria-pressed={f === k} onClick={() => setF(f === k ? '' : k)}><Icon name={ic} size={15} />{t} <span className="kb-count">{cnt[k]}</span></button>))}
        <button className={'pill-toggle' + (done ? ' on' : '')} aria-pressed={done} onClick={() => setDone(!done)}>{done && <Icon name="check" size={16} />}Gồm đơn đã xong / huỷ</button>
        <label className="small muted row" style={{ gap: 6 }}>Kết quả
          <select aria-label="Lọc theo kết quả" value={kq} onChange={(e) => setKq(e.target.value as typeof kq)}>
            <option value="">Tất cả</option><option value="ok">Hoàn thành</option><option value="fail">Có lượt thất bại</option></select></label>
      </div>
      {!rows ? <Skeleton rows={4} h={92} /> : list.length === 0 ? <Empty title={q ? 'Không có đơn khớp “' + q + '”' : 'Không có đơn'} /> : (
        <ul className="ol">
          {list.map(({ o, due, hs, stuck, steps }) => (
            <li key={o.id}><div role="link" tabIndex={0} className={'oc ' + (due?.cls ?? '') + (stuck ? ' stuck' : '')} onClick={() => nav('/don/' + o.id)} onKeyDown={(e) => e.key === 'Enter' && nav('/don/' + o.id)}>
              <div className="oc-a">
                <Link to={'/don/' + o.id} className="oc-code" onClick={(e) => e.stopPropagation()}>{CI.codeOf(o.id, myCo) ?? <span className="kb-nocode">Chưa có mã</span>}</Link>{adm && <span className="small muted">{o.code}</span>}
                {due && <span className={'chip ' + ({ late: 'bad', soon: 'warn', done: 'done', off: 'idle' } as Record<string, string>)[due.cls]}><Icon name={due.ic} size={13} />{due.t}</span>}
                <span className="oc-due small muted"><Icon name="clock" size={13} />{date(o.due_date)}</span>
              </div>
              <div className="oc-proj">{o.project}<span className="small muted"> · {cust[(o.customer_id ?? o.kh2_id ?? o.kh1_id ?? '')]?.name ?? 'Chưa có khách hàng'}</span></div>
              <div className="oc-prog" aria-label="Tiến độ 4 quy trình">
                {steps.map((s) => <span key={s.p} className={'seg ' + s.cls} title={s.p + ' ' + PROC_NAME[s.p] + ': ' + s.t + (s.d ? ' · ' + s.d : '')}><b>{s.p}</b><i /><em>{s.t}{s.d ? <small> · {s.d}</small> : null}</em></span>)}
              </div>
              <div className="oc-who">{hs.length ? hs.map((h, i) => <span key={i} className={'wait-who' + (isStuck(h.since) ? ' stuck' : '')}><LoginAs uid={h.uid} name={h.who} className="avatar xs">{initialOf(h.who)}</LoginAs>
                <span><LoginAs uid={h.uid} name={h.who}><b>{h.who}</b></LoginAs><span className="small muted">{h.what}{h.since ? ' · chờ ' + waited(h.since) : ''}</span></span></span>) : <span className="small muted">{due?.cls === 'done' ? 'Đã xong cả 4 quy trình' : 'Không ai đang giữ'}</span>}</div>
            </div></li>))}
        </ul>)}
      {rows && more && <div ref={sent} className="ol-more">{busy ? <span className="small muted">Đang tải thêm…</span> : <button className="btn sm" onClick={() => load(false)}>Xem thêm</button>}</div>}
    </>
  );
}
