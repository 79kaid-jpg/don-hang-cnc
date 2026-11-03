import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { sb } from './lib/supabase';
import { Icon } from './components/Icon';
import { ConfirmHost, Toaster } from './components/ui';
import Login from './pages/Login';
import MyWork from './pages/MyWork';
import Orders from './pages/Orders';
import Board from './pages/Board';
import NewOrder from './pages/NewOrder';
import OrderDetail from './pages/OrderDetail';
import Admin from './pages/Admin';
import Install, { UpdateBar } from './pages/Install';
import { ZaloLink } from './components/ZaloLink';

function Shell() {
  const { session, me, can, acting, real, stopActing } = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const h = (e: Event) => setBusy((e as CustomEvent<boolean>).detail);
    window.addEventListener('busy', h); return () => window.removeEventListener('busy', h);
  }, []);
  useEffect(() => {
    if (!me) return;
    const count = () => sb.from('approvals').select('id', { count: 'exact', head: true })
      .eq('approver_id', me.id).eq('status', 'cho').then(({ count }) => setPending(count ?? 0));
    count();
    const ch = sb.channel('approvals').on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, count).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [me]);
  if (!session) return <Login />;
  if (!me) return <p style={{ padding: 24 }}>Không tìm thấy hồ sơ người dùng. Liên hệ IT.</p>;

  // Điều hướng chính: tối đa 4 mục, dùng chung cho thanh bên (máy tính) và thanh dưới (điện thoại)
  const items = [
    { to: '/', end: true, icon: 'inbox', label: 'Việc của tôi', short: 'Việc', badge: pending },
    { to: '/bang', icon: 'kanban', label: 'Bảng Kanban', short: 'Bảng' },
    { to: '/don', icon: 'list', label: 'Danh sách đơn', short: 'Đơn hàng' },
    ...(can('admin_it') ? [{ to: '/quan-tri', icon: 'settings', label: 'Quản trị', short: 'Quản trị' }] : [])
  ];
  const badge = (n?: number) => (n ? <span className="nav-badge" aria-label={n + ' phiếu chờ duyệt'}>{n}</span> : null);
  const initial = (me.full_name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={'app' + (busy ? ' is-busy' : '')}>
      {busy && <div className="busy" role="progressbar" aria-label="Đang xử lý" />}
      <aside className="side" aria-label="Điều hướng">
        <div className="brand"><img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
          <div><div style={{ fontWeight: 700 }}>Đơn hàng CNC</div><div className="small muted">CNC → IPC → Hanwa</div></div></div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="nav-item"><Icon name={i.icon} />{i.label}{badge(i.badge)}</NavLink>))}
        </nav>
        <div className="side-foot">
          <div className="who"><span className="avatar" aria-hidden="true">{initial}</span>
            <span style={{ minWidth: 0 }}><b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.full_name}</b><span className="small muted">{me.unit}</span></span></div>
          <NavLink to="/cai-app" className="nav-item"><Icon name="download" />Hướng dẫn</NavLink>
          <NavLink to="/zalo" className="nav-item"><Icon name="bell" />Thông báo Zalo{me.zalo_chat_id ? '' : <span className="nav-badge" aria-label="chưa liên kết">!</span>}</NavLink>
          <button className="nav-item" style={{ border: 0, background: 'transparent', font: 'inherit' }} onClick={() => sb.auth.signOut()}><Icon name="logout" />Đăng xuất</button>
        </div>
      </aside>

      <header className="topbar">
        <img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
        <b style={{ flex: 1 }}>Đơn hàng CNC</b>
        <NavLink to="/zalo" className="btn sm icon-btn" aria-label="Thông báo Zalo"><Icon name="bell" /></NavLink>
        <NavLink to="/cai-app" className="btn sm icon-btn" aria-label="Hướng dẫn sử dụng"><Icon name="download" /></NavLink>
        <span className="avatar" title={me.full_name} aria-label={me.full_name}>{initial}</span>
        <button className="btn sm icon-btn" aria-label="Đăng xuất" onClick={() => sb.auth.signOut()}><Icon name="logout" /></button>
      </header>

      <main className="main" id="main">
        {acting && (
          <div className="acting" role="status">
            <Icon name="eye" />
            <span style={{ flex: '1 1 240px' }}>Đang <b>đăng nhập với tư cách {me.full_name}</b> ({me.roles.join(', ') || 'chưa có vai trò'}). Bạn thấy và làm đúng như người này; nhật ký ghi tên thật của bạn ({real?.full_name}).</span>
            <button className="btn sm" onClick={async () => { await stopActing(); nav('/quan-tri'); }}><Icon name="x" size={16} />Thoát, về tài khoản của tôi</button>
          </div>)}
        <Routes>
          <Route path="/" element={<MyWork />} />
          <Route path="/bang" element={<Board />} />
          <Route path="/don" element={<Orders />} />
          <Route path="/don/moi" element={<NewOrder />} />
          <Route path="/don/:id" element={<OrderDetail />} />
          <Route path="/quan-tri" element={<Admin />} />
          <Route path="/cai-app" element={<Install />} />
          <Route path="/zalo" element={<><div className="page-head"><div><h1>Thông báo Zalo</h1><p className="muted">Nhận tin nhắn từ bot khi đến lượt bạn duyệt phiếu.</p></div></div><ZaloLink /></>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} size={22} />{i.short}{badge(i.badge)}</NavLink>))}
      </nav>
      <UpdateBar /><Toaster /><ConfirmHost />
    </div>
  );
}
export default function App() { return <AuthProvider><Shell /></AuthProvider>; }
