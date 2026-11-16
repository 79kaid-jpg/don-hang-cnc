/** Mô hình quy trình theo swimlane 04/11/2026: 4 quy trình chạy riêng, QT1–QT3 đi qua 3 công ty PN → IPC → Hanwa */
export type Proc = 'QT0' | 'QT1' | 'QT2' | 'QT3';
export type Company = 'PN' | 'IPC' | 'HW';
export type Row = Record<string, string | number | null>;
/** Bảng con trong một ô (kiểu Bảng trong bảng) */
export const subRows = (r: Row, k: string): Row[] => { const v = (r as Record<string, unknown>)[k]; return Array.isArray(v) ? (v as Row[]) : []; };
export type RetSnap = { header: Record<string, string>; tables: Record<string, Row[]>; at: string; note: string; from: string; to: string; by: string };
export type Doc = { ret_snap?: RetSnap | null; can_view?: boolean; hidden?: string[]; assignee?: string | null; id: string; batch_id: string; company: Company; status: string; header: Record<string, string>; tables: Record<string, Row[]>;
  files: { kind: string; name: string; path: string; at?: string }[]; notes: { role: string; user: string; at: string; text: string }[];
  signs: { role: string; user: string; at: string; action: string; note?: string }[]; status_at: string; created_at: string };
export type Batch = { id: string; order_id: string; proc: Proc; seq: number; title: string; status: 'dang_lam' | 'cho_ky' | 'hoan_tat' | 'fail' | 'huy';
  checklist: Record<string, boolean>; final_files: { name: string; path: string }[]; created_at: string; done_at: string | null };

export const COMPANY: Record<Company, string> = { PN: 'Phương Nam CNC', IPC: 'IPC', HW: 'Hanwa' };
export const COMPANIES: Company[] = ['PN', 'IPC', 'HW'];
export const PROC_NAME: Record<Proc, string> = { QT0: 'Bóc tách bản vẽ', QT1: 'Xác nhận đơn hàng', QT2: 'Lệnh gia công & bàn giao vật liệu', QT3: 'Xuất kho kiêm biên bản giao hàng' };
export const PROC_SHORT: Record<Proc, string> = { QT0: 'Bóc tách', QT1: 'XNĐH', QT2: 'Lệnh GC', QT3: 'Giao hàng' };
export const BATCH_WORD: Record<Proc, string> = { QT0: 'lần bóc tách', QT1: 'XNĐH', QT2: 'lệnh gia công', QT3: 'đợt giao' };

