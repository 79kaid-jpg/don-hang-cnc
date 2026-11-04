import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { sb, errText } from '../lib/supabase';
import { Icon } from '../components/Icon';
import { Empty, Msg, Skeleton } from '../components/ui';
import { fmtDT, loadDirectory, slaLeft, userName, who, type Def, type Directory, type Instance, type Process, type Task, type Version } from './model';

type Row = Process & { versions: Version[] };

/** Hộp "Tạo hồ sơ": chọn quy trình đã phát hành + đơn hàng (tuỳ chọn) → mở lượt chạy; trường "kế thừa" tự điền từ hồ sơ trước của đơn */
export function StartDialog({ procs, preset, onClose }: { procs: Row[]; preset?: string; onClose: () => void }) {
  const nav = useNavigate();
  const live = procs.map((p) => ({ p, v: p.versions.find((v) => v.status === 'phat_hanh') })).filter((x) => x.v);
  const [pid, setPid] = useState(preset ?? live[0]?.p.id ?? '');
  const [q, setQ] = useState(''); const [orders, setOrders] = useState<{ id: string; code: string; project: string }[]>([]);
  const [order, setOrder] = useState<{ id: string; code: string; project: string } | null>(null);
  const [title, setTitle] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      let r = sb.from('orders').select('id, code, project').order('created_at', { ascending: false }).limit(20);
      if (q.trim()) r = r.or(`code.ilike.%${q.trim()}%,project.ilike.%${q.trim()}%`);
      const { data } = await r; setOrders((data ?? []) as typeof orders);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  const sel = live.find((x) => x.p.id === pid);
  const inherits = ((sel?.v?.def as Def | undefined)?.fields ?? []).filter((f) => f.inherit).map((f) => f.label);
  const go = async () => {
    if (!sel?.v) return; setBusy(true);
    const { data, error } = await sb.rpc('wf_start_order', { p_version: sel.v.id, p_title: title, p_test: false, p_order: order?.id ?? null });
    setBusy(false); if (error) return setErr(errText(error));
    onClose(); nav('/quy-trinh-moi/chay/' + data);
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wf-start" role="dialog" aria-modal="true" aria-labelledby="wf-start-h" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h2 id="wf-start-h" style={{ margin: 0 }}>Tạo hồ sơ mới</h2>
        {!live.length ? <p className="muted">Chưa có quy trình nào được phát hành.</p> : <>
          <label className="f"><span>Quy trình</span>
            <select value={pid} onChange={(e) => setPid(e.target.value)}>{live.map((x) => <option key={x.p.id} value={x.p.id}>{x.p.name} (bản {x.v!.version})</option>)}</select></label>
          <div className="f"><span>Gắn đơn hàng / dự án (tuỳ chọn)</span>
            {order ? <div className="wf-ck"><Icon name="file" size={14} /><b style={{ flex: 1 }}>{order.code}</b><span className="small muted">{order.project}</span>
              <button aria-label="Bỏ đơn hàng" onClick={() => setOrder(null)}><Icon name="x" size={14} /></button></div> : <>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã đơn hoặc tên dự án" aria-label="Tìm đơn hàng" />
              <div className="wf-olist" role="listbox" aria-label="Đơn hàng">{orders.map((o) => (
                <button key={o.id} role="option" aria-selected={false} onClick={() => setOrder(o)}><b>{o.code}</b><span className="small muted">{o.project}</span></button>))}
                {!orders.length && <span className="small muted" style={{ padding: 8 }}>Không thấy đơn phù hợp</span>}</div></>}
            {order && inherits.length > 0 && <small className="muted">Tự lấy từ hồ sơ trước của đơn này: {inherits.join(', ')}</small>}
          </div>
          <label className="f"><span>Tên hồ sơ</span><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={order ? `${order.code} · ${order.project}` : 'Ví dụ: Đề nghị mua thép tháng 11'} /></label>
        </>}
        <Msg err={err} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" disabled={!sel || busy || (!order && !title.trim())} onClick={go}><Icon name="plus" size={18} />{busy ? 'Đang tạo…' : 'Tạo hồ sơ'}</button>
        </div>
      </div>
    </div>);
}

type Stat = { step_id: string; step_name: string; open_n: number; late_n: number; done_n: number; avg_hours: number | null; back_n: number };

