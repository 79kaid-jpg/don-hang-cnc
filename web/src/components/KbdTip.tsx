import { useEffect, useRef, useState } from 'react';

/** Nhãn phím tắt khi rê chuột (hoặc Tab tới) phần tử có data-kbd="G B" / "Ctrl S". Chỉ máy có chuột. */
export function KbdTip() {
  const [t, setT] = useState<{ x: number; y: number; up: boolean; label: string; keys: string[] } | null>(null);
  const tm = useRef(0); const cur = useRef<Element | null>(null);
  useEffect(() => {
    const show = (el: HTMLElement) => {
      const r = el.getBoundingClientRect(); const keys = (el.dataset.kbd ?? '').split(/\s+/).filter(Boolean);
      const label = el.dataset.kbdLabel ?? el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
      const up = r.bottom + 40 > innerHeight;
      setT({ x: Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90), y: up ? r.top - 8 : r.bottom + 8, up, label: label.replace(/\s+/g, ' ').slice(0, 40), keys });
    };
    const hide = () => { clearTimeout(tm.current); cur.current = null; setT(null); };
    const drop = () => setT(null);
    const over = (e: PointerEvent) => { if (e.pointerType !== 'mouse') return; const el = (e.target as Element).closest?.('[data-kbd]') as HTMLElement | null;
      if (el === cur.current) return; hide(); if (!el) return; cur.current = el; if (el.title) { el.dataset.kbdLabel = el.title; el.removeAttribute('title'); } tm.current = window.setTimeout(() => show(el), 400); };
    const focus = (e: FocusEvent) => { const el = (e.target as Element).closest?.('[data-kbd]') as HTMLElement | null; if (el && (e.target as HTMLElement).matches(':focus-visible')) { cur.current = el; show(el); } };
    addEventListener('pointerover', over); addEventListener('focusin', focus); addEventListener('focusout', hide);
    addEventListener('pointerdown', hide, true); addEventListener('scroll', drop, true); addEventListener('keydown', hide);
    return () => { removeEventListener('pointerover', over); removeEventListener('focusin', focus); removeEventListener('focusout', hide);
      removeEventListener('pointerdown', hide, true); removeEventListener('scroll', drop, true); removeEventListener('keydown', hide); };
  }, []);
  if (!t) return null;
  return <div className={'kt' + (t.up ? ' up' : '')} role="tooltip" style={{ left: t.x, top: t.y }}>
    {t.label && <span>{t.label}</span>}<span className="kbd-set">{t.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}</span></div>;
}
