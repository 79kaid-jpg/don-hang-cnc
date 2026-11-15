import { sb, type Profile, type Customer } from './supabase';
import { cached, dropCache, cacheUser } from './qcache';
import type { Batch, Doc } from './proc';

/** Dữ liệu dùng chung cho trang đơn hàng: tải 1 lần, các phần cùng dùng (không tải lặp, không vẽ 2 nhịp) */
export type ProcData = { batches: Batch[]; docs: Doc[] };
const pkey = (order: string, proc: string) => `pp:${cacheUser}:${order}:${proc}`;
/** Lần / đợt + phiếu đầy đủ của một QT. force = bỏ bản nhớ tạm (sau khi lưu / chuyển bước) */
export function procData(order: string, proc: string, force = false): Promise<ProcData> {
  if (force) dropCache(pkey(order, proc));
  return cached(pkey(order, proc), async () => {
    const { data: b } = await sb.from('batches').select('*').eq('order_id', order).eq('proc', proc).order('seq');
    const batches = (b as Batch[]) ?? [];
    if (!batches.length) return { batches, docs: [] };
    const { data: d } = await sb.from('docs_v').select('*').in('batch_id', batches.map((x) => x.id));
    return { batches, docs: (d as Doc[]) ?? [] };
  }, 20000);
}
export const procKey = pkey;
/** Người dùng, đối tác: ít đổi → nhớ 5 phút */
export const allPeople = () => cached('od:people', async () => ((await sb.from('profiles').select('*')).data as Profile[]) ?? [], 300000);
export const allCustomers = () => cached('od:custs', async () => ((await sb.from('customers').select('*')).data as Customer[]) ?? [], 300000);