/** Báo cáo theo quy trình: Kanban (mỗi cột một bước) + bảng điểm tắc (đang chờ, trễ hạn, thời gian TB, số lần trả lại) */
export function Report({ procs }: { procs: Row[] }) {
  const usable = procs.filter((p) => p.versions.some((v) => v.status !== 'nhap') || p.versions.length);
  const [pid, setPid] = useState(usable[0]?.id ?? '');
  const [runs, setRuns] = useState<(Instance & { v: { def: Def; version: number } })[] | null>(null);
  const [open, setOpen] = useState<Task[]>([]); const [stats, setStats] = useState<Stat[]>([]);
  const [dir, setDir] = useState<Directory | null>(null); const [err, setErr] = useState(''); const [test, setTest] = useState(false);
  useEffect(() => { loadDirectory().then(setDir); }, []);
  useEffect(() => {
    if (!pid) return; setRuns(null);
    (async () => {
      const vs = procs.find((p) => p.id === pid)?.versions.map((v) => v.id) ?? [];
      const [i, s] = await Promise.all([
        sb.from('wf_instances').select('*, v:wf_versions(def, version)').in('version_id', vs).eq('status', 'dang_chay').order('started_at'),
        sb.rpc('wf_stats', { p_process: pid })]);
      if (i.error) return setErr(errText(i.error));
      const rs = (i.data ?? []) as (Instance & { v: { def: Def; version: number } })[]; setRuns(rs); setStats((s.data ?? []) as Stat[]);
      if (rs.length) { const { data } = await sb.from('wf_tasks').select('*').in('instance_id', rs.map((r) => r.id)).eq('status', 'cho'); setOpen((data ?? []) as Task[]); } else setOpen([]);
    })();
  }, [pid]);
  const proc = procs.find((p) => p.id === pid);
  const def: Def | undefined = (proc?.versions.find((v) => v.status === 'phat_hanh') ?? [...(proc?.versions ?? [])].sort((a, b) => b.version - a.version)[0])?.def;
  const shown = (runs ?? []).filter((r) => test || !r.is_test);
  const cols = useMemo(() => (def?.steps ?? []).map((s) => ({ s, cards: shown.filter((r) => r.v.def.steps[r.step_idx]?.id === s.id) })), [def, shown]);
  const maxAvg = Math.max(1, ...stats.map((x) => Number(x.avg_hours) || 0));
  if (!usable.length) return <Empty title="Chưa có quy trình để báo cáo" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="row">
        <label className="f" style={{ flex: '1 1 260px' }}><span className="small muted">Quy trình</span>
          <select className="wf-sel" value={pid} onChange={(e) => setPid(e.target.value)}>{usable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} />Hiện cả lượt chạy thử</label>
      </div>
      <Msg err={err} />
      {!runs ? <Skeleton /> : <>
        <section aria-label="Bảng Kanban theo bước">
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Đang chạy theo bước <span className="small muted">({shown.length} hồ sơ)</span></h2>
          <div className="wf-kanban">
            {cols.map(({ s, cards }, k) => (
              <div key={s.id} className="wf-kcol">
                <div className="wf-kcol-h"><b>{k + 1}. {s.name}</b><span className="chip idle">{cards.length}</span></div>
                <div className="small muted" style={{ padding: '0 10px 6px' }}>{who(s.assignee, dir)}</div>
                {cards.map((r) => { const t = open.find((x) => x.instance_id === r.id); const sla = slaLeft(t?.due_at ?? null); return (
                  <Link key={r.id} to={'/quy-trinh-moi/chay/' + r.id} className={'wf-kcard' + (sla?.late ? ' late' : '')}>
                    <b>{r.title}</b>
                    <span className="small muted">{t?.assigned_to ? userName(t.assigned_to, dir) : 'Chưa phân công'}{t?.appr_state === 'dang_duyet' ? ' · đang duyệt' : ''}</span>
                    <span className="row small" style={{ gap: 6 }}>{sla && <span className={'chip ' + (sla.late ? 'bad' : 'wait')}><Icon name="clock" size={12} />{sla.text}</span>}{r.is_test && <span className="chip idle">Thử</span>}<span className="muted">từ {fmtDT(t?.created_at ?? r.started_at)}</span></span>
                  </Link>); })}
                {!cards.length && <div className="small muted" style={{ padding: 10 }}>—</div>}
              </div>))}
          </div>
        </section>
        <section className="card flush" aria-label="Điểm tắc">
          <div className="card-head"><b>Điểm tắc theo bước</b><span className="small muted">không tính lượt chạy thử</span></div>
          <table className="wf-table"><thead><tr><th>Bước</th><th>Đang chờ</th><th>Trễ hạn</th><th>Đã xong</th><th>TG trung bình</th><th>Trả lại</th></tr></thead>
            <tbody>{(def?.steps ?? []).map((s) => { const x = stats.find((y) => y.step_id === s.id); const avg = Number(x?.avg_hours) || 0; return (
              <tr key={s.id}><td>{s.name}</td><td>{x?.open_n ?? 0}</td><td className={x?.late_n ? 'wf-bad' : ''}>{x?.late_n ?? 0}</td><td>{x?.done_n ?? 0}</td>
                <td><div className="wf-bar"><i style={{ width: `${(avg / maxAvg) * 100}%` }} className={s.sla_hours && avg > s.sla_hours ? 'over' : ''} /><span>{x?.avg_hours != null ? `${x.avg_hours} giờ` : '—'}{s.sla_hours ? ` / hạn ${s.sla_hours}` : ''}</span></div></td>
                <td>{x?.back_n ?? 0}</td></tr>); })}</tbody></table>
        </section>
      </>}
    </div>);
}
