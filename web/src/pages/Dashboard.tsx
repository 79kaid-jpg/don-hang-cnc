import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toBlob } from 'html-to-image';
import { sb, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { COMPANY, PROC_NAME, ROLE_NAME, STATUS, stepOf, type Batch, type Doc, type Proc } from '../lib/proc';
import { useHolders, isStuck, waited } from '../lib/holders';
import { Icon } from '../components/Icon';
import { QtTag } from '../components/QtTag';
import { Sheet } from '../components/Sheet';
import { Skeleton } from '../components/ui';
import { toast } from '../components/ui';

/** Thống kê: phần "Của tôi" cho mọi người, phần "Điều hành" cho giám đốc / admin.
 *  Mọi cột, thanh, ô số đều bấm được để xem danh sách hồ sơ (drill-down).
 *  Mỗi thẻ có nút chép ảnh / gửi Zalo (điện thoại: bảng chia sẻ của máy → chọn Zalo; máy tính: chép ảnh rồi dán vào Zalo). */
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const QC: Record<Proc, string> = { QT0: '#2F6FB0', QT1: '#7A4DB3', QT2: '#B4690E', QT3: '#2E8B57' };
const DAY = 864e5;
type D = Doc & { signs: { role: string; user: string; at: string; action: string }[] };
type Item = { key: string; order_id: string; code: string; title: string; proc: Proc; note?: string; bad?: boolean };
type Drill = { title: string; sub?: string; items: Item[] };

export default function Dashboard() {
  const { me, can } = useAuth();
  const boss = can('duyet') || can('admin_it') || can('admin_cnc');
  const [tab, setTab] = useState<'me' | 'boss'>(boss ? 'boss' : 'me');
  const [days, setDays] = useState(30);
  const [os, setOs] = useState<Order[] | null>(null); const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<D[]>([]);
  const [drill, setDrill] = useState<Drill | null>(null);
  const holder = useHolders();
  useEffect(() => {
    sb.from('orders').select('*').neq('status', 'huy').then(({ data }) => setOs((data as Order[]) ?? []));
    sb.from('batches').select('*').neq('status', 'huy').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs').select('id, batch_id, company, status, status_at, created_at, signs').then(({ data }) => setDs((data as D[]) ?? []));
  }, []);

  const M = useMemo(() => {
    if (!os) return null;
    const now = Date.now(); const from = now - days * DAY; const today = new Date().toISOString().slice(0, 10);
    const oOf = (b: Batch) => os.find((o) => o.id === b.order_id);
    const item = (b: Batch, note?: string, bad?: boolean): Item => ({ key: b.id, order_id: b.order_id, code: oOf(b)?.code ?? '', title: b.title, proc: b.proc, note, bad });
    const live = bs.filter((b) => b.status === 'dang_lam' || b.status === 'cho_ky');
    const since = (b: Batch) => ds.filter((d) => d.batch_id === b.id).map((d) => d.status_at).sort().pop() ?? b.created_at;
    const stuck = live.filter((b) => isStuck(since(b)));
    const doneP = bs.filter((b) => b.status === 'hoan_tat' && b.done_at && +new Date(b.done_at) >= from);
    const lateO = os.filter((o) => o.due_date && o.due_date < today && live.some((b) => b.order_id === o.id));
    const cycle = doneP.map((b) => (+new Date(b.done_at!) - +new Date(b.created_at)) / DAY);
    const avgCycle = cycle.length ? cycle.reduce((a, x) => a + x, 0) / cycle.length : 0;

    // tồn theo giai đoạn
    const stage: Record<string, { p: Proc; label: string; items: Item[]; stuck: number }> = {};
    for (const b of live) { const st = stepOf(b, ds); const label = st.key === 'ky' ? 'Chờ ký tay' : (b.proc !== 'QT0' && st.company ? (st.company === 'PN' ? 'PN' : COMPANY[st.company]) + ' · ' : '') + (STATUS[st.doc?.status ?? ''] ?? st.key);
      const k = b.proc + '|' + label; const s = isStuck(since(b)); (stage[k] ??= { p: b.proc, label, items: [], stuck: 0 }).items.push(item(b, 'chờ ' + waited(since(b)), s)); if (s) stage[k].stuck++; }
    const stages = Object.values(stage).sort((a, z) => PROCS.indexOf(a.p) - PROCS.indexOf(z.p) || z.items.length - a.items.length);

    // thông lượng theo tuần (8 tuần)
    const wk = (t: number) => Math.floor((now - t) / (7 * DAY));
    const weeks = Array.from({ length: 8 }, (_, i) => { const w = 7 - i; const end = new Date(now - w * 7 * DAY);
      return { w, label: end.getDate() + '/' + (end.getMonth() + 1), made: [] as Item[], done: [] as Item[] }; });
    for (const b of bs) { const a = wk(+new Date(b.created_at)); const wa = weeks.find((x) => x.w === a); if (wa) wa.made.push(item(b));
      if (b.done_at) { const d = wk(+new Date(b.done_at)); const wd = weeks.find((x) => x.w === d); if (wd) wd.done.push(item(b, 'xong ' + new Date(b.done_at).toLocaleDateString('vi-VN'))); } }

    // thời gian xử lý trung bình mỗi bước (từ chữ ký): khoảng cách giữa 2 lần ký liên tiếp trong một phiếu
    const stepT: Record<string, { label: string; p: Proc; hrs: number[]; items: Item[] }> = {};
    const mine: { at: string; action: string; hrs: number; it: Item }[] = [];
    for (const d of ds) { const b = bs.find((x) => x.id === d.batch_id); if (!b) continue;
      const sg = [...(d.signs ?? [])].sort((a, z) => a.at.localeCompare(z.at)); let prev = d.created_at;
      for (const g of sg) { const h = Math.max(0, (+new Date(g.at) - +new Date(prev)) / 36e5); prev = g.at;
        if (+new Date(g.at) < from) continue;
        const label = (b.proc !== 'QT0' ? (d.company === 'PN' ? 'PN' : COMPANY[d.company]) + ' · ' : '') + (ROLE_NAME[g.role] ?? g.role);
        const k = b.proc + '|' + label; (stepT[k] ??= { label, p: b.proc, hrs: [], items: [] }).hrs.push(h); stepT[k].items.push(item(b, Math.round(h) + ' giờ'));
        if (g.user === me?.id) mine.push({ at: g.at, action: g.action, hrs: h, it: item(b, g.action === 'ky' ? 'Đã ký' : g.action === 'tra_ve' ? 'Trả về' : 'Từ chối') }); } }
    const steps = Object.values(stepT).map((x) => ({ ...x, avg: x.hrs.reduce((a, y) => a + y, 0) / x.hrs.length })).sort((a, z) => z.avg - a.avg).slice(0, 10);

    // khối lượng theo người
    const load: Record<string, { who: string; items: Item[]; stuck: number }> = {};
    for (const b of live) { const h = holder(b, ds); if (!h) continue; const s = isStuck(h.since); (load[h.who] ??= { who: h.who, items: [], stuck: 0 }).items.push(item(b, h.what + ' · chờ ' + waited(h.since), s)); if (s) load[h.who].stuck++; }
    const people = Object.values(load).sort((a, z) => z.items.length - a.items.length);

    // tồn theo công ty
    const byCo = (['PN', 'IPC', 'HW'] as const).map((c) => ({ c, items: live.filter((b) => b.proc !== 'QT0' && stepOf(b, ds).company === c).map((b) => item(b)) }));

    // cá nhân
    const myName = me?.full_name ?? '';
    const myQueue = people.filter((p) => p.who === myName || p.who.includes(myName.split(' ').pop() ?? '§'));
    const myDays = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * DAY); const k = d.toISOString().slice(0, 10);
      return { label: d.getDate() + '/' + (d.getMonth() + 1), items: mine.filter((m) => m.at.slice(0, 10) === k).map((m) => m.it) }; });
    const myAvg = mine.length ? mine.reduce((a, m) => a + m.hrs, 0) / mine.length : 0;

    return { live, stuck, doneP, lateO, avgCycle, stages, weeks, steps, people, byCo, mine, myQueue, myDays, myAvg, item, since };
  }, [os, bs, ds, days, me, holder]);

  const open = (title: string, items: Item[], sub?: string) => items.length && setDrill({ title, sub, items });
  if (!M) return <><div className="page-head"><h1>Thống kê</h1></div><Skeleton rows={4} h={140} /></>;
  const maxStage = Math.max(1, ...M.stages.map((s) => s.items.length));
  const maxW = Math.max(1, ...M.weeks.map((w) => Math.max(w.made.length, w.done.length)));
  const maxStep = Math.max(1, ...M.steps.map((s) => s.avg));
  const maxP = Math.max(1, ...M.people.map((p) => p.items.length));
  const maxDay = Math.max(1, ...M.myDays.map((d) => d.items.length));

  return (
    <>
      <div className="page-head"><div><h1>Thống kê</h1><p className="muted">Bấm vào số, cột hoặc thanh để xem danh sách hồ sơ. Nút <Icon name="share" size={14} /> trên mỗi thẻ để gửi ảnh qua Zalo.</p></div>
        <ShareBtn target="#db-root" name="dashboard" label="Gửi ảnh cả trang" /></div>
      <div className="db-bar">
        <div className="seg" role="tablist" aria-label="Phạm vi">
          <button role="tab" aria-selected={tab === 'me'} aria-pressed={tab === 'me'} onClick={() => setTab('me')}>Của tôi</button>
          {boss && <button role="tab" aria-selected={tab === 'boss'} aria-pressed={tab === 'boss'} onClick={() => setTab('boss')}>Điều hành</button>}
        </div>
        <div className="seg" role="group" aria-label="Khoảng thời gian">
          {[7, 30, 90].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} ngày</button>)}
        </div>
      </div>

      <div id="db-root" className="db">
        <div className="db-stamp">Đơn hàng CNC · {tab === 'me' ? 'Thống kê của ' + me?.full_name : 'Thống kê điều hành'} · {days} ngày · {new Date().toLocaleString('vi-VN')}</div>
        {tab === 'me' ? <>
          <div className="db-kpi">
            <Kpi ic="inbox" tone="run" v={M.myQueue.reduce((a, p) => a + p.items.length, 0)} t="Đang chờ tôi" onClick={() => open('Hồ sơ đang chờ tôi', M.myQueue.flatMap((p) => p.items))} />
            <Kpi ic="hourglass" tone={M.myQueue.some((p) => p.stuck) ? 'bad' : 'ok'} v={M.myQueue.reduce((a, p) => a + p.stuck, 0)} t="Của tôi bị kẹt" onClick={() => open('Hồ sơ của tôi bị kẹt', M.myQueue.flatMap((p) => p.items.filter((i) => i.bad)))} />
            <Kpi ic="check" tone="ok" v={M.mine.length} t={'Đã xử lý ' + days + ' ngày'} onClick={() => open('Tôi đã xử lý', M.mine.map((m) => m.it))} />
            <Kpi ic="clock" tone="hot" v={M.myAvg < 24 ? Math.round(M.myAvg) + ' giờ' : (M.myAvg / 24).toFixed(1) + ' ngày'} t="Thời gian xử lý TB" />
          </div>
          <Card id="c-myday" title="Hồ sơ tôi xử lý mỗi ngày" sub="14 ngày gần nhất · bấm cột để xem">
            <div className="db-cols">{M.myDays.map((d) => <button key={d.label} className="db-col" onClick={() => open('Ngày ' + d.label, d.items)} disabled={!d.items.length} aria-label={d.label + ': ' + d.items.length}>
              <span className="db-colv">{d.items.length || ''}</span><i style={{ height: (d.items.length / maxDay) * 100 + '%' }} /><span className="db-coll">{d.label}</span></button>)}</div>
          </Card>
          <Card id="c-myq" title="Việc đang chờ tôi" sub="Sắp theo thời gian chờ">
            {M.myQueue.flatMap((p) => p.items).length ? <List items={M.myQueue.flatMap((p) => p.items)} /> : <p className="muted small">Không có việc nào đang chờ bạn.</p>}
          </Card>
        </> : <>
          <div className="db-kpi">
            <Kpi ic="run" tone="run" v={M.live.length} t="Hồ sơ đang chạy" onClick={() => open('Hồ sơ đang chạy', M.live.map((b) => M.item(b, 'chờ ' + waited(M.since(b)))))} />
            <Kpi ic="check" tone="ok" v={M.doneP.length} t={'Hoàn tất ' + days + ' ngày'} onClick={() => open('Hồ sơ hoàn tất', M.doneP.map((b) => M.item(b)))} />
            <Kpi ic="hourglass" tone={M.stuck.length ? 'bad' : 'ok'} v={M.stuck.length} t="Kẹt ≥ 2 ngày" onClick={() => open('Hồ sơ kẹt', M.stuck.map((b) => M.item(b, 'chờ ' + waited(M.since(b)), true)))} />
            <Kpi ic="alert" tone={M.lateO.length ? 'bad' : 'ok'} v={M.lateO.length} t="Đơn quá hạn giao" onClick={() => open('Đơn quá hạn giao', M.lateO.map((o) => ({ key: o.id, order_id: o.id, code: o.code, title: o.project, proc: 'QT3' as Proc, note: 'hạn ' + o.due_date, bad: true })))} />
            <Kpi ic="clock" tone="hot" v={M.avgCycle ? M.avgCycle.toFixed(1) + ' ngày' : '—'} t="Thời gian TB 1 hồ sơ" />
          </div>
          <div className="db-grid">
            <Card id="c-stage" title="Hồ sơ đang nằm ở đâu" sub="Theo quy trình và bước · đỏ = kẹt">
              <div className="db-hbars">{M.stages.map((s) => <button key={s.p + s.label} className="db-hbar" onClick={() => open(s.p + ' · ' + s.label, s.items)}>
                <span className="db-hl"><QtTag qt={s.p} />{s.label}</span>
                <span className="db-ht"><i style={{ width: (s.items.length / maxStage) * 100 + '%', background: QC[s.p] }}>{s.stuck > 0 && <em style={{ width: (s.stuck / s.items.length) * 100 + '%' }} />}</i></span>
                <b>{s.items.length}</b></button>)}</div>
            </Card>
            <Card id="c-week" title="Nhịp làm việc theo tuần" sub="Hồ sơ mở mới và hoàn tất · 8 tuần">
              <div className="db-legend"><span><i style={{ background: '#C9A24A' }} />Mở mới</span><span><i style={{ background: '#2E8B57' }} />Hoàn tất</span></div>
              <div className="db-cols two">{M.weeks.map((w) => <div key={w.w} className="db-col2">
                <button onClick={() => open('Mở mới tuần đến ' + w.label, w.made)} disabled={!w.made.length} aria-label={'Mở mới ' + w.made.length}><span className="db-colv">{w.made.length || ''}</span><i style={{ height: (w.made.length / maxW) * 100 + '%', background: '#C9A24A' }} /></button>
                <button onClick={() => open('Hoàn tất tuần đến ' + w.label, w.done)} disabled={!w.done.length} aria-label={'Hoàn tất ' + w.done.length}><span className="db-colv">{w.done.length || ''}</span><i style={{ height: (w.done.length / maxW) * 100 + '%', background: '#2E8B57' }} /></button>
                <span className="db-coll">{w.label}</span></div>)}</div>
            </Card>
            <Card id="c-step" title="Bước nào xử lý chậm nhất" sub={'Thời gian trung bình từ khi tới bước đến khi ký · ' + days + ' ngày'}>
              {M.steps.length ? <div className="db-hbars">{M.steps.map((s, i) => <button key={s.p + s.label} className="db-hbar" onClick={() => open(s.p + ' · ' + s.label + ' (TB ' + fmtH(s.avg) + ')', s.items)}>
                <span className="db-hl"><QtTag qt={s.p} />{s.label}</span>
                <span className="db-ht"><i style={{ width: (s.avg / maxStep) * 100 + '%', background: i === 0 ? '#D4513A' : '#C9A24A' }} /></span><b>{fmtH(s.avg)}</b></button>)}</div>
                : <p className="muted small">Chưa có chữ ký nào trong khoảng thời gian này.</p>}
            </Card>
            <Card id="c-people" title="Ai đang giữ nhiều việc" sub="Hồ sơ đang chờ từng người / nhóm · đỏ = kẹt">
              <div className="db-hbars">{M.people.map((p) => <button key={p.who} className="db-hbar" onClick={() => open(p.who, p.items, p.items.length + ' hồ sơ đang chờ')}>
                <span className="db-hl"><span className="avatar xs">{p.who.replace(/\(.*?\)/g, '').trim()[0]}</span>{p.who}</span>
                <span className="db-ht"><i style={{ width: (p.items.length / maxP) * 100 + '%', background: '#7E6024' }}>{p.stuck > 0 && <em style={{ width: (p.stuck / p.items.length) * 100 + '%' }} />}</i></span><b>{p.items.length}</b></button>)}</div>
            </Card>
            <Card id="c-co" title="Tồn theo công ty" sub="QT1–QT3 đang ở bên nào">
              <div className="db-donut-row">{(() => { const tot = Math.max(1, M.byCo.reduce((a, x) => a + x.items.length, 0)); let acc = 0;
                const col = { PN: '#7E6024', IPC: '#2F6FB0', HW: '#B4690E' } as const;
                return <><svg viewBox="0 0 42 42" className="db-donut" role="img" aria-label="Tồn theo công ty">
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#EFE9DC" strokeWidth="6" />
                  {M.byCo.map((x) => { const v = (x.items.length / tot) * 100; const el = <circle key={x.c} cx="21" cy="21" r="15.9" fill="none" stroke={col[x.c]} strokeWidth="6" strokeDasharray={v + ' ' + (100 - v)} strokeDashoffset={25 - acc} style={{ cursor: 'pointer' }} onClick={() => open(COMPANY[x.c], x.items)} />; acc += v; return el; })}
                  <text x="21" y="23" textAnchor="middle" fontSize="8" fontWeight="800">{tot}</text></svg>
                  <ul className="db-dl">{M.byCo.map((x) => <li key={x.c}><button onClick={() => open(COMPANY[x.c], x.items)}><i style={{ background: col[x.c] }} />{COMPANY[x.c]}<b>{x.items.length}</b></button></li>)}</ul></>; })()}</div>
            </Card>
            <Card id="c-proc" title="Tiến độ theo quy trình" sub="Đang chạy / hoàn tất trong kỳ">
              <div className="db-hbars">{PROCS.map((p) => { const l = M.live.filter((b) => b.proc === p); const d = M.doneP.filter((b) => b.proc === p); const t = Math.max(1, l.length + d.length);
                return <div key={p} className="db-hbar stack"><span className="db-hl"><QtTag qt={p} />{PROC_NAME[p].split(' & ')[0].replace('Xuất kho kiêm biên bản giao hàng', 'Giao hàng')}</span>
                  <span className="db-ht"><button style={{ width: (d.length / t) * 100 + '%', background: '#2E8B57' }} onClick={() => open(p + ' hoàn tất', d.map((b) => M.item(b)))} aria-label={'Hoàn tất ' + d.length} />
                    <button style={{ width: (l.length / t) * 100 + '%', background: QC[p], opacity: .55 }} onClick={() => open(p + ' đang chạy', l.map((b) => M.item(b)))} aria-label={'Đang chạy ' + l.length} /></span>
                  <b>{d.length}/{l.length + d.length}</b></div>; })}</div>
            </Card>
          </div>
        </>}
      </div>
      {drill && createPortal(<Sheet onClose={() => setDrill(null)} label={drill.title} head={<b style={{ fontSize: 17 }}>{drill.title}</b>} sub={drill.sub ?? drill.items.length + ' hồ sơ'}><List items={drill.items} /></Sheet>, document.body)}
    </>
  );
}

