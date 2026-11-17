"""Sinh bộ file test (.xls) theo đúng định dạng 3 file mẫu: Bóc tách bản vẽ, Phiếu LGC (PMSX), Phiếu BBGH (PMSX).
Mỗi kịch bản dùng chung 1 bộ mã tấm để chạy trọn QT0 → QT1 → QT2 → QT3.
Chạy: python3 gen_testdata.py <thư mục ra>
"""
import math, os, random, sys
import xlwt, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
random.seed(17)
B = xlwt.easyxf('font: bold on')
PN = 'CÔNG TY CỔ PHẦN PHƯƠNG NAM CNC'
PN_ADDR = 'Lô B5-9, KCN Tân Phú Trung, Đường D4, Xã Tân Phú Trung, Huyện Củ Chi, TP.HCM'
DENS = {'nhom': 2.71, 'thep': 7.85}
KH_DEF = 'CÔNG TY TNHH TEST AN PHÁT'
COLORS = ['THÔ', 'MILL FINISH', 'BRONZE - 290100P/ (075/60138)', 'TRẮNG SỨ RAL9003', 'XÁM GHI RAL7035', 'ĐEN MỜ RAL9005']


def mk_rows(prefix, n, day=1.2, mat='nhom', colors=('THÔ',), wr=(50, 1240), lr=(140, 2400)):
    rows = []
    for i in range(n):
        rows.append(dict(ma=f'{prefix}-{i + 1:02d}', day=day, mat=mat, rong=random.randrange(wr[0], wr[1], 2),
                         dai=random.randrange(lr[0], lr[1], 3), sl=random.choice([1, 1, 2, 2, 3, 4, 6, 8, 12]),
                         mau=random.choice(colors)))
    return rows


def m2(r, sl=None): return r['rong'] * r['dai'] / 1e6 * (r['sl'] if sl is None else sl)
def kg(r, sl=None): return m2(r, sl) * r['day'] * DENS[r['mat']]
def ten(r): return (f"Nhôm tấm {r['day']} x W x L (A3003-H14-CN)" if r['mat'] == 'nhom' else f"Thép {r['day']}mm x W x L")
def mavt(r): return (f"Nhom{r['day']}mm" if r['mat'] == 'nhom' else f"Thep{r['day']}mm")


# ---------- 1. Bóc tách bản vẽ ----------
def boctach(path, rows, du_an, hao=None, drop_sl=False):
    wb = xlwt.Workbook(encoding='utf-8')
    wb.add_sheet('CutData').write(0, 0, 'Mã sp')
    ws = wb.add_sheet('BOCTACHBANVE')
    ws.write(0, 2, f'BÓC TÁCH BẢN VẼ \n ĐƠN HÀNG ---- {du_an} ----', B)
    h1 = ['STT', 'Nội dung\nMã tấm', 'KÍCH THƯỚC HOÀN THIỆN', '', '', '', '', '', 'KÍCH THƯỚC THỰC TẾ TRẢI PHÔI', '', '', 'KÍCH THƯỚC PHÔI']
    h2 = ['', '', 'Độ dày', 'Rộng', 'Dài', '' if drop_sl else 'Số lượng', 'Màu sơn', 'KHỐI LƯỢNG', 'Rộng', 'Dài', 'KHỐI LƯỢNG', 'Rộng', 'Dài', '' if drop_sl else 'Số lượng', 'KHỐI LƯỢNG']
    h3 = ['', 'Column1', 'Column2', 'Column4', 'Column3', 'Column5', '', 'm2', 'mm', 'mm', 'm2', 'mm', 'mm', 'tấm', 'm2', 'GHI CHÚ', '', 'Đột']
    for r, h in ((1, h1), (2, h2), (3, h3)):
        for c, v in enumerate(h): ws.write(r, c, v, B)
    tot_sl = tot_tp = tot_ph = 0
    for i, x in enumerate(rows):
        rr, dd = x['rong'] + 67, x['dai'] + 73
        tp, tt, ph = m2(x), rr * dd / 1e6 * x['sl'], (rr + 5) * (dd + 5) / 1e6 * x['sl']
        vals = [i + 1, x['ma'], x['day'], x['rong'], x['dai'], x['sl'], x['mau'], round(tp, 6), rr, dd, round(tt, 6), rr + 5, dd + 5, x['sl'], round(ph, 6), x.get('note', ''), 3400, 3400]
        for c, v in enumerate(vals): ws.write(4 + i, c, v)
        tot_sl += x['sl']; tot_tp += tp; tot_ph += ph
    t = 4 + len(rows)
    for c, v in ((0, 'TỔNG CỘNG'), (5, tot_sl), (7, round(tot_tp, 3)), (10, round(tot_ph, 3)), (13, tot_sl), (14, round(tot_ph, 3))): ws.write(t, c, v, B)
    # GIA CONG: ô tỷ lệ hao hụt (cột Q, dòng Tổng kết)
    g = wb.add_sheet('GIA CONG')
    g.write(0, 0, f'KẾT QUẢ BÓC TÁCH BẢN VẼ ĐƠN HÀNG {du_an}', B)
    for c, v in ((0, 'YÊU CẦU THÀNH PHẨM'), (5, 'YÊU CẦU PHÔI NHÔM'), (12, 'TỶ LỆ HAO HỤT')): g.write(1, c, v, B)
    for c, v in ((12, 'STT'), (13, 'Độ dày nhôm'), (14, 'Khối lượng'), (16, 'Tỷ lệ\nhao hụt')): g.write(2, c, v, B)
    for c, v in ((14, 'Thành phẩm'), (15, 'Yêu cầu')): g.write(3, c, v)
    sheets_phoi = math.ceil(tot_ph / 2.88)
    hh = hao if hao is not None else round((1 - tot_tp / (sheets_phoi * 2.88)) * 100, 2)
    for c, v in ((0, 'Tổng kết'), (2, tot_sl), (3, round(tot_tp, 3)), (5, 'Phôi nhôm'), (10, sheets_phoi), (11, round(sheets_phoi * 2.88, 2)),
                 (12, 'Hao hụt'), (14, round(tot_tp, 3)), (15, round(sheets_phoi * 2.88, 2)), (16, hh)):
        g.write(8, c, v, B)
    wb.save(path)
    return dict(sl=tot_sl, tp=tot_tp, hao=hh)


