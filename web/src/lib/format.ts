const nf = (d: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: d });
export const num = (v: number | null | undefined, d = 1) => (v == null ? '' : nf(d).format(Number(v)));
export const money = (v: number | null | undefined) => (v == null ? '' : nf(0).format(Math.round(Number(v))) + ' đ');
export const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('vi-VN') : '');
export const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

export const ORDER_STATUS: Record<string, string> = {
  tiep_nhan: 'Tiếp nhận', boc_tach: 'Bóc tách F1', kiem_tra_f1: 'Chờ kiểm tra F1', xndh: 'Lập XNĐH',
  cho_duyet_xndh: 'Chờ duyệt XNĐH', cho_khach: 'Chờ khách xác nhận', san_xuat: 'Sản xuất',
  giao_hang: 'Giao hàng', hoan_tat: 'Hoàn tất', huy: 'Huỷ'
};
export const BRANCH: Record<string, string> = {
  chua_bat_dau: 'Chưa bắt đầu', du_toan: 'Dự toán NVL', cho_duyet_f3: 'Duyệt cùng LGC', mua_hang: 'Mua hàng', cho_duyet_po: 'Chờ duyệt PO',
  nhap_kho: 'Nhập kho & QC', san_sang: 'NVL sẵn sàng', lap_lgc: 'Lập LGC', cho_duyet_lgc: 'Chờ duyệt LGC', cho_nvl: 'Chờ NVL',
  ban_giao: 'Bàn giao NVL', gia_cong: 'Đang gia công', qc_dat: 'QC đạt', chua_giao: 'Chưa giao', thong_bao: 'Thông báo giao + F8', lap_lgh: 'Lập lệnh giao hàng', cho_duyet_lgh: 'Duyệt LGH 2 chặng',
  giao_hang: 'Đang giao hàng', ky_bbgh: 'Ký & lưu BBGH', hoan_tat: 'Hoàn tất'
};
export const DOC: Record<string, string> = { F2: 'XNĐH', F3: 'Dự toán NVL', PO: 'PO', F5: 'Lệnh gia công', LGH1: 'LGH chặng 1 CNC → IPC', LGH2: 'LGH chặng 2 IPC → Hanwa' };
export const ROLES: Record<string, string> = {
  admin_it: 'IT quản trị', kinh_doanh: 'Kinh doanh', ky_thuat: 'Kỹ thuật bóc tách', kiem_tra_f1: 'Kiểm tra F1',
  admin_cnc: 'Admin CNC', ke_hoach: 'Kế hoạch', mua_hang: 'Mua hàng', kho_qc: 'Kho / QC', ipc: 'IPC', duyet: 'Người duyệt', xem: 'Chỉ xem'
};
export function chipKind(status: string): 'done' | 'wait' | 'bad' | 'idle' {
  if (['hoan_tat', 'dat', 'san_xuat', 'san_sang', 'qc_dat'].includes(status)) return 'done';
  if (['tu_choi', 'huy', 'khong_dat'].includes(status)) return 'bad';
  if (['chua_bat_dau', 'chua_giao', 'chua'].includes(status)) return 'idle';
  return 'wait';
}

/** Bước của QT2 gộp (Lệnh GC & bàn giao NVL) suy từ 2 trạng thái nhánh */
export function qt2Step(o: { status: string; nvl_status: string; gc_status: string }): string | null {
  if (o.status !== 'san_xuat' && o.gc_status !== 'qc_dat') return null;
  const g = o.gc_status, n = o.nvl_status;
  if (g === 'lap_lgc') return 'b1';
  if (g === 'cho_duyet_lgc') return 'b2';
  if (g === 'cho_nvl') return n === 'nhap_kho' ? 'b4' : 'b3';
  if (g === 'ban_giao') return 'b5';
  if (g === 'gia_cong') return 'b6';
  return null;
}
export const QT2_STEP: Record<string, string> = { b1: 'B1 Lập LGC + dự toán NVL', b2: 'B2 Duyệt LGC 4 cấp', b3: 'B3 Mua NVL (PO)', b4: 'B4 Nhập kho & QC NVL', b5: 'B5 Bàn giao NVL', b6: 'B6 Gia công & QC TP' };
