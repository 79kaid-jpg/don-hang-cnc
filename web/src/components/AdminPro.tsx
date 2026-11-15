import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, errText, type Profile } from '../lib/supabase';
import { COMPANY, ROLE_NAME, STATUS, type Company } from '../lib/proc';
import { Icon } from './Icon';
import { confirmDialog, toast } from './ui';

const RN = (r: string) => ROLE_NAME[r] ?? r;
const CN = (c: string) => COMPANY[c as Company] ?? c;
const ago = (s: string) => { const d = (Date.now() - new Date(s).getTime()) / 864e5; return d >= 1 ? Math.floor(d) + ' ngày' : Math.max(1, Math.floor(d * 24)) + ' giờ'; };

/* ───────── 1. Sức khoẻ hệ thống ───────── */
type Health = { missing: { proc: string; company: string; role: string }[]; locked: { proc: string; company: string; role: string; user: string; user_id: string; via: string | null }[];
  no_zalo: { id: string; name: string; unit: string }[]; stuck: { doc: string; order: string; code: string; project: string; proc: string; company: string; status: string; since: string }[]; days: number };
type TplBad = { id: string; name: string; proc: string; company: string | null; version: number; bad: string[] };
async function tplCheck(): Promise<TplBad[]> {
  const { data } = await sb.from('print_templates').select('*').eq('active', true); const out: TplBad[] = [];
  const { scanVars, varList } = await import('../lib/xlsxTpl');
  for (const t of (data as { id: string; name: string; proc: string; company: string | null; version: number; path: string; vars: string[] }[]) ?? []) {
    let vars = t.vars ?? []; if (!vars.length) { const f = await sb.storage.from('files').download(t.path); if (f.data) vars = await scanVars(await f.data.arrayBuffer()); }
    const known = new Set(varList(t.proc as never).map((v) => v.k)); const bad = vars.filter((v) => !known.has(v));
    if (bad.length) out.push({ id: t.id, name: t.name, proc: t.proc, company: t.company, version: t.version, bad }); }
  return out;
}
export function HealthAdmin({ go }: { go: (tab: string) => void }) {
  const [tb, setTb] = useState<TplBad[] | null>(null);
  useEffect(() => { tplCheck().then(setTb).catch(() => setTb([])); }, []);
  const [days, setDays] = useState(3); const [h, setH] = useState<Health | null>(null); const [err, setErr] = useState(''); const [open, setOpen] = useState<string>('');
  const load = () => sb.rpc('admin_health', { p_days: days }).then(({ data, error }) => { if (error) setErr(errText(error)); else { setErr(''); setH(data as Health); } });
  useEffect(() => { load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <p className="msg err">{err}</p>;
  if (!h) return <p className="muted">Đang kiểm tra…</p>;
  const cards: { k: string; t: string; n: number; tone: 'bad' | 'warn' | 'ok'; sub: string }[] = [
    { k: 'missing', t: 'Bước không có người phụ trách', n: h.missing.length, tone: h.missing.length ? 'bad' : 'ok', sub: 'Phiếu tới bước này sẽ không ai nhận' },
    { k: 'locked', t: 'Tài khoản đã khoá vẫn được giao', n: h.locked.length, tone: h.locked.length ? 'warn' : 'ok', sub: 'Nên gỡ khỏi Phụ trách quy trình' },
    { k: 'stuck', t: 'Phiếu kẹt quá ' + h.days + ' ngày', n: h.stuck.length, tone: h.stuck.length ? 'warn' : 'ok', sub: 'Chưa chuyển bước (không tính đơn [MẪU])' },
    { k: 'tpl', t: 'Mẫu in dùng biến không có', n: tb?.length ?? 0, tone: tb === null ? 'ok' : tb.length ? 'warn' : 'ok', sub: tb === null ? 'Đang kiểm tra…' : 'Ô đó sẽ để trống khi in' },
    { k: 'no_zalo', t: 'Người dùng chưa nối Zalo', n: h.no_zalo.length, tone: h.no_zalo.length ? 'warn' : 'ok', sub: 'Sẽ không nhận được nhắc việc' }];
  return <div className="hl">
    <div className="hl-top"><span className="small muted">Kiểm tra lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
      <label className="small">Kẹt quá <select value={days} onChange={(e) => setDays(+e.target.value)}>{[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} ngày</option>)}</select></label>
      <button className="btn sm" onClick={load}><Icon name="refresh" size={14} />Kiểm tra lại</button></div>
    <div className="hl-cards">{cards.map((c) => <button key={c.k} type="button" className={'hl-card ' + c.tone + (open === c.k ? ' on' : '')} aria-expanded={open === c.k} onClick={() => setOpen(open === c.k ? '' : c.k)}>
      <b className="hl-n">{c.n}</b><span className="hl-t">{c.t}</span><small>{c.n ? c.sub : 'Ổn'}</small></button>)}</div>
    {open === 'missing' && <section className="card hl-list"><header><b>Bước không có người phụ trách</b><button className="btn sm primary" onClick={() => go('cp')}>Mở Phụ trách quy trình</button></header>
      {h.missing.length ? <ul>{h.missing.map((m, i) => <li key={i}><span className="qt-tag">{m.proc}</span> {CN(m.company)} · <b>{RN(m.role)}</b></li>)}</ul> : <p className="muted">Mọi bước đều có người.</p>}</section>}
    {open === 'locked' && <section className="card hl-list"><header><b>Tài khoản đã khoá vẫn được giao</b><button className="btn sm primary" onClick={() => go('cp')}>Mở Phụ trách quy trình</button></header>
      {h.locked.length ? <ul>{h.locked.map((m, i) => <li key={i}><b>{m.user}</b> · <span className="qt-tag">{m.proc}</span> {CN(m.company)} · {RN(m.role)}{m.via && <span className="muted"> (qua nhóm {m.via})</span>}</li>)}</ul> : <p className="muted">Không có.</p>}</section>}
    {open === 'stuck' && <section className="card hl-list"><header><b>Phiếu kẹt quá {h.days} ngày</b></header>
      {h.stuck.length ? <ul>{h.stuck.map((s) => <li key={s.doc}><Link to={'/don/' + s.order + '?tab=' + s.proc}><b>{s.code}</b></Link> · {s.project} · <span className="qt-tag">{s.proc}</span> {CN(s.company)} · {STATUS[s.status] ?? s.status} <span className="muted">· {ago(s.since)}</span></li>)}</ul> : <p className="muted">Không có phiếu nào bị kẹt.</p>}</section>}
    {open === 'tpl' && <section className="card hl-list"><header><b>Mẫu in dùng biến không có</b><button className="btn sm primary" onClick={() => go('tpl')}>Mở Mẫu in</button></header>
      {tb === null ? <p className="muted">Đang kiểm tra…</p> : tb.length ? <ul>{tb.map((t) => <li key={t.id}><span className="qt-tag">{t.proc}</span> <b>{t.name}</b> v{t.version}{t.company ? ' · ' + CN(t.company) : ''}: {t.bad.map((v) => <code key={v} className="hl-bad">{'{' + v + '}'}</code>)}</li>)}</ul> : <p className="muted">Mọi mẫu in đang dùng đều khớp biến.</p>}</section>}
    {open === 'no_zalo' && <section className="card hl-list"><header><b>Chưa nối Zalo</b><button className="btn sm primary" onClick={() => go('users')}>Mở Người dùng</button></header>
      {h.no_zalo.length ? <ul className="hl-cols">{h.no_zalo.map((p) => <li key={p.id}>{p.name} <span className="muted small">{p.unit}</span></li>)}</ul> : <p className="muted">Mọi người đã nối.</p>}</section>}
  </div>;
}

/* ───────── 2. Ma trận phân quyền (chỉ xem) ───────── */
type CP = { proc: string; company: string; role: string; user_id: string | null; group_id: string | null };
type WG = { id: string; name: string; member_ids: string[]; active: boolean };
export function PermMatrix({ people, go }: { people: Profile[]; go: (tab: string) => void }) {
  const [cp, setCp] = useState<CP[] | null>(null); const [gs, setGs] = useState<WG[]>([]); const [q, setQ] = useState(''); const [co, setCo] = useState(''); const [open, setOpen] = useState('');
  useEffect(() => { sb.from('chain_people').select('proc,company,role,user_id,group_id').then(({ data }) => setCp((data as CP[]) ?? [])); sb.from('work_groups').select('id,name,member_ids,active').then(({ data }) => setGs((data as WG[]) ?? [])); }, []);
  const cols = useMemo(() => { const s = new Map<string, CP>(); (cp ?? []).forEach((x) => { if (!co || x.company === co) s.set(x.proc + '|' + x.company + '|' + x.role, x); });
    return [...s.keys()].sort().map((k) => { const [proc, company, role] = k.split('|'); return { k, proc, company, role }; }); }, [cp, co]);
  const has = (uid: string, k: string): string => { const [proc, company, role] = k.split('|'); const rs = (cp ?? []).filter((x) => x.proc === proc && x.company === company && x.role === role);
    if (rs.some((x) => x.user_id === uid)) return 'trực tiếp'; const g = rs.map((x) => gs.find((y) => y.id === x.group_id && y.active)).find((y) => y?.member_ids.includes(uid)); return g ? 'nhóm ' + g.name : ''; };
  const rows = people.filter((p) => p.active && p.full_name.toLowerCase().includes(q.toLowerCase())).map((p) => ({ p, n: cols.filter((c) => has(p.id, c.k)).length })).filter((r) => r.n > 0 || q);
  const xlsx = async () => { const X = await import('xlsx'); const aoa = [['Người dùng', ...cols.map((c) => `${c.proc} ${c.company} ${RN(c.role)}`)], ...rows.map(({ p }) => [p.full_name, ...cols.map((c) => has(p.id, c.k))])];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'Phân quyền'); X.writeFile(wb, 'Ma_tran_phan_quyen.xlsx'); };
  if (!cp) return <p className="muted">Đang tải…</p>;
  return <div className="pm">
    <div className="pm-top"><input className="pm-q" placeholder="Lọc theo tên…" value={q} onChange={(e) => setQ(e.target.value)} />
      <select value={co} onChange={(e) => setCo(e.target.value)} aria-label="Công ty"><option value="">Cả 3 công ty</option>{Object.entries(COMPANY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className="btn sm" onClick={xlsx}><Icon name="download" size={14} />Xuất Excel</button><button className="btn sm" onClick={() => go('cp')}><Icon name="edit" size={14} />Sửa ở Phụ trách quy trình</button></div>
    <p className="small muted">Chỉ hiện người đang được giao ít nhất 1 bước. ● trực tiếp · ○ qua nhóm (rê chuột để xem nhóm).</p>
    <div className="pm-wrap"><table className="pm-t"><thead><tr><th className="pm-n">Người dùng</th>{cols.map((c) => <th key={c.k} title={`${c.proc} · ${CN(c.company)} · ${RN(c.role)}`}><span>{c.proc}</span><small>{c.company}</small><small>{RN(c.role)}</small></th>)}</tr></thead>
      <tbody>{rows.map(({ p }) => <tr key={p.id}><th className="pm-n">{p.full_name}</th>{cols.map((c) => { const v = has(p.id, c.k); return <td key={c.k} title={v}>{v ? (v === 'trực tiếp' ? '●' : '○') : ''}</td>; })}</tr>)}</tbody></table></div>
    <ul className="pm-mob">{rows.map(({ p, n }) => <li key={p.id} className="card"><button type="button" className="pm-mh" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? '' : p.id)}><b>{p.full_name}</b><span className="muted small">{n} bước</span></button>
      {open === p.id && <ul className="pm-ml">{cols.filter((c) => has(p.id, c.k)).map((c) => <li key={c.k}><span className="qt-tag">{c.proc}</span> {CN(c.company)} · <b>{RN(c.role)}</b> <span className="muted small">{has(p.id, c.k)}</span></li>)}</ul>}</li>)}</ul>
  </div>;
}

