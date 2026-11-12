/** Bộ nhớ đệm truy vấn ngắn hạn: các thành phần cùng hỏi một dữ liệu chỉ gọi máy chủ 1 lần. */
const m = new Map<string, { at: number; p: Promise<unknown> }>();
export function cached<T>(key: string, fn: () => PromiseLike<T>, ttlMs = 30000): Promise<T> {
  const h = m.get(key); if (h && Date.now() - h.at < ttlMs) return h.p as Promise<T>;
  const p = Promise.resolve(fn()).catch((e) => { m.delete(key); throw e; }); m.set(key, { at: Date.now(), p }); return p;
}
export const dropCache = (prefix = '') => { for (const k of [...m.keys()]) if (k.startsWith(prefix)) m.delete(k); };
