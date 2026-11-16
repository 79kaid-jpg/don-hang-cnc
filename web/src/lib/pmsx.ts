/** Đọc file Lệnh gia công xuất từ phần mềm sản xuất (PMSX) → dòng cho bảng NVL (xuất hàng) và Thành phẩm (nhập hàng).
 *  Nhận khối theo tiêu đề "THÔNG TIN XUẤT HÀNG" / "THÔNG TIN NHẬP HÀNG", cột theo tên tiêu đề (+ tên gọi khác cấu hình trong Quản trị). */
import type { Col, Row } from './proc';

const nrm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const key = (s: unknown) => nrm(s).replace(/[^a-z0-9]/g, '');
/** Tên gọi có sẵn của các cột thường gặp trong file PMSX */
const BUILTIN: Record<string, string[]> = {
  vat_lieu: ['ten hang', 'ten vat tu', 'ten nvl'], rong: ['quy cach w (mm)', 'quy cach w', 'rong (mm)', 'w (mm)'], dai: ['quy cach l (mm)', 'quy cach l', 'dai (mm)', 'l (mm)'],
  day: ['do day (mm)', 'do day', 'day (mm)'], mac_thep: ['mac thep', 'ma vat lieu'], don_vi_tinh: ['dvt', 'don vi tinh'], so_tam: ['sl (tam)', 'sl tam', 'so luong (tam)', 'so luong tam'],
  m2: ['dt (m2)', 'dt m2', 'dien tich (m2)', 'sl m2'], kg: ['tl (kg)', 'trong luong (kg)', 'trong luong'], ma_mau: ['ma mau', 'mau son'], ma_don_hang: ['ma don hang', 'ma dh'],
  kh_bv: ['kh bv', 'ky hieu ban ve'], ma_tam: ['kh bv', 'kh bv (ma tam)', 'ma tam'], ghi_chu: ['ghi chu'] };

export type PmsxBlock = { tbl: string; rows: Row[]; unmatched: string[] };
/** cols: cột của bảng (theo Quản trị) kèm tên gọi khác */
export function readPmsx(sheets: unknown[][][], defs: { tbl: string; title: RegExp; cols: (Col & { alias?: string[] })[] }[]): PmsxBlock[] {
  const out: PmsxBlock[] = [];
  for (const rows of sheets) for (const d of defs) {
    const ti = rows.findIndex((r) => r.some((v) => d.title.test(nrm(v)))); if (ti < 0 || out.some((x) => x.tbl === d.tbl)) continue;
    const hi = rows.findIndex((r, i) => i > ti && r.filter((v) => String(v ?? '').trim()).length >= 3); if (hi < 0) continue;
    const head = rows[hi].map((v) => key(v));
    const map: Record<number, string> = {}; const unmatched: string[] = [];
    head.forEach((h, ci) => { if (!h || h === 'stt') return;
      const c = d.cols.find((x) => !x.calc && x.ty !== 'ref' && x.ty !== 'sub' && [x.t, x.k, ...(x.alias ?? []), ...(BUILTIN[x.k] ?? [])].some((a) => key(a) === h && !Object.values(map).includes(x.k)));
      const auto = d.cols.some((x) => (x.calc || x.ty === 'ref') && [x.t, x.k, ...(BUILTIN[x.k] ?? [])].some((a) => key(a) === h)); // cột app tự tính → bỏ qua, không báo
      if (c) map[ci] = c.k; else if (!auto) unmatched.push(String(rows[hi][ci]).replace(/\s+/g, ' ').trim()); });
    const data: Row[] = [];
    for (let i = hi + 1; i < rows.length; i++) { const r = rows[i]; const first = nrm(r[0]);
      if (d.title.test(r.map(nrm).join(' ')) || defs.some((o) => o !== d && r.some((v) => o.title.test(nrm(v))))) break;
      if (/^tong|^cong/.test(first)) break;
      if (r.every((v) => /^\(?\d*\)?$/.test(String(v ?? '').trim()))) continue; // dòng đánh số cột (1)(2)… / dòng trống
      const o: Row = {}; for (const [ci, k] of Object.entries(map)) { const v = r[+ci]; if (v !== '' && v != null) o[k] = typeof v === 'number' ? v : String(v).trim(); }
      // Độ dày lấy từ tên hàng "Nhôm 3.0 x W x L" nếu file không có cột dày
      if (o.day == null && o.vat_lieu != null) { // kể cả khi cột Dày đang ẩn – cần để tính khối lượng
        const m = /(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*x/i.exec(String(o.vat_lieu)); if (m) o.day = Number(m[1].replace(',', '.')); }
      if (Object.keys(o).length) data.push(o); }
    out.push({ tbl: d.tbl, rows: data, unmatched });
  }
  return out;
}
