import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { sb, errText } from '../lib/supabase';
import { COMPANY, type Company } from '../lib/proc';
import { Icon } from './Icon';
import { toast } from './ui';
import { Qt0Picker, type Q0Row } from './Qt0Picker';

/** Quyền clone theo (QT, công ty) – hỏi máy chủ 1 lần, dùng chung */
const cache = new Map<string, Promise<boolean>>();
export const canClone = (proc: string, co: string) => { const k = proc + '|' + co; if (!cache.has(k)) cache.set(k, Promise.resolve(sb.rpc('can_start', { p_proc: proc, p_co: co })).then(({ data }) => !!data).catch(() => false)); return cache.get(k)!; };
export function useCanClone(proc: string, co?: string | null) {
  const [ok, setOk] = useState(false);
  useEffect(() => { let on = true; setOk(false); if (co) canClone(proc, co).then((v) => { if (on) setOk(v); }); return () => { on = false; }; }, [proc, co]);
  return ok;
}

/** Nút Clone trên thẻ Kanban (phiếu đã Thành công / Thất bại) – hỏi xác nhận ngay tại chỗ */
export function CloneChip({ docId, orderId, proc, company, title }: { docId: string; orderId: string; proc: string; company: string; title: string }) {
  const ok = useCanClone(proc, company); const [split, setSplit] = useState(false); const isSplit = proc === 'QT1' && company !== 'PN'; const [ask, setAsk] = useState<{ r: number; b: number } | null>(null); const [busy, setBusy] = useState(false); const nav = useNavigate(); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!ask) return; const f = (e: Event) => { const t = e.target as Node; if (!ref.current?.contains(t) && !document.querySelector('.cl-pop')?.contains(t)) setAsk(null); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(null); };
    document.addEventListener('pointerdown', f); addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); removeEventListener('keydown', k); }; }, [ask]);
  if (!ok) return null;
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const go = async () => { if (isSplit) { setAsk(null); setSplit(true); return; } setBusy(true); const { data, error } = await sb.rpc('doc_clone', { p_doc: docId }); setBusy(false);
    if (error) { toast(errText(error)); return; } toast('Đã clone thành hồ sơ mới'); setAsk(null); nav('/don/' + orderId + '?tab=' + proc + '&b=' + data + '&co=' + company); };
  return <div className="cl-chip" ref={ref} onPointerDown={stop} onClick={stop}>
    <button type="button" className="cl-btn" aria-expanded={!!ask} aria-label={'Clone ' + title} title="Clone thành hồ sơ mới" onClick={(e) => { if (ask) return setAsk(null); const r = e.currentTarget.getBoundingClientRect(); setAsk({ r: innerWidth - r.right, b: innerHeight - r.top + 8 }); }}><Icon name="copy" size={14} /><span>Clone</span></button>
    {ask && createPortal(<div className="cl-pop" role="dialog" aria-label="Xác nhận clone" style={{ right: Math.max(12, ask.r), bottom: ask.b }} onPointerDown={stop} onClick={stop}>
      <p>Clone <b>{title}</b> của <b>{COMPANY[company as Company] ?? company}</b> thành hồ sơ mới? Hồ sơ mới chép toàn bộ thông tin và bắt đầu lại từ bước đầu.</p>
      <div className="cl-pop-b"><button type="button" className="btn sm" onClick={() => setAsk(null)}>Huỷ</button><button type="button" className="btn sm cl-go" disabled={busy} autoFocus onClick={go}><Icon name="copy" size={14} />{busy ? 'Đang tạo…' : 'Clone'}</button></div>
    </div>, document.body)}
    {split && createPortal(<SplitPicker docId={docId} onClose={() => setSplit(false)} onDone={(id) => { setSplit(false); nav('/don/' + orderId + '?tab=' + proc + '&b=' + id + '&co=' + company); }} />, document.body)}
  </div>;
}

/** IPC/Hanwa · tách đơn: chọn số tấm từ phần còn lại của đơn nguồn rồi clone */
export function SplitPicker({ docId, onDone, onClose }: { docId: string; onDone: (batchId: string) => void; onClose: () => void }) {
  const [rows, setRows] = useState<Q0Row[] | null>(null); const [code, setCode] = useState('');
  useEffect(() => { let on = true;
    sb.rpc('src_rows', { p_doc: docId }).then(({ data, error }) => { if (!on) return; if (error) { toast(errText(error)); onClose(); return; }
      const l = ((data ?? []) as { i: number; k: string; r: Record<string, unknown>; tot: number; used: number; orders: Q0Row['orders'] }[]).map((x) => ({ ...x, tot: Number(x.tot), used: Number(x.used) })) as unknown as Q0Row[];
      if (!l.some((x) => x.tot - x.used > 0)) { toast('Đơn nguồn đã chia hết tấm – không tách thêm được'); onClose(); return; } setRows(l); });
    sb.rpc('co_ref_info', { p_doc: docId }).then(({ data }) => { if (on) setCode(String((data as { ref_code?: string } | null)?.ref_code ?? 'đơn nguồn')); });
    return () => { on = false; }; }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows) return null;
  return <Qt0Picker code={code} rows={rows} inTable={{}} onClose={onClose} onPick={async (p) => {
    const pick = p.map((x) => ({ k: rows.find((r) => r.i === x.i)?.k ?? '', q: x.q })).filter((x) => x.k && x.q > 0);
    const { data, error } = await sb.rpc('doc_clone_pick', { p_doc: docId, p_pick: pick });
    if (error) { toast(errText(error)); return; } toast('Đã tách thành đơn mới · ' + pick.reduce((a, x) => a + x.q, 0) + ' tấm'); onDone(String(data)); }} />;
}
