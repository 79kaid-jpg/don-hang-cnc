import { useState } from 'react';
import { isNumOk, numTyping } from '../lib/proc';
import type { FDef } from '../lib/fields';

/** Ô nhập cho trường đầu phiếu theo kiểu dữ liệu. Giá trị luôn là chuỗi. */
export const NUM_TYPES = ['number', 'int', 'money', 'percent'];
export const isNumType = (t: string) => NUM_TYPES.includes(t);
const toN = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const money = (s: string) => { if (!String(s).trim() || !isNumOk(s)) return s; return new Intl.NumberFormat('vi-VN').format(Number(String(s).replace(',', '.'))); };
export const fmtHead = (f: Pick<FDef, 'type'>, v: string) => (f.type === 'money' ? money(v) + (String(v).trim() ? ' đ' : '') : f.type === 'percent' && String(v).trim() ? v + ' %' : f.type === 'bool' ? (v ? 'Có' : 'Không') : v);
/** Lỗi định dạng (null = hợp lệ) */
export function headErr(t: string, v: string): string | null {
  const s = String(v ?? '').trim(); if (!s) return null;
  if (isNumType(t) && !isNumOk(s)) return 'Phải là số, VD: 12 hoặc 12,5';
  if (t === 'int' && !/^\d+$/.test(s)) return 'Chỉ nhập số nguyên';
  if (t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Email chưa đúng, VD: ten@congty.vn';
  if (t === 'phone' && !/^\+?[\d\s.-]{8,15}$/.test(s)) return 'Số điện thoại chưa đúng';
  if (t === 'url' && !/^https?:\/\/\S+\.\S+/.test(s)) return 'Link phải bắt đầu bằng http:// hoặc https://';
  return null;
}

export function HeadInput({ f, v, on, disabled, opts = [], calc }: { f: FDef; v: string; on: (x: string) => void; disabled?: boolean; opts?: string[]; calc?: string }) {
  const [focus, setFocus] = useState(false);
  const t = f.type;
  if (t === 'formula') return <input readOnly className="f-calc" value={calc ?? ''} title="Tự tính theo công thức" aria-readonly="true" />;
  if (t === 'select' || t === 'lookup') { const l = t === 'lookup' ? opts : f.options;
    return <select disabled={disabled} value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{l.map((o) => <option key={o}>{o}</option>)}{v && !l.includes(v) && <option>{v}</option>}</select>; }
  if (t === 'multi') { const cur = v.split(';').map((x) => x.trim()).filter(Boolean); const all = [...new Set([...f.options, ...cur])];
    const tog = (o: string) => on((cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join('; '));
    return <div className="hi-chips" role="group" aria-label={f.label}>{all.map((o) => <button key={o} type="button" disabled={disabled} aria-pressed={cur.includes(o)} className={cur.includes(o) ? 'on' : ''} onClick={() => tog(o)}>{cur.includes(o) ? '✓ ' : ''}{o}</button>)}
      {!all.length && <span className="small muted">Chưa có lựa chọn – thêm trong Quản trị</span>}</div>; }
  if (t === 'bool') return <span className="hi-bool"><input type="checkbox" disabled={disabled} checked={!!v} onChange={(e) => on(e.target.checked ? 'Có' : '')} /><span>{v ? 'Có' : 'Không'}</span></span>;
  if (t === 'textarea') return <textarea rows={2} disabled={disabled} value={v} onChange={(e) => on(e.target.value)} />;
  if (t === 'date' || t === 'datetime') return <input type={t === 'date' ? 'date' : 'datetime-local'} disabled={disabled} value={v} onChange={(e) => on(e.target.value)} />;
  const link = !focus && v && !headErr(t, v) ? (t === 'email' ? 'mailto:' + v : t === 'phone' ? 'tel:' + v.replace(/[^\d+]/g, '') : t === 'url' ? v : '') : '';
  const shown = !focus && t === 'money' ? money(v) : v;
  return <span className={'hi-wrap' + (t === 'money' || t === 'percent' ? ' hi-unit' : '')} data-unit={t === 'money' ? 'đ' : t === 'percent' ? '%' : undefined}>
    <input type={t === 'email' ? 'email' : t === 'phone' ? 'tel' : t === 'url' ? 'url' : 'text'} disabled={disabled} value={shown}
      inputMode={t === 'int' ? 'numeric' : isNumType(t) ? 'decimal' : t === 'phone' ? 'tel' : t === 'email' ? 'email' : t === 'url' ? 'url' : undefined}
      aria-invalid={headErr(t, v) ? true : undefined} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => on(isNumType(t) ? (t === 'int' ? e.target.value.replace(/\D/g, '') : t === 'money' ? numTyping(e.target.value).replace(/\./g, '') : numTyping(e.target.value)) : e.target.value)} />
    {link && <a className="hi-go" href={link} target={t === 'url' ? '_blank' : undefined} rel="noreferrer" aria-label={t === 'phone' ? 'Gọi' : t === 'email' ? 'Gửi mail' : 'Mở link'}>{t === 'phone' ? '📞' : t === 'email' ? '✉' : '↗'}</a>}
  </span>;
}
export { toN };
