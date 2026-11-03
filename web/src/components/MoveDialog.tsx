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
