import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePerf, scoresWithTrend, UNIT_NAME, DEFAULT_CFG, type PerfCfg, type Prize, type Score } from '../lib/perf';
import { Icon, PATHS as ICON_PATH } from './Icon';
import { toast } from './ui';

const tier = (s: number) => (s >= 85 ? { t: 'Xuất sắc', c: '#2E8B57' } : s >= 70 ? { t: 'Tốt', c: '#7E6024' } : s >= 50 ? { t: 'Khá', c: '#B4690E' } : { t: 'Cần cải thiện', c: '#C2410C' });
const fH = (h: number) => (h < 1 ? Math.round(h * 60) + ' phút' : h < 48 ? h.toFixed(1).replace('.0', '') + 'h' : (h / 24).toFixed(1) + ' ngày');
const avg = (l: Score[], k: keyof Score) => { const v = l.filter((s) => s.ranked).map((s) => s[k] as number); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0; };

const RINGS = [['sOntime', 'Đúng hạn', '#2E9E5B'], ['sSpeed', 'Tốc độ', '#2F7BD6'], ['sQuality', 'Chất lượng', '#8A5CD1'], ['sVolume', 'Khối lượng', '#E0962B']] as const;
/** 4 vòng đồng tâm kiểu Apple Fitness: mỗi vòng là một tiêu chí (0–100) */
function Rings({ m, score, color, label }: { m: Score; score: number | string; color: string; label: string }) {
  const W = 7.5, G = 2;
  return <svg viewBox="0 0 120 120" className="pf2-rings" role="img" aria-label={'Điểm hiệu quả ' + score}>
    {RINGS.map(([k, , c], i) => { const r = 54 - i * (W + G); const C = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, m[k] as number));
      return <g key={k}><circle cx="60" cy="60" r={r} fill="none" stroke={c} strokeOpacity=".14" strokeWidth={W} />
        <circle cx="60" cy="60" r={r} fill="none" stroke={c} strokeWidth={W} strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 60 60)" className="pf2-arc" style={{ animationDelay: i * 120 + 'ms' }} /></g>; })}
    <text x="60" y="63" textAnchor="middle" fontSize="18" fontWeight="800" fill={color}>{score}</text>
    <text x="60" y="74" textAnchor="middle" fontSize="6" fontWeight="700" fill="#8A7F6A">{label}</text>
  </svg>;
}

