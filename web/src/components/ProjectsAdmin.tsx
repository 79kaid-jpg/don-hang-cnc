import { useEffect, useMemo, useState } from 'react';
import { sb, errText, type Customer } from '../lib/supabase';
import { useProjects, reloadProjects, CODE_RE, type Project } from '../lib/projects';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from './ui';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Quản trị → Dự án: danh mục dự án, khách cuối, số đơn; admin đóng / mở lại */
export function ProjectsAdmin() {
  const list = useProjects(); const { can } = useAuth(); const admin = can('admin_it') || can('admin_cnc'); const edit = admin || can('kinh_doanh');
  const [cust, setCust] = useState<Record<string, Customer>>({}); const [cnt, setCnt] = useState<Record<string, number>>({});
  const [q, setQ] = useState(''); const [st, setSt] = useState<'open' | 'closed' | 'all'>('open'); const [ed, setEd] = useState<Project | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    sb.from('customers').select('*').then(({ data }) => setCust(Object.fromEntries(((data as Customer[]) ?? []).map((c) => [c.id, c]))));
    sb.from('orders').select('project_id').then(({ data }) => { const m: Record<string, number> = {}; ((data ?? []) as { project_id: string | null }[]).forEach((o) => { if (o.project_id) m[o.project_id] = (m[o.project_id] ?? 0) + 1; }); setCnt(m); });
  }, []);
  const shown = useMemo(() => (list ?? []).filter((p) => (st === 'all' || p.status === st) && (!q.trim() || fold(p.code + ' ' + p.name + ' ' + (cust[p.end_customer_id ?? '']?.name ?? '')).includes(fold(q.trim())))), [list, st, q, cust]);
  const save = async () => { if (!ed) return; setErr('');
    if (!CODE_RE.test(ed.code)) return setErr('Mã 2–12 ký tự, chỉ chữ in hoa và số');
    const { error } = await sb.from('projects').update({ code: ed.code, name: ed.name.trim(), location: ed.location || null, end_customer_id: ed.end_customer_id || null, note: ed.note || null }).eq('id', ed.id);
    if (error) return setErr(error.code === '23505' ? 'Mã ' + ed.code + ' đã có' : errText(error)); await reloadProjects(); setEd(null); toast('Đã lưu dự án'); };
  const close = async (p: Project, c: boolean) => {
    if (!(await confirmDialog((c ? 'Đóng' : 'Mở lại') + ' dự án ' + p.code + ' – ' + p.name + '?', c ? 'Đóng dự án' : 'Mở lại'))) return;
    const { error } = await sb.rpc('project_close', { p: p.id, close: c }); if (error) return toast(errText(error)); await reloadProjects(); toast(c ? 'Đã đóng dự án' : 'Đã mở lại'); };
  return (
    <div className="pja">
      <div className="pja-bar">
        <input className="pja-q" placeholder="Tìm mã, tên dự án, khách cuối…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm dự án" />
        <div className="seg" role="group" aria-label="Trạng thái">{([['open', 'Đang mở'], ['closed', 'Đã đóng'], ['all', 'Tất cả']] as const).map(([k, t]) =>
          <button key={k} type="button" aria-pressed={st === k} className={st === k ? 'on' : ''} onClick={() => setSt(k)}>{t}</button>)}</div>
      </div>
      {list === null ? <p className="muted">Đang tải…</p> : shown.length === 0 ? <p className="muted">Không có dự án.</p> :
      <ul className="pja-list">{shown.map((p) => <li key={p.id} className={'pja-it' + (p.status === 'closed' ? ' is-closed' : '')}>
        {ed?.id === p.id ? <div className="pja-ed">
            <label className="f"><span>Mã</span><input value={ed.code} maxLength={12} onChange={(e) => setEd({ ...ed, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} /></label>
            <label className="f"><span>Tên dự án</span><input value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
            <label className="f"><span>Khách cuối</span><select value={ed.end_customer_id ?? ''} onChange={(e) => setEd({ ...ed, end_customer_id: e.target.value || null })}><option value="">—</option>
              {Object.values(cust).filter((c) => c.kind !== 'van_chuyen').sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="f"><span>Địa điểm</span><input value={ed.location ?? ''} onChange={(e) => setEd({ ...ed, location: e.target.value })} /></label>
            {err && <small className="f-err">{err}</small>}
            <div className="row"><button className="btn primary sm" onClick={save} disabled={!ed.name.trim()}>Lưu</button><button className="btn sm" onClick={() => { setEd(null); setErr(''); }}>Huỷ</button></div>
          </div>
        : <>
          <b className="pj-code">{p.code}</b>
          <div className="pja-t"><b>{p.name}</b><span className="small muted">{[cust[p.end_customer_id ?? '']?.name ?? 'Chưa có khách cuối', p.location, (cnt[p.id] ?? 0) + ' đơn', p.status === 'closed' && 'Đã đóng ' + (p.closed_at ?? '').slice(0, 10)].filter(Boolean).join(' · ')}</span></div>
          <div className="pja-act">
            {edit && p.status === 'open' && <button className="btn sm" onClick={() => setEd(p)}>Sửa</button>}
            {admin && <button className={'btn sm' + (p.status === 'open' ? ' ghost' : '')} onClick={() => close(p, p.status === 'open')}>{p.status === 'open' ? 'Đóng' : 'Mở lại'}</button>}
          </div></>}
      </li>)}</ul>}
    </div>);
}
