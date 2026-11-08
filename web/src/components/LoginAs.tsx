import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { confirmDialog, toast } from './ui';

/** Tên người phụ trách: Admin IT bấm vào để "đăng nhập với tư cách" người đó ngay (không phải vào Quản trị) */
export function LoginAs({ uid, name, className, children }: { uid?: string | null; name: string; className?: string; children: ReactNode }) {
  const { real, actAs } = useAuth(); const nav = useNavigate();
  const ok = !!uid && !!real?.roles.includes('admin_it') && uid !== real.id;
  if (!ok) return <span className={className}>{children}</span>;
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!(await confirmDialog(`Đăng nhập với tư cách ${name}? Bạn thấy và thao tác đúng như người này cho tới khi bấm Thoát.`, 'Đăng nhập với tư cách'))) return;
    const err = await actAs(uid!); if (err) toast(err); else { toast('Đang dùng app với tư cách ' + name); nav('/'); }
  };
  return <button type="button" className={(className ?? '') + ' login-as'} title={'Admin: đăng nhập với tư cách ' + name} onPointerDown={(e) => e.stopPropagation()} onClick={go}>{children}</button>;
}
