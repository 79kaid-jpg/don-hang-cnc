import sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.worksheet.page import PageMargins

F = 'Times New Roman'
NAVY = '1F3A93'; RED = 'C00000'
thin = Side(style='thin', color='000000')
B = Border(left=thin, right=thin, top=thin, bottom=thin)
def f(sz=11, b=False, i=False, c='000000'): return Font(name=F, size=sz, bold=b, italic=i, color=c)
L = Alignment(horizontal='left', vertical='center'); C = Alignment(horizontal='center', vertical='center', wrap_text=True)
R = Alignment(horizontal='right', vertical='center'); LW = Alignment(horizontal='left', vertical='center', wrap_text=True)

# STT | Mã ĐH | Ký hiệu tấm | Tên hàng hóa | Mã màu | ĐVT | Dài | Rộng | SL | m² | Trọng lượng | Đơn giá | Thành tiền
COLS = [('STT',5),('Mã ĐH',14),('Ký hiệu tấm',11),('Tên hàng hóa',40),('ĐVT',6),('Dài',8),('Rộng',8),('SL',6),('m²',9),('Trọng lượng (kg)',11),('Đơn giá',12),('Thành tiền',15)]
LAST = 'L'

def build(path, d):
    """d: dict giá trị (mẫu: chuỗi {biến}; xem trước: dữ liệu thật). d['rows']: list dòng."""
    wb = Workbook(); ws = wb.active; ws.title = 'Don dat hang'
    for i, (_, w) in enumerate(COLS): ws.column_dimensions[chr(65 + i)].width = w
    ws.page_setup.orientation = 'landscape'; ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins = PageMargins(left=0.4, right=0.4, top=0.4, bottom=0.4)
    ws.sheet_view.showGridLines = False
    def put(cell, v, font=None, al=None):
        c = ws[cell]; c.value = v
        if font: c.font = font
        if al: c.alignment = al
        return c
    # Bên bán
    ws.merge_cells('A1:C4'); put('A1', d.get('logo', ''), f(9), C)
    ws.merge_cells('D1:H1'); put('D1', d['ben_ban_ten'], f(13, True, c=RED), L)
    ws.merge_cells('D2:H2'); put('D2', d['ben_ban_dia_chi'], f(10, c=RED), LW)
    ws.merge_cells('D3:H3'); put('D3', d['ben_ban_lien_he'], f(10, c=RED), L)
    for rr in (1, 2, 3, 4): ws.row_dimensions[rr].height = 19
    for r, (k, v) in enumerate([('Ngày CT:', d['ngay_ct']), ('Số CT:', d['so_ct']), ('Số ĐH:', d['so_dh']), ('Ngày GH:', d['ngay_gh'])], start=1):
        ws.merge_cells(f'I{r}:J{r}'); put(f'I{r}', k, f(11, i=True), R)
        ws.merge_cells(f'K{r}:L{r}'); put(f'K{r}', v, f(11), L)
    ws.row_dimensions[5].height = 30
    ws.merge_cells('A5:L5'); put('A5', 'ĐƠN ĐẶT HÀNG', f(22, True, c=NAVY), C)
    # Khách hàng (bên mua)
    rows = [('Tên KH:', d['kh_ten'], 'Mã KH:', d['kh_ma']), ('Địa chỉ:', d['kh_dia_chi'], 'MST:', d['kh_mst']),
            ('Nơi GH:', d['noi_gh'], 'Số P/O:', d['so_po']), ('Liên hệ:', d['kh_lien_he'], 'Dự án:', d['du_an'])]
    r0 = 6
    for j, (a, b, c, e) in enumerate(rows):
        r = r0 + j
        ws.merge_cells(f'A{r}:B{r}'); put(f'A{r}', a, f(11, i=True), L); ws.merge_cells(f'C{r}:H{r}'); put(f'C{r}', b, f(11, b=(j == 0)), L)
        ws.merge_cells(f'I{r}:J{r}'); put(f'I{r}', c, f(11, i=True), R); ws.merge_cells(f'K{r}:L{r}'); put(f'K{r}', e, f(11), LW); ws.row_dimensions[r].height = 30 if j == 3 else None
    # tiêu đề bảng (2 dòng: Quy cách gộp trên Dài/Rộng)
    h1, h2 = 11, 12
    for i, (t, _) in enumerate(COLS):
        col = chr(65 + i)
        if t in ('Dài', 'Rộng'): continue
        ws.merge_cells(f'{col}{h1}:{col}{h2}'); put(f'{col}{h1}', t, f(11, True), C)
    ws.merge_cells(f'F{h1}:G{h1}'); put(f'F{h1}', 'Quy cách (mm)', f(11, True), C)
    put(f'F{h2}', 'Dài', f(10, True), C); put(f'G{h2}', 'Rộng', f(10, True), C)
    fill = PatternFill('solid', fgColor='EEF2F8')
    for r in (h1, h2):
        for i in range(len(COLS)): c = ws.cell(r, i + 1); c.border = B; c.fill = fill
    ws.row_dimensions[h1].height = 20; ws.row_dimensions[h2].height = 18
    # dòng dữ liệu
    r = h2 + 1
    NUMF = {'F': '#,##0', 'G': '#,##0', 'H': '#,##0', 'I': '#,##0.00', 'J': '#,##0.0', 'K': '#,##0', 'L': '#,##0'}
    for it in d['rows']:
        vals = [it['stt'], it['ma_dh'], it['ky_hieu'], it['ten'], 'Tấm', it['dai'], it['rong'], it['sl'], it['m2'], it['kg'], it['don_gia'], it['tt']]
        for i, v in enumerate(vals):
            col = chr(65 + i); c = ws[f'{col}{r}']; c.value = v; c.border = B; c.font = f(11)
            c.alignment = C if col in 'ABCE' else (Alignment(horizontal='left', vertical='center', indent=1) if col == 'D' else Alignment(horizontal='right', vertical='center', indent=1))
            if col in NUMF: c.number_format = NUMF[col]
        r += 1
    first, last = h2 + 1, r - 1
    # tổng
    tr = r
    ws.merge_cells(f'A{tr}:G{tr}'); put(f'A{tr}', 'Tổng cộng', f(11, True), C)
    def tot(col, key, fmt):
        c = ws[f'{col}{tr}']; c.value = d[key]; c.font = f(11, True); c.alignment = Alignment(horizontal='right', vertical='center', indent=1); c.number_format = fmt
    tot('H', 'tong_sl', '#,##0'); tot('I', 'tong_m2', '#,##0.00'); tot('J', 'tong_kg', '#,##0.0')
    put(f'K{tr}', 'Thành tiền', f(11, True), Alignment(horizontal='left', vertical='center', indent=1)); tot('L', 'tong_tien', '#,##0')
    for i in range(len(COLS)): ws.cell(tr, i + 1).border = B
    # VAT, Phí VC, Phải thu
    for k, (lab, key) in enumerate([('VAT {vat}%'.replace('{vat}', str(d['vat'])), 'tien_vat'), ('Phí VC', 'phi_vc'), ('Phải thu', 'phai_thu')], start=1):
        rr = tr + k; put(f'K{rr}', lab, f(11, k == 3), Alignment(horizontal='left', vertical='center', indent=1)); c = put(f'L{rr}', d[key], f(11, k == 3), Alignment(horizontal='right', vertical='center', indent=1)); c.number_format = '#,##0'
        ws[f'K{rr}'].border = B; ws[f'L{rr}'].border = B
    ws.merge_cells(f'A{tr+1}:J{tr+1}'); put(f'A{tr+1}', d['bang_chu'], f(11, i=True), L)
    # chữ ký
    sr = tr + 5
    for rng, t in (('A{0}:C{0}', 'Khách hàng'), ('D{0}:E{0}', 'Phòng Kinh doanh'), ('H{0}:J{0}', 'Người duyệt'), ('K{0}:L{0}', 'NV lập')):
        a = rng.format(sr); ws.merge_cells(a); put(a.split(':')[0], t, f(11, True), C)
        a2 = rng.format(sr + 1); ws.merge_cells(a2); put(a2.split(':')[0], '(Ký, ghi rõ họ tên)', f(9, i=True, c='666666'), C)
    for rng, key in (('H{0}:J{0}', 'nguoi_duyet'), ('K{0}:L{0}', 'nguoi_lap')):
        a = rng.format(sr + 5); ws.merge_cells(a); put(a.split(':')[0], d[key], f(11, True), C)
    ws.print_area = f'A1:L{sr+5}'
    wb.save(path)

