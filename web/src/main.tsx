import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { startPwa } from './lib/pwa';
startPwa();
import { applyAppearance } from './components/Appearance';
applyAppearance(); matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyAppearance);
// App vừa cập nhật mà trang đang mở là bản cũ → file chunk cũ không còn: tự tải lại 1 lần
const RK = 'pms-chunk-reload';
const reloadOnce = () => { try { const t = +(sessionStorage.getItem(RK) ?? 0); if (Date.now() - t < 30000) return false; sessionStorage.setItem(RK, String(Date.now())); } catch { /* bỏ qua */ } location.reload(); return true; };
addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault(); });
addEventListener('unhandledrejection', (e) => { if (/dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(String((e.reason as Error)?.message ?? e.reason))) reloadOnce(); });

// Mở app mới → luôn vào "Việc của tôi"; link từ Zalo (?z=1) thì mở đúng phiếu; tải lại (F5) giữ trang đang xem
try {
  const fresh = !sessionStorage.getItem('pms-open'); sessionStorage.setItem('pms-open', '1');
  if (new URLSearchParams(location.search).has('z')) history.replaceState(null, '', location.pathname + location.hash);
  else if (fresh && location.hash && location.hash !== '#/' && location.hash !== '#') history.replaceState(null, '', location.pathname + '#/');
} catch { /* bỏ qua */ }

createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><App /></HashRouter></React.StrictMode>);
