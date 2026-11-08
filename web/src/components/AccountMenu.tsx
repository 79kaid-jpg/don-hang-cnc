import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sb, type Profile } from '../lib/supabase';
import { Appearance } from './Appearance';
import { Icon } from './Icon';

/** Chân menu trái: một nút tài khoản, bấm mở menu (giao diện, Zalo, hướng dẫn, phím tắt, đăng xuất) */
export function AccountMenu({ me, initial }: { me: Profile; initial: string }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null); const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', c); addEventListener('keydown', k);
    return () => { removeEventListener('mousedown', c); removeEventListener('keydown', k); };
  }, [open]);
  const go = (to: string) => { setOpen(false); nav(to); };
  const noZalo = !me.zalo_chat_id;
  return (
    <div className="acc" ref={box}>
      {open && <div className="acc-pop" role="menu" aria-label="Tài khoản">
        <div className="acc-hd"><span className="avatar acc-av" aria-hidden="true">{initial}</span>
          <span className="acc-id"><b>{me.full_name}</b><span className="small muted">{[me.position, me.unit].filter(Boolean).join(' · ')}</span></span></div>
        <div className="acc-sec"><Appearance /></div>
        <div className="acc-list">
          <button role="menuitem" onClick={() => go('/zalo')}><Icon name="bell" size={17} /><span>Thông báo Zalo</span>
            <span className={'acc-st' + (noZalo ? ' off' : '')}>{noZalo ? 'Chưa liên kết' : 'Đã liên kết'}</span></button>
          <button role="menuitem" onClick={() => go('/cai-app')}><Icon name="download" size={17} /><span>Hướng dẫn & cài app</span></button>
          <button role="menuitem" onClick={() => { setOpen(false); dispatchEvent(new Event('show-shortcuts')); }}><Icon name="list" size={17} /><span>Phím tắt</span><kbd>?</kbd></button>
        </div>
        <div className="acc-list acc-out"><button role="menuitem" onClick={() => sb.auth.signOut()}><Icon name="logout" size={17} /><span>Đăng xuất</span></button></div>
      </div>}
      <button className="acc-btn" aria-haspopup="menu" aria-expanded={open} title={me.full_name} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{initial}{noZalo && <i className="acc-dot" aria-label="chưa liên kết Zalo" />}</span>
        <span className="acc-id"><b>{me.full_name}</b><span className="small muted">{me.unit}</span></span>
        <svg className="acc-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m7 15 5-5 5 5" /></svg>
      </button>
    </div>);
}
