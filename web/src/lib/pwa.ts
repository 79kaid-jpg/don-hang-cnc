import { useEffect, useState } from 'react';

// ── Cài app (Add to Home Screen) ──
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; notify(); });
window.addEventListener('appinstalled', () => { deferred = null; notify(); });

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const platform = (): 'ios' | 'android' | 'desktop' => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
};
export const isIOSNotSafari = () => platform() === 'ios' && /CriOS|FxiOS|EdgiOS|Zalo|FBAN|FBAV/i.test(navigator.userAgent);

export function useInstall() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return {
    standalone: isStandalone(),
    canPrompt: !!deferred,
    prompt: async () => { if (!deferred) return false; await deferred.prompt(); const r = await deferred.userChoice; deferred = null; notify(); return r.outcome === 'accepted'; }
  };
}

// ── Tự động cập nhật ──
let updateReady = false;
const usubs = new Set<() => void>();
const unotify = () => usubs.forEach((f) => f());

async function check() {
  try {
    const r = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { build } = await r.json();
    if (build && build !== __BUILD__ && !updateReady) { updateReady = true; unotify(); }
  } catch { /* mất mạng: thử lại lần sau */ }
}

export function applyUpdate() {
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.waiting?.postMessage('skip')).finally(() => location.reload());
}

/** Đang gõ dở thì không tự tải lại */
const busyTyping = () => { const a = document.activeElement; return !!a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); };

export function startPwa() {
  if (import.meta.env.DEV) return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  check();
  setInterval(check, 5 * 60 * 1000);                       // 5 phút kiểm tra một lần
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // quay lại app: nếu đã có bản mới và không gõ dở → tự cập nhật luôn
      if (updateReady && !busyTyping()) applyUpdate(); else check();
    }
  });
  window.addEventListener('online', check);
}

export function useUpdate() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((x) => x + 1); usubs.add(f); return () => { usubs.delete(f); }; }, []);
  return updateReady;
}
export const BUILD = __BUILD__;
