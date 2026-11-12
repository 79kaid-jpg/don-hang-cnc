import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb } from '../lib/supabase';
import { dropCache } from '../lib/qcache';
import { Icon } from './Icon';

const num = (s: string) => { const v = Number(s.replace(/\s/g, '').replace(',', '.')); return s.trim() === '' ? null : Number.isFinite(v) && v >= 0 ? v : NaN; };
const show = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','));

/** Lưu kế hoạch 1 tháng (tấn). null = xoá. */
export async function savePlan(ym: string, tons: number | null) {
  const month = ym + '-01';
  const r = tons == null ? await sb.from('monthly_plans').delete().eq('month', month)
    : await sb.from('monthly_plans').upsert({ month, tons, note: null, updated_at: new Date().toISOString() });
  dropCache('pm:pl');
  return r.error?.message ?? null;
}

/** Khung nhập nhanh 1 tháng — mở từ trang Thống kê */
export function PlanSheet({ ym, value, onClose, onSaved }: { ym: string; value: number | null; onClose: () => void; onSaved: (v: number | null) => void }) {
  const [s, setS] = useState(show(value)); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const v = num(s); const bad = Number.isNaN(v);
  const go = async (x: number | null) => { setBusy(true); const e = await savePlan(ym, x); setBusy(false); if (e) setErr(e); else { onSaved(x); onClose(); } };
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return createPortal(<div className="pd-dr-bg pl-bg" onClick={onClose}>
    <form className="pl-sheet" role="dialog" aria-modal="true" aria-labelledby="pl-h" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (!bad) go(v); }}>
      <h3 id="pl-h">Kế hoạch tháng {Number(ym.slice(5))}/{ym.slice(0, 4)}</h3>
      <label className="pl-in"><input autoFocus inputMode="decimal" value={s} onChange={(e) => setS(e.target.value)} placeholder="VD: 200" aria-invalid={bad} /><span>tấn</span></label>
      {bad && <span className="pl-err small">Nhập số ≥ 0</span>}{err && <span className="pl-err small">{err}</span>}
      <div className="pl-act">{value != null && <button type="button" className="btn ghost" disabled={busy} onClick={() => go(null)}>Xoá</button>}
        <button type="button" className="btn" onClick={onClose}>Huỷ</button><button className="btn primary" disabled={busy || bad}>{busy ? 'Đang lưu…' : 'Lưu'}</button></div>
    </form></div>, document.body);
}

/** Bảng 12 tháng — tab Quản trị › Kế hoạch sản lượng */
export function PlanGrid({ canEdit }: { canEdit: boolean }) {
  const [y, setY] = useState(() => new Date().getFullYear());
  const [db, setDb] = useState<Record<string, number> | null>(null);
  const [ed, setEd] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = () => sb.from('monthly_plans').select('month, tons').then(({ data }) => setDb(Object.fromEntries(((data ?? []) as { month: string; tons: number }[]).map((x) => [x.month.slice(0, 7), Number(x.tons)]))));
  useEffect(() => { load(); }, []);
  const ms = Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
  const val = (m: string) => (m in ed ? ed[m] : show(db?.[m]));
  const dirty = ms.filter((m) => m in ed && num(ed[m]) !== (db?.[m] ?? null));
  const anyBad = ms.some((m) => Number.isNaN(num(val(m))));
  const sum = ms.reduce((a, m) => a + (num(val(m)) || 0), 0);
  const save = async () => { setBusy(true); setMsg(''); for (const m of dirty) { const e = await savePlan(m, num(ed[m])); if (e) { setMsg(e); setBusy(false); return; } } setEd({}); await load(); setBusy(false); setMsg('Đã lưu ' + dirty.length + ' tháng'); };
  const cur = new Date().toISOString().slice(0, 7);
  return <section className="card pl-grid-c">
    <div className="pl-top"><div className="pd-seg" role="group" aria-label="Năm">
      <button type="button" aria-label="Năm trước" onClick={() => setY(y - 1)}><Icon name="back" size={16} /></button><b>{y}</b><button type="button" aria-label="Năm sau" onClick={() => setY(y + 1)}><span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}><Icon name="back" size={16} /></span></button></div>
      <span className="muted small">Cả năm: <b>{sum.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tấn</b></span></div>
    {!db ? <div className="skel" style={{ height: 160 }} /> : <div className="pl-grid">{ms.map((m) => { const b = Number.isNaN(num(val(m)));
      return <label key={m} className={'pl-cell' + (m === cur ? ' cur' : '') + (m in ed && dirty.includes(m) ? ' dirty' : '') + (b ? ' bad' : '')}><span>Tháng {Number(m.slice(5))}</span>
        <span className="pl-in"><input inputMode="decimal" disabled={!canEdit} value={val(m)} placeholder="—" aria-invalid={b} onChange={(e) => setEd({ ...ed, [m]: e.target.value })} /><span>tấn</span></span></label>; })}</div>}
    <div className="pl-foot"><span className="muted small">{canEdit ? 'Để trống = không có kế hoạch. Số hiện ở biểu đồ Sản lượng.' : 'Chỉ admin được sửa.'}</span>
      {msg && <span className="small">{msg}</span>}
      {canEdit && <>{dirty.length > 0 && <button type="button" className="btn" onClick={() => setEd({})}>Huỷ</button>}<button type="button" className="btn primary" disabled={!dirty.length || anyBad || busy} onClick={save}>{busy ? 'Đang lưu…' : 'Lưu' + (dirty.length ? ' (' + dirty.length + ')' : '')}</button></>}</div>
  </section>;
}
