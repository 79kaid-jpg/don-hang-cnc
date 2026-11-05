// Service worker: trang & version.json luôn lấy mới từ mạng; file build (có hash) lưu cache để mở nhanh / khi mạng yếu.
const CACHE = 'dhcnc-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase, Google Fonts: không chặn
  if (e.request.mode === 'navigate' || u.pathname.endsWith('version.json') || u.pathname.endsWith('sw.js')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request).then((r) => r || caches.match('./'))));
    return;
  }
  if (u.pathname.includes('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r;
    })));
  }
});
