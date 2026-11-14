import { useScope } from '../lib/myco';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigationType } from 'react-router-dom';
import { toBlob } from 'html-to-image';
import { sb, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { COMPANIES, FLOW, COMPANY, PROC_NAME, ROLE_NAME, STATUS, stepOf, type Batch, type Doc, type Proc } from '../lib/proc';
import { useHolders, isStuck, waited } from '../lib/holders';
import { Icon } from '../components/Icon';
import { QtTag } from '../components/QtTag';
import { Sheet } from '../components/Sheet';
import { Age } from '../components/Age';
import { scrollTop, scrollToY } from '../lib/scroll';
import { Leaderboard } from '../components/Perf';
import { Skeleton } from '../components/ui';
import { toast } from '../components/ui';

/** Thống kê: phần "Của tôi" cho mọi người, phần "Điều hành" cho giám đốc / admin.
 *  Mọi cột, thanh, ô số đều bấm được để xem danh sách hồ sơ (drill-down).
 *  Mỗi thẻ có nút chép ảnh / gửi Zalo (điện thoại: bảng chia sẻ của máy → chọn Zalo; máy tính: chép ảnh rồi dán vào Zalo). */
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const QC: Record<Proc, string> = { QT0: '#2F6FB0', QT1: '#7A4DB3', QT2: '#B4690E', QT3: '#2E8B57' };
const DAY = 864e5;
/** Màu công ty dùng chung cho mọi biểu đồ – khác cả sắc lẫn độ sáng */
const CO_COL: Record<string, string> = { PN: '#1F4A73', IPC: '#2A9D8F', HW: '#D9822B' };
type D = Doc & { signs: { role: string; user: string; at: string; action: string }[] };
type Item = { key: string; order_id: string; code: string; title: string; proc: Proc; note?: string; bad?: boolean; since?: string };
type Drill = { title: string; sub?: string; items: Item[] };

export default function Dashboard() {
  const { me, can } = useAuth();
  const boss = can('duyet') || can('admin_it') || can('admin_cnc');
  const [tab, setTab0] = useState<'me' | 'boss'>(() => (sessionStorage.getItem('db-tab') as 'me' | 'boss') || (boss ? 'boss' : 'me'));
  const setTab = (t: 'me' | 'boss') => { setTab0(t); try { sessionStorage.setItem('db-tab', t); } catch { /* */ } };
  const [days, setDays0] = useState(() => +(sessionStorage.getItem('db-days') ?? 30) || 30);
  const setDays = (d: number) => { setDays0(d); try { sessionStorage.setItem('db-days', String(d)); } catch { /* */ } };
  const [os, setOs] = useState<Order[] | null>(null); const [bs0, setBs] = useState<Batch[]>([]); const [ds0, setDs] = useState<D[]>([]);
  const back = useNavigationType() === 'POP';
  const [drill, setDrill0] = useState<Drill | null>(() => { try { if (!back) return null; return JSON.parse(sessionStorage.getItem('db-drill') ?? 'null'); } catch { return null; } });
  const setDrill = (d: Drill | null) => { setDrill0(d); try { if (d) sessionStorage.setItem('db-drill', JSON.stringify(d)); else sessionStorage.removeItem('db-drill'); } catch { /* */ } };
  useEffect(() => { try { const y = +(sessionStorage.getItem('db-y') ?? 0); if (y && back) setTimeout(() => scrollToY(y), 400);
    const f = () => sessionStorage.setItem('db-y', String(scrollTop())); addEventListener('scroll', f, { passive: true, capture: true }); return () => removeEventListener('scroll', f, { capture: true }); } catch { return; } }, []);
  const holder = useHolders();
  useEffect(() => {
    sb.from('orders').select('*').neq('status', 'huy').then(({ data }) => setOs((data as Order[]) ?? []));
    sb.from('batches').select('*').neq('status', 'huy').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs_v').select('id, batch_id, company, status, status_at, created_at, signs').then(({ data }) => setDs((data as D[]) ?? []));
  }, []);

  const { scope } = useScope();
  const M = useMemo(() => {
    if (!os) return null;
    // Theo công ty đang chọn (QT0 thuộc PN)
    const ds = scope === 'ALL' ? ds0 : ds0.filter((d) => d.company === scope);
    const bs = scope === 'ALL' ? bs0 : bs0.filter((b) => (b.proc === 'QT0' ? scope === 'PN' : ds.some((d) => d.batch_id === b.id)));
    const now = Date.now(); const from = now - days * DAY; const today = new Date().toISOString().slice(0, 10);
    const oOf = (b: Batch) => os.find((o) => o.id === b.order_id);
    const since = (b: Batch) => ds.filter((d) => d.batch_id === b.id).map((d) => d.status_at).sort().pop() ?? b.created_at;
    const isLive = (b: Batch) => b.status === 'dang_lam' || b.status === 'cho_ky';
    const item = (b: Batch, note?: string, bad?: boolean): Item => ({ key: b.id, order_id: b.order_id, code: oOf(b)?.code ?? '', title: b.title, proc: b.proc, bad,
      note: isLive(b) && note?.startsWith('chờ ') ? undefined : note?.replace(/ · chờ .*$/, ''), since: isLive(b) ? since(b) : undefined });
    const live = bs.filter(isLive);
    const stuck = live.filter((b) => isStuck(since(b)));
    const doneP = bs.filter((b) => b.status === 'hoan_tat' && b.done_at && +new Date(b.done_at) >= from);
    const lateO = os.filter((o) => o.due_date && o.due_date < today && live.some((b) => b.order_id === o.id));
    const cycle = doneP.map((b) => (+new Date(b.done_at!) - +new Date(b.created_at)) / DAY);
    const avgCycle = cycle.length ? cycle.reduce((a, x) => a + x, 0) / cycle.length : 0;
    // Tỉ lệ trả về trong kỳ: số lượt trả về / số lượt ký
    let nTv = 0, nKy = 0; const tvItems: Item[] = [];
    for (const d of ds) for (const g of (d.signs ?? []) as { action?: string; at?: string }[]) { if (!g.at || +new Date(g.at) < from) continue;
      if (g.action === 'tra_ve') { nTv++; const b = bs.find((x) => x.id === d.batch_id); if (b && !tvItems.some((t) => t.key === b.id)) tvItems.push(item(b, d.company + ' · bị trả về', true)); }
      else if (g.action === 'ky') nKy++; }
    const tvRate = nKy + nTv ? nTv / (nKy + nTv) : 0;
    const urgent = [...stuck].sort((a, b) => since(a).localeCompare(since(b))).slice(0, 8);

    // tồn theo giai đoạn
    const stage: Record<string, { p: Proc; label: string; items: Item[]; stuck: number; o: number }> = {};
    for (const b of live) { const st = stepOf(b, ds); const label = st.key === 'ky' ? 'Chờ ký tay' : (b.proc !== 'QT0' && st.company ? (st.company === 'PN' ? 'PN' : COMPANY[st.company]) + ' · ' : '') + (STATUS[st.doc?.status ?? ''] ?? st.key);
      const k = b.proc + '|' + label; const s = isStuck(since(b)); (stage[k] ??= { p: b.proc, label, items: [], stuck: 0, o: st.key === 'ky' ? 999 : COMPANIES.indexOf(st.company ?? 'PN') * 50 + FLOW[b.proc].indexOf(st.doc?.status ?? '') }).items.push(item(b, 'chờ ' + waited(since(b)), s)); if (s) stage[k].stuck++; }
    const stages = Object.values(stage).sort((a, z) => PROCS.indexOf(a.p) - PROCS.indexOf(z.p) || a.o - z.o);

    // thông lượng theo tuần (8 tuần)
    const wk = (t: number) => Math.floor((now - t) / (7 * DAY));
    const weeks = Array.from({ length: 8 }, (_, i) => { const w = 7 - i; const end = new Date(now - w * 7 * DAY);
      return { w, label: end.getDate() + '/' + (end.getMonth() + 1), made: [] as Item[], done: [] as Item[] }; });
    for (const b of bs) { const a = wk(+new Date(b.created_at)); const wa = weeks.find((x) => x.w === a); if (wa) wa.made.push(item(b));
      if (b.done_at) { const d = wk(+new Date(b.done_at)); const wd = weeks.find((x) => x.w === d); if (wd) wd.done.push(item(b, 'xong ' + new Date(b.done_at).toLocaleDateString('vi-VN'))); } }

    // thời gian xử lý trung bình mỗi bước (từ chữ ký): khoảng cách giữa 2 lần ký liên tiếp trong một phiếu
    const stepT: Record<string, { label: string; p: Proc; hrs: number[]; items: Item[]; o: number }> = {};
    const RO = ['admin', 'ky_thuat', 'lap', 'kiem_tra', 'duyet', 'hoan_tat'];
    const mine: { at: string; action: string; hrs: number; it: Item }[] = [];
    for (const d of ds) { const b = bs.find((x) => x.id === d.batch_id); if (!b) continue;
      const sg = [...(d.signs ?? [])].sort((a, z) => a.at.localeCompare(z.at)); let prev = d.created_at;
      for (const g of sg) { const h = Math.max(0, (+new Date(g.at) - +new Date(prev)) / 36e5); prev = g.at;
        if (+new Date(g.at) < from || (g as { by?: string }).by) continue;
        const label = (b.proc !== 'QT0' ? (d.company === 'PN' ? 'PN' : COMPANY[d.company]) + ' · ' : '') + (ROLE_NAME[g.role] ?? g.role);
        const k = b.proc + '|' + label; (stepT[k] ??= { label, p: b.proc, hrs: [], items: [], o: COMPANIES.indexOf(d.company) * 10 + RO.indexOf(g.role) }).hrs.push(h); stepT[k].items.push(item(b, Math.round(h) + ' giờ'));
        if (g.user === me?.id) mine.push({ at: g.at, action: g.action, hrs: h, it: item(b, g.action === 'ky' ? 'Đã ký' : g.action === 'tra_ve' ? 'Trả về' : 'Từ chối') }); } }
    const steps = Object.values(stepT).map((x) => ({ ...x, avg: x.hrs.reduce((a, y) => a + y, 0) / x.hrs.length })).sort((a, z) => PROCS.indexOf(a.p) - PROCS.indexOf(z.p) || a.o - z.o);

    // khối lượng theo người
    const load: Record<string, { who: string; items: Item[]; stuck: number; co: Record<string, number> }> = {};
    for (const b of live) { const h = holder(b, ds); if (!h) continue; const s = isStuck(h.since); const L = (load[h.who] ??= { who: h.who, items: [], stuck: 0, co: {} }); L.items.push(item(b, h.what + ' · chờ ' + waited(h.since), s)); if (s) L.stuck++;
      const st = stepOf(b, ds); const c = st.key === 'ky' || b.proc === 'QT0' ? 'PN' : st.company ?? 'PN'; L.co[c] = (L.co[c] ?? 0) + 1; }
    const people = Object.values(load).sort((a, z) => z.items.length - a.items.length);

    // tồn theo công ty
    const byCo = (['PN', 'IPC', 'HW'] as const).map((c) => ({ c, items: live.filter((b) => b.proc !== 'QT0' && stepOf(b, ds).company === c).map((b) => item(b)) }));

    // cá nhân
    const myName = me?.full_name ?? '';
    const myQueue = people.filter((p) => p.who === myName || p.who.includes(myName.split(' ').pop() ?? '§'));
    const myDays = Array.from({ length: 14 }, (_, i) => { const d = new Date(now - (13 - i) * DAY); const k = d.toISOString().slice(0, 10);
      return { label: d.getDate() + '/' + (d.getMonth() + 1), items: mine.filter((m) => m.at.slice(0, 10) === k).map((m) => m.it) }; });
    const myAvg = mine.length ? mine.reduce((a, m) => a + m.hrs, 0) / mine.length : 0;

    return { live, stuck, doneP, lateO, avgCycle, stages, weeks, steps, people, byCo, mine, myQueue, myDays, myAvg, item, since, nTv, tvRate, tvItems, urgent };
  }, [os, bs0, ds0, days, me, holder, scope]);

  const open = (title: string, items: Item[], sub?: string) => items.length && setDrill({ title, sub, items: [...items].sort((a, z) => (a.since ?? '9').localeCompare(z.since ?? '9')) });
  if (!M) return <><div className="page-head"><h1>Thống kê</h1></div><Skeleton rows={4} h={140} /></>;
  const maxStage = Math.max(1, ...M.stages.map((s) => s.items.length));
  const maxW = Math.max(1, ...M.weeks.map((w) => Math.max(w.made.length, w.done.length)));
  const maxStep = Math.max(1, ...M.steps.map((s) => s.avg));
  const maxP = Math.max(1, ...M.people.map((p) => p.items.length));
  const maxDay = Math.max(1, ...M.myDays.map((d) => d.items.length));

  return (
    <>
      <header className="db-head">
        <div className="db-title"><h1>Thống kê</h1>
          <span className="db-live"><i />Cập nhật {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span></div>
        <Link className="btn sm" to="/bao-cao-du-an"><Icon name="fgrid" size={16} />Theo dự án</Link>
        <ShareBtn target="#db-root" name="dashboard" label="Gửi ảnh" />
        <p className="db-hint small muted hide-m"><Icon name="arrow" size={13} />Bấm vào số, cột hoặc thanh để xem danh sách hồ sơ · nút <Icon name="share" size={13} /> để gửi ảnh qua Zalo.</p>
      </header>
        <div className="db-ctrl db-sticky">
          {boss && <div className="db-tabs" role="tablist" aria-label="Phạm vi">
            <span className="db-thumb" style={{ transform: tab === 'boss' ? 'translateX(100%)' : 'none' }} aria-hidden="true" />
            <button role="tab" aria-selected={tab === 'me'} onClick={() => setTab('me')}><Icon name="inbox" size={16} />Của tôi</button>
            <button role="tab" aria-selected={tab === 'boss'} onClick={() => setTab('boss')}><Icon name="chart" size={16} />Điều hành</button>
          </div>}
          <div className="db-period" role="group" aria-label="Khoảng thời gian">
            {[7, 30, 90].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d}<small> ngày</small></button>)}
          </div>
        </div>

      <DailyZalo />
      <div id="db-root" className="db">
        <div className="db-stamp">PMS · {tab === 'me' ? 'Thống kê của ' + me?.full_name : 'Thống kê điều hành'} · {days} ngày · {new Date().toLocaleString('vi-VN')}</div>
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
            <Kpi ic="check" tone="ok" v={M.doneP.length} t={'Thành công ' + days + ' ngày'} onClick={() => open('Hồ sơ thành công', M.doneP.map((b) => M.item(b)))} />
            <Kpi ic="hourglass" tone={M.stuck.length ? 'bad' : 'ok'} v={M.stuck.length} t="Kẹt ≥ 2 ngày" onClick={() => open('Hồ sơ kẹt', M.stuck.map((b) => M.item(b, 'chờ ' + waited(M.since(b)), true)))} />
            <Kpi ic="alert" tone={M.lateO.length ? 'bad' : 'ok'} v={M.lateO.length} t="Đơn quá hạn giao" onClick={() => open('Đơn quá hạn giao', M.lateO.map((o) => ({ key: o.id, order_id: o.id, code: o.code, title: o.project, proc: 'QT3' as Proc, note: 'hạn ' + o.due_date, bad: true })))} />
            <Kpi ic="back" tone={M.tvRate > 0.2 ? 'bad' : M.tvRate > 0.1 ? 'hot' : 'ok'} v={Math.round(M.tvRate * 100) + '%'} t={'Tỉ lệ trả về · ' + M.nTv + ' lượt'} onClick={() => open('Hồ sơ bị trả về trong ' + days + ' ngày', M.tvItems)} />
            <Kpi ic="clock" tone="hot" v={M.avgCycle ? M.avgCycle.toFixed(1) + ' ngày' : '—'} t="Thời gian TB 1 hồ sơ" />
          </div>
          <Card id="c-urgent" title="Cần xử lý ngay" sub={M.urgent.length ? 'Hồ sơ kẹt lâu nhất · bấm để mở và nhắc người đang giữ' : undefined}>
            {M.urgent.length ? <List items={M.urgent.map((b) => M.item(b, 'chờ ' + waited(M.since(b)) + (holder(b, ds0)?.who ? ' · ' + holder(b, ds0)!.who : ''), true))} /> : <p className="muted small">Không có hồ sơ nào kẹt ≥ 2 ngày. 👍</p>}
          </Card>
          <div className="db-grid">
            <Card id="c-stage" title="Hồ sơ đang nằm ở đâu" sub="Mỗi thanh là một quy trình, mỗi khúc màu là một bước · bấm để mở rộng">
              <StageBars stages={M.stages} open={open} />
            </Card>
            <Card id="c-week" title="Nhịp làm việc theo tuần" sub="Hồ sơ mở mới và hoàn tất · 8 tuần">
              <div className="db-legend"><span><i style={{ background: '#3A6EA5' }} />Mở mới</span><span><i style={{ background: '#2E8B57' }} />Hoàn tất</span></div>
              <div className="db-cols two">{M.weeks.map((w) => <div key={w.w} className="db-col2">
                <button onClick={() => open('Mở mới tuần đến ' + w.label, w.made)} disabled={!w.made.length} aria-label={'Mở mới ' + w.made.length}><span className="db-colv">{w.made.length || ''}</span><i style={{ height: (w.made.length / maxW) * 100 + '%', background: '#3A6EA5' }} /></button>
                <button onClick={() => open('Hoàn tất tuần đến ' + w.label, w.done)} disabled={!w.done.length} aria-label={'Hoàn tất ' + w.done.length}><span className="db-colv">{w.done.length || ''}</span><i style={{ height: (w.done.length / maxW) * 100 + '%', background: '#2E8B57' }} /></button>
                <span className="db-coll">{w.label}</span></div>)}</div>
            </Card>
            <Card id="c-step" title="Bước nào xử lý chậm nhất" sub={'Thời gian TB từ khi tới bước đến khi ký · ' + days + ' ngày · bấm để mở rộng'}>
              {M.steps.length ? <StepTime steps={M.steps} open={open} /> : <p className="muted small">Chưa có chữ ký nào trong khoảng thời gian này.</p>}
            </Card>
            <Card id="c-people" title="Ai đang giữ nhiều việc" sub="Hồ sơ đang chờ từng người / nhóm · đỏ = kẹt">
              <People people={M.people} open={open} />
            </Card>
            <Card id="c-co" title="Luồng PN → IPC → Hanwa" sub="Hồ sơ QT1–QT3 đang chạy ở từng công ty">
              <div className="db-donut-row">{(() => { const tot = Math.max(1, M.byCo.reduce((a, x) => a + x.items.length, 0)); let acc = 0;
                const col = CO_COL; const gap = M.byCo.filter((x) => x.items.length).length > 1 ? 0.8 : 0;
                return <><svg viewBox="0 0 42 42" className="db-donut" role="img" aria-label="Tồn theo công ty">
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#E9ECEF" strokeWidth="6" />
                  {M.byCo.map((x) => { const v = (x.items.length / tot) * 100; const el = <circle key={x.c} cx="21" cy="21" r="15.9" fill="none" stroke={col[x.c]} strokeWidth="6" strokeDasharray={Math.max(0, v - gap) + ' ' + (100 - v + gap)} strokeDashoffset={25 - acc} style={{ cursor: 'pointer' }} onClick={() => open(COMPANY[x.c], x.items)} />; acc += v; return el; })}
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
            <Card id="c-rank" collapsed title="Xếp hạng hiệu quả" sub="Điểm = đúng hạn + tốc độ + chất lượng + khối lượng − phạt quá hạn · bấm để xem chi tiết">
              <Leaderboard />
            </Card>
          </div>
        </>}
      </div>
      {drill && createPortal(<Sheet onClose={() => setDrill(null)} label={drill.title} head={<b style={{ fontSize: 17 }}>{drill.title}</b>} sub={drill.sub ?? drill.items.length + ' hồ sơ'}><List items={drill.items} /></Sheet>, document.body)}
    </>
  );
}

const fmtH = (h: number) => (h < 1 ? Math.round(h * 60) + ' phút' : h < 48 ? Math.round(h) + 'h' : (h / 24).toFixed(1) + ' ngày');

function Kpi({ ic, tone, v, t, onClick }: { ic: string; tone: string; v: ReactNode; t: string; onClick?: () => void }) {
  return <button className={'db-k t-' + tone + (tone === 'bad' ? ' bad' : '')} onClick={onClick} disabled={!onClick}><i className={'ov-ic ' + (tone === 'bad' ? 'stuck' : tone)}><Icon name={ic} size={20} /></i><b>{v}</b><span>{t}</span></button>;
}
function Card({ id, title, sub, children, collapsed }: { id: string; title: string; sub?: string; children: ReactNode; collapsed?: boolean }) {
  if (collapsed) return <details className="card db-card db-fold" id={id}><summary><h2>{title}</h2>{sub && <span className="small muted">{sub}</span>}</summary>{children}</details>;
  return <section id={id} className="db-card"><header><div><h2>{title}</h2>{sub && <span className="small muted">{sub}</span>}</div><ShareBtn target={'#' + id} name={id} icon /></header>{children}</section>;
}
function List({ items }: { items: Item[] }) {
  return <ul className="sh-list">{items.map((r) => <li key={r.key}><Link to={'/don/' + r.order_id + '?tab=' + r.proc}>
    <span className="sh-main"><b>{r.code}</b><span>{r.title}</span></span>
    <span className="sh-tags">{r.note && <span className={'chip ' + (r.bad && !r.since ? 'bad' : 'idle')}>{r.note}</span>}<Age since={r.since} /></span><Icon name="arrow" size={18} /></Link></li>)}</ul>;
}

/** Chụp một vùng thành ảnh PNG → chia sẻ (điện thoại: chọn Zalo) hoặc chép vào bộ nhớ (máy tính: dán vào Zalo) hoặc tải về */
function ShareBtn({ target, name, label, icon }: { target: string; name: string; label?: string; icon?: boolean }) {
  const [busy, setBusy] = useState(false); const [menu, setMenu] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!menu) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, [menu]);
  const shot = async () => {
    const el = document.querySelector<HTMLElement>(target); if (!el) throw new Error('Không thấy vùng cần chụp');
    el.classList.add('db-shooting');
    try { const b = await toBlob(el, { pixelRatio: 2, backgroundColor: '#F3F4F6', skipFonts: true, filter: (n) => !(n instanceof HTMLElement && n.classList?.contains('db-share')) });
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
      <Icon name={busy ? 'refresh' : 'share'} size={16} />{!icon && <span>{label ?? 'Gửi ảnh'}</span>}</button>
    {menu && <div className="db-menu" role="menu">
      <button role="menuitem" onClick={() => run('share')}><span className="zl-dot">Zalo</span>Gửi qua Zalo</button>
      <button role="menuitem" onClick={() => run('copy')}><Icon name="copy" size={16} />Chép ảnh</button>
      <button role="menuitem" onClick={() => run('save')}><Icon name="download" size={16} />Tải ảnh PNG</button>
    </div>}
  </div>;
}

/** Bật / tắt nhận báo cáo 8h sáng qua Zalo bot; gửi thử ngay cho mình */
function DailyZalo() {
  const { me, reload } = useAuth(); const [busy, setBusy] = useState(false);
  if (!me) return null;
  const p = me as typeof me & { daily_report?: boolean | null; zalo_chat_id?: string | null };
  const on = p.daily_report ?? (me.roles.includes('duyet') || me.roles.includes('admin_it'));
  const linked = !!p.zalo_chat_id;
  const toggle = async () => { setBusy(true); const { error } = await sb.rpc('set_daily_report', { p_on: !on }); setBusy(false);
    if (error) toast('Không lưu được: ' + error.message); else { toast(!on ? 'Đã bật báo cáo 8h sáng qua Zalo' : 'Đã tắt báo cáo sáng'); reload(); } };
  const test = async () => { setBusy(true); const { data, error } = await sb.rpc('send_daily_report_me'); setBusy(false);
    toast(error ? 'Lỗi: ' + error.message : data ? 'Đã gửi báo cáo vào Zalo của bạn' : 'Bạn chưa liên kết Zalo'); };
  return <div className={'db-daily' + (on && linked ? ' on' : '')}>
    <span className="db-zl" aria-hidden="true">Zalo</span>
    <span className="db-daily-t"><b>Báo cáo 8:00 hằng ngày</b>
      <span className="small">{!linked ? 'Liên kết Zalo để nhận báo cáo' : on ? <><i className="db-dot" />Đang bật · bot gửi vào Zalo của bạn</> : 'Đang tắt'}</span></span>
    {linked ? <>
      <button className="db-test" onClick={test} disabled={busy} aria-label="Gửi thử báo cáo ngay"><Icon name="share" size={15} /><span>Gửi thử</span></button>
      <button role="switch" aria-checked={on} className={'sw-toggle' + (on ? ' on' : '')} onClick={toggle} disabled={busy} aria-label="Nhận báo cáo 8h sáng"><i /></button>
    </> : <Link className="btn sm primary" to="/zalo">Liên kết</Link>}
  </div>;
}

/** Mỗi quy trình 1 thanh xếp chồng (mỗi bước 1 khúc, đậm → nhạt theo thứ tự bước, số trong khúc).
 *  Bấm thanh → mở rộng thành biểu đồ cột ngang các bước của quy trình đó; bấm cột → danh sách hồ sơ. */
function StageBars({ stages, open }: { stages: { p: Proc; label: string; items: Item[]; stuck: number }[]; open: (t: string, items: Item[]) => void }) {
  const [ex, setEx] = useState<Proc | null>(null);
  return <div className="sb">{PROCS.map((p) => {
    const st = stages.filter((s) => s.p === p); const tot = st.reduce((a, s) => a + s.items.length, 0); const stuck = st.reduce((a, s) => a + s.stuck, 0);
    const max = Math.max(1, ...st.map((s) => s.items.length)); const on = ex === p;
    const shade = (i: number) => `color-mix(in srgb, ${QC[p]} ${Math.round(100 - (i / Math.max(1, st.length)) * 62)}%, #fff)`;
    return <div key={p} className={'sb-row' + (on ? ' on' : '')}>
      <button className="sb-head" onClick={() => setEx(on ? null : p)} aria-expanded={on} disabled={!tot}>
        <span className="sb-name"><QtTag qt={p} /><b>{PROC_NAME[p].split(' & ')[0].replace('Xuất kho kiêm biên bản giao hàng', 'Giao hàng')}</b></span>
        <span className="sb-sum">{stuck > 0 && <span className="chip bad">{stuck} kẹt</span>}<b>{tot}</b><span className="small muted">hồ sơ</span><Icon name="arrow" size={16} /></span>
        <span className="sb-stack" aria-hidden="true">{tot ? st.map((s, i) => <i key={s.label} style={{ flexGrow: s.items.length, background: shade(i) }} className={s.stuck ? 'stuck' : ''} title={s.label + ': ' + s.items.length}>
          <em style={{ color: i / st.length > .45 ? '#1B1F24' : '#fff' }}>{s.items.length}</em></i>) : <i className="empty" style={{ flexGrow: 1 }}><em>Không có hồ sơ</em></i>}</span>
      </button>
      {on && <div className="sb-detail">{st.map((s, i) => <button key={s.label} className="db-hbar" onClick={() => open(p + ' · ' + s.label, s.items)}>
        <span className="db-hl"><i className="sb-sw" style={{ background: shade(i) }} />{s.label}</span>
        <span className="db-ht"><i style={{ width: (s.items.length / max) * 100 + '%', background: shade(i) }}>{s.stuck > 0 && <em style={{ width: (s.stuck / s.items.length) * 100 + '%' }} />}</i></span>
        <b>{s.items.length}</b></button>)}</div>}
    </div>; })}</div>;
}

const RED = '#D4513A';
/** Mỗi quy trình 1 thanh: độ dài khúc = thời gian TB của bước; bước lâu nhất màu đỏ, các bước còn lại nhạt dần theo độ dài */
function StepTime({ steps, open }: { steps: { p: Proc; label: string; avg: number; items: Item[] }[]; open: (t: string, items: Item[]) => void }) {
  const [ex, setEx] = useState<Proc | null>(null);
  const rows = PROCS.map((p) => { const st = steps.filter((s) => s.p === p); return { p, st, tot: st.reduce((a, s) => a + s.avg, 0) }; }).filter((r) => r.st.length);
  const maxTot = Math.max(0.01, ...rows.map((r) => r.tot)); const slow = Math.max(...steps.map((s) => s.avg));
  const tone = (st: { avg: number }[], s: { avg: number }) => { const top = Math.max(...st.map((x) => x.avg));
    if (s.avg === top && top > 0.02) return RED; const r = [...st].sort((a, z) => z.avg - a.avg).indexOf(s as never);
    return `color-mix(in srgb, #B8862E ${Math.max(22, 88 - r * 14)}%, #fff)`; };
  return <div className="sb">{rows.map(({ p, st, tot }) => { const on = ex === p; const max = Math.max(0.01, ...st.map((s) => s.avg)); const top = st.find((s) => s.avg === max);
    return <div key={p} className={'sb-row' + (on ? ' on' : '')}>
      <button className="sb-head" onClick={() => setEx(on ? null : p)} aria-expanded={on}>
        <span className="sb-name"><QtTag qt={p} /><b>{top && max > 0.02 ? top.label : PROC_NAME[p].split(' & ')[0].replace('Xuất kho kiêm biên bản giao hàng', 'Giao hàng')}</b>{top && max > 0.02 && <span className="sb-slow">chậm nhất</span>}</span>
        <span className="sb-sum"><b>{fmtH(tot)}</b><span className="small muted">tổng</span><Icon name="arrow" size={16} /></span>
        {tot < 0.02 ? <span className="sb-track small muted">Chưa đủ dữ liệu – các bước được ký gần như ngay</span> :
        <span className="sb-track" aria-hidden="true"><span className="sb-stack" style={{ width: Math.max(8, (tot / maxTot) * 100) + '%' }}>
          {st.map((s) => <i key={s.label} style={{ flexGrow: Math.max(s.avg, tot * 0.04 || 1), background: tone(st, s) }} title={s.label + ': ' + fmtH(s.avg)}>
            {s.avg / (tot || 1) > .14 && <em style={{ color: tone(st, s) === RED ? '#fff' : '#3A2C10' }}>{fmtH(s.avg)}</em>}</i>)}</span></span>}
      </button>
      {on && <div className="sb-detail">{[...st].sort((a, z) => z.avg - a.avg).map((s) => <button key={s.label} className="db-hbar" onClick={() => open(p + ' · ' + s.label + ' (TB ' + fmtH(s.avg) + ')', s.items)}>
        <span className="db-hl"><i className="sb-sw" style={{ background: tone(st, s) }} />{s.label}</span>
        <span className="db-ht"><i style={{ width: (s.avg / max) * 100 + '%', background: tone(st, s) }} /></span><b>{fmtH(s.avg)}</b></button>)}</div>}
    </div>; })}</div>;
}

/** Ai đang giữ việc: mặc định xếp nhiều → ít; bật "Theo công ty" thì gom PN / IPC / Hanwa, mỗi nhóm xếp nhiều → ít */
function People({ people, open }: { people: { who: string; items: Item[]; stuck: number; co: Record<string, number> }[]; open: (t: string, items: Item[], sub?: string) => void }) {
  const [by, setBy] = useState(false);
  const max = Math.max(1, ...people.map((p) => p.items.length));
  const coOf = (p: { co: Record<string, number> }) => Object.entries(p.co).sort((a, z) => z[1] - a[1])[0]?.[0] ?? 'PN';
  const CC = CO_COL as Record<string, string>;
  const row = (p: typeof people[number]) => <button key={p.who} className="db-hbar" onClick={() => open(p.who, p.items, p.items.length + ' hồ sơ đang chờ')}>
    <span className="db-hl"><span className="avatar xs">{p.who.replace(/\(.*?\)/g, '').trim()[0]}</span>{p.who}</span>
    <span className="db-ht"><i style={{ width: (p.items.length / max) * 100 + '%', background: by ? CC[coOf(p)] : '#3A6EA5' }}>{p.stuck > 0 && <em style={{ width: (p.stuck / p.items.length) * 100 + '%' }} />}</i></span><b>{p.items.length}</b></button>;
  const groups = COMPANIES.map((c) => { const l = people.filter((p) => coOf(p) === c); return { c, l, n: l.reduce((a, p) => a + p.items.length, 0) }; }).filter((g) => g.l.length).sort((a, z) => z.n - a.n);
  return <>
    <div className="pp-bar"><button role="switch" aria-checked={by} className={'pp-sw' + (by ? ' on' : '')} onClick={() => setBy(!by)}><i />Theo công ty</button></div>
    {!by ? <div className="db-hbars">{people.map(row)}</div> :
      <div className="pp-groups">{groups.map((g) => <section key={g.c}>
        <h3><i style={{ background: CC[g.c] }} />{COMPANY[g.c as keyof typeof COMPANY]}<span className="small muted">{g.l.length} người · {g.n} hồ sơ</span></h3>
        <div className="db-hbars">{g.l.map(row)}</div></section>)}</div>}
  </>;
}
