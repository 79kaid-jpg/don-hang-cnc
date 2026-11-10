import { useState } from 'react';
import { Icon } from './Icon';
import { useAuth } from '../lib/auth';
import { adminGuideLink, fillVars, lines, type Guide } from '../lib/guides';

/** Hiển thị (chỉ đọc) một hướng dẫn bước. compact = dạng thu gọn trong phiếu */
export function GuideBox({ g, vars, compact, hidePurpose }: { g?: Guide; vars?: Record<string, string>; compact?: boolean; hidePurpose?: boolean }) {
  const adm = useAuth().can('admin_it');
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('guide-open') !== '0'; } catch { return true; } });
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
  const tog = () => { const n = !open; setOpen(n); try { localStorage.setItem('guide-open', n ? '1' : '0'); } catch { /* */ } };
  return <section className={'gd gd-card' + (open ? ' open' : '')}>
    <button className="gd-top" aria-expanded={open} onClick={tog}><span className="gd-ic">💡</span><b>Hướng dẫn bước này</b><Icon name="down" size={14} /></button>
    {open && <div className="gd-in">{body}</div>}
  </section>;
}