# ---------- 2. Phiếu Lệnh gia công (PMSX) ----------
def lgc(path, rows, so_lenh, ngay, ma_dh, dang_gc, khach=KH_DEF, ma_kh='TS'):
    wb = xlwt.Workbook(encoding='utf-8'); ws = wb.add_sheet('Phieu LGCX')
    d = ngay.split('-')
    head = ['LỆNH GIA CÔNG', f' Ngày {int(d[2])} tháng {int(d[1])} năm {d[0]}', so_lenh, 'NGUYỄN VĂN TEST', ma_kh, ma_dh, khach, PN, PN, dang_gc]
    for c, v in enumerate(head): ws.write(0, c, v)
    r = 3; ws.write(r, 10, 'THÔNG TIN XUẤT HÀNG', B); r += 1
    for c, v in enumerate(['STT', 'DIENGIAIX', 'RONG', 'DAI', 'MAVTX', 'Text471', 'SOLUONG', 'DIENTICH', 'TRONGLUONG', 'Text473', 'MADHCT', 'KHSPBV']): ws.write(r, 10 + c, v, B)
    # phôi: gom theo vật liệu + độ dày, tấm 1200 x 2400
    grp = {}
    for x in rows: grp.setdefault((x['mat'], x['day']), []).append(x)
    ts = [0, 0, 0]
    for i, ((mat, day), xs) in enumerate(sorted(grp.items())):
        r += 1; ph = sum(m2(x) for x in xs) * 1.15; n = max(1, math.ceil(ph / 2.88)); s = n * 2.88; k = s * day * DENS[mat]
        ref = xs[0]
        for c, v in enumerate([i + 1, ten(ref), 1200, 2400, mavt(ref), 'tấm', n, round(s, 2), round(k, 2), '', f'{so_lenh}.{i + 1:03d}', '']): ws.write(r, 10 + c, v)
        ts[0] += n; ts[1] += s; ts[2] += k
    r += 1
    for c, v in ((16, ts[0]), (17, round(ts[1], 2)), (18, round(ts[2], 2))): ws.write(r, c, v, B)
    r += 1; ws.write(r, 10, 'THÔNG TIN NHẬP HÀNG', B); r += 1
    for c, v in enumerate(['STT', 'DIENGIAIx', 'RONG', 'DAI', 'MAVTX', 'DVT', 'SOLUONG', 'DIENTICH', 'TRONGLUONG', 'COLOR', 'MADHCT', 'KHSPBV']): ws.write(r, 10 + c, v, B)
    t = [0, 0, 0]
    for i, x in enumerate(rows):
        r += 1
        for c, v in enumerate([i + 1, ten(x), x['rong'], x['dai'], mavt(x), 'tấm', x['sl'], round(m2(x), 2), round(kg(x), 2), x['mau'], f'{ma_dh}.{i + 1:03d}', x['ma']]): ws.write(r, 10 + c, v)
        t[0] += x['sl']; t[1] += m2(x); t[2] += kg(x)
    r += 1
    for c, v in ((16, t[0]), (17, round(t[1], 2)), (18, round(t[2], 2))): ws.write(r, c, v, B)
    wb.save(path)
    return dict(sl=t[0])


