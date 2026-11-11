/** Kiểm tra file "Excel bóc tách chi tiết": đúng file Excel, có cột chính, có dữ liệu; đối chiếu với Danh sách tấm */
export type XCheck = { codes: string[]; qty: number; rows: number };
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string[]> = {
  ma: ['matam', 'ma', 'mahieu', 'matamthanhpham', 'code', 'partno', 'kyhieu'],
  vl: ['vatlieu', 'vattu', 'material', 'chatlieu'],
  day: ['day', 'daymm', 'dodaymm', 'doday', 'thickness', 't'],
  sl: ['sotam', 'soluong', 'sl', 'sltam', 'qty', 'quantity', 'soluongtam'],
};
const hit = (cell: unknown, k: string) => { const n = norm(cell); return !!n && ALIAS[k].some((a) => n === a || (a.length > 3 && n.startsWith(a))); };
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export async function checkExcelFile(file: File): Promise<{ ok: true; c: XCheck } | { ok: false; error: string }> {
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return { ok: false, error: 'File “' + file.name + '” không phải Excel (.xlsx / .xls).' };
  let aoa: unknown[][] = [];
  try { const X = await import('xlsx'); const wb = X.read(await file.arrayBuffer());
    for (const sn of wb.SheetNames) { const a = X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' });
      const hi = a.findIndex((r) => (['ma', 'vl', 'day', 'sl'] as const).every((k) => r.some((c) => hit(c, k)))); if (hi >= 0) { aoa = a.slice(hi); break; } }
  } catch { return { ok: false, error: 'Không đọc được file “' + file.name + '”. File hỏng hoặc không phải Excel.' }; }
  if (!aoa.length) return { ok: false, error: 'File “' + file.name + '” không phải file bóc tách: không thấy dòng tiêu đề có đủ cột Mã tấm, Vật liệu, Dày, Số tấm.' };
  const h = aoa[0]; const col = (k: string) => h.findIndex((c) => hit(c, k)); const ci = col('ma'), si = col('sl');
  const data = aoa.slice(1).filter((r) => String(r[ci] ?? '').trim() && num(r[si]) > 0);
  if (!data.length) return { ok: false, error: 'File “' + file.name + '” có tiêu đề nhưng không có dòng tấm nào (cần Mã tấm và Số tấm > 0).' };
  return { ok: true, c: { codes: data.map((r) => String(r[ci]).trim()), qty: data.reduce((a, r) => a + num(r[si]), 0), rows: data.length } };
}

/** So file với danh sách tấm trên phiếu */
export function compareExcel(c: XCheck, ds: Record<string, unknown>[]) {
  const key = (s: unknown) => String(s ?? '').trim().toUpperCase();
  const fc = new Set(c.codes.map(key)); const lc = new Set(ds.map((r) => key(r.ma_tam)).filter(Boolean));
  const missing = [...fc].filter((x) => !lc.has(x)); const extra = [...lc].filter((x) => !fc.has(x));
  const qty = ds.reduce((a, r) => a + num(r.so_tam), 0);
  return { ok: !missing.length && !extra.length && Math.abs(qty - c.qty) < 1e-6, missing, extra, fileQty: c.qty, listQty: qty, fileRows: c.rows, listRows: ds.length };
}