/** Thẻ "Hiệu quả của tôi" – tập trung hiệu quả; phiếu quay chỉ là dòng phụ ở cuối */
export function PerfCard() {
  const { me } = useAuth(); const { data } = usePerf();
  const [pts, setPts] = useState<{ balance: number; earned: number } | null>(null); const [wheel, setWheel] = useState(false); const [more, setMore] = useState(false);
  const loadPts = () => sb.rpc('my_points').then(({ data: d }) => { const r = (d as { balance: number; earned: number }[] | null)?.[0]; setPts(r ?? { balance: 0, earned: 0 }); });
  const [tk, setTk] = useState<TK | null>(null);
  const loadTk = () => sb.rpc('my_tickets').then(({ data: d }) => setTk(d as TK));
  useEffect(() => { loadPts(); loadTk(); }, []);
  const S = useMemo(() => (data ? scoresWithTrend(data) : null), [data]);
  if (!data || !S || !me) return null;
  const m = S.find((s) => s.id === me.id); const cfg = data.cfg;
  const co = S.filter((s) => s.unit === me.unit); const nRank = S.filter((s) => s.ranked).length;
  const ranked = !!m?.ranked; const t = tier(m?.score ?? 0); const isTop = m?.rank === 1;
  const row = (k: typeof RINGS[number][0], name: string, c: string, val: string, mine: number, allV: number, better: 'hi' | 'lo', coTxt: string) => {
    const good = better === 'hi' ? mine >= allV : mine <= allV;
    return <li key={k}><i style={{ background: c }} /><span className="pf2-n">{name}</span><b>{val}</b>
      <span className={'pf2-d ' + (good ? 'up' : 'down')}>{good ? '▲' : '▼'}</span><span className="pf2-avg">{coTxt}</span></li>;
  };
  const tip = !m ? 'Ký hồ sơ đầu tiên để bắt đầu tính điểm.' : m.overdue > 0 ? `Xử lý ${m.overdue} hồ sơ quá hạn để gỡ ${m.overdue * cfg.overdue_penalty} điểm phạt.`
    : !ranked ? `Còn ${cfg.min_steps - m.steps} bước nữa để được xếp hạng.`
    : m.ontime < cfg.crown_ontime ? `Ký trong ${cfg.sla_h} giờ để kéo đúng hạn lên ≥ ${cfg.crown_ontime}%.`
    : m.returned > 0 ? 'Kiểm tra kỹ trước khi ký – bị trả về làm giảm chất lượng.' : isTop ? 'Đang dẫn đầu – giữ phong độ!' : 'Ký nhanh hơn trung bình cùng vai trò để lên hạng.';
  const tickets = tk?.balance ?? 0; const isAdmin = me.roles.includes('admin_it');
  const canSpin = tickets > 0 || (cfg.points_spin !== false && (pts?.balance ?? 0) >= cfg.spin_cost) || isAdmin;
  const td = tk?.today ?? {};
  const wk = m?.weekly ?? [];
  return <section className="card pf2" aria-labelledby="pf-h">
    <header className="pf2-head"><div><h2 id="pf-h">Hiệu quả của tôi</h2><span className="small muted">{cfg.period_days} ngày gần nhất · so với công ty và toàn hệ thống</span></div>
      {ranked && <span className="pf2-tier" style={{ color: t.c, borderColor: t.c }}>{t.t}</span>}</header>
    {!m ? <p className="muted small" style={{ margin: 0 }}>Chưa có dữ liệu trong kỳ.</p> : <>
      <div className="pf2-hero">
        <div className="pf2-rw">
          <Rings m={m} score={ranked ? m.score : m.steps + '/' + cfg.min_steps} color={ranked ? t.c : '#8A7F6A'} label={ranked ? 'ĐIỂM' : 'BƯỚC'} />
          {isTop && <span className={'pf-crown' + (m.crown ? '' : ' off')} title={m.crown ? 'Vương miện' : 'Chưa đủ điều kiện: ' + m.crownWhy.join(', ')}><Icon name="crown" size={20} /></span>}
        </div>
        <ul className="pf2-legend">
          {row('sOntime', 'Đúng hạn', RINGS[0][2], Math.round(m.ontime) + '%', m.ontime, avg(S, 'ontime'), 'hi', 'TB ' + Math.round(avg(S, 'ontime')) + '%')}
          {row('sSpeed', 'Tốc độ', RINGS[1][2], fH(m.avgH), m.avgH, m.roleAvgH, 'lo', 'vai trò ' + fH(m.roleAvgH))}
          {row('sQuality', 'Chất lượng', RINGS[2][2], Math.round(m.quality) + '%', m.quality, avg(S, 'quality'), 'hi', m.returned ? m.returned + ' lần trả về' : 'không bị trả về')}
          {row('sVolume', 'Khối lượng', RINGS[3][2], m.steps + ' bước', m.steps, avg(S, 'steps'), 'hi', 'TB ' + Math.round(avg(S, 'steps')))}
        </ul>
      </div>
      <div className="pf2-stats">
        <div><span>Toàn hệ thống</span><b>{ranked ? <>#{m.rank}<small>/{nRank}</small></> : '—'}</b></div>
        <div><span>{UNIT_NAME[m.unit] ?? m.unit}</span><b>{ranked ? <>#{m.rankCo}<small>/{m.nCo}</small></> : '—'}</b></div>
        <div><span>So kỳ trước</span><b className={m.prev == null ? '' : m.score >= m.prev ? 'up' : 'down'}>{m.prev == null || !ranked ? '—' : (m.score >= m.prev ? '+' : '') + (m.score - m.prev)}</b></div>
      </div>
      {isTop && !m.crown && <div className="pf-warn"><Icon name="crown" size={16} /><span><b>Hạng 1, chưa đủ điều kiện vương miện:</b> {m.crownWhy.join(' · ')}</span></div>}
      {m.overdue > 0 && <div className="pf-warn bad"><Icon name="alert" size={16} /><span>Đang giữ <b>{m.overdue} hồ sơ quá hạn</b> · −{m.overdue * cfg.overdue_penalty} điểm</span></div>}
      {wk.some((v) => v >= 0) && <div className="pf2-week"><div className="pf2-wh"><span className="small muted">Đúng hạn theo tuần</span><span className="small muted">mục tiêu {cfg.crown_ontime}%</span></div>
        <div className="pf2-bars">{wk.map((v, i) => <span key={i} className={v < 0 ? 'nil' : v >= cfg.crown_ontime ? 'ok' : 'lo'}>
          <i style={{ height: (v < 0 ? 4 : Math.max(6, v)) + '%' }}>{v >= 0 && <em>{v}</em>}</i><small>{i === wk.length - 1 ? 'Tuần này' : 'T-' + (wk.length - 1 - i)}</small></span>)}
          <u style={{ bottom: `calc(${cfg.crown_ontime}% * .82 + 18px)` }} /></div></div>}
    </>}
    <div className="pf-tip"><Icon name="flame" size={16} /><span>{tip}</span></div>
    {cfg.wheel_on !== false && <div className="pf2-rew">
      <button className="pf2-rew-row" onClick={() => setMore(!more)} aria-expanded={more}>
        <span className="pf2-tk"><Icon name="ticket" size={15} />{tickets}</span>
        <span className="pf2-rew-t">phiếu quay{(td.tickets ?? 0) > 0 ? <em>+{td.tickets} hôm nay</em> : null}<span className="muted"> · {pts?.balance ?? '…'} điểm thưởng</span></span>
        <Icon name="arrow" size={14} />
      </button>
      <button className="btn sm pf2-spin" onClick={() => setWheel(true)} disabled={!canSpin || !cfg.prizes.length}><Icon name="gift" size={15} />Quay</button>
      {more && <p className="small muted pf2-rule">Mỗi ngày ký ≥ {cfg.tk_min_steps} bước, ≥ {cfg.tk_min_ontime}% đúng hạn → {cfg.tk_base} phiếu · +{cfg.tk_clean_bonus} nếu không bị trả về · +{cfg.tk_top_bonus} nếu top {cfg.tk_top_n} · tối đa {cfg.tk_max_day}/ngày · hạn {cfg.tk_valid_days} ngày.</p>}
    </div>}
    {wheel && createPortal(<Wheel prizes={cfg.prizes} cost={cfg.spin_cost} balance={pts?.balance ?? 0} tickets={tickets} pointsSpin={cfg.points_spin !== false} test={isAdmin && !tickets} onClose={() => { setWheel(false); loadPts(); loadTk(); }} />, document.body)}
  </section>;
}

const WICONS = ['gift', 'star', 'bolt', 'refresh', 'coffee', 'ticket', 'crown', 'check'];
const light = (hex: string) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 170; };
const ICOL = ['#C0392B', '#3F6FCB', '#C49A3C', '#2E7D4F'];
/** Vòng quay may mắn kiểu sân khấu: vành vàng có đèn, kim đỏ, nút QUAY giữa; máy chủ chọn giải, trình duyệt chỉ quay cho đẹp */
export function WheelArt({ prizes, rot, onSpin, busy, disabled, size = 340 }: { prizes: Prize[]; rot: number; onSpin?: () => void; busy?: boolean; disabled?: boolean; size?: number }) {
  const n = Math.max(1, prizes.length); const seg = 360 / n; const R = 40;
  const pt = (a: number, r: number) => [50 + r * Math.cos((a - 90) * Math.PI / 180), 50 + r * Math.sin((a - 90) * Math.PI / 180)];
  const arc = (i: number) => { const [x0, y0] = pt(i * seg, R), [x1, y1] = pt((i + 1) * seg, R); return `M50 50 L${x0} ${y0} A${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${x1} ${y1}Z`; };
  return <div className={'wa' + (busy ? ' spinning' : '')} style={{ width: size, maxWidth: '86vw' }}>
    <svg viewBox="0 0 100 100" className="wa-rim" aria-hidden="true">
      <defs><linearGradient id="wa-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E9C873" /><stop offset=".5" stopColor="#C9A24A" /><stop offset="1" stopColor="#A9802E" /></linearGradient></defs>
      <circle cx="50" cy="50" r="49" fill="url(#wa-g)" /><circle cx="50" cy="50" r="41.6" fill="#1F3A2A" />
      {Array.from({ length: 16 }, (_, i) => { const [x, y] = pt(i * 22.5, 45.3); return <circle key={i} cx={x} cy={y} r="1.7" className={'wa-bulb ' + (i % 2 ? 'b' : 'a')} />; })}
    </svg>
    <svg viewBox="0 0 100 100" className="wa-disc" style={{ transform: `rotate(${rot}deg)` }} aria-hidden="true">
      {prizes.map((p, i) => { const mid = i * seg + seg / 2; const [ix, iy] = pt(mid, 33); const [tx, ty] = pt(mid, 27.2); const lt = light(p.color);
        return <g key={i}>
          <path d={arc(i)} fill={p.color} />
          <circle cx={ix} cy={iy} r="5" fill="#fff" style={{ filter: 'drop-shadow(0 .6px .8px rgba(0,0,0,.25))' }} />
          <g transform={`translate(${ix - 2.8} ${iy - 2.8}) scale(.235)`} fill="none" stroke={ICOL[i % ICOL.length]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATH[p.icon ?? 'gift'] ?? ICON_PATH.gift} /></g>
          <text x={tx} y={ty} fill={lt ? '#1F1C16' : '#fff'} fontSize={n > 8 ? 2.6 : 2.9} fontWeight="800" textAnchor="start" dominantBaseline="middle"
            transform={`rotate(${mid + 90} ${tx} ${ty})`}>{p.label.length > 12 ? p.label.slice(0, 11) + '…' : p.label}</text></g>; })}
    </svg>
    <span className="wa-pin" aria-hidden="true"><i /></span>
    <button className="wa-hub" onClick={onSpin} disabled={!onSpin || busy || disabled} aria-label="Quay">{busy ? '…' : 'QUAY'}</button>
  </div>;
}

type TK = { balance: number; earned: number; used: number; today: { steps?: number; ontime?: number; tickets?: number; top_rank?: number }; days: { day: string; steps: number; ontime: number; tickets: number }[] };
export function Wheel({ prizes, cost, balance, tickets, pointsSpin, test, onClose, onSpun }: { prizes: Prize[]; cost: number; balance: number; tickets: number; pointsSpin: boolean; test?: boolean;
  onClose: () => void; onSpun?: (b: number, t: number) => void }) {
  const { can } = useAuth(); const isAdmin = can('admin_it');
  const [rot, setRot] = useState(0); const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ prize: string; bonus: number; kind: string } | null>(null);
  const [bal, setBal] = useState(balance); const [tk, setTk] = useState(tickets); const [testMode, setTestMode] = useState(!!test); const [n, setN] = useState(0);
  const seg = 360 / prizes.length;
  const can_ = testMode || tk > 0 || (pointsSpin && bal >= cost);
  const spin = async () => {
    setBusy(true); setRes(null);
    const { data, error } = await sb.rpc('spin_wheel', { p_test: testMode });
    if (error) { toast(error.message); setBusy(false); return; }
    const d = data as { index: number; prize: string; bonus: number; balance: number; tickets: number; kind: string };
    const jitter = (Math.random() - .5) * seg * .6;
    setRot((r) => r - (r % 360) + 360 * 7 + (360 - (d.index * seg + seg / 2)) + jitter);
    setTimeout(() => { setRes({ prize: d.prize, bonus: d.bonus, kind: d.kind }); setBal(d.balance); setTk(d.tickets); setN((x) => x + 1); onSpun?.(d.balance, d.tickets); setBusy(false); }, 5200);
  };
  return <div className="sw-sheet-bg wh-bg" onClick={() => !busy && onClose()}>
    <div className="wh" role="dialog" aria-modal="true" aria-label="Vòng quay may mắn" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><span className="wh-title"><Icon name="gift" size={18} />Vòng quay may mắn</span><button className="btn sm icon-btn" onClick={onClose} disabled={busy} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <div className="wh-bal">
        <span className="wh-chip tk"><Icon name="ticket" size={14} /><b>{tk}</b> phiếu</span>
        <span className="wh-chip"><Icon name="star" size={14} /><b>{bal}</b> điểm</span>
        {isAdmin && <button role="switch" aria-checked={testMode} className={'pp-sw' + (testMode ? ' on' : '')} onClick={() => setTestMode(!testMode)} disabled={busy}><i />Quay thử</button>}
      </div>
      <WheelArt prizes={prizes} rot={rot} onSpin={spin} busy={busy} disabled={!can_} />
      <div className={'wh-res' + (res ? ' on' : '')} aria-live="polite">{res ? <><span className="wh-confetti" aria-hidden="true" key={n} />{res.kind === 'test' ? 'Thử: ' : 'Bạn trúng '}<b>{res.prize}</b>{res.bonus > 0 && <em>+{res.bonus} điểm</em>}</>
        : busy ? 'Chúc may mắn…' : testMode ? 'Chế độ quay thử – không trừ phiếu, không trao giải' : !can_ ? 'Chưa có phiếu quay – làm đúng hạn hôm nay để nhận' : tk > 0 ? 'Mỗi lượt dùng 1 phiếu' : `Mỗi lượt ${cost} điểm`}</div>
      {testMode && <div className="wh-fast"><span className="small muted">Đã quay thử {n} lượt</span>
        <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); for (let i = 0; i < 20; i++) { const { error } = await sb.rpc('spin_wheel', { p_test: true }); if (error) { toast(error.message); break; } }
          setN((x) => x + 20); setBusy(false); toast('Đã quay nhanh 20 lượt – xem tỉ lệ thực tế trong Quản trị'); }}><Icon name="refresh" size={15} />Quay nhanh ×20</button></div>}
      {!testMode && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Giải được ghi lại để quản trị trao thưởng.</p>}
    </div></div>;
}

