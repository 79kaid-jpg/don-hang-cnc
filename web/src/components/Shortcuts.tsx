import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb, type Order } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { ORDER_STATUS } from '../lib/format';
import { Icon } from './Icon';

/** Phím tắt toàn app (kiểu Gmail / Linear). Không chạy khi đang gõ trong ô nhập. */
export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
export const modalOpen = () => !!document.querySelector('.modal-bg, .kp-bg');

export const SHORTCUTS: { group: string; items: [string[], string][] }[] = [
  { group: 'Chung', items: [
    [['Ctrl', 'K'], 'Tìm & mở đơn nhanh (gõ mã, dự án, khách)'], [['/'], 'Tìm & mở đơn nhanh'],
    [['?'], 'Xem bảng phím tắt này'], [['N'], 'Tạo đơn mới'], [['['], 'Ẩn / hiện menu trái'], [['Esc'], 'Đóng hộp thoại, menu ⋯'], [['Ctrl', 'S'], 'Lưu phiếu / quy trình đang sửa']] },
  { group: 'Đi tới (bấm G rồi bấm chữ)', items: [
    [['G', 'V'], 'Việc của tôi'], [['G', 'B'], 'Bảng Kanban'], [['G', 'S'], 'Sơ đồ đơn hàng'], [['G', 'D'], 'Danh sách đơn'], [['G', 'T'], 'Thống kê'],
    [['G', 'Q'], 'Quản trị'], [['G', 'H'], 'Hướng dẫn'], [['G', 'Z'], 'Thông báo Zalo']] },
  { group: 'Bảng Kanban', items: [
    [['1'], 'QT0'], [['2'], 'QT1'], [['3'], 'QT2'], [['4'], 'QT3'],
    [['J', '↓'], 'Thẻ đơn tiếp theo'], [['K', '↑'], 'Thẻ đơn trước'], [['H', '←'], 'Sang cột trái'], [['L', '→'], 'Sang cột phải'],
    [['Enter'], 'Mở đơn đang chọn'], [['M'], 'Ký nhanh hồ sơ đang chọn (sang bước sau)'], [['R'], 'Trả hồ sơ đang chọn về bước trước'],
    [['F'], 'Bật / tắt "Chỉ việc đến lượt tôi"'], [['C'], 'Đổi công ty: Tất cả → PNC → IPC → HAN (admin)']] },
  { group: 'Chi tiết đơn', items: [
    [['1 … 7'], 'Đổi thẻ: F0, QT0, QT1, QT2, QT3, Chứng từ, Lịch sử'], [['S'], 'Xem đơn trên sơ đồ'],
    [['B'], 'Quay lại bảng Kanban'], [[']'], 'Đóng / mở cột phải của phiếu'], [['Ctrl', 'S'], 'Lưu phiếu']] }
];

export const Kbd = ({ k }: { k: string[] }) => <span className="kbd-set">{k.map((x, i) => <kbd key={i}>{x}</kbd>)}</span>;

export function ShortcutTable() {
  return (
    <div className="kp-grid">
      {SHORTCUTS.map((g) => (
        <section key={g.group}><h3>{g.group}</h3>
          <dl>{g.items.map(([k, t]) => <div key={t + k.join()} className="kp-row"><dt><Kbd k={k} /></dt><dd>{t}</dd></div>)}</dl></section>))}
    </div>);
}

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

/** Gắn ở Shell: phím tắt chung + bảng lệnh + bảng phím tắt */
export function ShortcutHost({ onToggleSide }: { onToggleSide: () => void }) {
  const nav = useNavigate(); const { can } = useAuth();
  const [pal, setPal] = useState(false); const [help, setHelp] = useState(false);
  const gAt = useRef(0);
  useEffect(() => {
    const open = () => setHelp(true); addEventListener('show-shortcuts', open);
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setHelp(false); setPal((v) => !v); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || modalOpen()) return;
      const key = e.key.toLowerCase();
      if (Date.now() - gAt.current < 1200) {
        gAt.current = 0;
        const to: Record<string, string> = { v: '/', b: '/bang', s: '/so-do', d: '/don', t: '/thong-ke', q: '/quan-tri', h: '/cai-app', z: '/zalo' };
        if (to[key]) { e.preventDefault(); nav(to[key]); }
        return;
      }
      if (key === 'g') { gAt.current = Date.now(); return; }
      if (e.key === '/') { e.preventDefault(); setPal(true); }
      else if (e.key === '?') { e.preventDefault(); setHelp(true); }
      else if (key === 'n' && (can('kinh_doanh') || can('admin_cnc'))) { e.preventDefault(); nav('/don/moi'); }
      else if (e.key === '[') { e.preventDefault(); onToggleSide(); }
    };
    addEventListener('keydown', k);
    return () => { removeEventListener('keydown', k); removeEventListener('show-shortcuts', open); };
  }, [nav, can, onToggleSide]);
  return (<>
    {pal && <Palette onClose={() => setPal(false)} />}
    {help && (
      <div className="kp-bg" onClick={() => setHelp(false)}>
        <div className="kp-box" role="dialog" aria-modal="true" aria-labelledby="kp-t" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && setHelp(false)} tabIndex={-1} ref={(el) => el?.focus()}>
          <div className="mv-head"><h2 id="kp-t" style={{ margin: 0 }}>Phím tắt</h2><button className="btn sm icon-btn" onClick={() => setHelp(false)} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
          <ShortcutTable />
          <p className="small muted" style={{ margin: 0 }}>Rê chuột lên nút để xem phím tắt của nút đó. Phím tắt không chạy khi bạn đang gõ trong ô nhập (trừ Ctrl+S). Trên Mac dùng ⌘ thay cho Ctrl.</p>
        </div>
      </div>)}
  </>);
}

