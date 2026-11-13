/** Bộ nhớ đệm truy vấn ngắn hạn: các thành phần cùng hỏi một dữ liệu chỉ gọi máy chủ 1 lần. */
const m = new Map<string, { at: number; p: Promise<unknown>; v?: unknown; ok?: boolean }>();
export function cached<T>(key: string, fn: () => PromiseLike<T>, ttlMs = 30000): Promise<T> {
  const h = m.get(key); if (h && Date.now() - h.at < ttlMs) return h.p as Promise<T>;
  const e: { at: number; p: Promise<unknown>; v?: unknown; ok?: boolean } = { at: Date.now(), p: null as never };
  const p = Promise.resolve(fn()).then((v) => { e.v = v; e.ok = true; return v; }).catch((x) => { m.delete(key); throw x; }); e.p = p; m.set(key, e); return p;
}
export const dropCache = (prefix = '') => { for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k); };
/** Lấy ngay giá trị đã có (đồng bộ) để hiển thị tức thì, không chờ mạng */
export function peek<T>(key: string, ttlMs = 30000): T | undefined { const h = m.get(key); return h?.ok && Date.now() - h.at < ttlMs ? (h.v as T) : undefined; }
