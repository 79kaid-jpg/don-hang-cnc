import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Ngăn kéo đáy (điện thoại) / ngăn phải (máy tính): gắn thẳng vào body để không bị thanh điều hướng che; vuốt xuống để đóng */
export function Sheet({ head, sub, label, onClose, children }: { head: ReactNode; sub?: string; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null); const y0 = useRef<number | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, [onClose]);
  const move = (y: number) => { if (y0.current == null || !ref.current) return; const d = Math.max(0, y - y0.current); ref.current.style.transform = `translateY(${d}px)`; };
  const end = (y: number) => { if (y0.current == null || !ref.current) return; const d = y - y0.current; y0.current = null; ref.current.style.transform = ''; if (d > 90) onClose(); };
  return <div className="sw-sheet-bg" onClick={onClose}>
    <aside ref={ref} className="sw-detail sh" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
      <div className="sh-top" onTouchStart={(e) => { y0.current = e.touches[0].clientY; }} onTouchMove={(e) => move(e.touches[0].clientY)} onTouchEnd={(e) => end(e.changedTouches[0].clientY)}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="mv-head"><span className="row" style={{ gap: 8, minWidth: 0 }}>{head}</span>
          <button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
        {sub && <span className="small muted">{sub}</span>}
      </div>
      <div className="sh-body">{children}</div>
    </aside></div>;
}