/** Bảng lệnh: tìm đơn tương đối (bỏ dấu, nhiều từ) + đi tới trang */
function Palette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate(); const { can } = useAuth();
  const [q, setQ] = useState(''); const [orders, setOrders] = useState<Order[]>([]); const [cust, setCust] = useState<Record<string, string>>({});
  const [i, setI] = useState(0);
  useEffect(() => {
    sb.from('orders').select('*').order('created_at', { ascending: false }).limit(500).then(({ data }) => setOrders((data as Order[]) ?? []));
    sb.from('customers').select('id, name').then(({ data }) => setCust(Object.fromEntries(((data as { id: string; name: string }[]) ?? []).map((c) => [c.id, c.name]))));
  }, []);
  const pages = useMemo(() => [
    { t: 'Việc của tôi', to: '/', k: 'G V' }, { t: 'Bảng Kanban', to: '/bang', k: 'G B' }, { t: 'Sơ đồ đơn hàng', to: '/so-do', k: 'G S' },
    { t: 'Danh sách đơn', to: '/don', k: 'G D' }, { t: 'Thống kê', to: '/thong-ke', k: 'G T' }, ...(can('kinh_doanh') || can('admin_cnc') ? [{ t: 'Tạo đơn mới', to: '/don/moi', k: 'N' }] : []),
    ...(can('admin_it') ? [{ t: 'Quản trị', to: '/quan-tri', k: 'G Q' }] : []), { t: 'Hướng dẫn', to: '/cai-app', k: 'G H' }, { t: 'Thông báo Zalo', to: '/zalo', k: 'G Z' }], [can]);
  const toks = norm(q).split(/\s+/).filter(Boolean);
  const hit = (s: string) => toks.every((t) => norm(s).includes(t));
  const os = orders.filter((o) => !toks.length || hit([o.code, o.project, cust[o.customer_id ?? ''], cust[o.kh1_id ?? ''], cust[o.kh2_id ?? ''], ORDER_STATUS[o.status]].join(' '))).slice(0, 8);
  const ps = pages.filter((p) => toks.length && hit(p.t));
  const all = [...os.map((o) => ({ key: o.id, to: '/don/' + o.id, main: o.code, sub: [o.project, ORDER_STATUS[o.status]].filter(Boolean).join(' · '), k: '' })),
    ...(toks.length ? ps : pages).map((p) => ({ key: p.to, to: p.to, main: p.t, sub: 'Trang', k: p.k }))];
  const cur = Math.min(i, Math.max(0, all.length - 1));
  const go = (to: string) => { onClose(); nav(to); };
  return (
    <div className="kp-bg top" onClick={onClose}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Tìm nhanh" onClick={(e) => e.stopPropagation()}>
        <label className="pal-in"><Icon name="search" size={20} />
          <input autoFocus value={q} placeholder="Gõ mã đơn, dự án, khách hàng hoặc tên trang…" aria-label="Tìm nhanh"
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setI((cur + 1) % Math.max(1, all.length)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setI((cur - 1 + all.length) % Math.max(1, all.length)); }
              else if (e.key === 'Enter' && all[cur]) go(all[cur].to);
            }} /><kbd>Esc</kbd></label>
        <ul className="pal-list" role="listbox">
          {all.length === 0 && <li className="pal-empty">Không tìm thấy “{q}”</li>}
          {all.map((r, j) => (
            <li key={r.key} role="option" aria-selected={j === cur} className={j === cur ? 'on' : ''} onMouseEnter={() => setI(j)} onClick={() => go(r.to)}>
              <Icon name={r.sub === 'Trang' ? 'arrow' : 'file'} size={16} /><b>{r.main}</b><span className="small muted">{r.sub}</span>{r.k && <span className="pal-k">{r.k.split(' ').map((x) => <kbd key={x}>{x}</kbd>)}</span>}
            </li>))}
        </ul>
        <div className="pal-foot small muted"><span><kbd>↑</kbd><kbd>↓</kbd> chọn</span><span><kbd>Enter</kbd> mở</span><span><kbd>?</kbd> tất cả phím tắt</span></div>
      </div>
    </div>);
}
