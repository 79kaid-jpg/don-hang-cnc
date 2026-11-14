import { Skeleton } from './components/ui';
import { useEffect, useState , lazy, Suspense } from 'react';
import { Appearance } from './components/Appearance';
import { scrollTop, scrollToY } from './lib/scroll';
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { sb } from './lib/supabase';
import { Icon } from './components/Icon';
import { ScopeChip } from './components/ScopeChip';
import { ConfirmHost, Toaster } from './components/ui';
import Login from './pages/Login';
import MyWork from './pages/MyWork';
import Orders from './pages/Orders';
import Board from './pages/Board';
import NewOrder from './pages/NewOrder';
import OrderDetail from './pages/OrderDetail';
const Admin = lazy(() => import('./pages/Admin'));
const FlowMap = lazy(() => import('./pages/FlowMap'));
import Install, { UpdateBar } from './pages/Install';
import { ZaloLink } from './components/ZaloLink';
import { Bell } from './components/Bell';
import { AccountMenu } from './components/AccountMenu';
import { ShortcutHost } from './components/Shortcuts';
import { KbdTip } from './components/KbdTip';
const WfHome = lazy(() => import('./wf/WfHome'));
const WfEditor = lazy(() => import('./wf/WfEditor'));
const WfRun = lazy(() => import('./wf/WfRun'));
const WfPrint = lazy(() => import('./wf/WfPrint'));
import './wf/wf.css';
const Stats = lazy(() => import('./pages/Stats'));
const ProjectReport = lazy(() => import('./pages/ProjectReport'));
import { Viewer } from './components/Viewer';
const ProcessDoc = lazy(() => import('./pages/ProcessDoc'));
const Simulate = lazy(() => import('./pages/Simulate'));

