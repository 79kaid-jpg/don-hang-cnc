import { Icon } from './Icon';
import { waited } from '../lib/holders';

/** Hạn xử lý một bước: ≥ 36 giờ = sắp quá hạn, ≥ 48 giờ (2 ngày) = quá hạn */
export const STEP_WARN_H = 36, STEP_LATE_H = 48;
export function Age({ since, short }: { since?: string | null; short?: boolean }) {
  if (!since) return null;
  const h = (Date.now() - new Date(since).getTime()) / 36e5;
  const lv = h >= STEP_LATE_H ? 'late' : h >= STEP_WARN_H ? 'warn' : 'ok';
  const txt = h < 48 ? (h < 1 ? Math.max(1, Math.round(h * 60)) + ' phút' : Math.round(h) + ' giờ') : waited(since);
  return <span className={'age ' + lv} title={'Ở bước này ' + txt + (lv === 'late' ? ' – đã quá hạn 2 ngày' : lv === 'warn' ? ' – sắp quá hạn' : '')}>
    <Icon name={lv === 'late' ? 'alert' : 'clock'} size={13} />{txt}{!short && lv !== 'ok' && <b>{lv === 'late' ? 'Quá hạn' : 'Sắp quá hạn'}</b>}</span>;
}
