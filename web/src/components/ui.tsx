import { useEffect, useRef, useState, type ReactNode } from 'react';
import { chipKind } from '../lib/format';
import { Icon } from './Icon';

const ICON: Record<string, string> = { done: 'check', bad: 'alert', wait: 'clock', idle: '' };
/** Nhãn trạng thái: màu + icon + chữ (không chỉ dựa vào màu) */
export const Chip = ({ s, text }: { s: string; text?: string }) => {
  const k = chipKind(s);
  return <span className={'chip ' + k}>{ICON[k] && <Icon name={ICON[k]} size={13} />}{text ?? s}</span>;
};

// ── Toast: báo thành công, tự ẩn sau 4s, đọc qua aria-live, không chiếm focus ──
type T = { id: number; text: string };
let push: (t: string) => void = () => {};
export const toast = (t: string) => push(t);
export function Toaster() {
  const [list, setList] = useState<T[]>([]);
  useEffect(() => {
    push = (text) => { const id = Date.now() + Math.random(); setList((l) => [...l, { id, text }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), 4000); };
  }, []);
  return (
    <div className="toaster" aria-live="polite" role="status">
      {list.map((t) => <div key={t.id} className="toast"><Icon name="check" size={18} />{t.text}</div>)}
    </div>
  );
}

/** Lỗi hiện tại chỗ (role=alert); thông báo thành công chuyển sang toast */
export const Msg = ({ err, ok }: { err?: string; ok?: string }) => {
  useEffect(() => { if (ok) toast(ok); }, [ok]);
  return err ? <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div> : null;
};

// ── Hộp xác nhận cho thao tác khó hoàn tác ──
let ask: (q: string, label?: string, safe?: boolean) => Promise<boolean> = async () => true;
/** safe=true: thao tác bình thường (nút vàng); mặc định: thao tác khó hoàn tác (nút đỏ) */
export const confirmDialog = (q: string, label = 'Xác nhận', safe = false) => ask(q, label, safe);
export function ConfirmHost() {
  const [st, setSt] = useState<{ q: string; d: string; safe: boolean; res: (v: boolean) => void } | null>(null);
  useEffect(() => { ask = (q, d = 'Xác nhận', safe = false) => new Promise((res) => setSt({ q, d, safe, res })); }, []);
  if (!st) return null;
  const done = (v: boolean) => { st.res(v); setSt(null); };
  return (
    <div className="modal-bg" onClick={() => done(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-q" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && done(false)}>
        <p id="cf-q" style={{ margin: 0, fontWeight: 600 }}>{st.q}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" autoFocus onClick={() => done(false)}>Huỷ</button>
          <button className={st.safe ? 'btn primary' : 'btn danger-fill'} onClick={() => done(true)}>{st.d}</button>
        </div>
      </div>
    </div>
  );
}

export const Skeleton = ({ rows = 3, h = 56 }: { rows?: number; h?: number }) => (
  <div className="steps" aria-busy="true" aria-label="Đang tải">{Array.from({ length: rows }, (_, i) => <div key={i} className="skel" style={{ height: h }} />)}</div>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty"><Icon name="inbox" size={28} /><b>{title}</b>{children}</div>
);

/** Menu thả xuống gọn: một nút + danh sách lệnh (đóng khi bấm ra ngoài / Esc) */
export type MenuItem = { label: string; icon?: string; onClick: () => void; danger?: boolean; hint?: string; sep?: boolean } | null | false;
export function Menu({ label, icon, items, align = 'right', primary, title }: { label?: string; icon?: string; items: MenuItem[]; align?: 'left' | 'right'; primary?: boolean; title?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); }; }, [open]);
  const list = items.filter(Boolean) as Exclude<MenuItem, null | false>[];
  if (!list.length) return null;
  return <div className="mnu" ref={ref}>
    <button type="button" className={'btn sm' + (primary ? ' primary' : '') + (label ? '' : ' icon-btn')} aria-haspopup="menu" aria-expanded={open} title={title} aria-label={title ?? label} onClick={() => setOpen(!open)}>
      {icon && <Icon name={icon} size={15} />}{label}{label && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}</button>
    {open && <div className={'mnu-pop ' + align} role="menu">{list.map((it, i) => <div key={i}>{it.sep && i > 0 && <div className="mnu-sep" />}
      <button type="button" role="menuitem" className={'mnu-it' + (it.danger ? ' danger' : '')} onClick={() => { setOpen(false); it.onClick(); }}>
        {it.icon && <Icon name={it.icon} size={15} />}<span><span>{it.label}</span>{it.hint && <span className="mnu-hint">{it.hint}</span>}</span></button></div>)}</div>}
  </div>;
}