/* ───────── 3. Nhật ký thao tác cấu hình ───────── */
const TBL: Record<string, string> = { proc_fields: 'Trường dữ liệu', chain_people: 'Phụ trách quy trình', companies: 'Công ty / đánh số', materials: 'Vật liệu', print_templates: 'Mẫu in', profiles: 'Người dùng',
  work_groups: 'Nhóm', approval_levels: 'Luồng duyệt', approval_steps: 'Luồng duyệt', checklist_items: 'Checklist', step_guides: 'Hướng dẫn bước', step_defaults: 'Mặc định bước', act_grants: 'Uỷ quyền',
  delegations: 'Uỷ quyền', projects: 'Dự án', customers: 'Đối tác', perf_config: 'Hiệu quả & thưởng' };
const ACT: Record<string, string> = { 'cfg:insert': 'Thêm', 'cfg:update': 'Sửa', 'cfg:delete': 'Xoá' };
type Log = { id: number; at: string; actor: string | null; table_name: string; action: string; detail: { name?: string; ctx?: string; changes?: Record<string, [unknown, unknown]> } };
export function AuditAdmin({ people }: { people: Profile[] }) {
  const [rows, setRows] = useState<Log[] | null>(null); const [who, setWho] = useState(''); const [tb, setTb] = useState(''); const [from, setFrom] = useState(''); const [lim, setLim] = useState(100);
  useEffect(() => { let qy = sb.from('audit_log').select('id,at,actor,table_name,action,detail').like('action', 'cfg:%').order('at', { ascending: false }).limit(lim);
    if (who) qy = qy.eq('actor', who); if (tb) qy = qy.eq('table_name', tb); if (from) qy = qy.gte('at', from);
    qy.then(({ data }) => setRows((data as Log[]) ?? [])); }, [who, tb, from, lim]);
  const nm = (id: string | null) => (id ? people.find((p) => p.id === id)?.full_name ?? 'Người dùng đã xoá' : 'Hệ thống');
  const short = (v: unknown) => { if (typeof v === 'string' && /^[0-9a-f-]{36}$/.test(v)) { const p = people.find((x) => x.id === v); if (p) return p.full_name; }
    const s = typeof v === 'string' ? v : JSON.stringify(v); return s == null ? '∅' : s.length > 60 ? s.slice(0, 60) + '…' : s; };
  const day = (s: string) => new Date(s).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  const groups: [string, Log[]][] = []; for (const r of rows ?? []) { const k = day(r.at); const g = groups.at(-1); if (g && g[0] === k) g[1].push(r); else groups.push([k, [r]]); }
  return <div className="al">
    <div className="pm-top"><select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Người thao tác"><option value="">Mọi người</option>{people.filter((p) => p.roles.some((r) => r.startsWith('admin'))).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
      <select value={tb} onChange={(e) => setTb(e.target.value)} aria-label="Loại"><option value="">Mọi mục</option>{Object.keys(TBL).filter((k) => k !== 'approval_steps' && k !== 'delegations').map((k) => <option key={k} value={k}>{TBL[k]}</option>)}</select>
      <label className="small">Từ ngày <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label></div>
    {rows === null ? <p className="muted">Đang tải…</p> : !rows.length ? <p className="muted">Chưa có thao tác nào. Nhật ký bắt đầu ghi từ hôm nay.</p>
      : groups.map(([d, ls]) => <section key={d} className="al-day"><h3>{d}</h3><ol>{ls.map((r) => <li key={r.id} className={'al-it ' + r.action.slice(4)}>
        <time>{new Date(r.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time>
        <div><b>{nm(r.actor)}</b> {ACT[r.action] ?? r.action} <span className="al-tb">{TBL[r.table_name] ?? r.table_name}</span> <b>{r.detail?.name}</b>{r.detail?.ctx && <span className="muted"> · {r.detail.ctx}</span>}
          {r.detail?.changes && Object.keys(r.detail.changes).length > 0 && <ul className="al-ch">{Object.entries(r.detail.changes).slice(0, 6).map(([k, [a, b]]) => <li key={k}><code>{k}</code> {short(a)} → <b>{short(b)}</b></li>)}</ul>}</div></li>)}</ol></section>)}
    {rows && rows.length >= lim && <button className="btn sm" onClick={() => setLim(lim + 100)}>Xem thêm</button>}
  </div>;
}

/* ───────── 5. Xuất / nhập cấu hình ───────── */
const CFG: { t: string; l: string; key: string }[] = [
  { t: 'proc_fields', l: 'Trường dữ liệu', key: 'id' }, { t: 'approval_levels', l: 'Cấp duyệt', key: 'id' }, { t: 'approval_steps', l: 'Bước duyệt', key: 'id' },
  { t: 'checklist_items', l: 'Checklist', key: 'id' }, { t: 'step_guides', l: 'Hướng dẫn bước', key: 'id' }, { t: 'materials', l: 'Vật liệu', key: 'id' }, { t: 'companies', l: 'Công ty / đánh số', key: 'code' }];
type Pack = { app: 'PMS'; ver: 1; at: string; data: Record<string, Record<string, unknown>[]> };
export function ConfigIO() {
  const [busy, setBusy] = useState(false); const [pv, setPv] = useState<{ pack: Pack; diff: { t: string; l: string; add: number; chg: number; same: number }[] } | null>(null);
  const exp = async () => { setBusy(true); const data: Pack['data'] = {};
    for (const c of CFG) { const { data: d, error } = await sb.from(c.t).select('*'); if (error) { setBusy(false); return toast(c.l + ': ' + errText(error)); } data[c.t] = (d as Record<string, unknown>[]) ?? []; }
    const pack: Pack = { app: 'PMS', ver: 1, at: new Date().toISOString(), data }; const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'PMS_cau_hinh_' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); setBusy(false); toast('Đã xuất cấu hình'); };
  const pick = async (f: File) => { try { const pack = JSON.parse(await f.text()) as Pack; if (pack.app !== 'PMS' || !pack.data) throw new Error('File không phải cấu hình PMS');
    const diff = []; for (const c of CFG) { const inc = pack.data[c.t] ?? []; const { data } = await sb.from(c.t).select('*'); const cur = new Map(((data as Record<string, unknown>[]) ?? []).map((r) => [String(r[c.key]), JSON.stringify(r)]));
      let add = 0, chg = 0, same = 0; for (const r of inc) { const o = cur.get(String(r[c.key])); if (!o) add++; else if (o !== JSON.stringify(r)) chg++; else same++; } diff.push({ t: c.t, l: c.l, add, chg, same }); }
    setPv({ pack, diff }); } catch (e) { toast((e as Error).message); } };
  const apply = async () => { if (!pv) return; if (!(await confirmDialog('Áp dụng cấu hình từ file? Dòng mới sẽ được thêm, dòng trùng sẽ được ghi đè. Không xoá dòng nào. Mọi thay đổi được ghi vào Nhật ký.', 'Áp dụng'))) return;
    setBusy(true); for (const c of CFG) { const rs = pv.pack.data[c.t] ?? []; const d = pv.diff.find((x) => x.t === c.t)!; if (!rs.length || d.add + d.chg === 0) continue;
      const { error } = await sb.from(c.t).upsert(rs, { onConflict: c.key }); if (error) { setBusy(false); return toast(c.l + ': ' + errText(error)); } }
    setBusy(false); setPv(null); toast('Đã áp dụng cấu hình – tải lại trang để thấy thay đổi'); };
  return <div className="cio">
    <section className="card"><h3>Xuất cấu hình</h3><p className="small muted">Tải về một file JSON gồm: {CFG.map((c) => c.l).join(', ')}. Không gồm người dùng, mật khẩu, đơn hàng hay file mẫu in.</p>
      <button className="btn primary sm" disabled={busy} onClick={exp}><Icon name="download" size={15} />Tải file cấu hình</button></section>
    <section className="card"><h3>Nhập cấu hình</h3><p className="small muted">Chọn file đã xuất. Hệ thống <b>xem trước</b> những gì sẽ thay đổi rồi mới áp dụng. Không xoá dòng nào đang có.</p>
      <label className="btn sm"><Icon name="upload" size={15} />Chọn file…<input type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} /></label>
      {pv && <div className="cio-pv"><p className="small">File xuất lúc <b>{new Date(pv.pack.at).toLocaleString('vi-VN')}</b></p>
        <table className="cio-t"><thead><tr><th>Mục</th><th>Thêm mới</th><th>Thay đổi</th><th>Giữ nguyên</th></tr></thead><tbody>{pv.diff.map((d) => <tr key={d.t}><td>{d.l}</td><td className={d.add ? 'hl-add' : ''}>{d.add}</td><td className={d.chg ? 'hl-chg' : ''}>{d.chg}</td><td>{d.same}</td></tr>)}</tbody></table>
        <div className="row"><button className="btn primary sm" disabled={busy || pv.diff.every((d) => !d.add && !d.chg)} onClick={apply}>Áp dụng</button><button className="btn sm" onClick={() => setPv(null)}>Huỷ</button></div></div>}</section>
  </div>;
}