export const FLOW: Record<Proc, string[]> = {
  QT0: ['tiep_nhan', 'boc_tach', 'tao_ds', 'kiem_tra', 'duyet'],
  QT1: ['lap', 'kiem_tra', 'duyet'], QT2: ['lap', 'kiem_tra', 'duyet'], QT3: ['lap', 'kiem_tra', 'duyet', 'anh_giao']
};
export const STATUS: Record<string, string> = {
  tiep_nhan: 'Admin tiếp nhận', boc_tach: 'Bóc tách kỹ thuật', tao_ds: 'Tạo danh sách tấm', kiem_tra: 'Kiểm tra', duyet: 'Duyệt',
  lap: 'Lập', anh_giao: 'Tải ảnh giao hàng', da_duyet: 'Đã duyệt', fail: 'Fail', duyet_them: 'Duyệt thêm'
};
export const ROLE_OF: Record<string, string> = { tiep_nhan: 'admin', boc_tach: 'ky_thuat', tao_ds: 'admin', kiem_tra: 'kiem_tra', duyet: 'duyet', lap: 'lap', anh_giao: 'thu_kho' };
export const ROLE_NAME: Record<string, string> = { admin: 'Admin tiếp nhận', ky_thuat: 'Bóc tách kỹ thuật', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', lap: 'Lập', hoan_tat: 'Tải bản ký tay', thu_kho: 'Thủ kho · ảnh giao hàng' };
export const FINAL: Record<Proc, string> = { QT0: '', QT1: 'Khách ký xác nhận', QT2: 'Ký bàn giao / nhận vật liệu', QT3: 'Khách ký nhận hàng' };
export const NEXT_LABEL: Record<string, string> = {
  tiep_nhan: 'Chuyển bóc tách', boc_tach: 'Xong bóc tách', tao_ds: 'Gửi kiểm tra', kiem_tra: 'Đạt', duyet: 'Duyệt', lap: 'Gửi kiểm tra', anh_giao: 'Xong ảnh giao hàng'
};
export const CHECK5 = ['Bóc tách đã được duyệt', 'Đủ vật liệu, vật tư', 'Đủ công cụ sản xuất', 'Vấn đề kỹ thuật đã xử lý', 'Đã công bố tiêu chuẩn QC'];

/** Cột bảng: key, tên, kiểu (t chữ, n số), có tính tự động */
export type Col = { k: string; t: string; alias?: string[]; sum?: boolean; fx?: string; ty?: 'date' | 'select' | 'bool' | 'ref' | 'lookup' | 'datetime' | 'multi' | 'sub'; int?: boolean; sub?: Col[]; opts?: string[]; ref?: string; refv?: string; n?: boolean; ro?: boolean; req?: boolean; calc?: (r: Row) => number | null; d?: number; w?: number; g?: string; u?: string; info?: string[] };
const num = (v: unknown) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(x) && String(v ?? '') !== '' ? x : null; };
export const m2Of = (r: Row) => { const a = num(r.m2_tam), s = num(r.so_tam); return a != null && s != null ? +(a * s).toFixed(3) : num(r.m2); };
/** Khối lượng riêng (g/cm³): nhôm 2,75 (khớp lệnh gia công giấy), còn lại thép 7,85 */
export const ALU = 2.75, STEEL = 7.85;
export const isAlu = (r: Row) => /nh[oô]m|alu|^\s*a\d{3,4}/i.test(String(r.vat_lieu ?? '') + ' ' + String(r.mac_thep ?? '')) || /^\s*a\d{3,4}/i.test(String(r.mac_thep ?? ''));
/** Danh mục vật liệu (Quản trị → Vật liệu): tên, tỷ trọng, từ khoá nhận diện */
export type Material = { id: string; name: string; density: number; keywords: string[]; is_default: boolean; active: boolean; ord: number };
let MATS: Material[] = [];
export const setMaterials = (m: Material[]) => { MATS = m.filter((x) => x.active); };
const nrm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Vật liệu của dòng: ưu tiên ô chọn đúng tên vật liệu, rồi từ khoá trong tên hàng / mác thép; không khớp → mặc định */
export function matOf(r: Row): { m: Material | null; how: 'chon' | 'tu_khoa' | 'mac_dinh' } {
  if (!MATS.length) return { m: null, how: 'mac_dinh' };
  for (const v of Object.values(r)) if (typeof v === 'string' && v) { const x = MATS.find((m) => m.name.toLowerCase() === v.trim().toLowerCase()); if (x) return { m: x, how: 'chon' }; }
  const txt = nrm(String(r.vat_lieu ?? '') + ' ' + String(r.mac_thep ?? '') + ' ' + String(r.ten_hang ?? ''));
  let best: Material | null = null; let bl = 0;
  for (const m of MATS) for (const k of m.keywords) { const kk = nrm(k.trim()); if (kk && txt.includes(kk) && kk.length > bl) { best = m; bl = kk.length; } }
  if (best) return { m: best, how: 'tu_khoa' };
  return { m: MATS.find((m) => m.is_default) ?? null, how: 'mac_dinh' };
}
const matTxt = (r: Row) => String(r.vat_lieu ?? '') + '|' + String(r.mac_thep ?? '');
/** Tỷ trọng: giá trị đã chốt trong phiếu (nếu tên hàng/mác chưa đổi) → danh mục → mặc định cũ */
export const densOf = (r: Row): number => { const s = num(r.ty_trong); if (s != null && r._vl === matTxt(r)) return s;
  const { m } = matOf(r); return m ? Number(m.density) : isAlu(r) ? ALU : STEEL; };
