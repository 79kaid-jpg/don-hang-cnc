/** Điện thoại: cả khung .app là vùng cuộn (tài liệu không cuộn) để thanh menu dưới không bị iOS kéo trôi */
export const scroller = (): HTMLElement | null => {
  for (const s of ['.app', '.main']) { const m = document.querySelector<HTMLElement>(s); if (m && /auto|scroll/.test(getComputedStyle(m).overflowY)) return m; }
  return null;
};
export const scrollTop = () => scroller()?.scrollTop ?? window.scrollY;
export const scrollToY = (y: number) => { const m = scroller(); if (m) m.scrollTo(0, y); else window.scrollTo(0, y); };
