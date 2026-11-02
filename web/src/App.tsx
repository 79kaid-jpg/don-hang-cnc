import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { sb } from './lib/supabase';
import Login from './pages/Login';
import MyWork from './pages/MyWork';
import Orders from './pages/Orders';
import NewOrder from './pages/NewOrder';
import OrderDetail from './pages/OrderDetail';
import Admin from './pages/Admin';

function Shell() {
  const { session, me, can } = useAuth();
  const [pending, setPending] = useState(0);
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
  return (
    <>
      <header className="top">
        <div className="logo" aria-hidden="true">C</div>
        <div><div style={{ fontWeight: 700, fontSize: 16 }}>Đơn hàng CNC</div><div className="small muted">CNC → IPC → Hanwa</div></div>
        <div style={{ marginLeft: 'auto' }} className="row">
          <NavLink to="/" className="btn sm ghost" aria-label="Phiếu chờ tôi duyệt" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            Chờ duyệt: {pending}
          </NavLink>
          <span><b>{me.full_name}</b> <span className="small muted">· {me.unit}</span></span>
          <button className="btn sm" onClick={() => sb.auth.signOut()}>Đăng xuất</button>
        </div>
      </header>
      <div className="shell">
        <nav className="nav" aria-label="Menu chính">
          <NavLink to="/" end>Việc của tôi</NavLink>
          <NavLink to="/don">Đơn hàng</NavLink>
          {can('admin_it') && <NavLink to="/quan-tri">Quản trị</NavLink>}
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<MyWork />} />
            <Route path="/don" element={<Orders />} />
            <Route path="/don/moi" element={<NewOrder />} />
            <Route path="/don/:id" element={<OrderDetail />} />
            <Route path="/quan-tri" element={<Admin />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </>
  );
}
export default function App() { return <AuthProvider><Shell /></AuthProvider>; }