# ---------- 3. Phiếu BBGH (PMSX) ----------
def bbgh(path, lines, so_phieu, ngay, ma_dh, dang_gc, khach, dia_chi, tx='', xe=''):
    """lines: [(row, so_luong_giao)]"""
    wb = xlwt.Workbook(encoding='utf-8'); ws = wb.add_sheet('Phieu GHT')
    d = ngay.split('-')
    r0 = [PN, PN_ADDR, so_phieu, f'TP.HCM, Ngày {int(d[2])} tháng {int(d[1])} năm {d[0]}', ma_dh, 'BIÊN BẢN GIAO NHẬN HÀNG HÓA', dang_gc, khach, dia_chi,
          '0300000000', '', '', PN, 'Số 99, Quốc lộ 1A, Phường Tân Thới Nhất, Quận 12, TPHCM', '-', '-', '-', '', '', '', '', '', 'TX: ' + tx, 'xe: ' + xe]
    for c, v in enumerate(r0): ws.write(0, c, v)
    for c, v in enumerate(['STT', 'DIENGIAIx', 'RONG', 'DAI', 'SOLUONG', 'DIENTICH', 'TRONGLUONG', 'COLOR', 'TIENTAM']): ws.write(1, c, v, B)
    t = [0, 0, 0]
    for i, (x, q) in enumerate(lines):
        for c, v in enumerate([i + 1, ten(x), x['rong'], x['dai'], q, round(m2(x, q), 2), round(kg(x, q), 2), x['mau'], x['ma']]): ws.write(2 + i, c, v)
        t[0] += q; t[1] += m2(x, q); t[2] += kg(x, q)
    for c, v in ((4, t[0]), (5, round(t[1], 2)), (6, round(t[2], 2))): ws.write(2 + len(lines), c, v, B)
    wb.save(path)
    return dict(sl=t[0], n=len(lines))


# ---------- Kịch bản ----------
GUIDE = []  # (TC, file, bước, tải vào đâu, mong đợi)
KH = {'AP': ('CÔNG TY TNHH TEST AN PHÁT', '12 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM'),
      'BM': ('CÔNG TY CỔ PHẦN TEST BÌNH MINH', '536 Quang Trung, Phường 11, Quận Gò Vấp, TP.HCM'),
      'HL': ('CÔNG TY TNHH TEST HOÀNG LONG', 'Lô C3, KCN Sóng Thần 2, Dĩ An, Bình Dương')}
seq = {'lgc': 100, 'bbgh': 500}


def P(tc, du_an, step, tail): return os.path.join(OUT, f'{tc}_{du_an}_{step}-{tail}.xls')
def nl(): seq['lgc'] += 1; return f'D16{seq["lgc"]:05d}'
def nb(): seq['bbgh'] += 1; return f'{seq["bbgh"]:05d}/BBGH/2026'


def full(tc, du_an, rows, kh, ma_dh, dang, note_bt, note_end, hao=None, day0='2026-11-18'):
    f1 = P(tc, du_an, 1, 'BocTach'); s = boctach(f1, rows, du_an, hao)
    GUIDE.append((tc, os.path.basename(f1), 'QT0 · Bóc tách', 'Tải file Excel bóc tách → Lấy từ file', note_bt.format(**s, n=len(rows))))
    f2 = P(tc, du_an, 2, 'LGC'); lgc(f2, rows, nl(), day0, ma_dh, dang, kh[0])
    GUIDE.append((tc, os.path.basename(f2), 'QT2 · Lệnh GC', 'Đính kèm file PMSX → nạp Bảng 1 (phôi) + Bảng 2 (thành phẩm)', f'Bảng 2 có {len(rows)} dòng, {s["sl"]} tấm, mã khớp XNĐH (không dòng đỏ)'))
    f3 = P(tc, du_an, 3, 'BBGH'); b = bbgh(f3, [(x, x['sl']) for x in rows], nb(), day0, ma_dh, dang, *kh, 'Trần Văn Xe', '51C-123.45')
    GUIDE.append((tc, os.path.basename(f3), 'QT3 · Giao hàng', 'Đính kèm file BBGH', note_end.format(**b)))


