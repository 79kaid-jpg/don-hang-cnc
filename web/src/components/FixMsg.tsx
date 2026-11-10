import { fixOf, goFix } from '../lib/gotoFix';
import { Icon } from './Icon';

/** Thông báo lỗi: nếu biết chỗ cần sửa thì bấm được. onGo: thay hành vi (vd. Kanban → mở phiếu) */
export function FixMsg({ err, onGo }: { err: string; onGo?: () => void }) {
  if (!err) return null; const f = fixOf(err);
  if (!f) return <div className="msg err" role="alert"><Icon name="alert" size={18} /><span>{err}</span></div>;
  return <button type="button" className="msg err msg-go" role="alert" onClick={() => (onGo ? onGo() : goFix(err))}>
    <Icon name="alert" size={18} /><span>{err}<b className="msg-go-t">{onGo ? 'Mở phiếu để sửa' : f.label} ›</b></span></button>;
}
