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
  const W = Math.max(...hdr.map((r) => r.length), 0);
  const find = (test: (n: string) => boolean, from = 0, to = W) => { for (let j = from; j < Math.min(W, to); j++) if (hdr.some((r) => test(norm(r[j])))) return j; return -1; };
  // Nhóm cột theo mẫu: Kích thước hoàn thiện | Thực tế trải | Phôi | Ghi chú
  const g1 = find((n) => n.includes('thucte')), g2 = find((n) => n.includes('phoi') && !n.includes('thucte')), gc = find((n) => n.includes('ghichu'));
  const end0 = g1 >= 0 ? g1 : g2 >= 0 ? g2 : W, end1 = g2 >= 0 ? g2 : gc >= 0 ? gc : W, end2 = gc >= 0 ? gc : W;
  const inG = (re: RegExp, a: number, b: number) => (a < 0 ? -1 : find((n) => re.test(n), a, b));
  const RONG = /^rong/, DAI = /^dai$|^chieudai/, SL = /soluong|^sotam/, KL = /khoiluong|^m2$|dientich/;
  const c = { rong: inG(RONG, t.di, end0), dai: inG(DAI, t.di, end0), m2_ht: inG(KL, t.si, end0), mau: inG(/mau/, t.si, end0),
    trai_rong: inG(RONG, g1, end1), trai_dai: inG(DAI, g1, end1), m2: inG(KL, g1, end1),
    phoi_rong: inG(RONG, g2, end2), phoi_dai: inG(DAI, g2, end2), phoi_sl: inG(SL, g2, end2), phoi_m2: inG(KL, g2, end2), vat_lieu: find((n) => /vatlieu|vattu|material/.test(n)) };
  const out: Record<string, string>[] = [];
  const fx = (v: unknown, d: number) => { const n = num(v); return n > 0 ? String(+n.toFixed(d)) : ''; };
  for (const r of t.rows) { const ma = String(r[t.ci] ?? '').trim(); if (!ma) { if (out.length) break; continue; } if (num(r[t.si]) <= 0) continue;
    const v = (j: number) => (j >= 0 ? String(r[j] ?? '').trim() : '');
    const row: Record<string, string> = { ma_tam: ma, day: v(t.di), rong: v(c.rong), dai: v(c.dai), so_tam: v(t.si), mau_son: v(c.mau), m2_ht: c.m2_ht >= 0 ? fx(r[c.m2_ht], 4) : '',
      trai_rong: v(c.trai_rong), trai_dai: v(c.trai_dai), m2: c.m2 >= 0 ? fx(r[c.m2], 4) : '',
      phoi_rong: v(c.phoi_rong), phoi_dai: v(c.phoi_dai), phoi_sl: v(c.phoi_sl), phoi_m2: c.phoi_m2 >= 0 ? fx(r[c.phoi_m2], 4) : '', ghi_chu: v(gc), vat_lieu: v(c.vat_lieu), ma_mau: v(c.mau) };
    // File không có nhóm Thực tế trải: dùng m² hoàn thiện làm khối lượng
    if (!row.m2 && row.m2_ht) row.m2 = row.m2_ht;
    out.push(row); }
  return out;
}