function Shell() {
  const { session, me, can, acting, real, stopActing, actUntil } = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  // Trình tạo quy trình: hiện mục menu cho người thiết kế, hoặc người đang có việc / phiếu duyệt trong quy trình mới
  const [wfN, setWfN] = useState(() => { try { return Number(localStorage.getItem('wf-n') ?? 0); } catch { return 0; } });
  // Menu trái: ẩn/hiện (nhớ theo trình duyệt); khi ẩn có nút nổi để mở menu dạng lớp phủ
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('side-hidden') === '1'; } catch { return false; } });
  const [peek, setPeek] = useState(false); const [sheet, setSheet] = useState(false);
  const toggleSide = (v: boolean) => { setHidden(v); setPeek(false); try { localStorage.setItem('side-hidden', v ? '1' : '0'); } catch { /* */ } };
  useEffect(() => {
    const h = (e: Event) => setBusy((e as CustomEvent<boolean>).detail);
    window.addEventListener('busy', h); return () => window.removeEventListener('busy', h);
  }, []);
  // iOS: khi bàn phím mở, thanh điều hướng đáy có thể bị đẩy lơ lửng giữa màn hình → ẩn khi đang gõ, và vẽ lại khi khung nhìn đổi kích thước
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !(el as HTMLInputElement).readOnly && !(el as HTMLInputElement).disabled
      && !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'file'].includes((el as HTMLInputElement).type);
    const on = (e: FocusEvent) => { if (typing(e.target)) document.body.classList.add('kb-open'); };
    const off = () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kb-open'); }, 80);
    addEventListener('focusin', on); addEventListener('focusout', off);
    return () => { removeEventListener('focusin', on); removeEventListener('focusout', off); };
  }, []);
  // Điện thoại: cuộn xuống thì thu nút nổi (Tạo đơn) cho khỏi che nội dung, cuộn lên thì hiện lại
  const loc = useLocation(); const navType = useNavigationType();
  useEffect(() => { if (navType !== 'POP') scrollToY(0); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { let y = 0; const f = () => { const t = scrollTop(); const d = t - y; if (Math.abs(d) > 8) { document.body.classList.toggle('scroll-down', d > 0 && t > 80); y = t; } };
    addEventListener('scroll', f, { passive: true, capture: true }); return () => removeEventListener('scroll', f, { capture: true }); }, []);
  useEffect(() => { if (me) sb.rpc('wf_inbox').then(({ data }) => { const n = ((data ?? []) as unknown[]).length; setWfN(n); try { localStorage.setItem('wf-n', String(n)); } catch { /* */ } }); }, [me]);
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
    { to: '/', kbd: 'G V', end: true, icon: 'inbox', label: 'Việc của tôi', short: 'Việc', badge: pending },
    { to: '/bang', kbd: 'G B', icon: 'kanban', label: 'Bảng Kanban', short: 'Bảng' },
    { to: '/so-do', kbd: 'G S', icon: 'flow', label: 'Sơ đồ đơn hàng', short: 'Sơ đồ', side: true },
    { to: '/don', kbd: 'G D', icon: 'list', label: 'Danh sách đơn', short: 'Đơn hàng' },
    { to: '/thong-ke', kbd: 'G T', icon: 'chart', label: 'Thống kê', short: 'Thống kê' },
    ...(can('thiet_ke_qt') || wfN > 0 ? [{ to: '/quy-trinh-moi', icon: 'flow', label: 'Tạo quy trình', short: 'Quy trình', side: true }] : []),
    ...(can('admin_it') ? [{ to: '/mo-phong', icon: 'run', label: 'Mô phỏng quy trình', short: 'Mô phỏng', side: true }] : []),
    ...(can('admin_it') ? [{ to: '/quan-tri', kbd: 'G Q', icon: 'settings', label: 'Quản trị', short: 'Quản trị' }] : [])
  ];
  const badge = (n?: number) => (n ? <span className="nav-badge" aria-label={n + ' phiếu chờ duyệt'}>{n}</span> : null);
  const initial = (me.full_name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={'app' + (busy ? ' is-busy' : '') + (hidden ? ' side-hidden' : '') + (peek ? ' side-peek' : '')}>
      {peek && <div className="side-scrim" onClick={() => setPeek(false)} aria-hidden="true" />}
 <ShortcutHost onToggleSide={() => toggleSide(!hidden)} /><KbdTip />
      {busy && <div className="busy" role="progressbar" aria-label="Đang xử lý" />}
      <aside className="side" aria-label="Điều hướng">
        <div className="brand"><img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>PMS</div><div className="small muted">CNC → IPC → Hanwa</div></div>
          <Bell variant="side" />
          <button className="btn sm icon-btn side-hide" aria-label={hidden ? 'Mở rộng menu' : 'Thu gọn menu'} data-kbd="[" onClick={() => toggleSide(!hidden)}><Icon name="panel" size={18} /></button></div>
        <ScopeChip variant="side" />
        <button className="side-search" title="Tìm đơn nhanh (Ctrl K)" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}>
          <Icon name="search" size={18} /><span>Tìm đơn nhanh</span><kbd>Ctrl K</kbd></button>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className="nav-item" data-kbd={(i as { kbd?: string }).kbd} onClick={() => setPeek(false)}><Icon name={i.icon} />{i.label}{badge(i.badge)}</NavLink>))}
        </nav>
        <AccountMenu me={me} initial={initial} />
      </aside>

      <header className="topbar">
        <img className="logo" src="./icon.svg" alt="" aria-hidden="true" />
        <b className="tb-title">PMS</b>
        <ScopeChip variant="top" />
        <button className="tb-btn" aria-label="Tìm đơn" onClick={() => dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}><Icon name="search" size={21} /></button>
        <Bell variant="top" />
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
              {can('admin_it') && <NavLink to="/mo-phong"><Icon name="run" />Mô phỏng quy trình</NavLink>}
              {(can('thiet_ke_qt') || wfN > 0) && <NavLink to="/quy-trinh-moi"><Icon name="flow" />Tạo quy trình</NavLink>}
              <NavLink to="/zalo"><Icon name="bell" />Thông báo Zalo{!me.zalo_chat_id && <span className="nav-badge">!</span>}</NavLink>
              <NavLink to="/cai-app"><Icon name="download" />Hướng dẫn & cài app</NavLink>
              <button onClick={() => sb.auth.signOut()}><Icon name="logout" />Đăng xuất</button>
            </nav>
          </div>
        </div>)}

      <main className="main" id="main">
        {acting && (
          <div className={'acting' + (actUntil ? ' act-do' : '')} role="status">
            <span className="act-av" aria-hidden="true">{me.full_name.trim().split(' ').pop()?.[0]}</span>
            <span className="act-t">{actUntil ? 'Đang làm thay' : 'Đang xem với tư cách'} <b>{me.full_name}</b>{actUntil ? <> · đến {new Date(actUntil).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</> : <span className="small"> · chỉ xem đơn thật</span>}</span>
            <span className="act-real" title={'Thao tác được ghi là ' + real?.full_name + ' thay mặt'}>· {real?.full_name}</span>
            <button className="btn sm" onClick={async () => { await stopActing(); location.reload(); }}><Icon name="x" size={15} />Thoát</button>
          </div>)}
        <ZaloNudge />
        <Suspense fallback={<Skeleton rows={3} h={90} />}><Routes>
          <Route path="/" element={<MyWork />} />
          <Route path="/thong-ke" element={<Stats />} />
          <Route path="/bao-cao-du-an" element={<ProjectReport />} />
          {can('admin_it') && <Route path="/mo-phong" element={<Simulate />} />}
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
          <Route path="/quy-trinh" element={<ProcessDoc />} />
          <Route path="/zalo" element={<><div className="page-head"><div><h1>Thông báo Zalo</h1><p className="muted">Nhận tin nhắn từ bot khi đến lượt bạn duyệt phiếu.</p></div></div><ZaloLink /></>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes></Suspense>
      </main>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {items.filter((i) => i.to !== '/quan-tri' && i.to !== '/quy-trinh-moi' && i.to !== '/mo-phong').map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}><Icon name={i.icon} size={22} />{i.short}{badge(i.badge)}</NavLink>))}
      </nav>
      <UpdateBar /><Toaster /><ConfirmHost /><Viewer />
    </div>
  );
}
export default function App() { return <AuthProvider><Shell /></AuthProvider>; }

/** Nhắc nối Zalo trên mọi trang (trừ Việc của tôi / trang Zalo đã có thẻ riêng); tạm ẩn 1 ngày */
function ZaloNudge() {
  const { me, acting } = useAuth(); const loc = useLocation(); const [hid, setHid] = useState(() => { try { return Number(localStorage.getItem('zalo-nudge') ?? 0) > Date.now(); } catch { return false; } });
  if (!me || acting || me.zalo_chat_id || hid || loc.pathname === '/' || loc.pathname === '/zalo') return null;
  return <div className="zn" role="status"><span className="zalo-badge" aria-hidden="true">Zalo</span><span className="zn-t">Chưa nối Zalo · bạn sẽ không nhận được nhắc việc</span>
    <Link className="btn sm primary" to="/zalo">Nối ngay</Link>
    <button className="btn sm icon-btn" aria-label="Để sau" title="Để sau (ẩn 1 ngày)" onClick={() => { try { localStorage.setItem('zalo-nudge', String(Date.now() + 864e5)); } catch { /* */ } setHid(true); }}><Icon name="x" size={14} /></button></div>;
}
