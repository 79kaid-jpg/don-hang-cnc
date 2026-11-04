import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { usePerf, scoresWithTrend, UNIT_NAME, DEFAULT_CFG, type PerfCfg, type Prize, type Score } from '../lib/perf';
import { Icon, PATHS as ICON_PATH } from './Icon';
import { toast } from './ui';

const tier = (s: number) => (s >= 85 ? { t: 'Xuất sắc', c: '#2E8B57' } : s >= 70 ? { t: 'Tốt', c: '#7E6024' } : s >= 50 ? { t: 'Khá', c: '#B4690E' } : { t: 'Cần cải thiện', c: '#C2410C' });
const fH = (h: number) => (h < 1 ? Math.round(h * 60) + ' phút' : h < 48 ? h.toFixed(1).replace('.0', '') + ' giờ' : (h / 24).toFixed(1) + ' ngày');
const avg = (l: Score[], k: keyof Score) => { const v = l.filter((s) => s.ranked).map((s) => s[k] as number); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0; };

function Ring({ v, c, size = 112 }: { v: number; c: string; size?: number }) {
  const r = 46, C = 2 * Math.PI * r;
  return <svg viewBox="0 0 100 100" width={size} height={size} className="pf-ring" role="img" aria-label={'Điểm ' + v}>
    <circle cx="50" cy="50" r={r} fill="none" stroke="#EFE9DC" strokeWidth="8" />
    <circle cx="50" cy="50" r={r} fill="none" stroke={c} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 50 50)" className="pf-ring-v" />
    <text x="50" y="50" textAnchor="middle" fontSize="28" fontWeight="800" fill="currentColor">{v}</text>
    <text x="50" y="66" textAnchor="middle" fontSize="10" fill="#8A7F6A">điểm</text></svg>;
}

