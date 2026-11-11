import { useEffect, useMemo, useRef, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { useProjects, reloadProjects, codeFromName, CODE_RE, type Project } from '../lib/projects';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Chọn dự án (mã + tên) – gõ để tìm; chưa có thì tạo nhanh. Khách cuối = khách ở F0. */
export function ProjectPicker({ value, name, customerId, onChange, disabled }: { value: string; name: string; customerId: string; onChange: (p: Project | null) => void; disabled?: boolean }) {
  const list = useProjects(); const { can } = useAuth(); const canNew = can('kinh_doanh') || can('admin_cnc') || can('admin_it');
  const cur = list?.find((p) => p.id === value) ?? null;
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [mk, setMk] = useState<{ code: string; name: string } | null>(null); const [err, setErr] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; addEventListener('mousedown', f); return () => removeEventListener('mousedown', f); }, []);
  const hits = useMemo(() => { const t = fold(q.trim()); const o = (list ?? []).filter((p) => p.status === 'open');
    return (t ? o.filter((p) => fold(p.code + ' ' + p.name).includes(t)) : o).slice(0, 8); }, [q, list]);
  const pick = (p: Project) => { onChange(p); setOpen(false); setQ(''); };
  const create = async () => { if (!mk) return; setErr('');
    const code = mk.code.trim().toUpperCase(); if (!CODE_RE.test(code)) return setErr('Mã 2–12 ký tự, chỉ chữ in hoa và số');
    const { data, error } = await sb.from('projects').insert({ code, name: mk.name.trim(), end_customer_id: customerId || null }).select('*').single();
    if (error) return setErr(error.code === '23505' ? 'Mã ' + code + ' đã có' : errText(error));
    await reloadProjects(); setMk(null); pick(data as Project); };
  if (disabled) return <div className="pj-cur is-dis">{cur ? <><b className="pj-code">{cur.code}</b><span>{cur.name}</span></> : <span>{name || '—'}</span>}</div>;
  return (
    <div className="cp pj" ref={box}>
      {cur && !open ? <button type="button" className="pj-cur" onClick={() => setOpen(true)} aria-label={'Dự án ' + cur.code + ' ' + cur.name + '. Bấm để đổi'}>
          <b className="pj-code">{cur.code}</b><span>{cur.name}</span><span className="small cp-chg">Đổi</span></button>
        : <input className="cp-in" value={q} autoFocus={open} placeholder="Gõ mã hoặc tên dự án…" role="combobox" aria-expanded={open}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />}
      {open && !mk && <ul className="cp-pop" role="listbox">
        {list === null && <li className="muted small" style={{ padding: 10 }}>Đang tải…</li>}
        {hits.map((p) => <li key={p.id} role="option" aria-selected={p.id === value}><button type="button" className={'cp-it' + (p.id === value ? ' on' : '')} onClick={() => pick(p)}>
          <b className="pj-code">{p.code}</b><span className="cp-nm">{p.name}</span></button></li>)}
        {canNew && <li><button type="button" className="cp-it cp-new" onClick={() => { const n = q.trim(); setMk({ name: n, code: codeFromName(n) }); }}>
          <Icon name="plus" size={16} />Tạo dự án mới{q.trim() ? ' “' + q.trim() + '”' : ''}</button></li>}
      </ul>}
      {mk && <div className="pj-new">
        <label className="f"><span>Tên dự án *</span><input autoFocus value={mk.name} onChange={(e) => setMk({ name: e.target.value, code: mk.code === codeFromName(mk.name) ? codeFromName(e.target.value) : mk.code })} /></label>
        <label className="f"><span>Mã dự án *</span><input value={mk.code} maxLength={12} onChange={(e) => setMk({ ...mk, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
          <small className="muted">Dùng trong mã đơn, ví dụ 20261111-PN-IPC-<b>{mk.code || 'MÃ'}</b>/01</small></label>
        {err && <small className="f-err">{err}</small>}
        <div className="row"><button type="button" className="btn primary sm" disabled={!mk.name.trim() || !mk.code} onClick={create}>Tạo</button><button type="button" className="btn sm" onClick={() => { setMk(null); setErr(''); }}>Huỷ</button></div>
      </div>}
    </div>);
}
