/** Khung xem file / bản in NGAY TRONG APP (thay cho window.open – trên iPhone app cài màn hình chính, cửa sổ mới không có nút đóng) */
export type ViewItem = { title: string; html?: string; url?: string; name?: string; landscape?: boolean };
type L = (v: ViewItem | null) => void;
const subs = new Set<L>();
export const onView = (f: L) => { subs.add(f); return () => { subs.delete(f); }; };
export const openView = (v: ViewItem | null) => subs.forEach((f) => f(v));
export const viewHtml = (html: string, title: string, landscape?: boolean) => openView({ html, title, landscape });
export const viewUrl = (url: string, name: string) => openView({ url, name, title: name });