/** Thẻ "Hiệu quả của tôi" ở trang chủ: điểm, hạng, so sánh với công ty & hệ thống, xu hướng, gợi ý, điểm thưởng & vòng quay */
export function PerfCard() {
  const { me } = useAuth(); const { data } = usePerf();
  const [pts, setPts] = useState<{ balance: number; earned: number } | null>(null); const [wheel, setWheel] = useState(false);
  const loadPts = () => sb.rpc('my_points').then(({ data: d }) => { const r = (d as { balance: number; earned: number }[] | null)?.[0]; setPts(r ?? { balance: 0, earned: 0 }); });
  useEffect(() => { loadPts(); }, []);
  const S = useMemo(() => (data ? scoresWithTrend(data) : null), [data]);
  if (!data || !S || !me) return null;
  const m = S.find((s) => s.id === me.id); const cfg = data.cfg;
  const co = S.filter((s) => s.unit === me.unit); const nRank = S.filter((s) => s.ranked).length;
  const t = tier(m?.score ?? 0); const isTop = m?.rank === 1;
  const metric = (label: string, ic: string, mine: number, coV: number, allV: number, fmt: (v: number) => string, better: 'hi' | 'lo') => {
    const good = better === 'hi' ? mine >= allV : mine <= allV; const pct = better === 'hi' ? Math.min(100, mine) : Math.min(100, (allV ? (allV / Math.max(mine, .01)) * 50 : 50));
    return <div className="pf-m"><span className="pf-ml"><Icon name={ic} size={15} />{label}</span>
      <span className="pf-mv"><b>{fmt(mine)}</b><em className={good ? 'up' : 'down'}><Icon name={good ? 'check' : 'alert'} size={11} />{good ? 'tốt hơn TB' : 'dưới TB'}</em></span>
      <span className="pf-mb"><i style={{ width: pct + '%', background: good ? '#2E8B57' : '#D4A017' }} />
        <u style={{ left: (better === 'hi' ? Math.min(100, coV) : 50) + '%' }} title={'Công ty: ' + fmt(coV)} />
        <s style={{ left: (better === 'hi' ? Math.min(100, allV) : 50) + '%' }} title={'Hệ thống: ' + fmt(allV)} /></span>
      <span className="pf-mc small muted">Công ty {fmt(coV)} · Hệ thống {fmt(allV)}</span></div>;
  };
  const tip = !m ? 'Bắt đầu xử lý hồ sơ để có điểm.' : m.overdue > 0 ? `Xử lý ${m.overdue} hồ sơ đang quá hạn để gỡ ${m.overdue * cfg.overdue_penalty} điểm phạt.`
    : m.ontime < cfg.crown_ontime ? `Ký trong ${cfg.sla_h} giờ để tăng tỉ lệ đúng hạn (đang ${Math.round(m.ontime)}%).`
    : m.returned > 0 ? 'Kiểm tra kỹ trước khi ký để không bị trả về.' : isTop ? 'Giữ phong độ để giữ vương miện!' : 'Ký nhanh hơn trung bình cùng vai trò để lên hạng.';
  const tickets = pts ? Math.floor(pts.balance / Math.max(1, cfg.spin_cost)) : 0;
  return <section className="card pf" aria-labelledby="pf-h">
    <div className="pf-head"><h2 id="pf-h">Hiệu quả của tôi</h2><span className="small muted">{cfg.period_days} ngày gần nhất</span></div>
    {!m || !m.ranked ? <p className="muted small">Chưa đủ dữ liệu để xếp hạng (cần ít nhất {cfg.min_steps} bước đã ký trong kỳ{m ? `, bạn đang có ${m.steps}` : ''}).</p> : <>
      <div className="pf-top">
        <div className="pf-score" style={{ color: t.c }}><Ring v={m.score} c={t.c} />{isTop && <span className={'pf-crown' + (m.crown ? '' : ' off')} title={m.crown ? 'Vương miện' : 'Chưa đủ điều kiện: ' + m.crownWhy.join(', ')}><Icon name="crown" size={22} /></span>}</div>
        <div className="pf-rank">
          <span className="pf-tier" style={{ background: t.c }}>{t.t}</span>
          <div className="pf-rk"><b>#{m.rank}</b><span>/{nRank} toàn hệ thống</span></div>
          <div className="pf-rk sm"><b>#{m.rankCo}</b><span>/{m.nCo} tại {UNIT_NAME[m.unit] ?? m.unit}</span></div>
          {m.prev != null && <span className={'pf-trend ' + (m.score >= m.prev ? 'up' : 'down')}><Icon name={m.score >= m.prev ? 'up' : 'down'} size={13} />{m.score >= m.prev ? '+' : ''}{m.score - m.prev} điểm so với kỳ trước</span>}
        </div>
      </div>
      {isTop && !m.crown && <div className="pf-warn"><Icon name="crown" size={16} /><span><b>Hạng 1 nhưng chưa đủ điều kiện vương miện:</b> {m.crownWhy.join(' · ')}</span></div>}
      {m.overdue > 0 && <div className="pf-warn bad"><Icon name="alert" size={16} /><span>Đang giữ <b>{m.overdue} hồ sơ quá hạn</b> · trừ {m.overdue * cfg.overdue_penalty} điểm</span></div>}
      <div className="pf-ms">
        {metric('Đúng hạn', 'clock', m.ontime, avg(co, 'ontime'), avg(S, 'ontime'), (v) => Math.round(v) + '%', 'hi')}
        {metric('Tốc độ', 'run', m.avgH, avg(co, 'avgH'), avg(S, 'avgH'), fH, 'lo')}
        {metric('Chất lượng', 'check', m.quality, avg(co, 'quality'), avg(S, 'quality'), (v) => Math.round(v) + '%', 'hi')}
        {metric('Khối lượng', 'list', m.steps, avg(co, 'steps'), avg(S, 'steps'), (v) => Math.round(v) + ' bước', 'hi')}
      </div>
      <div className="pf-legend small muted"><span><i className="u" />TB công ty</span><span><i className="s" />TB hệ thống</span></div>
      <Spark weekly={m.weekly} />
    </>}
    <div className="pf-tip"><Icon name="flame" size={16} /><span>{tip}</span></div>
    {cfg.wheel_on !== false && <div className="pf-pts">
      <div className="pf-coin"><Icon name="star" size={20} /></div>
      <div className="pf-pts-t"><b>{pts?.balance ?? '…'} điểm thưởng</b><span className="small muted">{tickets} lượt quay · {cfg.spin_cost} điểm / lượt · +{cfg.pts_ontime} mỗi bước đúng hạn</span></div>
      <button className="btn primary pf-spin" onClick={() => setWheel(true)} disabled={!tickets || !cfg.prizes.length}><Icon name="gift" size={18} />Quay thưởng</button>
    </div>}
    {wheel && createPortal(<Wheel prizes={cfg.prizes} cost={cfg.spin_cost} balance={pts?.balance ?? 0} onClose={() => { setWheel(false); loadPts(); }} onSpun={(b) => setPts((p) => p && { ...p, balance: b })} />, document.body)}
  </section>;
}

