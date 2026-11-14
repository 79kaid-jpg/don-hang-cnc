/** Mô hình quy trình theo swimlane 04/11/2026: 4 quy trình chạy riêng, QT1–QT3 đi qua 3 công ty PN → IPC → Hanwa */
export type Proc = 'QT0' | 'QT1' | 'QT2' | 'QT3';
export type Company = 'PN' | 'IPC' | 'HW';
export type Row = Record<string, string | number | null>;
export type Doc = { can_view?: boolean; hidden?: string[]; assignee?: string | null; id: string; batch_id: string; company: Company; status: string; header: Record<string, string>; tables: Record<string, Row[]>;
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
  QT1: ['lap', 'kiem_tra', 'duyet'], QT2: ['lap', 'kiem_tra', 'duyet'], QT3: ['lap', 'kiem_tra', 'duyet']
};
export const STATUS: Record<string, string> = {
  tiep_nhan: 'Admin tiếp nhận', boc_tach: 'Bóc tách kỹ thuật', tao_ds: 'Tạo danh sách tấm', kiem_tra: 'Kiểm tra', duyet: 'Duyệt',
  lap: 'Lập', da_duyet: 'Đã duyệt', fail: 'Fail', duyet_them: 'Duyệt thêm'
};
export const ROLE_OF: Record<string, string> = { tiep_nhan: 'admin', boc_tach: 'ky_thuat', tao_ds: 'admin', kiem_tra: 'kiem_tra', duyet: 'duyet', lap: 'lap' };
export const ROLE_NAME: Record<string, string> = { admin: 'Admin tiếp nhận', ky_thuat: 'Bóc tách kỹ thuật', kiem_tra: 'Kiểm tra', duyet: 'Duyệt', lap: 'Lập', hoan_tat: 'Tải bản ký tay' };
export const FINAL: Record<Proc, string> = { QT0: '', QT1: 'Khách ký xác nhận', QT2: 'Ký bàn giao / nhận vật liệu', QT3: 'Khách ký nhận hàng' };
export const NEXT_LABEL: Record<string, string> = {
  tiep_nhan: 'Chuyển bóc tách', boc_tach: 'Xong bóc tách', tao_ds: 'Gửi kiểm tra', kiem_tra: 'Đạt', duyet: 'Duyệt', lap: 'Gửi kiểm tra'
};
export const CHECK5 = ['Bóc tách đã được duyệt', 'Đủ vật liệu, vật tư', 'Đủ công cụ sản xuất', 'Vấn đề kỹ thuật đã xử lý', 'Đã công bố tiêu chuẩn QC'];

/** Cột bảng: key, tên, kiểu (t chữ, n số), có tính tự động */
export type Col = { k: string; t: string; n?: boolean; ro?: boolean; req?: boolean; calc?: (r: Row) => number | null; d?: number; w?: number };
const num = (v: unknown) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(x) && String(v ?? '') !== '' ? x : null; };
export const m2Of = (r: Row) => { const a = num(r.m2_tam), s = num(r.so_tam); return a != null && s != null ? +(a * s).toFixed(3) : num(r.m2); };
/** Khối lượng riêng (g/cm³): nhôm 2,75 (khớp lệnh gia công giấy), còn lại thép 7,85 */
export const ALU = 2.75, STEEL = 7.85;
export const isAlu = (r: Row) => /nh[oô]m|alu|^\s*a\d{3,4}/i.test(String(r.vat_lieu ?? '') + ' ' + String(r.mac_thep ?? '')) || /^\s*a\d{3,4}/i.test(String(r.mac_thep ?? ''));
export const densOf = (r: Row) => (isAlu(r) ? ALU : STEEL);
export const kgOf = (r: Row) => { const m = m2Of(r), d = num(r.day); return m != null && d != null ? +(m * d * densOf(r)).toFixed(2) : null; };
export const ttOf = (r: Row) => { const m = m2Of(r), g = num(r.don_gia); return m != null && g != null ? Math.round(m * g) : null; };
export const TABLES: Record<string, { t: string; cols: Col[] }> = {
  ds0: { t: 'Danh sách tấm', cols: [
    { k: 'ma_tam', t: 'Mã tấm', w: 10 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'dai', t: 'Dài (mm)', n: true },
    { k: 'rong', t: 'Rộng (mm)', n: true }, { k: 'so_tam', t: 'Số tấm', n: true }, { k: 'm2_tam', t: 'm² trải phẳng / tấm', n: true, d: 2 },
    { k: 'm2', t: 'Tổng m²', n: true, d: 2, calc: m2Of }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf },
    { k: 'duong_han', t: 'Đường hàn (m)', n: true, d: 1 }, { k: 'chan', t: 'Số lần chấn', n: true }, { k: 'm2_dot', t: 'm² đột', n: true, d: 2 }, { k: 'ghi_chu', t: 'Ghi chú', w: 14 }] },
  ds1: { t: 'Danh sách tấm', cols: [
    { k: 'ma_tam', t: 'Mã tấm', w: 10 }, { k: 'vat_lieu', t: 'Vật liệu', w: 8 }, { k: 'day', t: 'Dày (mm)', n: true, d: 1 }, { k: 'so_tam', t: 'Số tấm', n: true },
    { k: 'm2_tam', t: 'm² / tấm', n: true, d: 2 }, { k: 'm2', t: 'Tổng m²', n: true, d: 2, calc: m2Of }, { k: 'kg', t: 'Khối lượng (kg)', n: true, d: 1, calc: kgOf },
    { k: 'don_gia', t: 'Đơn giá (đ/m²)', n: true }, { k: 'tt', t: 'Thành tiền (đ)', n: true, calc: ttOf }, { k: 'ghi_chu', t: 'Ghi chú', w: 12 }] },
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
export const PROC_TABLES: Record<Proc, [string, string][]> = { QT0: [['ds', 'ds0']], QT1: [['ds', 'ds1']], QT2: [['nl', 'nl'], ['tp', 'tp2']], QT3: [['tp', 'tp3']] };
export const HEADER: Record<Proc, [string, string, string?][]> = {
  QT0: [['ngay_nhan', 'Ngày nhận bản vẽ', 'date'], ['kenh', 'Kênh nhận (email / Zalo)'], ['hao_hut', 'Hao hụt dự kiến (%)', 'num']],
  QT1: [['so_xn', 'Số XNĐH'], ['ngay', 'Ngày lập', 'date'], ['dk_giao', 'Điều kiện giao hàng'], ['dk_tt', 'Điều kiện thanh toán'], ['vat', 'Thuế GTGT (%)', 'num']],
  QT2: [['so_lenh', 'Số lệnh gia công'], ['so_hd', 'Số hợp đồng'], ['kho_xuat', 'Kho xuất'], ['kho_nhan', 'Kho nhận'], ['dang_gc', 'Dạng gia công']],
  QT3: [['so_phieu', 'Số phiếu'], ['ngay_giao', 'Ngày giao', 'date'], ['dia_diem', 'Địa điểm giao'], ['xe', 'Xe / biển số'], ['tai_xe', 'Tài xế']]
};
/** Cột nào thuộc riêng mỗi công ty (không chép sang bên sau) */
export const OWN_HEADER = ['so_lenh', 'so_hd', 'so_phieu', 'so_xn'];

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
