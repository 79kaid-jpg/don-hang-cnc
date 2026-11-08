import sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.worksheet.page import PageMargins
FN = 'Times New Roman'; NAVY = '1F3A93'
thin = Side(style='thin', color='000000'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
def f(sz=11, b=False, i=False, c='000000'): return Font(name=FN, size=sz, bold=b, italic=i, color=c)
def al(h='left', wrap=False, ind=0): return Alignment(horizontal=h, vertical='center', wrap_text=wrap, indent=ind)
COLS = [('STT', 5), ('Nội dung', 30), ('Dài', 8), ('Rộng', 7), ('Số lượng\n(tấm)', 8.5), ('Số lượng\n(m²)', 8.5), ('Trọng\nlượng (kg)', 9.5), ('Mã màu', 10), ('Ký hiệu tấm', 15)]
wb = Workbook(); ws = wb.active; ws.title = 'BBGN'
for i, (_, w) in enumerate(COLS): ws.column_dimensions[chr(65 + i)].width = w
ws.page_setup.orientation = 'portrait'; ws.page_setup.paperSize = ws.PAPERSIZE_A4
ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
ws.page_margins = PageMargins(left=0.35, right=0.35, top=0.4, bottom=0.5); ws.sheet_view.showGridLines = False
def put(c, v, font=None, a=None, mg=None):
    if mg: ws.merge_cells(mg)
    x = ws[c]; x.value = v
    if font: x.font = font
    if a: x.alignment = a
    return x
# Đầu trang: logo + bên giao | quốc hiệu
put('A1', '{ben_ban_logo}', f(9), al('center'), 'A1:B3')
put('C1', '{ben_ban_ten}', f(11, True, c=NAVY), al('left', True), 'C1:E2')
put('C3', '{ben_ban_dia_chi}', f(9), al('left', True), 'C3:E4')
put('F1', 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', f(11, True), al('center'), 'F1:I1')
put('F2', 'Độc lập - Tự do - Hạnh phúc', f(11, True, i=True), al('center'), 'F2:I2')
put('F4', '{ngay_thang_nam}', f(10, i=True), al('right'), 'F4:I4')
for r in (1, 2, 3, 4): ws.row_dimensions[r].height = 17
put('A5', 'Số: {so_phieu}', f(10), al('left'), 'A5:B5'); put('F5', 'P/O: {so_po}', f(10), al('right'), 'F5:I5')
put('A6', 'ĐH: {ma_don}', f(10), al('left'), 'A6:B6')
ws.row_dimensions[7].height = 30
put('A7', 'BIÊN BẢN GIAO NHẬN HÀNG HÓA', f(17, True, c=NAVY), al('center'), 'A7:I7')
put('A8', 'Hôm nay, chúng tôi gồm có:', f(10, i=True), al('left'), 'A8:I8')
r = 9
def party(title, rows):
    global r
    put(f'A{r}', title, f(11, True), al('left'), f'A{r}:B{r}'); put(f'C{r}', rows[0], f(11, True), al('left', True), f'C{r}:I{r}'); r += 1
    for lab, v, lab2, v2 in rows[1:]:
        put(f'A{r}', lab, f(10), al('left', ind=1), f'A{r}:B{r}'); put(f'C{r}', v, f(10), al('left', True), f'C{r}:F{r}')
        if lab2: put(f'G{r}', lab2, f(10, i=True), al('right'), f'G{r}:G{r}'); put(f'H{r}', v2, f(10), al('left'), f'H{r}:I{r}')
        r += 1
party('Bên A (Bên nhận hàng):', ['{kh_ten}', ('Địa chỉ giao:', '{dia_diem}', None, None), ('Điện thoại:', '{kh_dien_thoai}', None, None), ('Đại diện:', '{kh_dai_dien}', 'Chức vụ:', '{kh_chuc_vu}')])
party('Bên B (Bên giao hàng):', ['{ben_ban_ten}', ('Địa chỉ:', '{ben_ban_dia_chi}', None, None), ('Điện thoại:', '{ben_ban_dien_thoai}', None, None), ('Đại diện:', '{ben_ban_dai_dien}', 'Chức vụ:', '{ben_ban_chuc_vu}')])
party('Bên C (Bên vận chuyển):', ['{vc_ten}', ('Địa chỉ:', '{vc_dia_chi}', None, None), ('Điện thoại:', '{vc_dien_thoai}', None, None), ('Đại diện:', '{vc_dai_dien}', 'Chức vụ:', '{vc_chuc_vu}'), ('Xe / biển số:', '{xe}', 'Tài xế:', '{tai_xe}')])
put(f'A{r}', 'Hai bên cùng nhau thống nhất số lượng giao hàng như sau:', f(10, i=True), al('left'), f'A{r}:I{r}'); r += 1
h1, h2 = r, r + 1
fill = PatternFill('solid', fgColor='EEF2F8')
for i, (t, _) in enumerate(COLS):
    col = chr(65 + i)
    if t in ('Dài', 'Rộng'): continue
    put(f'{col}{h1}', t, f(10, True), al('center', True), f'{col}{h1}:{col}{h2}')
put(f'C{h1}', 'Quy cách (mm)', f(10, True), al('center'), f'C{h1}:D{h1}'); put(f'C{h2}', 'Dài', f(9, True), al('center')); put(f'D{h2}', 'Rộng', f(9, True), al('center'))
for rr in (h1, h2):
    for i in range(len(COLS)): c = ws.cell(rr, i + 1); c.border = B; c.fill = fill
ws.row_dimensions[h1].height = 18; ws.row_dimensions[h2].height = 18
# dòng lặp
dr = h2 + 1
vals = ['{#tp}{tp.stt}', '{tp.vat_lieu} dày {tp.day}mm', '{tp.dai}', '{tp.rong}', '{tp.so_tam}', '{tp.m2}', '{tp.kg}', '{tp.ma_mau}', '{tp.ma_tam}']
fmt = {'C': '#,##0', 'D': '#,##0', 'E': '#,##0', 'F': '#,##0.00', 'G': '#,##0.00'}
for i, v in enumerate(vals):
    col = chr(65 + i); c = ws[f'{col}{dr}']; c.value = v; c.border = B; c.font = f(10)
    c.alignment = al('center') if col in 'AH' else al('left', ind=1) if col in 'BI' else al('right', ind=1)
    if col in fmt: c.number_format = fmt[col]
# tổng
tr = dr + 1
put(f'A{tr}', 'Tổng cộng', f(10, True), al('center'), f'A{tr}:D{tr}')
for col, v, fm in (('E', '{tong_tp_so_tam}', '#,##0'), ('F', '{tong_tp_m2}', '#,##0.00'), ('G', '{tong_tp_kg}', '#,##0.00')):
    c = put(f'{col}{tr}', v, f(10, True), al('right', ind=1)); c.number_format = fm
for i in range(len(COLS)): ws.cell(tr, i + 1).border = B; ws.cell(tr, i + 1).fill = fill
# quy cách giao hàng (ghi chú cuối)
notes = ['Hàng mới 100%, không móp méo, trầy xước. Hàng được đóng gói / bao bì chắc chắn.',
         'Bên A xác nhận Bên B đã giao hàng đúng chủng loại và đúng số lượng như trên, được giao bởi Bên C.',
         'Ba bên đồng ý và ký biên bản xác nhận.',
         'Biên bản được lập thành 3 bản, mỗi bên giữ 1 bản và có giá trị pháp lý như nhau.']
r = tr + 1
for n in notes: put(f'A{r}', n, f(10), al('left', True), f'A{r}:I{r}'); r += 1
r += 1
for rng, t in (('A{0}:C{0}', 'BÊN A'), ('D{0}:F{0}', 'BÊN B'), ('G{0}:I{0}', 'BÊN C')):
    a = rng.format(r); put(a.split(':')[0], t, f(11, True), al('center'), a)
    a = rng.format(r + 1); put(a.split(':')[0], '(Ký, ghi rõ họ tên)', f(9, i=True, c='666666'), al('center'), a)
ws.print_area = f'A1:I{r+6}'; ws.print_title_rows = f'{h1}:{h2}'
wb.save(sys.argv[1])
