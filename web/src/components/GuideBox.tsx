import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useAuth } from '../lib/auth';
import { adminGuideLink, fillVars, lines, type Guide } from '../lib/guides';

/** Hiển thị (chỉ đọc) một hướng dẫn bước. compact = dạng thu gọn trong phiếu */
export function GuideBox({ g, vars, compact, hidePurpose }: { g?: Guide; vars?: Record<string, string>; compact?: boolean; hidePurpose?: boolean }) {
  const adm = useAuth().can('admin_it');
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open]);
  if (!g) return null;
  const todo = lines(fillVars(g.todo, vars)); const links = lines(g.links);
  const body = <>
    {!hidePurpose && g.purpose && <p className="gd-purpose">{fillVars(g.purpose, vars)}</p>}
    {todo.length > 0 && <><div className="gd-h">Việc cần làm</div><ol className="gd-todo">{todo.map((t, i) => <li key={i}>{t}</li>)}</ol></>}
    {g.notes.trim() && <div className="gd-note"><Icon name="alert" size={14} /><span>{fillVars(g.notes, vars)}</span></div>}
    {links.length > 0 && <div className="gd-links">{links.map((l, i) => { const [t, u] = l.includes('|') ? l.split('|').map((x) => x.trim()) : [l, l];
      return /^https?:\/\//.test(u) ? <a key={i} href={u} target="_blank" rel="noreferrer"><Icon name="file" size={13} />{t}</a> : <span key={i}>{t}</span>; })}</div>}
    {adm && <a className="gd-edit" href={adminGuideLink(g.key)}><Icon name="ftext" size={12} />Sửa trong Quản trị</a>}
  </>;
  if (!compact) return <div className="gd">{body}</div>;
  return <>
    <button className={'btn xs icon-only gd-btn' + (open ? ' on' : '')} aria-label={'Hướng dẫn: ' + g.title} title="Hướng dẫn bước này" aria-expanded={open} onClick={() => setOpen(!open)}>💡</button>
    {open && createPortal(<div className="gd-pop-bg" onClick={() => setOpen(false)}>
      <section className="gd-pop" role="dialog" aria-label={g.title} onClick={(e) => e.stopPropagation()}>
        <header><span>💡</span><b>{g.title.replace(/^QT\d · /, '')}</b><button className="btn xs icon-only" aria-label="Đóng" onClick={() => setOpen(false)}><Icon name="x" size={14} /></button></header>
        <div className="gd">{body}</div></section></div>, document.body)}
  </>;
}