TPL = dict(logo='{ben_ban_logo}', ben_ban_ten='{ben_ban_ten}', ben_ban_dia_chi='{ben_ban_dia_chi}', ben_ban_lien_he='Điện thoại: {ben_ban_dien_thoai}   ·   MST: {ben_ban_mst}',
  ngay_ct='{ngay_duyet_full}', so_ct='{so_xn}', so_dh='{ma_don}', ngay_gh='{han_giao}',
  kh_ten='{kh_ten}', kh_ma='{kh_ma}', kh_dia_chi='{kh_dia_chi}', kh_mst='{kh_mst}', noi_gh='{dk_giao}', so_po='{so_po}', kh_lien_he='{kh_lien_he}', du_an='{du_an}',
  rows=[dict(stt='{#ds}{ds.stt}', ma_dh='{ma_don}', ky_hieu='{ds.ma_tam}', ten='{ds.vat_lieu} dày {ds.day}mm – {ten_hang}',
             dai='{ds.dai}', rong='{ds.rong}', sl='{ds.so_tam}', m2='{ds.m2}', kg='{ds.kg}', don_gia='{ds.don_gia}', tt='{ds.tt}')],
  tong_sl='{tong_ds_so_tam}', tong_m2='{tong_ds_m2}', tong_kg='{tong_ds_kg}', tong_tien='{tong_tien}', vat='{vat}', tien_vat='{tien_vat}', phi_vc='', phai_thu='{tong_tt}',
  bang_chu='Số tiền phải thu: {tong_tt_chu}', nguoi_duyet='{nguoi_duyet}', nguoi_lap='{nguoi_lap}')

if __name__ == '__main__':
    build(sys.argv[1], TPL)
