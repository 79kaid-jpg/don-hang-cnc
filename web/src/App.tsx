import { useEffect, useState } from 'react';
import { Appearance } from './components/Appearance';
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
import FlowMap from './pages/FlowMap';
import Install, { UpdateBar } from './pages/Install';
import { ZaloLink } from './components/ZaloLink';
import { ShortcutHost } from './components/Shortcuts';
import WfHome from './wf/WfHome';
import WfEditor from './wf/WfEditor';
import WfRun from './wf/WfRun';
import WfPrint from './wf/WfPrint';
import './wf/wf.css';

function Shell() {
  const { session, me, can, acting, real, stopActing } = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  // Trình tạo quy trình: hiện mục menu cho người thiết kế, hoặc người đang có việc / phiếu duyệt trong quy trình mới
  const [wfN, setWfN] = useState(0);
  // Menu trái: ẩn/hiện (nhớ theo trình duyệt); khi ẩn có nút nổi để mở menu dạng lớp phủ
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('side-hidden') === '1'; } catch { return false; } });
  const [peek, setPeek] = useState(false); const [sheet, setSheet] = useState(false);
  const toggleSide = (v: boolean) => { setHidden(v); setPeek(false); try { localStorage.setItem('side-hidden', v ? '1' : '0'); } catch { /* */ } };
  useEffect(() => {
    const h = (e: Event) => setBusy((e as CustomEvent<boolean>).detail);
    window.addEventListener('busy', h); return () => window.removeEventListener('busy', h);
  }, []);
  // Điện thoại: cuộn xuống thì thu nút nổi (Tạo đơn) cho khỏi che nội dung, cuộn lên thì hiện lại
  useEffect(() => { let y = scrollY; const f = () => { const d = scrollY - y; if (Math.abs(d) > 8) { document.body.classList.toggle('scroll-down', d > 0 && scrollY > 80); y = scrollY; } };
    addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f); }, []);
  useEffect(() => { if (me) sb.rpc('wf_inbox').then(({ data }) => setWfN(((data ?? []) as unknown[]).length)); }, [me]);
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
    { to: '/so-do', icon: 'flow', label: 'Sơ đồ đơn hàng', short: 'Sơ đồ', side: true },
    { to: '/don', icon: 'list', label: 'Danh sách đơn', short: 'Đơn hàng' },
    ...(can('thiet_ke_qt') || wfN > 0 ? [{ to: '/quy-trinh-moi', icon: 'flow', label: 'Trình tạo quy trình (thử)', short: 'Quy trình', side: true }] : []),
    ...(can('admin_it') ? [{ to: '/quan-tri', icon: 'settings', label: 'Quản trị', short: 'Quản trị' }] : [])
  ];
  const badge = (n?: number) => (n ? <span className="nav-badge" aria-label={n + ' phiếu chờ duyệt'}>{n}</span> : null);
  const initial = (me.full_name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={'app' + (busy ? ' is-busy' : '') + (hidden ? ' side-hidden' : '') + (peek ? ' side-peek' : '')}>
      {hidden && !peek && <button className="side-fab" aria-label="Mở menu" title="Mở menu" onClick={() => setPeek(true)}><Icon name="menu" /></button>}
      {peek && <div className="side-scrim" onClick={() => setPeek(false)} aria-hidden="true" />}
 <ShortcutHost onToggleSide={() => toggleSide(!hidden)} />
      {busy && <div className="busy" role="progressbar" aria-label="Đang xử lý" />}
      <aside className="side" aria-label="Điều hướng">
        <div className="brand"><img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>Đơn hàng CNC</div><div className="small muted">CNC → IPC → Hanwha</div></div>
          <button className="btn sm icon-btn side-hide" aria-label={hidden ? 'Ghim menu' : 'Ẩn menu'} title={hidden ? 'Ghim menu' : 'Ẩn menu (mở lại bằng nút ☰ góc trái)'} onClick={() => toggleSide(!hidden)}><Icon name="panel" size={18} /></button></div>
        <button className="side-search" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <Icon name="search" size={18} /><span>Tìm đơn nhanh</span><kbd>Ctrl K</kbd></button>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="nav-item" onClick={() => setPeek(false)}><Icon name={i.icon} />{i.label}{badge(i.badge)}</NavLink>))}
        </nav>
        <div className="side-foot">
          <div className="who"><span className="avatar" aria-hidden="true">{initial}</span>
            <span style={{ minWidth: 0 }}><b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.full_name}</b><span className="small muted">{me.unit}</span></span></div>
          <details className="nav-appear"><summary className="nav-item"><Icon name="sun" />Giao diện</summary><Appearance /></details>
          <NavLink to="/cai-app" className="nav-item"><Icon name="download" />Hướng dẫn</NavLink>
          <button className="nav-item kbd-link" style={{ border: 0, background: 'transparent', font: 'inherit' }} onClick={() => dispatchEvent(new Event('show-shortcuts'))}><Icon name="list" />Phím tắt<kbd>?</kbd></button>
          <NavLink to="/zalo" className="nav-item"><Icon name="bell" />Thông báo Zalo{me.zalo_chat_id ? '' : <span className="nav-badge" aria-label="chưa liên kết">!</span>}</NavLink>
          <button className="nav-item" style={{ border: 0, background: 'transparent', font: 'inherit' }} onClick={() => sb.auth.signOut()}><Icon name="logout" />Đăng xuất</button>
        </div>
      </aside>

      <header className="topbar">
        <img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
        <b className="tb-title">Đơn hàng CNC</b>
        <button className="tb-btn" aria-label="Tìm đơn" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}><Icon name="search" size={21} /></button>
        <NavLink to="/zalo" className="tb-btn" aria-label="Thông báo Zalo"><Icon name="bell" size={21} />{!me.zalo_chat_id && <i className="tb-dot" aria-hidden="true" />}</NavLink>
        <button className="tb-av" aria-label={'Tài khoản ' + me.full_name} aria-expanded={sheet} onClick={() => setSheet(true)}>{initial}</button>
      </header>
      {sheet && (
        <div className="sheet-bg" onClick={() => setSheet(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Tài khoản" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-grip" aria-hidden="true" />
            <div className="who"><span className="avatar" aria-hidden="true">{initial}</span>
              <span style={{ minWidth: 0 }}><b style={{ display: 'block' }}>{me.full_name}</b><span className="small muted">{me.unit} · {me.zalo_chat_id ? 'Đã liên kết Zalo' : 'Chưa liên kết Zalo'}</span></span></div>
            <Appearance />
            <nav className="sheet-list" onClick={() => setSheet(false)}>
              {can('admin_it') && <NavLink to="/quan-tri"><Icon name="settings" />Quản trị</NavLink>}
              {(can('thiet_ke_qt') || wfN > 0) && <NavLink to="/quy-trinh-moi"><Icon name="flow" />Trình tạo quy trình (thử)</NavLink>}
              <NavLink to="/zalo"><Icon name="bell" />Thông báo Zalo{!me.zalo_chat_id && <span className="nav-badge">!</span>}</NavLink>
              <NavLink to="/cai-app"><Icon name="download" />Hướng dẫn & cài app</NavLink>
              <button onClick={() => sb.auth.signOut()}><Icon name="logout" />Đăng xuất</button>
            </nav>
          </div>
        </div>)}

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
          <Route path="/so-do" element={<FlowMap />} />
          <Route path="/don" element={<Orders />} />
          <Route path="/don/moi" element={<NewOrder />} />
          <Route path="/don/:id" element={<OrderDetail />} />
          <Route path="/quan-tri" element={<Admin />} />
          <Route path="/quy-trinh-moi" element={<WfHome />} />
          <Route path="/quy-trinh-moi/sua/:id" element={<WfEditor />} />
          <Route path="/quy-trinh-moi/chay/:id" element={<WfRun />} />
          <Route path="/quy-trinh-moi/in/:id" element={<WfPrint />} />
          <Route path="/cai-app" element={<Install />} />
          <Route path="/quy-trinh" element={<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="page-head"><div><h1>Tài liệu quy trình đơn hàng BASE</h1><p className="muted">Sơ đồ tương tác, bảng bước, điều kiện chuyển và 10 form. Bản v4 – đã gộp QT2.</p></div>
              <div className="row"><NavLink className="btn sm" to="/cai-app"><Icon name="back" size={16} />Hướng dẫn</NavLink><a className="btn sm" href="./quy-trinh/index.html" target="_blank" rel="noopener">Mở toàn màn hình ↗</a></div></div>
            <iframe src="./quy-trinh/index.html" title="Tài liệu quy trình đơn hàng BASE" style={{ width: '100%', height: 'calc(100vh - 200px)', minHeight: 600, border: '1px solid var(--line)', borderRadius: 'var(--r)', background: '#fff' }} />
          </div>} />
          <Route path="/zalo" element={<><div className="page-head"><div><h1>Thông báo Zalo</h1><p className="muted">Nhận tin nhắn từ bot khi đến lượt bạn duyệt phiếu.</p></div></div><ZaloLink /></>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {items.filter((i) => i.to !== '/quan-tri' && i.to !== '/quy-trinh-moi').map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} size={22} />{i.short}{badge(i.badge)}</NavLink>))}
      </nav>
      <UpdateBar /><Toaster /><ConfirmHost />
    </div>
  );
}
export default function App() { return <AuthProvider><Shell /></AuthProvider>; }
