// Kiểm tra "Excel bóc tách chi tiết" phía máy chủ: tải file từ kho, đọc, ghi kết quả vào excel_checks (chỉ service role ghi được).
// Gọi: POST { path } kèm JWT người dùng. Chỉ nhận file đang gắn vào một hồ sơ mà người gọi xem được.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import * as X from 'npm:xlsx@0.18.5';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const svc = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string[]> = {
  ma: ['matam', 'ma', 'mahieu', 'matamthanhpham', 'code', 'partno', 'kyhieu'], vl: ['vatlieu', 'vattu', 'material', 'chatlieu'],
  day: ['day', 'daymm', 'dodaymm', 'doday', 'thickness', 't'], sl: ['sotam', 'soluong', 'sl', 'sltam', 'qty', 'quantity', 'soluongtam'] };
const hit = (cell: unknown, k: string) => { const n = norm(cell); return !!n && n.length < 40 && ALIAS[k].some((a) => n === a || (a.length > 3 && n.includes(a))); };
/** Tìm bảng bóc tách: tiêu đề 1–3 dòng (ghép), cần Mã tấm + Dày + Số lượng; Vật liệu không bắt buộc. Ưu tiên sheet BOCTACHBANVE. */
function findTable(sheets: { name: string; rows: unknown[][] }[]): { sheet: string; rows: unknown[][]; ci: number; si: number; di: number } | null {
  const ord = [...sheets].sort((a, b) => Number(/boc ?tach/i.test(norm(b.name))) - Number(/boc ?tach/i.test(norm(a.name))));
  for (const s of ord) { const a = s.rows;
    for (let i = 0; i < Math.min(a.length, 40); i++) for (let k = 1; k <= 3 && i + k <= a.length; k++) {
      const col = (key: string) => { const w = Math.max(...a.slice(i, i + k).map((r) => r.length)); for (let j = 0; j < w; j++) if (a.slice(i, i + k).some((r) => hit(r[j], key))) return j; return -1; };
      const ci = col('ma'), di = col('day'), si = col('sl');
      if (ci >= 0 && di >= 0 && si >= 0) return { sheet: s.name, rows: a.slice(i + k), ci, si, di };
    } }
  return null;
}
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = createClient(URL_, req.headers.get('apikey') || Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const { data: u } = await user.auth.getUser(jwt); if (!u?.user) return json({ error: 'Chưa đăng nhập' }, 401);
  const { path } = await req.json().catch(() => ({ path: '' }));
  if (typeof path !== 'string' || !path || path.includes('..')) return json({ error: 'Thiếu đường dẫn file' }, 400);
  // File phải đang gắn vào hồ sơ mà người gọi xem được (docs_v theo quyền của người gọi)
  const { data: holder } = await svc.from('docs').select('id').contains('files', JSON.stringify([{ path }])).limit(1);
  const { data: owned } = holder?.length ? await user.from('docs_v').select('id').eq('id', holder[0].id).limit(1) : { data: [] };
  if (!owned?.length) return json({ error: 'Không tìm thấy file trong hồ sơ bạn xem được' }, 403);
  let res: { ok: boolean; error?: string; codes?: string[]; qty?: number; rows?: number } = { ok: false };
  const name = path.split('/').pop() ?? path;
  if (!/\.(xlsx|xlsm|xls)$/i.test(name)) res = { ok: false, error: 'Không phải file Excel' };
  else {
    const { data: blob, error } = await svc.storage.from('files').download(path);
    if (error || !blob) res = { ok: false, error: 'Không tải được file' };
    else try {
      const wb = X.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
      const t = findTable(wb.SheetNames.map((sn) => ({ name: sn, rows: X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }) })));
      if (!t) res = { ok: false, error: 'Không thấy bảng có cột Mã tấm, Độ dày, Số lượng' };
      else { const data = t.rows.filter((r) => String(r[t.ci] ?? '').trim() && num(r[t.si]) > 0);
        res = data.length ? { ok: true, codes: data.map((r) => String(r[t.ci]).trim().toUpperCase()), qty: data.reduce((a, r) => a + num(r[t.si]), 0), rows: data.length }
          : { ok: false, error: 'Không có dòng tấm nào' }; }
    } catch { res = { ok: false, error: 'File hỏng hoặc không đọc được' }; }
  }
  await svc.from('excel_checks').upsert({ path, ok: res.ok, error: res.error ?? null, codes: res.codes ?? [], qty: res.qty ?? 0, rows: res.rows ?? 0, checked_by: u.user.id, at: new Date().toISOString() });
  return json(res);
});
