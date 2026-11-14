import { useEffect, useRef, useState } from 'react';
import { useScope, setScope, SCOPES, SCOPE_LABEL, CO_NAME, type Scope } from '../lib/myco';
import { Icon } from './Icon';

const full = (s: Scope) => (s === 'ALL' ? 'Tất cả công ty' : CO_NAME[s]);
/** Chip chọn công ty dùng chung toàn app (admin / tổng giám đốc) */
export function ScopeChip({ variant }: { variant: 'side' | 'top' }) {
  const { scope, canSwitch } = useScope(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const f = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f); }, [open]);
  useEffect(() => { document.documentElement.dataset.scope = canSwitch ? scope : ''; }, [scope, canSwitch]);
  if (!canSwitch) return null;
  return <div className={'scope scope-' + variant + ' sc-' + scope} ref={ref}>
    <button type="button" className="scope-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} data-kbd="C" data-kbd-label={'Đang xem: ' + full(scope) + ' · bấm C để đổi'}>
      <span className="scope-dot" aria-hidden="true" /><span className="scope-t">{variant === 'side' ? full(scope) : SCOPE_LABEL[scope]}</span><Icon name="caret" size={14} /></button>
    {open && <div className={'scope-menu' + (variant === 'top' ? ' sheetish' : '')} role="listbox" aria-label="Xem dữ liệu công ty">
      {SCOPES.map((c) => <button key={c} type="button" role="option" aria-selected={scope === c} className={'sc-' + c} onClick={() => { setScope(c); setOpen(false); }}>
        <span className="scope-dot" aria-hidden="true" />{full(c)}{scope === c && <Icon name="check" size={15} />}</button>)}
    </div>}
  </div>;
}
