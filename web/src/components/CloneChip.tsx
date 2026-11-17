import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { sb, errText } from '../lib/supabase';
import { COMPANY, type Company } from '../lib/proc';
import { Icon } from './Icon';
import { toast } from './ui';

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
  const ok0 = useCanClone(proc, company); const ok = ok0 && (proc === 'QT0' || company === 'PN'); const [ask, setAsk] = useState<{ r: number; b: number } | null>(null); const [busy, setBusy] = useState(false); const nav = useNavigate(); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!ask) return; const f = (e: Event) => { const t = e.target as Node; if (!ref.current?.contains(t) && !document.querySelector('.cl-pop')?.contains(t)) setAsk(null); }; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setAsk(null); };
    document.addEventListener('pointerdown', f); addEventListener('keydown', k); return () => { document.removeEventListener('pointerdown', f); removeEventListener('keydown', k); }; }, [ask]);
  if (!ok) return null;
  const stop = (e: React.SyntheticEvent) => { e.stopPropagation(); };
  const go = async () => { setBusy(true); const { data, error } = await sb.rpc('doc_clone', { p_doc: docId }); setBusy(false);
    if (error) { toast(errText(error)); return; } toast('Đã clone thành hồ sơ mới'); setAsk(null); nav('/don/' + orderId + '?tab=' + proc + '&b=' + data + '&co=' + company); };
  return <div className="cl-chip" ref={ref} onPointerDown={stop} onClick={stop}>
    <button type="button" className="cl-btn" aria-expanded={!!ask} aria-label={'Clone ' + title} title="Clone thành hồ sơ mới" onClick={(e) => { if (ask) return setAsk(null); const r = e.currentTarget.getBoundingClientRect(); setAsk({ r: innerWidth - r.right, b: innerHeight - r.top + 8 }); }}><Icon name="copy" size={14} /><span>Clone</span></button>
    {ask && createPortal(<div className="cl-pop" role="dialog" aria-label="Xác nhận clone" style={{ right: Math.max(12, ask.r), bottom: ask.b }} onPointerDown={stop} onClick={stop}>
      <p>Clone <b>{title}</b> của <b>{COMPANY[company as Company] ?? company}</b> thành hồ sơ mới? Hồ sơ mới chép toàn bộ thông tin và bắt đầu lại từ bước đầu.</p>
      <div className="cl-pop-b"><button type="button" className="btn sm" onClick={() => setAsk(null)}>Huỷ</button><button type="button" className="btn sm cl-go" disabled={busy} autoFocus onClick={go}><Icon name="copy" size={14} />{busy ? 'Đang tạo…' : 'Clone'}</button></div>
    </div>, document.body)}
  </div>;
}
