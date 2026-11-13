import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { sb } from '../lib/supabase';
import { dt } from '../lib/format';
import { Icon } from './Icon';

type M = { id: string; order_id: string; code: string; project: string; proc: string | null; company: string | null; kind: string; from_name: string; text: string; via: string; at: string; unread: boolean };
const LB: Record<string, string> = { nudge: 'nhắc việc', reply: 'nhắn', reassign: 'giao việc cho bạn', auto: 'nhắc hạn', turn: 'chuyển phiếu', result: 'kết quả duyệt' };
const IC: Record<string, string> = { nudge: 'bell', reply: 'chat', reassign: 'users', auto: 'clock', turn: 'inbox', result: 'checksq' };

/** Chuông thông báo: tin Trao đổi gửi tới tôi (nhắc việc, giao lại, phản hồi, nhắc hạn) */
export function Bell({ variant }: { variant: 'top' | 'side' }) {
  const [ms, setMs] = useState<M[]>([]); const [open, setOpen] = useState(false); const nav = useNavigate(); const box = useRef<HTMLDivElement>(null); const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => { if (!open) return; const place = () => { const r = box.current?.getBoundingClientRect(); if (!r) return; const w = Math.min(380, innerWidth - 32); const rail = !!box.current?.closest('.side') && r.right < 110;
      setPos(rail ? { left: r.right + 10, top: Math.max(12, r.top) } : { left: Math.min(Math.max(16, r.left), innerWidth - w - 16), top: r.bottom + 8 }); };
    place(); addEventListener('resize', place); return () => removeEventListener('resize', place); }, [open]);
  const load = () => sb.rpc('my_msgs', { p_limit: 30 }).then(({ data }) => setMs((data as M[]) ?? []));
  useEffect(() => {
    load();
    const ch = sb.channel('bell-' + variant).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_msgs' }, () => load()).subscribe();
    return () => { sb.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const c = (e: MouseEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    addEventListener('keydown', k); addEventListener('mousedown', c);
    return () => { removeEventListener('keydown', k); removeEventListener('mousedown', c); };
  }, [open]);
  const n = ms.filter((m) => m.unread).length;
  const toggle = () => { const v = !open; setOpen(v); if (v && n) sb.rpc('seen_msgs').then(() => setTimeout(() => setMs((x) => x.map((m) => ({ ...m, unread: false }))), 1500)); };
  return (
    <div className={'bell bell-' + variant} ref={box}>
      <button className={variant === 'top' ? 'tb-btn' : 'btn sm icon-btn bell-btn'} aria-label={'Thông báo' + (n ? ', ' + n + ' chưa đọc' : '')} title="Thông báo" aria-expanded={open} onClick={toggle}>
        <Icon name="bell" size={variant === 'top' ? 21 : 18} />{n > 0 && <span className="bell-n" aria-hidden="true">{n > 9 ? '9+' : n}</span>}
      </button>
      {open && pos && createPortal(<div ref={pop} className="bell-pop bell-pop-p" role="dialog" aria-label="Thông báo" style={{ left: pos.left, top: pos.top }}>
        <div className="bell-h"><b>Thông báo</b><button className="btn sm icon-btn" aria-label="Đóng" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button></div>
        {ms.length === 0 ? <p className="small muted" style={{ padding: '18px 14px', margin: 0 }}>Chưa có tin nào. Khi quản lý nhắc việc, giao việc hoặc có người nhắn trong mục Trao đổi của phiếu bạn đang làm, tin sẽ hiện ở đây.</p>
          : <ul className="bell-list">{ms.map((m) => (
            <li key={m.id}><button className={'bell-it' + (m.unread ? ' new' : '')} onClick={() => { setOpen(false); nav('/don/' + m.order_id + (m.proc ? '?tab=' + m.proc : '')); }}>
              <span className={'bell-ic ' + m.kind}><Icon name={IC[m.kind] ?? 'chat'} size={14} /></span>
              <span className="bell-tx"><span><b>{m.from_name}</b> {LB[m.kind] ?? ''}{m.via === 'zalo' && <span className="tk-via">Zalo</span>}</span>
                <span className="bell-q">{m.text}</span>
                <span className="small muted">{m.code}{m.proc ? ' · ' + m.proc : ''}{m.company && m.proc !== 'QT0' ? ' · ' + m.company : ''} · {dt(m.at)}</span></span>
              {m.unread && <i className="bell-dot" aria-label="chưa đọc" />}
            </button></li>))}</ul>}
      </div>, document.body)}
    </div>
  );
}