/** Ghi tỷ trọng hiện tại vào dòng (khi lưu phiếu) để phiếu đã duyệt giữ nguyên số kg */
export const stampDens = (r: Row): Row => { if (!String(r.vat_lieu ?? '').trim() && !String(r.mac_thep ?? '').trim()) return r; const { m } = matOf(r); return m ? { ...r, ty_trong: Number(m.density), _vl: matTxt(r) } : r; };
export const kgOf = (r: Row) => { const m = m2Of(r), d = num(r.day); return m != null && d != null ? +(m * d * densOf(r)).toFixed(2) : null; };
export const ttOf = (r: Row) => { const m = m2Of(r), g = num(r.don_gia); return m != null && g != null ? Math.round(m * g) : null; };
export const TABLES: Record<string, { t: string; cols: Col[] }> = {
  nl0: { t: 'Bảng 1 – Nguyên vật liệu (phôi)', cols: [
    { k: 'vat_lieu', t: 'Tên hàng / vật liệu', w: 12 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'dai', t: 'Dài (mm)', n: true }, { k: 'rong', t: 'Rộng (mm)', n: true },
    { k: 'mac_thep', t: 'Mác thép', w: 8 }, { k: 'so_tam', t: 'SL (tấm)', n: true }, { k: 'm2', t: 'DT (m²)', n: true, d: 2 }, { k: 'kg', t: 'TL (kg)', n: true, d: 1, calc: kgOf },
    { k: 'ma_mau', t: 'Mã màu', w: 6 }, { k: 'ma_tam', t: 'Dùng cho mã tấm', w: 14 }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] },
  ds0: { t: 'Bảng 2 – Thành phẩm', cols: [
    // cùng trường, cùng thứ tự, cùng nhãn với Bảng 2 của Lệnh gia công (QT2)
    { k: 'vat_lieu', t: 'Tên hàng', w: 10 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'dai', t: 'Dài (mm)', n: true }, { k: 'rong', t: 'Rộng (mm)', n: true },
    { k: 'mac_thep', t: 'Mác thép', w: 8 }, { k: 'cot_moi', t: 'Đơn vị tính', w: 6 }, { k: 'so_tam', t: 'SL (tấm)', n: true },
    { k: 'm2', t: 'DT (m²)', n: true, d: 2 }, { k: 'kg', t: 'TL (kg)', n: true, d: 1, calc: kgOf }, { k: 'ma_mau', t: 'Mã màu', w: 8 },
    { k: 'ma_don_hang', t: 'Mã đơn hàng', w: 10 }, { k: 'ma_tam', t: 'KH BV (mã tấm)', w: 12 }, { k: 'ghi_chu', t: 'Ghi chú', w: 14 },
    // chỉ QT0: số liệu kỹ thuật – dùng tính m²/tấm cho QT1 và lọc hàn khi tách đơn
    { k: 'trai_rong', t: 'Rộng trải', n: true, u: 'mm' }, { k: 'trai_dai', t: 'Dài trải', n: true, u: 'mm' }, { k: 'm2_ht', t: 'm² hoàn thiện', n: true, d: 2 },
    { k: 'loai_gc', t: 'Loại gia công', w: 9 }, { k: 'm2_tam', t: 'm²/tấm', n: true, d: 4 },
    { k: 'duong_han', t: 'Đường hàn (m)', n: true, d: 1 }, { k: 'chan', t: 'Số lần chấn', n: true }, { k: 'm2_dot', t: 'm² đột', n: true, d: 2 },
    { k: 'phoi_rong', t: 'Rộng phôi', n: true }, { k: 'phoi_dai', t: 'Dài phôi', n: true }, { k: 'phoi_sl', t: 'SL phôi', n: true }, { k: 'phoi_m2', t: 'm² phôi', n: true, d: 2 }] },
  ds1: { t: 'Danh sách tấm', cols: [
    { k: 'ma_tam', t: 'Mã tấm', w: 10 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'rong', t: 'Rộng (mm)', n: true }, { k: 'dai', t: 'Dài (mm)', n: true }, { k: 'so_tam', t: 'Số tấm', n: true }, { k: 'mau_son', t: 'Màu sơn', w: 6 },
    { k: 'm2_tam', t: 'm² / tấm', n: true, d: 2 }, { k: 'm2', t: 'Tổng m²', n: true, d: 2, calc: m2Of }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf },
    { k: 'don_gia', t: 'Đơn giá (đ/m²)', n: true }, { k: 'tt', t: 'Thành tiền (đ)', n: true, calc: ttOf }, { k: 'loai_gc', t: 'Loại gia công', w: 9 }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] },
  nl: { t: 'Bảng 1 – Thông tin xuất hàng (nguyên liệu)', cols: [
    { k: 'tam_phoi', t: 'Tấm phôi / quy cách', w: 14 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'so_tam', t: 'Số tấm', n: true },
    { k: 'm2', t: 'Tổng m²', n: true, d: 2 }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] },
  tp2: { t: 'Bảng 2 – Thông tin nhập hàng (thành phẩm)', cols: [
    { k: 'ma_tam', t: 'Mã tấm thành phẩm', w: 12 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'so_tam', t: 'Số tấm', n: true },
    { k: 'm2', t: 'Tổng m²', n: true, d: 2 }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] },
  tp3: { t: 'Danh sách thành phẩm của đợt giao', cols: [
    { k: 'pallet', t: 'Mã pallet', w: 8 }, { k: 'ma_tam', t: 'Mã tấm', w: 10 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 },
    { k: 'so_tam', t: 'Số tấm', n: true }, { k: 'm2', t: 'Tổng m²', n: true, d: 2 }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] }
};
/** bảng của từng quy trình: [khoá lưu trong docs.tables, định nghĩa cột] */
export const PROC_TABLES: Record<Proc, [string, string][]> = { QT0: [['nl', 'nl0'], ['ds', 'ds0']], QT1: [['ds', 'ds1']], QT2: [['nl', 'nl'], ['tp', 'tp2']], QT3: [['tp', 'tp3']] };
export const HEADER: Record<Proc, [string, string, string?][]> = {
  QT0: [['ngay_nhan', 'Ngày nhận bản vẽ', 'date'], ['kenh', 'Kênh nhận (email / Zalo)'], ['hao_hut', 'Hao hụt dự kiến (%)', 'num']],
  QT1: [['so_xn', 'Số XNĐH'], ['ngay', 'Ngày lập', 'date'], ['dk_giao', 'Điều kiện giao hàng'], ['noi_giao', 'Nơi giao hàng'], ['dk_tt', 'Điều kiện thanh toán'], ['vat', 'Thuế GTGT (%)', 'num'], ['phi_vc', 'Phí vận chuyển (đ)', 'num']],
  QT2: [['so_lenh', 'Số lệnh gia công'], ['so_hd', 'Số hợp đồng'], ['kho_xuat', 'Kho xuất'], ['kho_nhan', 'Kho nhận'], ['dang_gc', 'Dạng gia công']],
  QT3: [['so_phieu', 'Số phiếu'], ['ngay_giao', 'Ngày giao', 'date'], ['dia_diem', 'Địa điểm giao'], ['xe', 'Xe / biển số'], ['tai_xe', 'Tài xế']]
};
/** Cột nào thuộc riêng mỗi công ty (không chép sang bên sau) */
export const OWN_HEADER = ['so_lenh', 'so_hd', 'so_phieu', 'so_xn', 'so_ct'];

