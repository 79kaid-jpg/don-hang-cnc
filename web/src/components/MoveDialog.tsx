import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { sb, errText, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Proc } from '../pages/Board';
import { ChecklistBox } from './Checklist';
import { Icon } from './Icon';
import { toast } from './ui';

/** Bước chỉ cần chuyển trạng thái (dữ liệu đã nhập trong phiếu) → gọi thẳng; máy chủ vẫn kiểm tra đủ dữ liệu + checklist */
const AUTO: Record<string, { fn: string; args: Record<string, string>; ok: string }> = {
  'qt0.tiep_nhan': { fn: 'start_extraction', args: {}, ok: 'Đã chuyển sang bóc tách.' },
  'qt0.boc_tach': { fn: 'submit_f1', args: {}, ok: 'Đã gửi kiểm tra F1.' },
  'qt1.xndh': { fn: 'submit_for_approval', args: { p_doc: 'F2' }, ok: 'Đã gửi duyệt XNĐH.' },
  'qt1.cho_khach': { fn: 'close_qt1', args: {}, ok: 'ĐK2 đạt – đã mở QT2.' },
  'qt2.b1': { fn: 'submit_for_approval', args: { p_doc: 'F5' }, ok: 'Đã gửi duyệt LGC 4 cấp.' },
  'qt3.thong_bao': { fn: 'f8_submit', args: {}, ok: 'Đã thông báo giao hàng.' },
  'qt3.lap_lgh': { fn: 'submit_for_approval', args: { p_doc: 'LGH1' }, ok: 'Đã gửi duyệt LGH 2 chặng.' }
};
const PREFIX: Record<string, string> = { qt0: 'qt0.', qt1: 'qt1.', qt2: 'qt2.', qt4: 'qt3.' };

