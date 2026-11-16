/** Đọc file Lệnh gia công xuất từ phần mềm sản xuất (PMSX) → dòng cho bảng NVL (xuất hàng) và Thành phẩm (nhập hàng).
 *  Nhận khối theo tiêu đề "THÔNG TIN XUẤT HÀNG" / "THÔNG TIN NHẬP HÀNG", cột theo tên tiêu đề (+ tên gọi khác cấu hình trong Quản trị). */
import type { Col, Row } from './proc';

const nrm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
const key = (s: unknown) => nrm(s).replace(/[^a-z0-9]/g, '');
/** Tên gọi có sẵn của các cột thường gặp trong file PMSX */
const BUILTIN: Record<string, string[]> = {
  ten_hang: ['ten hang', 'diengiaix'], dai_mm: ['dai (mm)', 'dai'],   vat_lieu: ['ten hang', 'ten vat tu', 'ten nvl', 'diengiaix'], rong: ['quy cach w (mm)', 'quy cach w', 'rong (mm)', 'w (mm)'], dai: ['quy cach l (mm)', 'quy cach l', 'dai (mm)', 'l (mm)'],
  day: ['do day (mm)', 'do day', 'day (mm)'], mac_thep: ['mac thep', 'ma vat lieu', 'mavtx'], don_vi_tinh: ['dvt', 'don vi tinh', 'text471'], so_tam: ['sl (tam)', 'sl tam', 'so luong (tam)', 'so luong tam', 'soluong'],
  m2: ['dt (m2)', 'dt m2', 'dien tich (m2)', 'sl m2', 'dientich'], kg: ['tl (kg)', 'trong luong (kg)', 'trong luong', 'trongluong'], ma_mau: ['ma mau', 'mau son', 'color', 'text473'], ma_don_hang: ['ma don hang', 'ma dh', 'madhct'],
  kh_bv: ['kh bv', 'ky hieu ban ve', 'khspbv'], ma_tam: ['kh bv', 'kh bv (ma tam)', 'ma tam', 'khspbv', 'tientam'], ghi_chu: ['ghi chu'] };

export type PmsxBlock = { tbl: string; rows: Row[]; unmatched: string[]; total?: Record<string, number> };
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
    const data: Row[] = []; const sc = head.indexOf('stt'); let total: Record<string, number> | undefined;
    for (let i = hi + 1; i < rows.length; i++) { const r = rows[i]; const first = nrm(r[0]);
      if (d.title.test(r.map(nrm).join(' ')) || defs.some((o) => o !== d && r.some((v) => o.title.test(nrm(v))))) break;
      if (/^tong|^cong/.test(first)) break;
      if (sc >= 0 && key(r[sc]) === 'stt') continue; // tiêu đề cột lặp lại mỗi trang
      // Dòng tổng (STT trống, chỉ có số) → giữ để đối chiếu, kết thúc khối
      if (sc >= 0 && !String(r[sc] ?? '').trim() && Object.values(map).length && !Object.entries(map).some(([ci, k]) => k === 'vat_lieu' && String(r[+ci] ?? '').trim()) && r.some((v) => typeof v === 'number' || /^\d[\d.,]*$/.test(String(v).trim()))) {
        total = {}; for (const [ci, k] of Object.entries(map)) { const n = Number(String(r[+ci]).replace(',', '.')); if (String(r[+ci]).trim() && !isNaN(n)) total[k] = n; } break; }
      if (r.every((v) => /^\(?\d*\)?$/.test(String(v ?? '').trim()))) continue; // dòng đánh số cột (1)(2)… / dòng trống
      const o: Row = {}; for (const [ci, k] of Object.entries(map)) { const v = r[+ci]; if (v !== '' && v != null) o[k] = typeof v === 'number' ? v : String(v).trim(); }
      // Độ dày lấy từ tên hàng "Nhôm 3.0 x W x L" nếu file không có cột dày
      if (o.day == null && (o.vat_lieu ?? o.ten_hang) != null) { // kể cả khi cột Dày đang ẩn – cần để tính khối lượng
        const m = /(\d+(?:[.,]\d+)?)\s*(?:mm)?\s*x/i.exec(String(o.vat_lieu ?? o.ten_hang)); if (m) o.day = Number(m[1].replace(',', '.')); }
      if (Object.keys(o).length) data.push(o); }
    out.push({ tbl: d.tbl, rows: data, unmatched, total });
  }
  return out;
}

/** Dòng đầu file "Phiếu LGC" của PMSX: LỆNH GIA CÔNG | Ngày | Số lệnh | Người phát lệnh | Mã KH | Mã ĐH | Khách | Kho xuất | Kho nhận | Dạng GC */
export function readPmsxHead(sheets: unknown[][][]): Record<string, string> {
  for (const rows of sheets) for (const r of rows.slice(0, 5)) {
    if (!/lenh gia cong/.test(nrm(r[0])) || r.slice(0, 10).filter((v) => String(v ?? '').trim()).length < 9) continue;
    const v = (i: number) => String(r[i] ?? '').trim();
    return Object.fromEntries(Object.entries({ so_lenh: v(2), nguoi_phat_lenh: v(3), ma_dh: v(5), kho_xuat: v(7), kho_nhan: v(8), dang_gc: v(9) }).filter(([, x]) => x));
  }
  return {};
}

/** Phiếu Biên bản giao hàng (RPhieuBBGH) của PMSX: dòng 1 = thông tin phiếu, dòng 2 = tiêu đề cột, cuối = dòng tổng */
export function readBbgh(sheets: unknown[][][], d: { tbl: string; cols: (Col & { alias?: string[] })[] }): { block: PmsxBlock | null; head: Record<string, string> } {
  for (const rows of sheets) {
    const r0 = rows[0] ?? []; if (!r0.some((v) => /bbgh|bien ban giao/.test(nrm(v)))) continue;
    const v = (i: number) => String(r0[i] ?? '').trim();
    const dm = /ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/.exec(nrm(v(3)));
    const after = (s: string) => s.replace(/^[^:]*:\s*/, '').trim();
    const head = Object.fromEntries(Object.entries({ so_phieu: v(2), ngay_giao: dm ? `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}` : '', ma_dh_khach: v(4), dang_gia_cong: v(6),
      ten_khach: v(7), dia_diem: v(8), tai_xe: after(v(22)), xe: after(v(23)) }).filter(([, x]) => x && x !== '-'));
    const out = readPmsx([[['DANH SACH THANH PHAM'], ...rows.slice(1)]], [{ tbl: d.tbl, title: /danh sach thanh pham/, cols: d.cols }]);
    return { block: out[0] ?? null, head };
  }
  return { block: null, head: {} };
}
