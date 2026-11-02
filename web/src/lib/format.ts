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
  chua_bat_dau: 'Chưa bắt đầu', du_toan: 'Dự toán NVL', lap_lgc: 'Lập LGC', chua_giao: 'Chưa giao'
};
export const DOC: Record<string, string> = { F2: 'XNĐH', F3: 'Dự toán NVL', PO: 'PO', F5: 'Lệnh gia công', LGH1: 'LGH chặng 1', LGH2: 'LGH chặng 2' };
export const ROLES: Record<string, string> = {
  admin_it: 'IT quản trị', kinh_doanh: 'Kinh doanh', ky_thuat: 'Kỹ thuật bóc tách', kiem_tra_f1: 'Kiểm tra F1',
  admin_cnc: 'Admin CNC', ke_hoach: 'Kế hoạch', mua_hang: 'Mua hàng', kho_qc: 'Kho / QC', ipc: 'IPC', duyet: 'Người duyệt', xem: 'Chỉ xem'
};
export function chipKind(status: string): 'done' | 'wait' | 'bad' | 'idle' {
  if (['hoan_tat', 'dat', 'san_xuat'].includes(status)) return 'done';
  if (['tu_choi', 'huy', 'khong_dat'].includes(status)) return 'bad';
  if (['chua_bat_dau', 'chua_giao', 'chua'].includes(status)) return 'idle';
  return 'wait';
}