export const sumOf = (rows: Row[], c: Col) => rows.reduce((s, r) => s + (Number((c.calc ? c.calc(r) : num(r[c.k])) ?? 0)), 0);
export const numIn = num;
/** Số hợp lệ: 12 · 12.5 · 12,5 (không âm, tối đa một dấu thập phân) */
export const NUM_RE = /^\d+([.,]\d+)?$/;
export const isNumOk = (v: unknown) => { const s = String(v ?? '').trim(); return s === '' || NUM_RE.test(s); };
/** Lọc ký tự khi gõ vào ô số */
export const numTyping = (v: string) => v.replace(/[^\d.,]/g, '');

/** Bước hiện tại của một hồ sơ (dùng cho Kanban / sơ đồ) */
export function stepOf(b: Batch, docs: Doc[]): { key: string; company?: Company; doc?: Doc } {
  if (b.status === 'cho_ky') return { key: 'ky' };
  if (b.status !== 'dang_lam') return { key: b.status };
  const d = docs.filter((x) => x.batch_id === b.id).sort((a, z) => COMPANIES.indexOf(z.company) - COMPANIES.indexOf(a.company))[0];
  if (!d) return { key: 'none' };
  const k = d.status === 'duyet_them' ? 'duyet' : d.status;
  return b.proc === 'QT0' ? { key: k, company: d.company, doc: d } : { key: d.company + '.' + k, company: d.company, doc: d };
}
export function columnsOf(p: Proc): { key: string; title: string; group?: string }[] {
  if (p === 'QT0') return FLOW.QT0.map((s) => ({ key: s, title: STATUS[s] }));
  return [...COMPANIES.flatMap((c) => FLOW[p].map((s) => ({ key: c + '.' + s, title: STATUS[s], group: COMPANY[c] }))), { key: 'ky', title: FINAL[p] }];
}

