import { useEffect, useMemo, useState } from 'react';
import { sb, errText, type Customer } from '../lib/supabase';
import { useProjects, reloadProjects, CODE_RE, codeFromName, type Project } from '../lib/projects';
import { HeadInput } from './HeadInput';
import { Icon } from './Icon';
import type { FDef } from '../lib/fields';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from './ui';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Quản trị → Dự án: danh mục dự án, khách cuối, số đơn; admin đóng / mở lại */
export function ProjectsAdmin() {
  const list = useProjects(); const { can } = useAuth(); const admin = can('admin_it') || can('admin_cnc'); const edit = admin || can('kinh_doanh');
  const [cust, setCust] = useState<Record<string, Customer>>({}); const [cnt, setCnt] = useState<Record<string, number>>({});
  const [zg, setZg] = useState<{ chat_id: string; name: string; projects: string[]; rule_customers: string[]; rule_prefix: string[] }[]>([]); const [zsel, setZsel] = useState<string[]>([]);
  const loadZg = () => sb.rpc('zgroups_pick').then(({ data }) => setZg((data as typeof zg) ?? []));
  useEffect(() => { loadZg(); }, []);
  const zOf = (id: string) => zg.filter((g) => g.projects.includes(id));
  const startEd = (p: Project) => { setEd(p); setZsel(zOf(p.id).map((g) => g.chat_id)); };
  const [nw, setNw] = useState<{ code: string; name: string; end_customer_id: string; location: string; auto: boolean } | null>(null); const [nsel, setNsel] = useState<string[]>([]); const [nerr, setNerr] = useState(''); const [inv, setInv] = useState('');
  useEffect(() => { sb.from('app_settings').select('value').eq('key', 'zalo_group_link').maybeSingle().then(({ data }) => setInv(data?.value ?? '')); }, []);
  const ruleHit = (code: string, cu: string) => zg.filter((g) => (cu && g.rule_customers.includes(cu)) || g.rule_prefix.some((p) => p && code.toUpperCase().startsWith(p.toUpperCase()))).map((g) => g.chat_id);
  const setN = (x: NonNullable<typeof nw>) => { const prevHit = nw ? ruleHit(nw.code, nw.end_customer_id) : []; const hit = ruleHit(x.code, x.end_customer_id);
    setNsel([...new Set([...nsel.filter((c) => !prevHit.includes(c)), ...hit])]); setNw(x); };
  const taken = (c: string) => (list ?? []).some((p) => p.code === c);
  const create = async () => { if (!nw) return; setNerr('');
    if (!CODE_RE.test(nw.code)) return setNerr('Mã 2–12 ký tự, chỉ chữ in hoa và số'); if (taken(nw.code)) return setNerr('Mã ' + nw.code + ' đã có');
    const { data, error } = await sb.from('projects').insert({ code: nw.code, name: nw.name.trim(), end_customer_id: nw.end_customer_id || null, location: nw.location.trim() || null }).select('id').single();
    if (error) return setNerr(error.code === '23505' ? 'Mã ' + nw.code + ' đã có' : errText(error));
    if (zg.length) { const r = await sb.rpc('project_set_zgroups', { p_project: (data as { id: string }).id, p_chats: nsel }); if (r.error) toast(errText(r.error)); await loadZg(); }
    await reloadProjects(); setNw(null); setNsel([]); toast('Đã tạo dự án ' + nw.code); };
  const LOC = { type: 'location', label: 'Địa điểm', options: [] } as unknown as FDef;
  const [q, setQ] = useState(''); const [st, setSt] = useState<'open' | 'closed' | 'all'>('open'); const [ed, setEd] = useState<Project | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
    sb.from('orders').select('project_id').then(({ data }) => { const m: Record<string, number> = {}; ((data ?? []) as { project_id: string | null }[]).forEach((o) => { if (o.project_id) m[o.project_id] = (m[o.project_id] ?? 0) + 1; }); setCnt(m); });
  }, []);
  const shown = useMemo(() => (list ?? []).filter((p) => (st === 'all' || p.status === st) && (!q.trim() || fold(p.code + ' ' + p.name + ' ' + (cust[p.end_customer_id ?? '']?.name ?? '')).includes(fold(q.trim())))), [list, st, q, cust]);
  const save = async () => { if (!ed) return; setErr('');
    if (!CODE_RE.test(ed.code)) return setErr('Mã 2–12 ký tự, chỉ chữ in hoa và số');
    const { error } = await sb.from('projects').update({ code: ed.code, name: ed.name.trim(), location: ed.location || null, end_customer_id: ed.end_customer_id || null, note: ed.note || null }).eq('id', ed.id);
    if (error) return setErr(error.code === '23505' ? 'Mã ' + ed.code + ' đã có' : errText(error));
    if (zg.length) { const r = await sb.rpc('project_set_zgroups', { p_project: ed.id, p_chats: zsel }); if (r.error) return setErr(errText(r.error)); await loadZg(); }
    await reloadProjects(); setEd(null); toast('Đã lưu dự án'); };
  const close = async (p: Project, c: boolean) => {
    if (!(await confirmDialog((c ? 'Đóng' : 'Mở lại') + ' dự án ' + p.code + ' – ' + p.name + '?', c ? 'Đóng dự án' : 'Mở lại'))) return;
    const { error } = await sb.rpc('project_close', { p: p.id, close: c }); if (error) return toast(errText(error)); await reloadProjects(); toast(c ? 'Đã đóng dự án' : 'Đã mở lại'); };
  return (
    <div className="pja">
      <div className="pja-bar">
        <input className="pja-q" placeholder="Tìm mã, tên dự án, khách cuối…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm dự án" />
        <div className="seg" role="group" aria-label="Trạng thái">{([['open', 'Đang mở'], ['closed', 'Đã đóng'], ['all', 'Tất cả']] as const).map(([k, t]) =>
          <button key={k} type="button" aria-pressed={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{t}</button>)}</div>
        {edit && !nw && <button className="btn primary pja-new" onClick={() => { setNw({ code: '', name: '', end_customer_id: '', location: '', auto: true }); setNsel([]); setNerr(''); }}><Icon name="plus" size={18} /><span>Dự án mới</span></button>}
      </div>
      {nw && <section className="card pja-form" aria-label="Tạo dự án mới">
        <b>Dự án mới</b>
        <div className="pja-fg">
          <label className="f"><span>Tên dự án *</span><input autoFocus value={nw.name} onChange={(e) => { const name = e.target.value; setN({ ...nw, name, code: nw.auto ? codeFromName(name) : nw.code }); }} placeholder="VD: Sony Tower L18" /></label>
          <label className="f"><span>Mã *</span><input value={nw.code} maxLength={12} onChange={(e) => setN({ ...nw, auto: false, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} aria-invalid={!!nw.code && (taken(nw.code) || !CODE_RE.test(nw.code))} />
            {nw.code && taken(nw.code) ? <small className="f-err">Mã đã có</small> : nw.code && !CODE_RE.test(nw.code) ? <small className="f-err">2–12 ký tự, chữ in hoa và số</small> : <small className="muted">Tự gợi ý từ tên, sửa được</small>}</label>
          <label className="f"><span>Khách cuối</span><select value={nw.end_customer_id} onChange={(e) => setN({ ...nw, end_customer_id: e.target.value })}><option value="">—</option>
            {Object.values(cust).filter((c) => c.kind !== 'van_chuyen').sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <div className="f f-wide"><span>Địa điểm</span><HeadInput f={LOC} v={nw.location} on={(x) => setNw({ ...nw, location: x })} /></div>
          <fieldset className="f f-wide pja-zg"><legend>Nhóm Zalo nhận tin dự án</legend>
            {zg.length ? zg.map((g) => { const hit = ruleHit(nw.code, nw.end_customer_id).includes(g.chat_id); return <label key={g.chat_id} className="pja-zgi"><input type="checkbox" checked={nsel.includes(g.chat_id)} onChange={(e) => setNsel(e.target.checked ? [...nsel, g.chat_id] : nsel.filter((x) => x !== g.chat_id))} />{g.name || 'Nhóm ' + g.chat_id.slice(0, 6)}{hit && <small className="muted"> (theo quy tắc)</small>}</label>; })
              : <span className="small muted">Chưa có nhóm Zalo theo dự án. Thêm bot vào nhóm{inv && <> (<button type="button" className="link-btn" onClick={() => { navigator.clipboard?.writeText(inv); toast('Đã chép link mời bot'); }}>chép link mời bot</button>)</>}, rồi gõ trong nhóm <span className="kbd">/noi duan {nw.code || 'MÃ'}</span>.</span>}</fieldset>
        </div>
        {nerr && <small className="f-err">{nerr}</small>}
        <div className="row"><button className="btn primary" disabled={!nw.name.trim() || !nw.code} onClick={create}>Tạo dự án</button><button className="btn" onClick={() => setNw(null)}>Huỷ</button></div>
      </section>}
      {list === null ? <p className="muted">Đang tải…</p> : shown.length === 0 ? <p className="muted">Không có dự án.</p> :
      <ul className="pja-list">{shown.map((p) => <li key={p.id} className={'pja-it' + (p.status === 'closed' ? ' is-closed' : '')}>
        {ed?.id === p.id ? <div className="pja-ed">
            <label className="f"><span>Mã</span><input value={ed.code} maxLength={12} onChange={(e) => setEd({ ...ed, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
            <label className="f"><span>Tên dự án</span><input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
            <label className="f"><span>Khách cuối</span><select value={ed.end_customer_id ?? ''} onChange={(e) => setEd({ ...ed, end_customer_id: e.target.value || null })}><option value="">—</option>
              {Object.values(cust).filter((c) => c.kind !== 'van_chuyen').sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {zg.length > 0 && <fieldset className="f pja-zg"><legend>Nhóm Zalo nhận tin dự án</legend>
              {zg.map((g) => <label key={g.chat_id} className="pja-zgi"><input type="checkbox" checked={zsel.includes(g.chat_id)} onChange={(e) => setZsel(e.target.checked ? [...zsel, g.chat_id] : zsel.filter((x) => x !== g.chat_id))} />{g.name || 'Nhóm ' + g.chat_id.slice(0, 6)}</label>)}
              {!zsel.length && <small className="f-err">Chưa có nhóm Zalo – tin của dự án sẽ không vào nhóm dự án nào</small>}</fieldset>}
            <label className="f"><span>Địa điểm</span><input value={ed.location ?? ''} onChange={(e) => setEd({ ...ed, location: e.target.value })} /></label>
            {err && <small className="f-err">{err}</small>}
            <div className="row"><button className="btn primary sm" onClick={save} disabled={!ed.name.trim()}>Lưu</button><button className="btn sm" onClick={() => { setEd(null); setErr(''); }}>Huỷ</button></div>
          </div>
        : <>
          <b className="pj-code">{p.code}</b>
          <div className="pja-t"><b>{p.name}</b><span className="small muted">{[cust[p.end_customer_id ?? '']?.name ?? 'Chưa có khách cuối', p.location, (cnt[p.id] ?? 0) + ' đơn', zg.length ? (zOf(p.id).length ? 'Zalo: ' + zOf(p.id).map((g) => g.name).join(', ') : '⚠ chưa có nhóm Zalo') : '', p.status === 'closed' && 'Đã đóng ' + (p.closed_at ?? '').slice(0, 10)].filter(Boolean).join(' · ')}</span></div>
          <div className="pja-act">
            {edit && p.status === 'open' && <button className="btn sm" onClick={() => startEd(p)}>Sửa</button>}
            {admin && <button className={'btn sm' + (p.status === 'open' ? ' ghost' : '')} onClick={() => close(p, p.status === 'open')}>{p.status === 'open' ? 'Đóng' : 'Mở lại'}</button>}
          </div></>}
      </li>)}</ul>}
    </div>);
}
