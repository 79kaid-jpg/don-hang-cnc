/** Điện thoại dùng khung ứng dụng cố định (thanh trên + nội dung cuộn + thanh dưới) nên vùng cuộn là .main thay vì cửa sổ */
export const scroller = (): HTMLElement | null => { const m = document.querySelector<HTMLElement>('.main'); return m && getComputedStyle(m).overflowY === 'auto' ? m : null; };
export const scrollTop = () => scroller()?.scrollTop ?? window.scrollY;
export const scrollToY = (y: number) => { const m = scroller(); if (m) m.scrollTo(0, y); else window.scrollTo(0, y); };