/** Bảng xếp hạng cho giám đốc / admin */
export function Leaderboard() {
  const { data } = usePerf(); const [co, setCo] = useState(''); const [open, setOpen] = useState<string | null>(null);
  const S = useMemo(() => (data ? scoresWithTrend(data) : []), [data]);
  if (!data) return null;
  const units = [...new Set(S.map((s) => s.unit))]; const list = S.filter((s) => !co || s.unit === co);
  return <div className="lb">
    <div className="adm-chips"><button className={'pill-toggle' + (!co ? ' on' : '')} onClick={() => setCo('')}>Tất cả</button>
      {units.map((u) => <button key={u} className={'pill-toggle' + (co === u ? ' on' : '')} onClick={() => setCo(u)}>{UNIT_NAME[u] ?? u}</button>)}</div>
    <ol className="lb-list">{list.map((s) => { const t = tier(s.score); const on = open === s.id; return <li key={s.id} className={on ? 'on' : ''}>
      <button className="lb-row" onClick={() => setOpen(on ? null : s.id)} aria-expanded={on}>
        <span className={'lb-rank r' + s.rank}>{s.ranked ? (s.rank === 1 && s.crown ? <Icon name="crown" size={16} /> : '#' + s.rank) : '—'}</span>
        <span className="lb-name"><b>{s.name}</b><span className="small muted">{UNIT_NAME[s.unit] ?? s.unit} · {s.steps} bước</span></span>
        {s.overdue > 0 && <span className="chip bad">{s.overdue} quá hạn</span>}
        <span className="lb-sc" style={{ color: t.c }}>{s.ranked ? s.score : '—'}{s.ranked && s.prev != null && <em className={s.score >= s.prev ? 'up' : 'down'}>{s.score >= s.prev ? '▲' : '▼'}{Math.abs(s.score - s.prev)}</em>}</span>
      </button>
      {on && <div className="lb-det">
        {([['Đúng hạn', s.sOntime, Math.round(s.ontime) + '%'], ['Tốc độ', s.sSpeed, fH(s.avgH) + ' (vai trò ' + fH(s.roleAvgH) + ')'], ['Chất lượng', s.sQuality, s.returned + ' lần bị trả về'], ['Khối lượng', s.sVolume, s.steps + ' bước']] as const).map(([l, v, d]) =>
          <div key={l} className="lb-m"><span>{l}</span><span className="db-ht"><i style={{ width: v + '%', background: v >= 70 ? '#2E8B57' : v >= 50 ? '#C9A24A' : '#D4513A' }} /></span><span className="small">{d}</span></div>)}
        {s.rank === 1 && !s.crown && <p className="small" style={{ color: '#9F2A12', margin: 0 }}>Chưa đủ điều kiện vương miện: {s.crownWhy.join(' · ')}</p>}
        {!s.ranked && <p className="small muted" style={{ margin: 0 }}>Chưa đủ {data.cfg.min_steps} bước để xếp hạng.</p>}
      </div>}
    </li>; })}</ol>
  </div>;
}