/* ───────── 4. Tìm nhanh trong Quản trị ───────── */
export type AdmHit = { k: string; t: string; sub: string; tab: string; uid?: string };
export function AdminSearch({ tabs, people, fields, mats, onPick }: { tabs: [string, string, string, string][]; people: Profile[]; fields: { label: string; key: string; proc: string }[]; mats: { name: string }[]; onPick: (h: AdmHit) => void }) {
  const [q, setQ] = useState(''); const [on, setOn] = useState(false); const [i, setI] = useState(0);
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const hits = useMemo<AdmHit[]>(() => { const x = n(q.trim()); if (!x) return [];
    return [...tabs.filter((t) => n(t[1] + ' ' + t[2]).includes(x)).map((t) => ({ k: 't' + t[0], t: t[1], sub: 'Mục · ' + t[2], tab: t[0] })),
      ...people.filter((p) => n(p.full_name).includes(x)).slice(0, 6).map((p) => ({ k: 'u' + p.id, t: p.full_name, sub: 'Người dùng' + (p.active ? '' : ' · đã khoá'), tab: 'users', uid: p.id })),
      ...[...new Map(fields.filter((f) => n(f.label + ' ' + f.key).includes(x)).map((f) => [f.proc + f.key + f.label, f])).values()].slice(0, 6).map((f) => ({ k: 'f' + f.proc + f.key, t: f.label, sub: 'Trường dữ liệu · ' + f.proc + ' · {' + f.key + '}', tab: 'fields' })),
      ...mats.filter((m) => n(m.name).includes(x)).map((m) => ({ k: 'm' + m.name, t: m.name, sub: 'Vật liệu', tab: 'vl' }))].slice(0, 12); }, [q, tabs, people, fields, mats]);
  useEffect(() => { const f = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); document.getElementById('adm-q')?.focus(); } };
    addEventListener('keydown', f, true); return () => removeEventListener('keydown', f, true); }, []);
  const pick = (h: AdmHit) => { onPick(h); setQ(''); setOn(false); (document.activeElement as HTMLElement | null)?.blur(); };
  return <div className="adm-s"><Icon name="search" size={15} />
    <input id="adm-q" placeholder="Tìm trong Quản trị… (Ctrl K)" value={q} role="combobox" aria-expanded={on && hits.length > 0} aria-controls="adm-q-l" onFocus={() => setOn(true)} onBlur={() => setTimeout(() => setOn(false), 150)}
      onChange={(e) => { setQ(e.target.value); setI(0); setOn(true); }} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, hits.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)); } else if (e.key === 'Enter' && hits[i]) { e.preventDefault(); pick(hits[i]); } else if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } }} />
    {on && hits.length > 0 && <ul id="adm-q-l" role="listbox" className="adm-s-l">{hits.map((h, j) => <li key={h.k} role="option" aria-selected={j === i}><button type="button" className={j === i ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h)}><b>{h.t}</b><small>{h.sub}</small></button></li>)}</ul>}
    {on && q.trim() && !hits.length && <div className="adm-s-l adm-s-none small muted">Không tìm thấy “{q}”</div>}
  </div>;
}
