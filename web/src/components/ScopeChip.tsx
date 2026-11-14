import { useEffect, useRef, useState } from 'react';
import { useScope, setScope, SCOPE_LABEL, CO_NAME, type Scope } from '../lib/myco';
import { Icon } from './Icon';
import { sb } from '../lib/supabase';
import { confirmDialog } from './ui';
import type { Co } from '../lib/myco';

const NM: Record<Scope, string> = { ALL: 'Tất cả công ty', PN: 'PNC', IPC: 'IPC', HW: 'Hanwa' };
/** Chuyển công ty tường minh: hỏi xác nhận, đổi màu nền toàn app */
export async function switchCo(c: Scope, from?: Scope) {
  if (c === from) return true;
  const ok = await confirmDialog(c === 'ALL' ? 'Xem tổng hợp tất cả công ty? Ở chế độ này chỉ xem, muốn thao tác phải chuyển về đúng công ty.'
    : 'Chuyển sang làm việc cho ' + NM[c] + '? Mọi trang sẽ hiển thị và thao tác dưới tên ' + NM[c] + '.', c === 'ALL' ? 'Xem tất cả' : 'Chuyển sang ' + NM[c]);
  if (ok) setScope(c as Scope);
  return ok;
}
export type { Co };

const full = (s: Scope) => (s === 'ALL' ? 'Tất cả công ty' : CO_NAME[s]);
/** Chip chọn công ty dùng chung toàn app (admin / tổng giám đốc) */
export function ScopeChip({ variant }: { variant: 'side' | 'top' }) {
  const { scope, canSwitch, options, own } = useScope(); const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const f = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', f); return () => document.removeEventListener('pointerdown', f); }, [open]);
  // Báo máy chủ công ty đang làm (máy chủ chặn thao tác sai công ty)
  useEffect(() => { if (canSwitch) sb.rpc('set_active_co', { p_co: scope }); }, [scope, canSwitch]);
  useEffect(() => { document.documentElement.dataset.scope = canSwitch ? scope : (own ?? ''); }, [scope, canSwitch, own]);
  if (!canSwitch) return null;
  return <div className={'scope scope-' + variant + ' sc-' + scope} ref={ref}>
    <button type="button" className="scope-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} data-kbd="C" data-kbd-label={'Đang xem: ' + full(scope) + ' · bấm C để đổi'}>
      <span className="scope-dot" aria-hidden="true" /><span className="scope-t">{scope === 'ALL' ? (variant === 'side' ? 'Tất cả công ty' : 'Tất cả') : (variant === 'side' ? 'Đang làm: ' : '') + NM[scope]}</span><Icon name="caret" size={14} /></button>
    {open && <div className={'scope-menu' + (variant === 'top' ? ' sheetish' : '')} role="listbox" aria-label="Xem dữ liệu công ty">
      {options.map((c) => <button key={c} type="button" role="option" aria-selected={scope === c} className={'sc-' + c} onClick={() => { setOpen(false); switchCo(c, scope); }}>
        <span className="scope-dot" aria-hidden="true" />{scope === c ? full(c) : (c === 'ALL' ? 'Xem tất cả công ty' : 'Chuyển sang ' + NM[c])}{scope === c && <Icon name="check" size={15} />}</button>)}
    </div>}
  </div>;
}