const fmtH = (h: number) => (h < 1 ? Math.round(h * 60) + ' phút' : h < 48 ? Math.round(h) + ' giờ' : (h / 24).toFixed(1) + ' ngày');

function Kpi({ ic, tone, v, t, onClick }: { ic: string; tone: string; v: ReactNode; t: string; onClick?: () => void }) {
  return <button className={'db-k ' + (tone === 'bad' ? 'bad' : '')} onClick={onClick} disabled={!onClick}><i className={'ov-ic ' + (tone === 'bad' ? 'stuck' : tone)}><Icon name={ic} size={20} /></i><b>{v}</b><span>{t}</span></button>;
}
function Card({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return <section id={id} className="db-card"><header><div><h2>{title}</h2>{sub && <span className="small muted">{sub}</span>}</div><ShareBtn target={'#' + id} name={id} icon /></header>{children}</section>;
}
function List({ items }: { items: Item[] }) {
  return <ul className="sh-list">{items.map((r) => <li key={r.key}><Link to={'/don/' + r.order_id + '?tab=' + r.proc}>
    <span className="sh-main"><b>{r.code}</b><span>{r.title}</span></span>
    {r.note && <span className={'chip ' + (r.bad ? 'bad' : 'idle')}>{r.note}</span>}<Icon name="arrow" size={18} /></Link></li>)}</ul>;
}

/** Chụp một vùng thành ảnh PNG → chia sẻ (điện thoại: chọn Zalo) hoặc chép vào bộ nhớ (máy tính: dán vào Zalo) hoặc tải về */
function ShareBtn({ target, name, label, icon }: { target: string; name: string; label?: string; icon?: boolean }) {
  const [busy, setBusy] = useState(false); const [menu, setMenu] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, [menu]);
  const shot = async () => {
    const el = document.querySelector<HTMLElement>(target); if (!el) throw new Error('Không thấy vùng cần chụp');
    el.classList.add('db-shooting');
    try { const b = await toBlob(el, { pixelRatio: 2, backgroundColor: '#F6F3EC', skipFonts: true, filter: (n) => !(n instanceof HTMLElement && n.classList?.contains('db-share')) });
      if (!b) throw new Error('Không tạo được ảnh'); return b; } finally { el.classList.remove('db-shooting'); }
  };
  const run = async (mode: 'share' | 'copy' | 'save') => {
    setMenu(false); setBusy(true);
    try {
      const blob = await shot(); const file = new File([blob], 'thong-ke-' + name + '.png', { type: 'image/png' });
      if (mode === 'share' && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Thống kê đơn hàng CNC' }); return; }
      if (mode !== 'save' && 'ClipboardItem' in window && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast(mode === 'share' ? 'Đã chép ảnh. Mở Zalo và dán (Ctrl V) vào cuộc trò chuyện.' : 'Đã chép ảnh vào bộ nhớ');
        if (mode === 'share') window.open('https://chat.zalo.me/', '_blank', 'noopener'); return;
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Đã tải ảnh xuống – gửi file này qua Zalo');
    } catch (e) { if ((e as Error).name !== 'AbortError') toast('Không gửi được: ' + (e as Error).message); } finally { setBusy(false); }
  };
  return <div className="db-share" ref={ref}>
    <button className={'btn sm' + (icon ? ' icon-btn' : '')} onClick={() => setMenu(!menu)} disabled={busy} aria-label={label ?? 'Gửi ảnh thẻ này'} aria-expanded={menu} title="Gửi ảnh qua Zalo / chép ảnh">
      <Icon name={busy ? 'refresh' : 'share'} size={16} />{!icon && (label ?? 'Gửi ảnh')}</button>
    {menu && <div className="db-menu" role="menu">
      <button role="menuitem" onClick={() => run('share')}><span className="zl-dot">Zalo</span>Gửi qua Zalo</button>
      <button role="menuitem" onClick={() => run('copy')}><Icon name="copy" size={16} />Chép ảnh</button>
      <button role="menuitem" onClick={() => run('save')}><Icon name="download" size={16} />Tải ảnh PNG</button>
    </div>}
  </div>;
}