/** Tóm tắt tiến độ một quy trình của một đơn */
/** Trạng thái thống nhất toàn app: Chưa mở · Đang làm · Chờ ký · Xong · Fail. d = chi tiết bước (để hiện phụ / tooltip) */
export function procSummary(p: Proc, bs: Batch[], ds: Doc[]): { t: string; d: string; cls: 'idle' | 'done' | 'bad' | 'wait' | 'sign'; since?: string } {
  const list = bs.filter((b) => b.proc === p); if (!list.length) return { t: 'Chưa mở', d: '', cls: 'idle' };
  const open = list.filter((b) => b.status === 'dang_lam' || b.status === 'cho_ky');
  const done = list.filter((b) => b.status === 'hoan_tat').length;
  const unit = p === 'QT0' ? 'lần' : p === 'QT2' ? 'lệnh' : p === 'QT3' ? 'đợt' : 'bộ';
  if (!open.length) return done ? { t: 'Xong', d: done > 1 ? done + ' ' + unit + ' xong' : '', cls: 'done' } : { t: 'Fail', d: 'Bị từ chối', cls: 'bad' };
  const b = open[open.length - 1]; const st = stepOf(b, ds);
  const more = (open.length > 1 ? open.length + ' ' + unit + ' đang mở · ' : '') + (done ? done + ' xong · ' : '');
  const since = docs0(b, ds);
  if (st.key === 'ky') return { t: 'Chờ ký', d: more + FINAL[p], cls: 'sign', since };
  const lab = (st.company && p !== 'QT0' ? (st.company === 'PN' ? 'PN' : COMPANY[st.company]) + ' · ' : '') + (STATUS[st.doc?.status ?? ''] ?? '');
  return { t: 'Đang làm', d: more + lab, cls: 'wait', since };
}

const docs0 = (b: Batch, ds: Doc[]) => ds.filter((d) => d.batch_id === b.id).map((d) => d.status_at).sort().pop() ?? b.created_at;

/** QT3 · Tải ảnh giao hàng: 5 mục bắt buộc có ảnh */
export const GH_ITEMS: [string, string][] = [['gh_cccd', 'CCCD & số điện thoại tài xế'], ['gh_truoc', 'Ảnh trước khi lên hàng'], ['gh_sau', 'Ảnh sau khi load hàng xong'], ['gh_xe', 'Ảnh nguyên chiếc xe'], ['gh_bbgh', 'Ảnh BBGH đã ký']];

/** Gom cột phôi của bảng thành phẩm (file bóc tách) thành Bảng 1 – NVL: cùng vật liệu, dày, khổ phôi → 1 dòng */
export function nlFromPhoi(rows: Row[]): Row[] {
  const m = new Map<string, { row: Row; codes: string[] }>();
  for (const r of rows) { const pr = num(r.phoi_rong), pd = num(r.phoi_dai), sl = num(r.phoi_sl); if (pr == null || pd == null || !sl) continue;
    const vl = String(r.vat_lieu ?? '').trim(); const k = [vl, num(r.day) ?? '', pr, pd].join('|');
    const a = num(r.phoi_m2) ?? +(pr * pd * sl / 1e6).toFixed(4);
    const x = m.get(k) ?? { row: { vat_lieu: vl, day: r.day ?? null, rong: pr, dai: pd, so_tam: 0, m2: 0 }, codes: [] };
    x.row.so_tam = (Number(x.row.so_tam) || 0) + sl; x.row.m2 = +((Number(x.row.m2) || 0) + a).toFixed(4);
    const c = String(r.ma_tam ?? '').trim(); if (c && !x.codes.includes(c)) x.codes.push(c); m.set(k, x); }
  return [...m.values()].map(({ row, codes }) => ({ ...row, ma_tam: codes.join(', ') }));
}