function Spark({ weekly }: { weekly: number[] }) {
  const pts = weekly.map((v, i) => ({ x: 8 + i * 37, y: v < 0 ? null : 50 - (v / 100) * 40, v })).filter((p) => p.y != null) as { x: number; y: number; v: number }[];
  if (pts.length < 2) return null;
  return <div className="pf-spark"><span className="small muted">Tỉ lệ đúng hạn 6 tuần</span>
    <svg viewBox="0 0 200 56" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="200" y1={50 - 36} y2={50 - 36} stroke="#E3DCCB" strokeDasharray="3 3" />
      <polyline points={pts.map((p) => p.x + ',' + p.y).join(' ')} fill="none" stroke="#7E6024" strokeWidth="2.5" strokeLinejoin="round" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 2.5} fill={i === pts.length - 1 ? '#7E6024' : '#fff'} stroke="#7E6024" strokeWidth="1.5" />)}
    </svg></div>;
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

function Wheel({ prizes, cost, balance, onClose, onSpun }: { prizes: Prize[]; cost: number; balance: number; onClose: () => void; onSpun: (b: number) => void }) {
  const [rot, setRot] = useState(0); const [busy, setBusy] = useState(false); const [res, setRes] = useState<{ prize: string; bonus: number } | null>(null); const [bal, setBal] = useState(balance);
  const seg = 360 / prizes.length;
  const spin = async () => {
    setBusy(true); setRes(null);
    const { data, error } = await sb.rpc('spin_wheel');
    if (error) { toast(error.message); setBusy(false); return; }
    const d = data as { index: number; prize: string; bonus: number; balance: number };
    const jitter = (Math.random() - .5) * seg * .6;
    setRot((r) => r - (r % 360) + 360 * 7 + (360 - (d.index * seg + seg / 2)) + jitter);
    setTimeout(() => { setRes({ prize: d.prize, bonus: d.bonus }); setBal(d.balance); onSpun(d.balance); setBusy(false); }, 5200);
  };
  return <div className="sw-sheet-bg wh-bg" onClick={() => !busy && onClose()}>
    <div className="wh" role="dialog" aria-modal="true" aria-label="Vòng quay may mắn" onClick={(e) => e.stopPropagation()}>
      <div className="mv-head"><span className="wh-title"><Icon name="gift" size={18} />Vòng quay may mắn</span><button className="btn sm icon-btn" onClick={onClose} disabled={busy} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
      <div className="wh-bal"><span className="pf-coin sm"><Icon name="star" size={14} /></span><b>{bal}</b> điểm<span className="muted"> · {Math.floor(bal / Math.max(1, cost))} lượt · {cost} điểm/lượt</span></div>
      <WheelArt prizes={prizes} rot={rot} onSpin={spin} busy={busy} disabled={bal < cost} />
      <div className={'wh-res' + (res ? ' on' : '')} aria-live="polite">{res ? <><span className="wh-confetti" aria-hidden="true" />Bạn trúng <b>{res.prize}</b>{res.bonus > 0 && <em>+{res.bonus} điểm</em>}</> : busy ? 'Chúc may mắn…' : bal < cost ? 'Chưa đủ điểm để quay' : 'Bấm QUAY ở giữa vòng'}</div>
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Giải được ghi lại để quản trị trao thưởng.</p>
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
  const first = useRef(true); const [prev, setPrev] = useState(0);
  useEffect(() => { if (data && first.current) { setC(data.cfg); first.current = false; } }, [data]);
  useEffect(() => { sb.from('perf_spins').select('*').order('at', { ascending: false }).limit(30).then(({ data: d }) => setSpins((d as never[]) ?? [])); }, []);
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
    <section className="pa-card"><header><h3><Icon name="gift" size={18} />Vòng quay may mắn</h3>
      <button role="switch" aria-checked={c.wheel_on !== false} className={'pp-sw' + (c.wheel_on !== false ? ' on' : '')} disabled={!canEdit} onClick={() => set('wheel_on', c.wheel_on === false)}><i />{c.wheel_on !== false ? 'Đang bật' : 'Đang tắt'}</button></header>
      <p className="small muted" style={{ margin: 0 }}>Tắt thì nút “Quay thưởng” ẩn với mọi người, điểm thưởng vẫn được cộng. Bấm QUAY ở bản xem trước để thử hiệu ứng (không trừ điểm).</p>
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
      {spins.length ? <ul className="pa-hist">{spins.map((s) => <li key={s.id}><b>{names[s.user_id] ?? '?'}</b><span>{s.prize}</span><span className="small muted">{new Date(s.at).toLocaleString('vi-VN')}</span></li>)}</ul> : <p className="small muted" style={{ margin: 0 }}>Chưa có ai quay.</p>}</section>
  </div>;
}
