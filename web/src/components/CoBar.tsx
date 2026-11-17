import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { sb, errText } from '../lib/supabase';
import { useCompanies, type CoOrder } from '../lib/coorders';
import { reloadCoIdx } from '../lib/myco';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';
import { toast, confirmDialog } from './ui';

/** Đầu XNĐH: mã đơn của công ty (nổi bật, sửa khi được phép) + tham chiếu đơn công ty trước (không bắt buộc) */
/** lap: phiếu đang ở bước Lập – chỉ lúc này mới sửa mã / đổi tham chiếu */
export function CoBar({ docId, can, locked, lap, onTables }: { docId: string; can: boolean; locked?: boolean; lap?: boolean; onTables: (t: Record<string, unknown>) => void }) {
  const cos = useCompanies(); const { can: role } = useAuth(); const adm = role('admin_it') || role('admin_cnc');
  const [co, setCo] = useState<CoOrder | null>(null); const [cands, setCands] = useState<CoOrder[]>([]);
  const [ed, setEd] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { const f = () => setSlot(document.getElementById('pp-codeslot')); f(); const t = window.setInterval(f, 400); return () => window.clearInterval(t); }, []);
  const load = async () => { const { data } = await sb.from('co_orders').select('*').eq('doc_id', docId).maybeSingle(); setCo(data as CoOrder | null); };
  useEffect(() => { load(); }, [docId]);
  const seller = cos?.find((c) => c.buyer === co?.company);
  const [info, setInfo] = useState<{ auto: boolean; ref_code: string | null; cands: { id: string; code: string }[] } | null>(null);
  useEffect(() => { if (!co) return; sb.rpc('co_ref_info', { p_doc: docId }).then(({ data }) => { const x = data as typeof info; setInfo(x); setCands(((x?.cands ?? []) as CoOrder[])); }); }, [co?.id, co?.ref_id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!co) return null;
  const me = cos?.find((c) => c.code === co.company); const canCode = !locked && !!lap && ((me?.allow_edit && (can || adm)) || role('admin_it')); const canRef = !locked && !!lap && (can || adm) && !info?.auto;
  const saveCode = async () => { if (ed === null) return; setBusy(true); const { data, error } = await sb.rpc('co_set_code', { p_doc: docId, p_code: ed }); setBusy(false);
    if (error) return toast(errText(error)); setEd(null); toast('Đã đổi mã: ' + data); load(); reloadCoIdx(); };
  const setRef = async (id: string) => { if (!(await confirmDialog('Đổi tham chiếu sang ' + (cands.find((c) => c.id === id)?.code ?? 'không tham chiếu') + '? Thay đổi được ghi vào Lịch sử đơn.', 'Đổi'))) return; const { error } = await sb.rpc('co_set_ref', { p_doc: docId, p_ref: id || null }); if (error) return toast(errText(error)); load(); };
  const copy = async () => { if (!(await confirmDialog('Chép danh sách tấm từ đơn tham chiếu? Danh sách hiện tại sẽ bị thay; giá để trống cho bạn nhập.', 'Chép'))) return;
    const { data, error } = await sb.rpc('co_copy_ref', { p_doc: docId }); if (error) return toast(errText(error));
    const r = await sb.from('docs_v').select('tables').eq('id', docId).single(); if (r.data) onTables(r.data.tables ?? {}); toast('Đã chép ' + data + ' dòng'); };
  const ref = { code: info?.ref_code ?? null };
  const showCode = slot?.dataset.show === '1'; // chỉ 1 XNĐH → không có ô chọn đơn, hiện mã ở đây
  const top = slot && (showCode || canCode || ed !== null) ? createPortal(ed === null
    ? <span className="cob-top2">{showCode && <b className="cob-v" title={'Mã đơn ' + co.company}>{co.code}</b>}{showCode && co.edited && <span className="chip idle" title={'Mã tự tạo: ' + co.code_auto}>đã sửa</span>}
        {canCode && <button type="button" className="btn sm icon-btn cob-pen" aria-label="Sửa mã đơn" title="Sửa mã đơn" onClick={() => setEd(co.code)}><Icon name="edit" size={16} /></button>}</span>
    : <span className="cob-ed cob-top2"><input value={ed} autoFocus onChange={(e) => setEd(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') saveCode(); if (e.key === 'Escape') setEd(null); }} aria-label="Mã đơn mới" />
        <button type="button" className="btn sm primary" disabled={busy || !ed.trim()} onClick={saveCode}>Lưu</button><button type="button" className="btn sm" onClick={() => setEd(null)}>Huỷ</button></span>, slot) : null;
  return <>{top}
    {seller && lap && <div className="cob-ref1">
      <label><span className="cob-lb">Tham chiếu {seller.code}</span>
        {canRef ? <select value={co.ref_id ?? ''} onChange={(e) => setRef(e.target.value)} aria-label="Đơn tham chiếu">
            <option value="">{cands.length ? '— Chọn đơn ' + seller.code + ' —' : 'Không có đơn ' + seller.code + ' nào đang chờ liên kết'}</option>{co.ref_id && ref.code && !cands.some((c) => c.id === co.ref_id) && <option value={co.ref_id}>{ref.code}</option>}{cands.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
          : <b className="cob-locked">{info?.auto && <Icon name="shield" size={13} />}{ref.code ?? '—'}{info?.auto && <span className="small muted"> · Liên kết tự động</span>}</b>}</label>
      {false && canRef && co?.ref_id && <button type="button" className="btn sm" onClick={copy}><Icon name="copy" size={15} />Chép DS tấm</button>}
    </div>}</>;
}

/** QT2/QT3: hồ sơ thuộc đơn nào – hiện mã đơn của công ty đang xem hồ sơ (theo chuỗi tham chiếu từ đơn PN) */
export function CoLink({ coOrderId, company }: { coOrderId: string | null | undefined; company: string }) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => { if (!coOrderId) return setCode(null);
    sb.from('co_orders').select('id, company, code, ref_id').then(({ data }) => { const all = (data ?? []) as { id: string; company: string; code: string; ref_id: string | null }[];
      let cur = all.find((x) => x.id === coOrderId);
      while (cur && cur.company !== company) { const nx = all.find((x) => x.ref_id === cur!.id); if (!nx) break; cur = nx; }
      setCode(cur && cur.company === company ? cur.code : null); }); }, [coOrderId, company]);
  if (!coOrderId) return null;
  return <div className="cob cob-link"><span className="cob-lb">Thuộc đơn {company}</span><b className="cob-v">{code ?? 'Chưa có đơn ' + company + ' tham chiếu'}</b></div>;
}
