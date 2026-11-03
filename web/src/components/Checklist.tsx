import { useCallback, useEffect, useState } from 'react';
import { sb, type Order } from '../lib/supabase';
import { qt2Step } from '../lib/format';
import { Icon } from './Icon';

/** Checklist theo bước. Mục bắt buộc chưa tick thì máy chủ không cho chuyển bước tiến (trigger guard_checklist). */
export const STEP_LABEL: Record<string, string> = {
  'qt0.tiep_nhan': 'QT0 · Tiếp nhận', 'qt0.boc_tach': 'QT0 · Bóc tách F1', 'qt0.kiem_tra_f1': 'QT0 · Kiểm tra F1',
  'qt1.xndh': 'QT1 · Lập XNĐH', 'qt1.cho_duyet_xndh': 'QT1 · Duyệt XNĐH', 'qt1.cho_khach': 'QT1 · KH1 → KH2 xác nhận',
  'qt2.b1': 'QT2 · B1 Lập LGC + dự toán NVL', 'qt2.b2': 'QT2 · B2 Duyệt LGC 4 cấp', 'qt2.b3': 'QT2 · B3 Mua NVL (PO)',
  'qt2.b4': 'QT2 · B4 Nhập kho & QC NVL', 'qt2.b5': 'QT2 · B5 Bàn giao NVL', 'qt2.b6': 'QT2 · B6 Gia công & QC TP',
  'qt3.thong_bao': 'QT3 · B2 Thông báo giao + F8', 'qt3.lap_lgh': 'QT3 · B3 Lập lệnh giao hàng', 'qt3.cho_duyet_lgh': 'QT3 · B3 Duyệt LGH',
  'qt3.giao_hang': 'QT3 · B4 Giao hàng + ảnh', 'qt3.ky_bbgh': 'QT3 · B5 Ký & lưu BBGH'
};

export function stepKeys(o: Order): string[] {
  const k: string[] = [];
  if (['tiep_nhan', 'boc_tach', 'kiem_tra_f1'].includes(o.status)) k.push('qt0.' + o.status);
  if (['xndh', 'cho_duyet_xndh', 'cho_khach'].includes(o.status)) k.push('qt1.' + o.status);
  const s2 = qt2Step(o); if (s2 && o.status === 'san_xuat') k.push('qt2.' + s2);
  if (STEP_LABEL['qt3.' + o.gh_status]) k.push('qt3.' + o.gh_status);
  return k;
}

export type CItem = { id: string; step: string; label: string; required: boolean; sort: number; active: boolean };
type Done = { item_id: string; done: boolean; done_by: string | null; done_at: string };

export function ChecklistBox({ orderId, step, onState, compact }: { orderId: string; step: string; onState?: (missing: number) => void; compact?: boolean }) {
  const [items, setItems] = useState<CItem[] | null>(null);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const [{ data: it }, { data: d }] = await Promise.all([
      sb.from('checklist_items').select('*').eq('step', step).eq('active', true).order('sort'),
      sb.from('checklist_done').select('item_id, done, done_by, done_at').eq('order_id', orderId)]);
    setItems((it as CItem[]) ?? []);
    setDone(Object.fromEntries(((d as Done[]) ?? []).map((x) => [x.item_id, x])));
  }, [orderId, step]);
  useEffect(() => { load(); }, [load]);
  const missing = (items ?? []).filter((i) => i.required && !done[i.id]?.done).length;
  useEffect(() => { if (items) onState?.(missing); }, [missing, items]); // eslint-disable-line

  const toggle = async (i: CItem) => {
    setBusy(i.id); setErr('');
    const v = !done[i.id]?.done;
    const { error } = await sb.from('checklist_done').upsert({ order_id: orderId, item_id: i.id, done: v, done_at: new Date().toISOString() });
    setBusy('');
    if (error) setErr(error.message); else load();
  };
  if (!items) return <div className="ck"><span className="small muted">Đang tải checklist…</span></div>;
  if (!items.length) return compact ? null : <div className="ck"><span className="small muted">Bước này không có checklist.</span></div>;
  const n = items.filter((i) => done[i.id]?.done).length;
  return (
    <div className={'ck' + (missing ? '' : ' ok')}>
      <div className="ck-head"><b>Checklist · {STEP_LABEL[step] ?? step}</b>
        <span className={'chip ' + (missing ? 'wait' : 'done')}>{missing ? <Icon name="clock" size={13} /> : <Icon name="check" size={13} />}{n}/{items.length}{missing ? ` · thiếu ${missing} bắt buộc` : ' · đủ'}</span></div>
      <ul className="ck-list">
        {items.map((i) => {
          const d = done[i.id]?.done;
          return (
            <li key={i.id}>
              <label className={'ck-item' + (d ? ' on' : '') + (i.required && !d ? ' need' : '')}>
                <input type="checkbox" checked={!!d} disabled={busy === i.id} onChange={() => toggle(i)} />
                <span>{i.label}{i.required ? <em className="ck-req" aria-label="bắt buộc"> *</em> : <em className="ck-opt"> (không bắt buộc)</em>}</span>
              </label>
            </li>);
        })}
      </ul>
      {err && <div className="small" style={{ color: 'var(--red)' }}>{err}</div>}
    </div>);
}

