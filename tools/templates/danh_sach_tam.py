"""Mẫu in QT0 – Danh sách tấm (bóc tách bản vẽ). Font Be Vietnam Pro, logo bên phát hành (Phương Nam CNC)."""
import sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.worksheet.page import PageMargins

F = 'Be Vietnam Pro'
NAVY = '1F3A93'; GREY = '64748B'; HEAD = 'EEF2F7'
thin = Side(style='thin', color='94A3B8')
B = Border(left=thin, right=thin, top=thin, bottom=thin)
def f(sz=10, b=False, i=False, c='111827'): return Font(name=F, size=sz, bold=b, italic=i, color=c)
L = Alignment(horizontal='left', vertical='center'); C = Alignment(horizontal='center', vertical='center', wrap_text=True)
R = Alignment(horizontal='right', vertical='center'); LW = Alignment(horizontal='left', vertical='top', wrap_text=True)
RT = Alignment(horizontal='right', vertical='top'); CT = Alignment(horizontal='center', vertical='top')

# STT | Mã tấm | Vật liệu | Dày | Dài | Rộng | Số tấm | m²/tấm | Tổng m² | Khối lượng | Đường hàn | Số lần chấn | m² đột | Ghi chú
COLS = [('STT', 5, 'stt'), ('Mã tấm', 19, 'ma_tam'), ('Vật liệu', 23, 'vat_lieu'), ('Dày\n(mm)', 7, 'day'), ('Dài\n(mm)', 8, 'dai'),
        ('Rộng\n(mm)', 8, 'rong'), ('Số\ntấm', 6, 'so_tam'), ('m² trải\nphẳng/tấm', 10, 'm2_tam'), ('Tổng\nm²', 8, 'm2'),
        ('Khối lượng\n(kg)', 11, 'kg'), ('Đường\nhàn (m)', 8, 'duong_han'), ('Số lần\nchấn', 7, 'chan'), ('m²\nđột', 6, 'm2_dot'), ('Ghi chú', 20, 'ghi_chu')]
NUM = {'day': '0.#', 'dai': '#,##0', 'rong': '#,##0', 'so_tam': '#,##0', 'm2_tam': '#,##0.00', 'm2': '#,##0.00', 'kg': '#,##0.0',
       'duong_han': '#,##0.0', 'chan': '#,##0', 'm2_dot': '#,##0.00'}
N = len(COLS); LAST = chr(64 + N)

