import { fieldsOf, f0Perm, useFields } from '../lib/fields';
import { isNumOk, numTyping } from '../lib/proc';
import type { Profile } from '../lib/supabase';
import { ProjectPicker } from './ProjectPicker';

type V = Record<string, string | null | undefined>;
/** Các ô F0 · Thông tin đơn hàng theo Quản trị → Trường dữ liệu (ô có sẵn lưu trên đơn, ô thêm mới lưu trong orders.extra) */
export function OrderFields({ vals, extra, onVal, onExtra, disabled, people, skip }: {
  vals: V; extra: Record<string, string>; onVal: (k: string, v: string) => void; onExtra: (k: string, v: string) => void; disabled?: boolean; people: Profile[]; skip?: string[] }) {
  useFields();
  return <>{fieldsOf('F0', 'header').filter((f) => f0Perm(f) !== 'hide' && !(skip ?? []).includes(f.key)).map((f) => {
    const v = (f.sys ? vals[f.key] : extra[f.key]) ?? ''; const on = (x0: string) => { const x = f.type === 'number' ? numTyping(x0) : x0; return f.sys ? onVal(f.key, x) : onExtra(f.key, x); }; const req = f0Perm(f) === 'required';
    const lab = <span>{f.label}{req && <b className="req" aria-label="bắt buộc"> *</b>}</span>;
    const wide = f.type === 'textarea';
    if (f.key === 'project') return <div key={f.key} className="f f-wide">{lab}<ProjectPicker value={vals.project_id ?? ''} name={vals.project ?? ''} customerId={vals.customer_id ?? ''} disabled={disabled}
      onChange={(p) => { onVal('project_id', p?.id ?? ''); onVal('project', p?.name ?? ''); }} /></div>;
    return <label key={f.key} className={'f' + (wide ? ' f-wide' : '')} style={wide ? { gridColumn: '1 / -1' } : undefined}>{lab}
      {f.type === 'select' ? <select disabled={disabled} value={v} onChange={(e) => on(e.target.value)}>{!f.options.includes(v) && <option value={v}>{v || '—'}</option>}{f.options.map((o) => <option key={o}>{o}</option>)}</select>
        : f.type === 'person' ? <select disabled={disabled} value={v} onChange={(e) => on(e.target.value)}><option value="">[chưa giao]</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        : f.type === 'textarea' ? <textarea rows={3} disabled={disabled} value={v} onChange={(e) => on(e.target.value)} />
        : <input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} required={req} disabled={disabled} value={v} onChange={(e) => on(e.target.value)}
            placeholder={f.key === 'contact' ? 'Tên · số điện thoại' : undefined} />}
      {f.type === 'number' && !isNumOk(v) && <small className="f-err">Phải là số</small>}
      {f.help && <small className="muted">{f.help}</small>}</label>; })}</>;
}
