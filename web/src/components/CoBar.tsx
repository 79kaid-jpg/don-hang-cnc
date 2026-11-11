import { useEffect, useState } from 'react';
import { sb, errText } from '../lib/supabase';
import { useCompanies, type CoOrder } from '../lib/coorders';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';
import { toast, confirmDialog } from './ui';

/** Đầu XNĐH: mã đơn của công ty (nổi bật, sửa khi được phép) + tham chiếu đơn công ty trước (không bắt buộc) */
export function CoBar({ docId, can, onTables }: { docId: string; can: boolean; onTables: (t: Record<string, unknown>) => void }) {
  const cos = useCompanies(); const { can: role } = useAuth(); const adm = role('admin_it') || role('admin_cnc');
  const [co, setCo] = useState<CoOrder | null>(null); const [cands, setCands] = useState<CoOrder[]>([]);
  const [ed, setEd] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await sb.from('co_orders').select('*').eq('doc_id', docId).maybeSingle(); setCo(data as CoOrder | null); };
  useEffect(() => { load(); }, [docId]);
  const seller = cos?.find((c) => c.buyer === co?.company);
  useEffect(() => { if (!co || !seller) return setCands([]);
    let q = sb.from('co_orders').select('*').eq('company', seller.code).order('created_at', { ascending: false }).limit(50);
    if (co.project_id) q = q.eq('project_id', co.project_id); q.then(({ data }) => setCands((data as CoOrder[]) ?? [])); }, [co?.id, seller?.code]);
  if (!co) return null;
  const me = cos?.find((c) => c.code === co.company); const canCode = (me?.allow_edit && (can || adm)) || role('admin_it'); const canRef = can || adm;
  const saveCode = async () => { if (ed === null) return; setBusy(true); const { data, error } = await sb.rpc('co_set_code', { p_doc: docId, p_code: ed }); setBusy(false);
    if (error) return toast(errText(error)); setEd(null); toast('Đã đổi mã: ' + data); load(); };
  const setRef = async (id: string) => { const { error } = await sb.rpc('co_set_ref', { p_doc: docId, p_ref: id || null }); if (error) return toast(errText(error)); load(); };
  const copy = async () => { if (!(await confirmDialog('Chép danh sách tấm từ đơn tham chiếu? Danh sách hiện tại sẽ bị thay; giá để trống cho bạn nhập.', 'Chép'))) return;
    const { data, error } = await sb.rpc('co_copy_ref', { p_doc: docId }); if (error) return toast(errText(error));
    const r = await sb.from('docs_v').select('tables').eq('id', docId).single(); if (r.data) onTables(r.data.tables ?? {}); toast('Đã chép ' + data + ' dòng'); };
  const ref = cands.find((c) => c.id === co.ref_id);
  return (
    <div className="cob">
      <div className="cob-code">
        <span className="cob-lb">Mã đơn {co.company}</span>
        {ed === null ? <><b className="cob-v">{co.code}</b>{co.edited && <span className="chip idle" title={'Mã tự tạo: ' + co.code_auto}>đã sửa</span>}
            {canCode && <button type="button" className="btn sm icon-btn" aria-label="Sửa mã đơn" title="Sửa mã đơn" onClick={() => setEd(co.code)}><Icon name="edit" size={15} /></button>}</>
          : <span className="cob-ed"><input value={ed} autoFocus onChange={(e) => setEd(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') saveCode(); if (e.key === 'Escape') setEd(null); }} aria-label="Mã đơn mới" />
            <button type="button" className="btn sm primary" disabled={busy || !ed.trim()} onClick={saveCode}>Lưu</button><button type="button" className="btn sm" onClick={() => setEd(null)}>Huỷ</button></span>}
      </div>
      {seller && <div className="cob-ref">
        <span className="cob-lb">Tham chiếu đơn {seller.code} <span className="muted">(không bắt buộc)</span></span>
        <div className="cob-row">
          {canRef ? <select value={co.ref_id ?? ''} onChange={(e) => setRef(e.target.value)} aria-label="Đơn tham chiếu">
              <option value="">— Không tham chiếu —</option>{cands.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select>
            : <span>{ref?.code ?? '—'}</span>}
          {canRef && co.ref_id && <button type="button" className="btn sm" onClick={copy} title="Chép danh sách tấm từ đơn tham chiếu (không chép giá)"><Icon name="copy" size={15} />Chép DS tấm</button>}
        </div>
      </div>}
    </div>);
}