export function MoveDialog({ o, proc, i, onClose, onMoved }: { o: Order; proc: Proc; i: number; onClose: () => void; onMoved: () => void }) {
  const { can } = useAuth();
  const from = proc.cols[i], to = proc.cols[i + 1];
  const key = PREFIX[proc.key] + from.key; const auto = AUTO[key];
  const [missing, setMissing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const isApproval = from.roles.length === 0;
  const allowed = from.roles.some(can);
  const formLink = '/don/' + o.id + '?tab=' + from.tab;

  const go = async () => {
    if (!auto) return;
    setBusy(true); setErr('');
    const { error } = await sb.rpc(auto.fn, { p_order: o.id, ...auto.args });
    setBusy(false);
    if (error) setErr(errText(error)); else { toast(auto.ok); onMoved(); }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal mv" role="dialog" aria-modal="true" aria-labelledby="mv-t" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="mv-head">
          <h2 id="mv-t" style={{ margin: 0 }}>Chuyển {o.code}</h2>
          <button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button>
        </div>
        <div className="mv-route"><span className="chip idle">{from.title}</span><Icon name="arrow" size={16} /><span className="chip wait">{to.title}</span></div>

        {isApproval ? (
          <div className="msg info"><Icon name="alert" size={18} /><span>Đây là bước duyệt. Đơn chỉ sang bước sau khi người duyệt bấm <b>Duyệt</b> trong phiếu (có tin Zalo báo họ).</span></div>
        ) : !allowed ? (
          <div className="msg info"><Icon name="alert" size={18} /><span>Bạn không có vai trò làm bước <b>{from.title}</b>. Người phụ trách sẽ chuyển.</span></div>
        ) : (<>
          <ChecklistBox orderId={o.id} step={key} onState={setMissing} />
          {from.gate && <div className="small"><Icon name="alert" size={14} /> Điều kiện chuyển: <b>{from.gate}</b> – máy chủ sẽ kiểm tra khi chuyển.</div>}
          {!auto && <div className="msg info"><Icon name="alert" size={18} /><span>Bước này cần nhập số liệu / kết quả trong phiếu (<b>{from.next}</b>). Tick xong checklist rồi mở phiếu để hoàn tất – đủ điều kiện thì đơn tự sang <b>{to.title}</b>.</span></div>}
        </>)}

        {err && <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link className="btn" to={formLink}>Mở phiếu{err ? ' để nhập' : ''}</Link>
          {auto && allowed && !isApproval && (
            <button className="btn primary" disabled={busy || missing !== 0} onClick={go}>
              {missing ? `Còn ${missing} mục bắt buộc` : busy ? 'Đang chuyển…' : 'Chuyển sang ' + to.title}</button>)}
        </div>
      </div>
    </div>);
}

/** Trả về bước trước 1 bước: bắt buộc lý do; nếu qua bước duyệt thì huỷ duyệt cũ, duyệt lại từ cấp 1 */
const BACK_NOTE: Record<string, string> = {
  'qt1.cho_duyet_xndh': 'Lượt duyệt XNĐH đang chờ sẽ bị huỷ; sửa xong phải gửi duyệt lại.',
  'qt1.cho_khach': 'Huỷ toàn bộ duyệt XNĐH và xác nhận KH1/KH2; XNĐH được gửi duyệt lại từ cấp 1.',
  'qt2.b2': 'Lượt duyệt LGC 4 cấp đang chờ sẽ bị huỷ; sửa LGC xong phải gửi duyệt lại.',
  'qt2.b3': 'Huỷ duyệt LGC đã có (và PO nếu đang duyệt); LGC được gửi duyệt lại từ cấp 1 (Anh Mai).',
  'qt2.b4': 'Huỷ duyệt PO; Mua hàng phải gửi duyệt PO lại.',
  'qt2.b5': 'Huỷ kết quả nhập kho F4 và trừ lại tồn kho đã nhập (nếu có mua). Nếu NVL lấy từ tồn kho thì về B2 và LGC duyệt lại từ cấp 1.',
  'qt2.b6': 'Huỷ biên bản bàn giao F6 và cộng lại tồn kho đã xuất.',
  'qt3.cho_duyet_lgh': 'Huỷ duyệt Lệnh giao hàng 2 chặng đang chờ.',
  'qt3.giao_hang': 'Huỷ duyệt LGH đã có; LGH chặng 1 được gửi duyệt lại từ cấp 1.',
  'qt3.ky_bbgh': 'Bỏ mốc "đã giao xong"; ảnh và BBGH đã tải vẫn giữ.'
};
export function ReturnDialog({ o, proc, i, onClose, onDone }: { o: Order; proc: Proc; i: number; onClose: () => void; onDone: () => void }) {
  const from = proc.cols[i], to = proc.cols[i - 1]; const key = PREFIX[proc.key] + from.key;
  const [why, setWhy] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  const go = async () => {
    setBusy(true); setErr('');
    const { error } = await sb.rpc('return_step', { p_order: o.id, p_step: key, p_reason: why.trim() });
    setBusy(false);
    if (error) setErr(errText(error)); else { toast('Đã trả về ' + to.title + '. Người làm bước đó đã được báo.'); onDone(); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal mv" role="dialog" aria-modal="true" aria-labelledby="rt-t" onClick={(e) => e.stopPropagation()}>
        <div className="mv-head"><h2 id="rt-t" style={{ margin: 0 }}>Trả về {o.code}</h2>
          <button className="btn sm icon-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
        <div className="mv-route"><span className="chip wait">{to.title}</span><Icon name="back" size={16} /><span className="chip idle">{from.title}</span></div>
        {BACK_NOTE[key] && <div className="msg rt-warn"><Icon name="alert" size={18} /><span>{BACK_NOTE[key]}</span></div>}
        <label className="f">Lý do trả về *<textarea rows={3} autoFocus value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Ví dụ: Sai độ dày dòng 3, cần bóc tách lại" /></label>
        <p className="small muted" style={{ margin: 0 }}>Bước "{to.title}" mở lại với hạn mới. Người/nhóm làm bước đó và người giám sát nhận Zalo kèm lý do. Checklist đã tick vẫn giữ.</p>
        {err && <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn rt-go" disabled={busy || !why.trim()} onClick={go}><Icon name="back" size={16} />{busy ? 'Đang trả về…' : 'Trả về ' + to.title}</button>
        </div>
      </div>
    </div>);
}