/** Quản trị checklist: chỉ Admin IT sửa (RLS chặn ở máy chủ) */
export function ChecklistAdmin({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<CItem[] | null>(null);
  const [step, setStep] = useState('qt0.tiep_nhan');
  const [nl, setNl] = useState(''); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const load = useCallback(() => { sb.from('checklist_items').select('*').order('sort').then(({ data }) => setItems((data as CItem[]) ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  const list = (items ?? []).filter((i) => i.step === step);
  const save = async (id: string, patch: Partial<CItem>) => {
    setErr(''); setOk('');
    const { error } = await sb.from('checklist_items').update(patch).eq('id', id);
    if (error) setErr(error.message); else { setOk('Đã lưu.'); load(); }
  };
  const add = async () => {
    if (!nl.trim()) return;
    const { error } = await sb.from('checklist_items').insert({ step, label: nl.trim(), required: true, sort: (list.at(-1)?.sort ?? 0) + 1 });
    if (error) setErr(error.message); else { setNl(''); setOk('Đã thêm.'); load(); }
  };
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!canEdit && <div className="msg info"><Icon name="alert" size={18} /><span>Chỉ Admin IT được sửa checklist.</span></div>}
      <label className="f" style={{ maxWidth: 420 }}>Bước
        <select value={step} onChange={(e) => setStep(e.target.value)}>
          {Object.entries(STEP_LABEL).map(([k, t]) => <option key={k} value={k}>{t} ({(items ?? []).filter((i) => i.step === k && i.active).length})</option>)}
        </select></label>
      <ul className="ck-admin">
        {list.map((i) => (
          <li key={i.id} className={i.active ? '' : 'off'}>
            <input aria-label="Nội dung mục" defaultValue={i.label} disabled={!canEdit} onBlur={(e) => e.target.value.trim() !== i.label && save(i.id, { label: e.target.value.trim() })} />
            <label className="ck-tog"><input type="checkbox" checked={i.required} disabled={!canEdit} onChange={() => save(i.id, { required: !i.required })} />Bắt buộc</label>
            <button className="btn sm" disabled={!canEdit} onClick={() => save(i.id, { active: !i.active })}>{i.active ? 'Ẩn' : 'Hiện lại'}</button>
          </li>))}
        {items && list.length === 0 && <li className="small muted">Bước này chưa có mục nào.</li>}
      </ul>
      {canEdit && <div className="row"><label className="f" style={{ flex: '1 1 260px' }}>Thêm mục<input value={nl} onChange={(e) => setNl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ví dụ: Kiểm tra bản vẽ mới nhất" /></label>
        <button className="btn primary" onClick={add}><Icon name="plus" size={16} />Thêm</button></div>}
      {err && <div className="msg err">{err}</div>}{ok && <div className="small muted">{ok}</div>}
      <p className="small muted" style={{ margin: 0 }}>Mục bắt buộc chưa tick thì không chuyển được sang bước sau. Mục đã ẩn không còn hiện và không còn bắt buộc; đơn đã tick vẫn giữ lịch sử.</p>
    </div>);
}