# TC01 chuẩn
r = mk_rows('AP01', 15); full('TC01', 'AnPhat-ThapA', r, KH['AP'], 'AP260001', 'NHOM1.2-DOT-CHAN',
                             'Danh sách {n} mã tấm, tổng {sl} tấm; hao hụt đọc được ≈ {hao}%', 'Giao đủ {sl} tấm / {n} mã – XNĐH còn 0 tấm')

# TC02 giao nhiều đợt
r = mk_rows('AP02', 20, colors=('THÔ', 'TRẮNG SỨ RAL9003'))
s = boctach(P('TC02', 'AnPhat-ThapB', 1, 'BocTach'), r, 'AnPhat-ThapB')
GUIDE.append(('TC02', f'TC02_AnPhat-ThapB_1-BocTach.xls', 'QT0 · Bóc tách', 'Tải file bóc tách', f'{len(r)} mã, {s["sl"]} tấm'))
lgc(P('TC02', 'AnPhat-ThapB', 2, 'LGC'), r, nl(), '2026-11-18', 'AP260002', 'NHOM1.2-DOT-CHAN-SON')
GUIDE.append(('TC02', 'TC02_AnPhat-ThapB_2-LGC.xls', 'QT2 · Lệnh GC', 'Đính kèm file PMSX', 'Bảng 2 đủ 20 dòng'))
half = r[15]['sl'] // 2 or 1
parts = [[(x, x['sl']) for x in r[:8]], [(x, x['sl']) for x in r[8:15]] + [(r[15], half)], [(r[15], r[15]['sl'] - half)] + [(x, x['sl']) for x in r[16:]]]
parts = [p for p in parts if all(q > 0 for _, q in p)]
left = s['sl']
for k, p in enumerate(parts, 1):
    b = bbgh(P('TC02', 'AnPhat-ThapB', 3, f'BBGH_dot{k}-cua{len(parts)}'), p, nb(), f'2026-11-{18 + k}', 'AP260002', 'NHOM1.2-DOT-CHAN-SON', *KH['AP'])
    left -= b['sl']
    GUIDE.append(('TC02', f'TC02_AnPhat-ThapB_3-BBGH_dot{k}-cua{len(parts)}.xls', f'QT3 · Đợt giao {k}', 'Tạo đợt giao mới → đính kèm', f'Giao {b["sl"]} tấm; XNĐH còn {left} tấm' + (' (mã ' + r[15]['ma'] + ' giao 2 lần)' if k in (2, 3) else '')))

# TC03 nhiều lần bóc tách
for lan, (n, pre) in enumerate(((12, 'BM03A'), (8, 'BM03B')), 1):
    r = mk_rows(pre, n, colors=('BRONZE - 290100P/ (075/60138)',))
    s = boctach(P('TC03', 'BinhMinh-NhaXuong', 1, f'BocTach_lan{lan}'), r, 'BinhMinh-NhaXuong')
    GUIDE.append(('TC03', f'TC03_BinhMinh-NhaXuong_1-BocTach_lan{lan}.xls', f'QT0 · Bóc tách lần {lan}', 'Lần 2: tạo "Bóc tách lần mới" trong cùng đơn', f'{n} mã, {s["sl"]} tấm' + (' – lần 2 không trùng mã lần 1' if lan == 2 else '')))
    lgc(P('TC03', 'BinhMinh-NhaXuong', 2, f'LGC_lan{lan}'), r, nl(), '2026-11-19', f'BM2600{30 + lan}', 'NHOM1.2-DOT')
    GUIDE.append(('TC03', f'TC03_BinhMinh-NhaXuong_2-LGC_lan{lan}.xls', f'QT2 · Lệnh GC {lan}', 'Mở lệnh mới cho XNĐH của lần ' + str(lan), f'{n} dòng thành phẩm'))
    b = bbgh(P('TC03', 'BinhMinh-NhaXuong', 3, f'BBGH_lan{lan}'), [(x, x['sl']) for x in r], nb(), '2026-11-21', f'BM2600{30 + lan}', 'NHOM1.2-DOT', *KH['BM'])
    GUIDE.append(('TC03', f'TC03_BinhMinh-NhaXuong_3-BBGH_lan{lan}.xls', f'QT3 · Giao lần {lan}', 'Đợt giao theo XNĐH lần ' + str(lan), f'Giao đủ {b["sl"]} tấm'))