/** Quản trị → Hiệu quả & thưởng */
export function PerfAdmin({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = usePerf(); const [c, setC] = useState<PerfCfg | null>(null); const [busy, setBusy] = useState(false);
  const [spins, setSpins] = useState<{ id: number; user_id: string; prize: string; cost: number; at: string }[]>([]);
  const first = useRef(true); const [prev, setPrev] = useState(0); const [tw, setTw] = useState(false);
  useEffect(() => { if (data && first.current) { setC(data.cfg); first.current = false; } }, [data]);
  const loadSpins = () => sb.from('perf_spins').select('*').order('at', { ascending: false }).limit(200).then(({ data: d }) => setSpins((d as never[]) ?? []));
  useEffect(() => { loadSpins(); }, []);
  if (!c || !data) return <p className="muted">Đang tải…</p>;
  const set = <K extends keyof PerfCfg>(k: K, v: PerfCfg[K]) => setC({ ...c, [k]: v });
  const wsum = c.w_ontime + c.w_speed + c.w_quality + c.w_volume;
  const dirty = JSON.stringify(c) !== JSON.stringify(data.cfg);
  const save = async () => { setBusy(true); const { error } = await sb.rpc('set_perf_config', { p_cfg: c }); setBusy(false); if (error) toast(error.message); else { toast('Đã lưu cấu hình'); reload(); } };
  const num = (k: keyof PerfCfg, label: string, unit: string, hint?: string, step = 1) => <label className="pa-f"><span>{label}</span>
    <span className="pa-in"><input type="number" step={step} value={c[k] as number} disabled={!canEdit} onChange={(e) => set(k, +e.target.value as never)} /><em>{unit}</em></span>{hint && <small>{hint}</small>}</label>;
  const W = [['w_ontime', 'Đúng hạn', '#2E8B57'], ['w_speed', 'Tốc độ', '#2F6FB0'], ['w_quality', 'Chất lượng', '#7A4DB3'], ['w_volume', 'Khối lượng', '#C9A24A']] as const;
  const totW = Math.max(1, c.prizes.reduce((a, p) => a + p.weight, 0));
  const names = Object.fromEntries(data.people.map((p) => [p.id, p.full_name]));
  return <div className="pa">
    <section className="pa-card"><header><h3><Icon name="chart" size={18} />Công thức điểm hiệu quả</h3><span className={'chip ' + (wsum === 100 ? 'done' : 'warn')}>Tổng trọng số {wsum}%</span></header>
      <div className="pa-wbar">{W.map(([k, l, col]) => <i key={k} style={{ flexGrow: c[k], background: col }} title={l + ' ' + c[k] + '%'}>{c[k] >= 10 && <span>{l} {c[k]}%</span>}</i>)}</div>
      <div className="pa-sliders">{W.map(([k, l, col]) => <label key={k} className="pa-sl"><span><i style={{ background: col }} />{l}</span>
        <input type="range" min={0} max={100} value={c[k]} disabled={!canEdit} onChange={(e) => set(k, +e.target.value)} style={{ accentColor: col }} /><b>{c[k]}%</b></label>)}</div>
      <div className="pa-grid">
        {num('period_days', 'Kỳ đánh giá', 'ngày')}{num('sla_h', 'Hạn mỗi bước', 'giờ', 'Quá hạn khi giữ lâu hơn')}
        {num('overdue_penalty', 'Phạt mỗi hồ sơ quá hạn', 'điểm', 'Trừ thẳng vào điểm')}{num('min_steps', 'Tối thiểu để xếp hạng', 'bước')}
        {num('volume_cap', 'Trần khối lượng', '× TB', 'Làm nhiều hơn mức này không cộng thêm', 0.1)}
      </div></section>
    <section className="pa-card"><header><h3><Icon name="crown" size={18} />Điều kiện vương miện</h3></header>
      <p className="small muted" style={{ marginTop: 0 }}>Người hạng 1 chỉ được vương miện khi đạt <b>tất cả</b> điều kiện dưới đây và không giữ hồ sơ quá hạn nào.</p>
      <div className="pa-grid">{num('crown_ontime', 'Đúng hạn tối thiểu', '%')}{num('crown_min_steps', 'Số bước tối thiểu', 'bước')}</div></section>
    <section className="pa-card"><header><h3><Icon name="star" size={18} />Điểm thưởng</h3></header>
      <div className="pa-grid">{num('pts_ontime', 'Mỗi bước ký đúng hạn', 'điểm')}{num('pts_late', 'Mỗi bước ký trễ', 'điểm')}
        {num('pts_fast', 'Thưởng ký nhanh', 'điểm')}{num('fast_h', 'Nhanh khi dưới', 'giờ')}{num('pts_returned', 'Bị trả về', 'điểm', 'Số âm = trừ')}{num('spin_cost', 'Giá mỗi lượt quay', 'điểm')}</div></section>
    <section className="pa-card"><header><h3><Icon name="ticket" size={18} />Phiếu quay theo hiệu quả hằng ngày</h3>
      <button role="switch" aria-checked={c.tk_on !== false} className={'pp-sw' + (c.tk_on !== false ? ' on' : '')} disabled={!canEdit} onClick={() => set('tk_on', c.tk_on === false)}><i />{c.tk_on !== false ? 'Đang bật' : 'Đang tắt'}</button></header>
      <div className="pa-rule"><b>Mỗi ngày</b>, ai ký ≥ <em>{c.tk_min_steps}</em> bước và đúng hạn ≥ <em>{c.tk_min_ontime}%</em> nhận <em>{c.tk_base}</em> phiếu
        · +<em>{c.tk_clean_bonus}</em> nếu không bị trả về · +<em>{c.tk_top_bonus}</em> nếu vào top <em>{c.tk_top_n}</em> của ngày · tối đa <em>{c.tk_max_day}</em> phiếu/ngày · phiếu dùng trong <em>{c.tk_valid_days}</em> ngày.</div>
      <div className="pa-grid">{num('tk_min_steps', 'Số bước tối thiểu / ngày', 'bước')}{num('tk_min_ontime', 'Đúng hạn tối thiểu', '%')}{num('tk_base', 'Phiếu cơ bản', 'phiếu')}
        {num('tk_clean_bonus', 'Thưởng không bị trả về', 'phiếu')}{num('tk_top_n', 'Top trong ngày', 'người')}{num('tk_top_bonus', 'Thưởng top', 'phiếu')}
        {num('tk_max_day', 'Tối đa mỗi ngày', 'phiếu')}{num('tk_valid_days', 'Hạn dùng phiếu', 'ngày')}</div>
      <label className="pa-chk"><input type="checkbox" checked={c.points_spin !== false} disabled={!canEdit} onChange={(e) => set('points_spin', e.target.checked)} />Cho phép đổi <b>{c.spin_cost} điểm thưởng</b> lấy 1 lượt khi hết phiếu</label>
    </section>
    <section className="pa-card"><header><h3><Icon name="gift" size={18} />Vòng quay may mắn</h3>
      <button role="switch" aria-checked={c.wheel_on !== false} className={'pp-sw' + (c.wheel_on !== false ? ' on' : '')} disabled={!canEdit} onClick={() => set('wheel_on', c.wheel_on === false)}><i />{c.wheel_on !== false ? 'Đang bật' : 'Đang tắt'}</button></header>
      <p className="small muted" style={{ margin: 0 }}>Tắt thì nút “Quay thưởng” ẩn với mọi người. Bấm QUAY ở bản xem trước để xem hiệu ứng; bấm <b>Quay thử thật</b> để máy chủ quay liên tục theo tỉ lệ đã lưu (không trừ phiếu, không trao giải).</p>
      {canEdit && <div className="pa-ph"><span /><button className="btn sm" onClick={() => setTw(true)}><Icon name="refresh" size={16} />Quay thử thật</button></div>}
      {tw && createPortal(<Wheel prizes={data.cfg.prizes} cost={data.cfg.spin_cost} balance={0} tickets={0} pointsSpin={false} test onClose={() => { setTw(false); loadSpins(); }} />, document.body)}
      <div className="pa-wprev"><WheelArt prizes={c.prizes.length ? c.prizes : [{ label: 'Thêm giải', weight: 1, color: '#F7F0E1' }]} rot={prev} onSpin={() => setPrev((r) => r + 1440 + Math.random() * 360)} size={260} /></div>
      <div className="pa-ph"><b>Danh sách giải</b>{canEdit && <button className="btn sm" onClick={() => set('prizes', [...c.prizes, { label: 'Giải mới', weight: 10, color: c.prizes.length % 2 ? '#3F6FCB' : '#F7F0E1', icon: 'gift' }])}><Icon name="plus" size={16} />Thêm giải</button>}</div>
      <div className="pa-prizes">
        <svg viewBox="0 0 42 42" className="pa-donut" aria-hidden="true">{(() => { let acc = 0; return c.prizes.map((p, i) => { const v = (p.weight / totW) * 100; const el = <circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={p.color} strokeWidth="7" strokeDasharray={v + ' ' + (100 - v)} strokeDashoffset={25 - acc} />; acc += v; return el; }); })()}</svg>
        <ul>{c.prizes.map((p, i) => <li key={i}>
          <input type="color" value={p.color} disabled={!canEdit} onChange={(e) => set('prizes', c.prizes.map((x, j) => j === i ? { ...x, color: e.target.value } : x))} aria-label="Màu" />
          <select className="pa-ic" value={p.icon ?? 'gift'} disabled={!canEdit} onChange={(e) => set('prizes', c.prizes.map((x, j) => j === i ? { ...x, icon: e.target.value } : x))} aria-label="Biểu tượng">
            {WICONS.map((k) => <option key={k} value={k}>{({ gift: 'Quà', star: 'Sao', bolt: 'Tia sét', refresh: 'Quay lại', coffee: 'Cà phê', ticket: 'Vé', crown: 'Vương miện', check: 'Dấu tích' } as Record<string, string>)[k]}</option>)}</select>
          <input className="pa-pl" value={p.label} disabled={!canEdit} onChange={(e) => set('prizes', c.prizes.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} aria-label="Tên giải" />
          <span className="pa-in sm"><input type="number" min={0} value={p.weight} disabled={!canEdit} onChange={(e) => set('prizes', c.prizes.map((x, j) => j === i ? { ...x, weight: +e.target.value } : x))} aria-label="Tỉ trọng" /><em>{Math.round((p.weight / totW) * 100)}%</em></span>
          <span className="pa-in sm" title="Điểm cộng ngay khi trúng (0 = quà hiện vật)"><input type="number" value={p.points ?? 0} disabled={!canEdit} onChange={(e) => set('prizes', c.prizes.map((x, j) => j === i ? { ...x, points: +e.target.value } : x))} aria-label="Điểm cộng" /><em>+điểm</em></span>
          {canEdit && <button className="btn sm icon-btn" onClick={() => set('prizes', c.prizes.filter((_, j) => j !== i))} aria-label="Bỏ giải"><Icon name="x" size={16} /></button>}</li>)}</ul>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Cột <b>%</b> là tỉ lệ trúng. <b>+điểm</b>: số điểm cộng ngay cho người trúng (0 = quà hiện vật, quản trị trao tay). Giải tên “Quay lại” hoàn lại điểm lượt quay.</p></section>
    {canEdit && <div className="pa-save"><span className="small muted">{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}{wsum !== 100 && ' · nên để tổng trọng số = 100%'}</span>
      <button className="btn" onClick={() => setC(data.cfg)} disabled={!dirty || busy}>Hoàn tác</button>
      <button className="btn" onClick={() => setC({ ...DEFAULT_CFG, prizes: c.prizes })} disabled={busy}>Mặc định</button>
      <button className="btn primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>}
    <section className="pa-card"><header><h3><Icon name="list" size={18} />Lượt quay gần đây</h3></header>
      {(() => { const t = spins.filter((x) => (x as { kind?: string }).kind === 'test'); if (!t.length) return null;
        const cnt: Record<string, number> = {}; t.forEach((x) => { cnt[x.prize] = (cnt[x.prize] ?? 0) + 1; }); const tw2 = Math.max(1, c.prizes.reduce((a, p) => a + p.weight, 0));
        return <div className="pa-test"><b className="small">Kết quả quay thử ({t.length} lượt) – thực tế so với tỉ lệ cài đặt</b>
          {c.prizes.map((p) => { const v = ((cnt[p.label] ?? 0) / t.length) * 100; return <div key={p.label} className="lb-m"><span>{p.label}</span><span className="db-ht"><i style={{ width: v + '%', background: p.color === '#F7F0E1' ? '#C9A24A' : p.color }} /></span><span className="small">{Math.round(v)}% / {Math.round((p.weight / tw2) * 100)}%</span></div>; })}</div>; })()}
      {spins.filter((x) => (x as { kind?: string }).kind !== 'test').length ? <ul className="pa-hist">{spins.filter((x) => (x as { kind?: string }).kind !== 'test').slice(0, 30).map((s) => <li key={s.id}><b>{names[s.user_id] ?? '?'}</b><span>{s.prize}</span><span className="small muted">{new Date(s.at).toLocaleString('vi-VN')}</span></li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>Chưa có ai quay.</p>}</section>
  </div>;
}
