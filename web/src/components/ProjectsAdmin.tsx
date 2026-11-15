import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sb, errText, type Customer } from '../lib/supabase';
import { useProjects, reloadProjects, CODE_RE, codeFromName, type Project } from '../lib/projects';
import { HeadInput, parseLoc, mapUrl } from './HeadInput';
import { Icon } from './Icon';
import type { FDef } from '../lib/fields';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from './ui';
const MiniMap = lazy(() => import('./MiniMap'));

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
type ZG = { chat_id: string; name: string; projects: string[]; rule_customers: string[]; rule_prefix: string[] };
type Draft = { code: string; name: string; end_customer_id: string; location: string; note: string; auto: boolean };
type Ord = { id: string; code: string; due_date: string | null; created_at: string; status: string | null };
type Bat = { order_id: string; proc: string; status: string };
const LOC = { type: 'location', label: 'Địa điểm', options: [] } as unknown as FDef;
const d10 = (s?: string | null) => (s ? new Date(s).toLocaleDateString('vi-VN') : '');

/** Quản trị → Dự án: danh sách · bấm dòng để xem chi tiết (đơn hàng, bản đồ, nhóm Zalo) · Sửa / Tạo mới dùng chung một form đầy đủ */
export function ProjectsAdmin() {
  const list = useProjects(); const { can } = useAuth(); const admin = can('admin_it') || can('admin_cnc'); const edit = admin || can('kinh_doanh');
  const [sp, setSp] = useSearchParams(); const selId = sp.get('id'); const mode = sp.get('m');
  const go = (id: string | null, m?: string) => { const n = new URLSearchParams(sp); if (id) n.set('id', id); else n.delete('id'); if (m) n.set('m', m); else n.delete('m'); setSp(n); scrollTo({ top: 0 }); };
  const [cust, setCust] = useState<Record<string, Customer>>({}); const [ords, setOrds] = useState<(Ord & { project_id: string | null })[]>([]); const [bats, setBats] = useState<Bat[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [zg, setZg] = useState<ZG[]>([]); const [inv, setInv] = useState('');
  const loadZg = () => sb.rpc('zgroups_pick').then(({ data }) => setZg((data as ZG[]) ?? []));
  useEffect(() => { loadZg();
    sb.from('app_settings').select('value').eq('key', 'zalo_group_link').maybeSingle().then(({ data }) => setInv(data?.value ?? ''));
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
    sb.from('orders').select('id, code, due_date, created_at, status, project_id').order('created_at', { ascending: false }).then(({ data }) => setOrds((data as typeof ords) ?? []));
    sb.from('batches').select('order_id, proc, status').then(({ data }) => setBats((data as Bat[]) ?? []));
    sb.from('profiles').select('id, full_name').then(({ data }) => setPeople(Object.fromEntries(((data ?? []) as { id: string; full_name: string }[]).map((x) => [x.id, x.full_name])))); }, []);
  const cnt = useMemo(() => { const m: Record<string, number> = {}; ords.forEach((o) => { if (o.project_id) m[o.project_id] = (m[o.project_id] ?? 0) + 1; }); return m; }, [ords]);
  const zOf = (id: string) => zg.filter((g) => g.projects.includes(id));
  const ruleHit = (code: string, cu: string) => zg.filter((g) => (cu && g.rule_customers.includes(cu)) || g.rule_prefix.some((p) => p && code.toUpperCase().startsWith(p.toUpperCase()))).map((g) => g.chat_id);
  const [q, setQ] = useState(''); const [st, setSt] = useState<'open' | 'closed' | 'all'>('open');
  const shown = useMemo(() => (list ?? []).filter((p) => (st === 'all' || p.status === st) && (!q.trim() || fold(p.code + ' ' + p.name + ' ' + (cust[p.end_customer_id ?? '']?.name ?? '')).includes(fold(q.trim())))), [list, st, q, cust]);
  const close = async (p: Project, c: boolean) => {
    if (!(await confirmDialog((c ? 'Đóng' : 'Mở lại') + ' dự án ' + p.code + ' – ' + p.name + '?', c ? 'Đóng dự án' : 'Mở lại'))) return;
    const { error } = await sb.rpc('project_close', { p: p.id, close: c }); if (error) return toast(errText(error)); await reloadProjects(); toast(c ? 'Đã đóng dự án' : 'Đã mở lại'); };
  const custOpts = Object.values(cust).filter((c) => c.kind !== 'van_chuyen').sort((a, b) => a.name.localeCompare(b.name));
  const form = (p: Project | null) => <ProjectForm p={p} list={list ?? []} custOpts={custOpts} zg={zg} inv={inv} ruleHit={ruleHit} hasOrders={!!p && (cnt[p.id] ?? 0) > 0} admin={admin}
    initZ={p ? zOf(p.id).map((g) => g.chat_id) : []}
    onCancel={() => go(p?.id ?? null)} onSaved={async (id) => { await loadZg(); await reloadProjects(); go(id); }} />;

  // Tạo mới
  if (mode === 'new' && edit) return <div className="pja">{form(null)}</div>;
  // Chi tiết
  const sel = selId ? (list ?? []).find((p) => p.id === selId) : null;
  if (selId) {
    if (!list) return <p className="muted">Đang tải…</p>;
    if (!sel) return <div className="pja"><button className="btn sm" onClick={() => go(null)}><Icon name="back" size={16} />Dự án</button><p className="muted">Không tìm thấy dự án.</p></div>;
    if (mode === 'edit' && edit) return <div className="pja">{form(sel)}</div>;
    const c = cust[sel.end_customer_id ?? '']; const { addr, ll } = parseLoc(sel.location ?? ''); const os = ords.filter((o) => o.project_id === sel.id);
    const qtOf = (oid: string) => { const b = bats.filter((x) => x.order_id === oid); if (!b.length) return 'Chưa bắt đầu';
      const live = b.filter((x) => x.status !== 'hoan_tat' && x.status !== 'fail').map((x) => x.proc).sort().at(-1); return live ? 'Đang ' + live : 'Xong ' + b.map((x) => x.proc).sort().at(-1); };
    const done = os.filter((o) => qtOf(o.id).startsWith('Xong QT3')).length;
    return <div className="pja pjv">
      <div className="pjv-top"><button className="btn sm" onClick={() => go(null)}><Icon name="back" size={16} />Dự án</button></div>
      <header className="card pjv-head">
        <b className="pj-code">{sel.code}</b>
        <div className="pjv-ttl"><h2>{sel.name}</h2><span className={'chip sm ' + (sel.status === 'open' ? 'done' : 'idle')}>{sel.status === 'open' ? 'Đang mở' : 'Đã đóng ' + d10(sel.closed_at)}</span></div>
        <div className="pjv-act">
          {sel.status === 'open' && <Link className="btn sm" to={'/don/moi?project=' + sel.id}><Icon name="plus" size={15} />Tạo đơn</Link>}
          {admin && <button className="btn sm ghost" onClick={() => close(sel, sel.status === 'open')}>{sel.status === 'open' ? 'Đóng dự án' : 'Mở lại'}</button>}
          {edit && sel.status === 'open' && <button className="btn sm primary pjv-edit" onClick={() => go(sel.id, 'edit')}><Icon name="ftext" size={15} />Sửa</button>}
        </div>
      </header>
      <div className="pjv-grid">
        <section className="card pjv-info"><h3>Thông tin</h3>
          <dl className="pjv-dl">
            <dt>Khách cuối</dt><dd>{c ? <><b>{c.name}</b>{(c.contact || c.phone) && <div className="small muted">{[c.contact, c.phone].filter(Boolean).join(' · ')}{c.phone && <> · <a href={'tel:' + c.phone.replace(/[^\d+]/g, '')}>Gọi</a></>}</div>}</> : <span className="muted">Chưa có</span>}</dd>
            <dt>Địa điểm</dt><dd>{addr || ll ? <>{addr || <span className="muted">(chưa có địa chỉ chữ)</span>} {(addr || ll) && <a href={mapUrl(sel.location ?? '')} target="_blank" rel="noreferrer" className="small">🗺 Mở Google Maps</a>}</> : <span className="muted">Chưa có</span>}</dd>
            <dt>Ghi chú</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{sel.note || <span className="muted">—</span>}</dd>
            <dt>Tạo lúc</dt><dd>{d10(sel.created_at)}{(sel as Project & { created_by?: string }).created_by && ' · ' + (people[(sel as Project & { created_by?: string }).created_by!] ?? '')}</dd>
          </dl>
          {ll && <details className="pjv-map" open={!matchMedia('(max-width:640px)').matches}><summary>Bản đồ</summary><Suspense fallback={<div className="mm mm-ph">Đang tải bản đồ…</div>}><MiniMap ll={ll} readOnly onPick={() => {}} /></Suspense></details>}
        </section>
        <div className="pjv-side">
          <section className="card"><h3>Đơn hàng <span className="muted small">· {os.length} đơn · {done} hoàn tất · {os.length - done} đang làm</span></h3>
            {os.length ? <ul className="pjv-ords">{os.map((o) => <li key={o.id}><Link to={'/don/' + o.id}><b>{o.code}</b><span className="small muted">{qtOf(o.id)}{o.due_date ? ' · hạn ' + d10(o.due_date) : ''}</span><Icon name="arrow" size={14} /></Link></li>)}</ul>
              : <p className="muted small" style={{ margin: 0 }}>Chưa có đơn.</p>}</section>
          <section className="card"><h3>Nhóm Zalo</h3>
            {zOf(sel.id).length ? <ul className="pjv-zg">{zOf(sel.id).map((g) => <li key={g.chat_id}>💬 {g.name || 'Nhóm ' + g.chat_id.slice(0, 6)}</li>)}</ul>
              : <p className="small muted" style={{ margin: 0 }}>Chưa có nhóm nhận tin dự án này. Thêm bot vào nhóm{inv && <> (<button type="button" className="link-btn" onClick={() => { navigator.clipboard?.writeText(inv); toast('Đã chép link mời bot'); }}>chép link mời bot</button>)</>}, rồi gõ trong nhóm <span className="kbd">/noi duan {sel.code}</span>, hoặc bấm Sửa để chọn nhóm.</p>}</section>
        </div>
      </div>
      {edit && sel.status === 'open' && <div className="pjv-bar"><button className="btn primary" onClick={() => go(sel.id, 'edit')}><Icon name="ftext" size={16} />Sửa dự án</button></div>}
    </div>;
  }
  // Danh sách
  return (
    <div className="pja">
      <div className="pja-bar">
        <input className="pja-q" placeholder="Tìm mã, tên dự án, khách cuối…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm dự án" />
        <div className="seg" role="group" aria-label="Trạng thái">{([['open', 'Đang mở'], ['closed', 'Đã đóng'], ['all', 'Tất cả']] as const).map(([k, t]) =>
          <button key={k} type="button" aria-pressed={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{t}</button>)}</div>
        {edit && <button className="btn primary pja-new" onClick={() => go(null, 'new')}><Icon name="plus" size={18} /><span>Dự án mới</span></button>}
      </div>
      {list === null ? <p className="muted">Đang tải…</p> : shown.length === 0 ? <p className="muted">Không có dự án.</p> :
      <ul className="pja-list">{shown.map((p) => <li key={p.id} className={'pja-it' + (p.status === 'closed' ? ' is-closed' : '')}>
        <button type="button" className="pja-row" onClick={() => go(p.id)} aria-label={'Xem dự án ' + p.code}>
          <b className="pj-code">{p.code}</b>
          <div className="pja-t"><b>{p.name}</b><span className="small muted">{[cust[p.end_customer_id ?? '']?.name ?? 'Chưa có khách cuối', parseLoc(p.location ?? '').addr, (cnt[p.id] ?? 0) + ' đơn', zg.length ? (zOf(p.id).length ? 'Zalo: ' + zOf(p.id).map((g) => g.name).join(', ') : '⚠ chưa có nhóm Zalo') : '', p.status === 'closed' && 'Đã đóng ' + (p.closed_at ?? '').slice(0, 10)].filter(Boolean).join(' · ')}</span></div>
          <Icon name="arrow" size={16} />
        </button>
        {edit && p.status === 'open' && <button className="btn sm pja-ed-btn" onClick={() => go(p.id, 'edit')}>Sửa</button>}
      </li>)}</ul>}
    </div>);
}

/** Form đầy đủ: tạo mới (p = null) hoặc sửa */
function ProjectForm({ p, list, custOpts, zg, inv, ruleHit, initZ, hasOrders, admin, onCancel, onSaved }: { p: Project | null; list: Project[]; custOpts: Customer[]; zg: ZG[]; inv: string; ruleHit: (c: string, cu: string) => string[]; initZ: string[]; hasOrders: boolean; admin: boolean; onCancel: () => void; onSaved: (id: string) => void }) {
  const [d, setD] = useState<Draft>({ code: p?.code ?? '', name: p?.name ?? '', end_customer_id: p?.end_customer_id ?? '', location: p?.location ?? '', note: p?.note ?? '', auto: !p });
  const [zs, setZs] = useState<string[]>(initZ); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [unlock, setUnlock] = useState(false);
  const codeLocked = !!p && hasOrders && !unlock;
  const set = (x: Draft) => { if (!p) { const prev = ruleHit(d.code, d.end_customer_id); const hit = ruleHit(x.code, x.end_customer_id); setZs([...new Set([...zs.filter((c) => !prev.includes(c)), ...hit])]); } setD(x); };
  const taken = (c: string) => list.some((x) => x.code === c && x.id !== p?.id);
  const save = async () => { setErr('');
    if (!CODE_RE.test(d.code)) return setErr('Mã 2–12 ký tự, chỉ chữ in hoa và số'); if (taken(d.code)) return setErr('Mã ' + d.code + ' đã có');
    setBusy(true); const row = { code: d.code, name: d.name.trim(), end_customer_id: d.end_customer_id || null, location: d.location.trim() || null, note: d.note.trim() || null };
    const r = p ? await sb.from('projects').update(row).eq('id', p.id).select('id').single() : await sb.from('projects').insert(row).select('id').single();
    if (r.error) { setBusy(false); return setErr(r.error.code === '23505' ? 'Mã ' + d.code + ' đã có' : errText(r.error)); }
    const id = (r.data as { id: string }).id;
    if (zg.length) { const z = await sb.rpc('project_set_zgroups', { p_project: id, p_chats: zs }); if (z.error) toast(errText(z.error)); }
    setBusy(false); toast(p ? 'Đã lưu dự án' : 'Đã tạo dự án ' + d.code); onSaved(id); };
  return <section className="card pja-form" aria-label={p ? 'Sửa dự án' : 'Tạo dự án mới'}>
    <div className="pjv-top"><button className="btn sm" onClick={onCancel}><Icon name="back" size={16} />{p ? 'Xem dự án' : 'Dự án'}</button></div>
    <h2 style={{ margin: 0 }}>{p ? 'Sửa dự án ' + p.code : 'Dự án mới'}</h2>
    <div className="pja-fg">
      <label className="f"><span>Tên dự án *</span><input autoFocus={!p} value={d.name} onChange={(e) => { const name = e.target.value; set({ ...d, name, code: d.auto ? codeFromName(name) : d.code }); }} placeholder="VD: Sony Tower L18" /></label>
      <label className="f"><span>Mã *</span><input value={d.code} maxLength={12} disabled={codeLocked} onChange={(e) => set({ ...d, auto: false, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} aria-invalid={!!d.code && (taken(d.code) || !CODE_RE.test(d.code))} />
        {codeLocked ? <small className="muted">Đã có đơn – khoá để không lệch mã đơn{admin && <> · <button type="button" className="link-btn" onClick={() => setUnlock(true)}>Mở khoá</button></>}</small>
          : d.code && taken(d.code) ? <small className="f-err">Mã đã có</small> : d.code && !CODE_RE.test(d.code) ? <small className="f-err">2–12 ký tự, chữ in hoa và số</small> : <small className="muted">{p ? 'Chữ in hoa và số' : 'Tự gợi ý từ tên, sửa được'}</small>}</label>
      <label className="f"><span>Khách cuối</span><select value={d.end_customer_id} onChange={(e) => set({ ...d, end_customer_id: e.target.value })}><option value="">—</option>
        {custOpts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="f f-wide"><span>Địa điểm</span><HeadInput f={LOC} v={d.location} on={(x) => setD({ ...d, location: x })} /></div>
      <label className="f f-wide"><span>Ghi chú</span><textarea rows={3} value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} placeholder="Yêu cầu riêng, đầu mối, lưu ý giao hàng…" /></label>
      <fieldset className="f f-wide pja-zg"><legend>Nhóm Zalo nhận tin dự án</legend>
        {zg.length ? zg.map((g) => { const hit = !p && ruleHit(d.code, d.end_customer_id).includes(g.chat_id); return <label key={g.chat_id} className="pja-zgi"><input type="checkbox" checked={zs.includes(g.chat_id)} onChange={(e) => setZs(e.target.checked ? [...zs, g.chat_id] : zs.filter((x) => x !== g.chat_id))} />{g.name || 'Nhóm ' + g.chat_id.slice(0, 6)}{hit && <small className="muted"> (theo quy tắc)</small>}</label>; })
          : <span className="small muted">Chưa có nhóm Zalo theo dự án. Thêm bot vào nhóm{inv && <> (<button type="button" className="link-btn" onClick={() => { navigator.clipboard?.writeText(inv); toast('Đã chép link mời bot'); }}>chép link mời bot</button>)</>}, rồi gõ trong nhóm <span className="kbd">/noi duan {d.code || 'MÃ'}</span>.</span>}
        {zg.length > 0 && !zs.length && <small className="f-err">Chưa chọn nhóm Zalo – tin của dự án sẽ không vào nhóm dự án nào</small>}</fieldset>
    </div>
    {err && <small className="f-err">{err}</small>}
    <div className="row pja-save"><button className="btn primary" disabled={busy || !d.name.trim() || !d.code} onClick={save}><Icon name="check" size={16} />{busy ? 'Đang lưu…' : p ? 'Lưu' : 'Tạo dự án'}</button><button className="btn" onClick={onCancel}>Huỷ</button></div>
  </section>;
}
