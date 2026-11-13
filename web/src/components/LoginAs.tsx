import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from './ui';

/** Tên người phụ trách: Admin IT bấm vào để "đăng nhập với tư cách" người đó ngay (không phải vào Quản trị) */
export function LoginAs({ uid, name, className, children }: { uid?: string | null; name: string; className?: string; children: ReactNode }) {
  const { real, actAs, grants } = useAuth(); const nav = useNavigate();
  const granted = grants.some((g) => !g.target_id || g.target_id === uid);
  const ok = !!uid && !!real && (real.roles.includes('admin_it') || granted) && uid !== real.id;
  if (!ok) return <span className={className}>{children}</span>;
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!(await confirmDialog(granted ? `Làm thay ${name}? Bạn thao tác được như người này (theo uỷ quyền), chữ ký ghi “làm thay”.` : `Xem với tư cách ${name}? Chỉ xem – muốn thao tác trên đơn thật cần có uỷ quyền làm thay (Quản trị › Uỷ quyền).`, granted ? 'Làm thay' : 'Xem với tư cách'))) return;
    const err = await actAs(uid!); if (err) toast(err); else { toast('Đang dùng app với tư cách ' + name); nav('/'); }
  };
  return <button type="button" className={(className ?? '') + ' login-as'} title={'Admin: đăng nhập với tư cách ' + name} onPointerDown={(e) => e.stopPropagation()} onClick={go}>{children}</button>;
}