def build(path):
    wb = Workbook(); ws = wb.active; ws.title = 'Danh sach tam'
    for i, (_, w, _k) in enumerate(COLS): ws.column_dimensions[chr(65 + i)].width = w
    ws.page_setup.orientation = 'landscape'; ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.4, bottom=0.45)
    ws.sheet_view.showGridLines = False
    ws.oddFooter.right.text = 'Trang &P/&N'
    def put(cell, v, font=None, al=None, fill=None, border=None, fmt=None):
        c = ws[cell]; c.value = v
        if font: c.font = font
        if al: c.alignment = al
        if fill: c.fill = PatternFill('solid', fgColor=fill)
        if border: c.border = border
        if fmt: c.number_format = fmt
        return c

    # Đầu trang: logo + tên công ty | tiêu đề | số đơn
    ws.merge_cells('A1:B3'); put('A1', '{ben_ban_logo}', f(9), C)
    ws.merge_cells('C1:F1'); put('C1', '{ben_ban_ten}', f(11, True, c=NAVY), L)
    ws.merge_cells('C2:F2'); put('C2', '{ben_ban_dia_chi}', f(8.5, c=GREY), L)
    ws.merge_cells('C3:F3'); put('C3', 'ĐT: {ben_ban_dien_thoai}   ·   MST: {ben_ban_mst}', f(8.5, c=GREY), L)
    ws.merge_cells(f'K1:{LAST}1'); put('K1', 'Mã đơn: {ma_don}', f(10, True), R)
    ws.merge_cells(f'K2:{LAST}2'); put('K2', 'Lần bóc tách: {lo}', f(9, c=GREY), R)
    ws.merge_cells(f'K3:{LAST}3'); put('K3', 'Ngày in: {ngay_in}', f(9, c=GREY), R)
    for r in (1, 2, 3): ws.row_dimensions[r].height = 20
    ws.row_dimensions[4].height = 8

    ws.merge_cells(f'A5:{LAST}5'); put('A5', 'DANH SÁCH TẤM – BÓC TÁCH BẢN VẼ', f(16, True, c=NAVY), C)
    ws.row_dimensions[5].height = 30
    ws.row_dimensions[6].height = 6

    # Thông tin chung (2 cột)
    info = [('Khách hàng:', '{khach_hang}', 'Dự án:', '{du_an}'),
            ('Ngày nhận bản vẽ:', '{ngay_nhan}', 'Kênh nhận:', '{kenh}'),
            ('Hao hụt dự kiến:', '{hao_hut} %', 'Hạn giao:', '{han_giao}')]
    for i, (a, av, b, bv) in enumerate(info):
        r = 7 + i
        ws.merge_cells(f'A{r}:B{r}'); put(f'A{r}', a, f(9.5, c=GREY), L)
        ws.merge_cells(f'C{r}:F{r}'); put(f'C{r}', av, f(10, True), L)
        ws.merge_cells(f'H{r}:I{r}'); put(f'H{r}', b, f(9.5, c=GREY), L)
        ws.merge_cells(f'J{r}:{LAST}{r}'); put(f'J{r}', bv, f(10, True), L)
        ws.row_dimensions[r].height = 18
    ws.row_dimensions[10].height = 10

    # Bảng
    h = 11
    for i, (t, _w, _k) in enumerate(COLS):
        put(f'{chr(65 + i)}{h}', t, f(9, True), C, HEAD, B)
    ws.row_dimensions[h].height = 32
    d = h + 1
    for i, (_t, _w, k) in enumerate(COLS):
        v = '{#ds}{ds.stt}' if k == 'stt' else '{ds.' + k + '}'
        al = CT if k == 'stt' else (RT if k in NUM else LW)
        put(f'{chr(65 + i)}{d}', v, f(9.5), al, None, B, NUM.get(k))
    ws.row_dimensions[d].height = 30
    t = d + 1
    for i in range(N): put(f'{chr(65 + i)}{t}', None, f(9.5, True), R, HEAD, B)
    ws.merge_cells(f'A{t}:F{t}'); put(f'A{t}', 'TỔNG CỘNG', f(9.5, True), C, HEAD, B)
    for k, col in (('so_tam', 'G'), ('m2', 'I'), ('kg', 'J'), ('duong_han', 'K'), ('chan', 'L'), ('m2_dot', 'M')):
        put(f'{col}{t}', '{tong_ds_' + k + '}', f(9.5, True), R, HEAD, B, NUM[k])
    ws.row_dimensions[t].height = 22

    # Ghi chú
    g = t + 2
    put(f'A{g}', 'Ghi chú:', f(9.5, True), L)
    ws.merge_cells(f'C{g}:{LAST}{g + 1}'); put(f'C{g}', '{ghi_chu}', f(9.5), LW)
    ws.row_dimensions[g].height = 18; ws.row_dimensions[g + 1].height = 18

    # Ký xác nhận: 4 ô
    k = g + 3
    boxes = [('A', 'D', 'Người tạo', 'admin'), ('E', 'H', 'Bóc tách kỹ thuật', 'ky_thuat'),
             ('I', 'K', 'Kiểm tra', 'kiem_tra'), ('L', LAST, 'Duyệt', 'duyet')]
    for a, z, lb, role in boxes:
        ws.merge_cells(f'{a}{k}:{z}{k}'); put(f'{a}{k}', lb, f(10, True), C, HEAD)
        ws.merge_cells(f'{a}{k + 1}:{z}{k + 1}'); put(f'{a}{k + 1}', '(Ký, ghi rõ họ tên)', f(8.5, i=True, c=GREY), C)
        ws.merge_cells(f'{a}{k + 2}:{z}{k + 4}'); put(f'{a}{k + 2}', '', f(10), C)
        ws.merge_cells(f'{a}{k + 5}:{z}{k + 5}'); put(f'{a}{k + 5}', '{nguoi_' + role + '}', f(10, True), C)
        ws.merge_cells(f'{a}{k + 6}:{z}{k + 6}'); put(f'{a}{k + 6}', '{ngay_' + role + '}', f(8.5, c=GREY), C)
        ca, cz = ord(a), ord(z)
        for rr in range(k, k + 7):
            for cc in range(ca, cz + 1):
                cell = ws[f'{chr(cc)}{rr}']
                cell.border = Border(left=thin if cc == ca else None, right=thin if cc == cz else None,
                                     top=thin if rr == k else None, bottom=thin if rr == k + 6 else None)
    ws.row_dimensions[k].height = 20
    for rr in range(k + 2, k + 5): ws.row_dimensions[rr].height = 16
    ws.print_area = f'A1:{LAST}{k + 6}'
    wb.save(path)

if __name__ == '__main__':
    build(sys.argv[1] if len(sys.argv) > 1 else 'Mau_Danh_sach_tam.xlsx')