# TC04 tách đơn (2 XNĐH từ 1 bóc tách)
r = mk_rows('BM04', 16)
s = boctach(P('TC04', 'BinhMinh-VanPhong', 1, 'BocTach'), r, 'BinhMinh-VanPhong')
GUIDE.append(('TC04', 'TC04_BinhMinh-VanPhong_1-BocTach.xls', 'QT0 · Bóc tách', 'Tải file bóc tách', f'16 mã, {s["sl"]} tấm. QT1: tạo XNĐH 1 chọn mã 01–10, XNĐH 2 chọn mã 11–16 (Tách đơn)'))
for k, part in enumerate((r[:10], r[10:]), 1):
    lgc(P('TC04', 'BinhMinh-VanPhong', 2, f'LGC_XNDH{k}'), part, nl(), '2026-11-19', f'BM26004{k}', 'NHOM1.2-DOT-CHAN')
    GUIDE.append(('TC04', f'TC04_BinhMinh-VanPhong_2-LGC_XNDH{k}.xls', f'QT2 · Lệnh GC cho XNĐH {k}', 'Lệnh GC gắn đúng XNĐH ' + str(k), f'{len(part)} dòng, mã khớp XNĐH {k}'))
    b = bbgh(P('TC04', 'BinhMinh-VanPhong', 3, f'BBGH_XNDH{k}'), [(x, x['sl']) for x in part], nb(), '2026-11-22', f'BM26004{k}', 'NHOM1.2-DOT-CHAN', *KH['BM'])
    GUIDE.append(('TC04', f'TC04_BinhMinh-VanPhong_3-BBGH_XNDH{k}.xls', f'QT3 · Giao XNĐH {k}', 'Đợt giao của XNĐH ' + str(k), f'Giao {b["sl"]} tấm, XNĐH {k} còn 0'))

# TC05 dự án lớn
r = mk_rows('HL05', 120, colors=COLORS[:4])
full('TC05', 'HoangLong-TTTM-Lon', r, KH['HL'], 'HL260005', 'NHOM1.2-DOT-CHAN-HAN',
     'Dữ liệu lớn: {n} mã, {sl} tấm – thử cuộn, tìm, toàn màn hình', 'Giao {sl} tấm / {n} dòng')

# TC06 nhiều độ dày / màu / vật liệu
r = mk_rows('HL06A', 6, 1.2, colors=COLORS) + mk_rows('HL06B', 6, 2.0, colors=COLORS) + mk_rows('HL06C', 4, 3.0, colors=COLORS) + mk_rows('HL06T', 4, 0.58, 'thep', ('tấm thô',))
full('TC06', 'HoangLong-NhieuDoDay', r, KH['HL'], 'HL260006', 'NHOM-THEP-NHIEU-DAY',
     '{n} mã: nhôm 1.2/2.0/3.0 + thép 0.58 – kiểm TL (kg) theo độ dày & vật liệu', 'Giao {sl} tấm; LGC Bảng 1 có 4 dòng phôi (mỗi độ dày 1 dòng)')

# TC07 BBGH sai mã
r = mk_rows('AP07', 10)
boctach(P('TC07', 'AnPhat-SaiMa', 1, 'BocTach'), r, 'AnPhat-SaiMa'); lgc(P('TC07', 'AnPhat-SaiMa', 2, 'LGC'), r, nl(), '2026-11-20', 'AP260007', 'NHOM1.2-DOT')
bad = [dict(r[0], ma='XX-99'), dict(r[1], ma='ZZ-01')]
bbgh(P('TC07', 'AnPhat-SaiMa', 3, 'BBGH_LOI-sai-ma'), [(x, x['sl']) for x in r[2:]] + [(x, x['sl']) for x in bad], nb(), '2026-11-22', 'AP260007', 'NHOM1.2-DOT', *KH['AP'])
GUIDE += [('TC07', 'TC07_AnPhat-SaiMa_1-BocTach.xls', 'QT0', 'Tải bình thường', '10 mã'),
          ('TC07', 'TC07_AnPhat-SaiMa_2-LGC.xls', 'QT2', 'Tải bình thường', 'Không dòng đỏ'),
          ('TC07', 'TC07_AnPhat-SaiMa_3-BBGH_LOI-sai-ma.xls', 'QT3', 'Đính kèm', 'MONG ĐỢI LỖI: 2 dòng đỏ (XX-99, ZZ-01) + chip "2 dòng mã tấm không có trong XNĐH"; vẫn ký được')]

