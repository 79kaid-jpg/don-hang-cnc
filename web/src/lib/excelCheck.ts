/** Kiểm tra file "Excel bóc tách chi tiết": đúng file Excel, có cột chính, có dữ liệu; đối chiếu với Danh sách tấm */
export type XCheck = { codes: string[]; qty: number; rows: number; sheet?: string; day?: number[] };
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS: Record<string, string[]> = {
  ma: ['matam', 'ma', 'mahieu', 'matamthanhpham', 'code', 'partno', 'kyhieu'],
  vl: ['vatlieu', 'vattu', 'material', 'chatlieu'],
  day: ['day', 'daymm', 'dodaymm', 'doday', 'thickness', 't'],
  sl: ['sotam', 'soluong', 'sl', 'sltam', 'qty', 'quantity', 'soluongtam'],
};
const hit = (cell: unknown, k: string) => { const n = norm(cell); return !!n && n.length < 40 && ALIAS[k].some((a) => n === a || (a.length > 3 && n.includes(a))); };
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

export async function checkExcelFile(file: File): Promise<{ ok: true; c: XCheck } | { ok: false; error: string }> {
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name)) return { ok: false, error: 'File “' + file.name + '” không phải Excel (.xlsx / .xls).' };
  let t: ReturnType<typeof findTable> = null;
  try { const X = await import('xlsx'); const wb = X.read(await file.arrayBuffer());
    t = findTable(wb.SheetNames.map((sn) => ({ name: sn, rows: X.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, blankrows: false, defval: '' }) })));
  } catch { return { ok: false, error: 'Không đọc được file “' + file.name + '”. File hỏng hoặc không phải Excel.' }; }
  if (!t) return { ok: false, error: 'File “' + file.name + '” không phải file bóc tách: không thấy bảng có cột Mã tấm, Độ dày, Số lượng.' };
  const data = t.rows.filter((r) => String(r[t!.ci] ?? '').trim() && num(r[t!.si]) > 0);
  if (!data.length) return { ok: false, error: 'File “' + file.name + '” có tiêu đề nhưng không có dòng tấm nào (cần Mã tấm và Số lượng > 0).' };
  return { ok: true, c: { codes: data.map((r) => String(r[t!.ci]).trim()), qty: data.reduce((a, r) => a + num(r[t!.si]), 0), rows: data.length, sheet: t.sheet,
    day: [...new Set(data.map((r) => num(r[t!.di])).filter((x) => x > 0))].sort((x, y) => x - y) } };
}

/** Tìm bảng bóc tách: tiêu đề 1–3 dòng (ghép), cần Mã tấm + Dày + Số lượng; Vật liệu không bắt buộc. Ưu tiên sheet BOCTACHBANVE. */
export function findTable(sheets: { name: string; rows: unknown[][] }[]): { sheet: string; rows: unknown[][]; ci: number; si: number; di: number } | null {
  const ord = [...sheets].sort((a, b) => Number(/boc ?tach/i.test(norm(b.name))) - Number(/boc ?tach/i.test(norm(a.name))));
  for (const s of ord) { const a = s.rows;
    for (let i = 0; i < Math.min(a.length, 40); i++) for (let k = 1; k <= 3 && i + k <= a.length; k++) {
      const col = (key: string) => { const w = Math.max(...a.slice(i, i + k).map((r) => r.length)); for (let j = 0; j < w; j++) if (a.slice(i, i + k).some((r) => hit(r[j], key))) return j; return -1; };
      const ci = col('ma'), di = col('day'), si = col('sl');
      if (ci >= 0 && di >= 0 && si >= 0) return { sheet: s.name, rows: a.slice(i + k), ci, si, di };
    } }
  return null;
}

/** So file với danh sách tấm trên phiếu */
export function compareExcel(c: XCheck, ds: Record<string, unknown>[]) {
  const key = (s: unknown) => String(s ?? '').trim().toUpperCase();
  const fc = new Set(c.codes.map(key)); const lc = new Set(ds.map((r) => key(r.ma_tam)).filter(Boolean));
  const missing = [...fc].filter((x) => !lc.has(x)); const extra = [...lc].filter((x) => !fc.has(x));
  const qty = ds.reduce((a, r) => a + num(r.so_tam), 0);
  return { ok: !missing.length && !extra.length && Math.abs(qty - c.qty) < 1e-6, missing, extra, fileQty: c.qty, listQty: qty, fileRows: c.rows, listRows: ds.length };
}

/** Đọc dòng tấm từ file bóc tách (sheet BOCTACHBANVE, tiêu đề 1–3 dòng): mã tấm, dày, rộng, dài, số lượng, m² hoàn thiện, màu */
export function bocTachRows(sheets: { name: string; rows: unknown[][] }[]): Record<string, string>[] {
  const t = findTable(sheets); if (!t) return [];
  const all = sheets.find((s) => s.name === t.sheet)!.rows; const start = all.length - t.rows.length;
  const hdr = all.slice(Math.max(0, start - 3), start);
  const col = (re: RegExp, from = 0, to = 999) => { const w = Math.max(...hdr.map((r) => r.length)); for (let j = from; j < Math.min(w, to); j++) if (hdr.some((r) => re.test(norm(r[j])))) return j; return -1; };
  const ri = col(/^rong/, t.di, t.si + 1), li = col(/^dai$/, t.di, t.si + 1), mi = col(/khoiluong|^m2$|dientich/, t.si), vi = col(/vatlieu|vattu|material/), ci = col(/mau/, t.si);
  const out: Record<string, string>[] = [];
  for (const r of t.rows) { const ma = String(r[t.ci] ?? '').trim(); if (!ma) { if (out.length) break; continue; } if (num(r[t.si]) <= 0) continue;
    const v = (j: number) => (j >= 0 ? String(r[j] ?? '').trim() : '');
    const m2 = mi >= 0 && num(r[mi]) > 0 ? String(+num(r[mi]).toFixed(4)) : '';
    out.push({ ma_tam: ma, day: v(t.di), so_tam: v(t.si), rong: v(ri), dai: v(li), m2, vat_lieu: v(vi), ma_mau: v(ci) }); }
  return out;
}