# TC08 BBGH giao vượt
r = mk_rows('AP08', 10)
boctach(P('TC08', 'AnPhat-GiaoVuot', 1, 'BocTach'), r, 'AnPhat-GiaoVuot'); lgc(P('TC08', 'AnPhat-GiaoVuot', 2, 'LGC'), r, nl(), '2026-11-20', 'AP260008', 'NHOM1.2-DOT')
bbgh(P('TC08', 'AnPhat-GiaoVuot', 3, 'BBGH_LOI-giao-vuot'), [(x, x['sl'] + (5 if i < 2 else 0)) for i, x in enumerate(r)], nb(), '2026-11-22', 'AP260008', 'NHOM1.2-DOT', *KH['AP'])
GUIDE += [('TC08', 'TC08_AnPhat-GiaoVuot_1-BocTach.xls', 'QT0', 'Tải bình thường', '10 mã'),
          ('TC08', 'TC08_AnPhat-GiaoVuot_2-LGC.xls', 'QT2', 'Tải bình thường', ''),
          ('TC08', 'TC08_AnPhat-GiaoVuot_3-BBGH_LOI-giao-vuot.xls', 'QT3', 'Đính kèm', f'MONG ĐỢI LỖI: {r[0]["ma"]} và {r[1]["ma"]} giao dư 5 tấm/mã (chưa có cảnh báo – đang chờ làm)')]

# TC09 bóc tách lỗi
r = mk_rows('HL09', 8)
boctach(P('TC09', 'HoangLong-FileLoi', 1, 'BocTach_LOI-thieu-cot-SoLuong'), r, 'HoangLong-FileLoi', drop_sl=True)
r2 = mk_rows('HL09', 8); r2[5]['ma'] = r2[2]['ma']
boctach(P('TC09', 'HoangLong-FileLoi', 1, 'BocTach_LOI-trung-ma'), r2, 'HoangLong-FileLoi')
GUIDE += [('TC09', 'TC09_HoangLong-FileLoi_1-BocTach_LOI-thieu-cot-SoLuong.xls', 'QT0', 'Tải file bóc tách', 'MONG ĐỢI LỖI: báo "không phải file bóc tách: không thấy cột Số lượng"'),
          ('TC09', 'TC09_HoangLong-FileLoi_1-BocTach_LOI-trung-ma.xls', 'QT0', 'Tải file bóc tách', f'MONG ĐỢI: mã {r2[2]["ma"]} xuất hiện 2 dòng – xem app gộp hay báo trùng')]

# TC10 hai khách song song
for kk, pre in (('AP', 'AP10'), ('BM', 'BM10')):
    r = mk_rows(pre, 9)
    tag = 'AnPhat' if kk == 'AP' else 'BinhMinh'
    full('TC10', f'{tag}-SongSong', r, KH[kk], f'{kk}260010', 'NHOM1.2-DOT',
         'Khách ' + KH[kk][0] + ': {n} mã, {sl} tấm – thử lọc theo khách/dự án', 'Giao {sl} tấm')

# ---------- Hướng dẫn ----------
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Huong dan'
ws.append(['BỘ FILE TEST PMS – thứ tự tải: sắp xếp theo tên file (TCxx → bước 1 Bóc tách → 2 LGC → 3 BBGH)'])
ws.append(['Lưu ý: tên khách/dự án đều là dữ liệu TEST. Đặt tên dự án trong app bắt đầu bằng [TEST] để không gửi Zalo.'])
ws.append([])
ws.append(['Kịch bản', 'File', 'Bước', 'Thao tác', 'Kết quả mong đợi'])
for c in ws[4]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1F3A93')
ws['A1'].font = Font(bold=True, size=13)
for g in GUIDE:
    ws.append(list(g))
    if 'LỖI' in g[4]:
        for c in ws[ws.max_row]: c.fill = PatternFill('solid', fgColor='FDECEC')
for col, w in zip('ABCDE', (10, 58, 26, 44, 70)): ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=5):
    for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
ws.freeze_panes = 'A5'
wb.save(os.path.join(OUT, '00_HUONG-DAN.xlsx'))
print(len(GUIDE), 'dòng hướng dẫn;', len([f for f in os.listdir(OUT) if f.endswith('.xls')]), 'file .xls')
