import { useState } from 'react';
import { Icon } from './Icon';

/** Sơ đồ quy trình tương tác QT0 → QT3 (bản gộp QT2, 4 điều kiện ĐK1–ĐK4).
 *  Bấm một quy trình để xem các bước, bấm một bước để xem ai làm, nhập gì, ai duyệt, xong thì sang đâu, làm ở đâu trong app. */
type Step = { k: string; t: string; who: string; form?: string; input: string; approve?: string; next: string; where: string; gate?: string };
type Proc = { k: string; t: string; sub: string; steps: Step[]; exit: string };

const PROCS: Proc[] = [
  { k: 'QT0', t: 'QT0', sub: 'Tiếp nhận & bóc tách', exit: 'ĐK1: F1 đạt → QT1', steps: [
    { k: 'B1', t: 'Tiếp nhận yêu cầu', who: 'Kinh doanh / CSKH', form: 'F0', input: 'Khách hàng KH1 → KH2, dự án, kênh, người liên hệ, bản vẽ, ngày cần báo giá / giao, người bóc tách', next: 'Bóc tách F1', where: 'Tạo đơn → thẻ F0' },
    { k: 'B2', t: 'Bóc tách kỹ thuật', who: 'Kỹ thuật bóc tách', form: 'F1', input: 'Mỗi dòng: mã TP, vật liệu, dày, dài, rộng, số tấm (m², kg tự tính). Nhập tay, dán từ Excel hoặc tải file Excel theo mẫu', next: 'Gửi kiểm tra F1', where: 'Thẻ F1 · Bắt đầu bóc tách → Gửi kiểm tra F1' },
    { k: 'B3', t: 'Kiểm tra F1', who: 'Kiểm tra F1', form: 'F1', input: 'Đạt / Không đạt; không đạt phải ghi nội dung cần bổ sung', next: 'Đạt → QT1. Không đạt → về B2', where: 'Thẻ F1 · Đạt / Không đạt', gate: 'ĐK1' }] },
  { k: 'QT1', t: 'QT1', sub: 'Xác nhận đơn hàng', exit: 'ĐK2: XNĐH đã ký → QT2', steps: [
    { k: 'B1', t: 'Lập XNĐH', who: 'Admin CNC / Kinh doanh', form: 'F2', input: 'Đơn giá (đ/kg) từng dòng, VAT, điều kiện giao / thanh toán', next: 'Gửi duyệt XNĐH', where: 'Thẻ F2 · Lưu đơn giá → Gửi duyệt XNĐH' },
    { k: 'B2', t: 'Duyệt XNĐH', who: 'Người duyệt', form: 'F2', input: 'Duyệt / Từ chối (từ chối ghi lý do)', approve: 'Dung · có tin Zalo', next: 'Duyệt → B3. Từ chối → về B1', where: 'Việc của tôi → Chờ tôi duyệt' },
    { k: 'B3', t: 'Khách xác nhận', who: 'Admin CNC', form: 'F2', input: 'Ghi KH1 (IPC) rồi KH2 (Hanwa) xác nhận, tải PDF XNĐH đã ký', next: 'Hoàn tất QT1 → QT2', where: 'Thẻ F2 · Ghi KH1 / KH2 → Tải PDF → Hoàn tất QT1', gate: 'ĐK2' }] },
  { k: 'QT2', t: 'QT2', sub: 'Lệnh GC & bàn giao NVL', exit: 'ĐK4: QC thành phẩm đạt → QT3', steps: [
    { k: 'B1', t: 'Lập LGC + dự toán NVL', who: 'Admin CNC · Kế hoạch', form: 'F5 + F3', input: 'LGC: dự phòng %, ngày bắt đầu / hoàn thành, xưởng nhận. Dự toán: hao hụt % → cần dùng − tồn kho = cần mua', next: 'Gửi duyệt LGC + dự toán NVL', where: 'Thẻ QT2 · Tính LGC → Lưu ngày → Tính dự toán' },
    { k: 'B2', t: 'Duyệt LGC 4 cấp', who: 'Người duyệt theo chuỗi', form: 'F5 + F3', input: 'Duyệt / Từ chối từng cấp', approve: 'Anh Mai → Dung (duyệt cả dự toán NVL) → Thủy → Anh Kiên · mỗi cấp 1 tin Zalo', next: 'Cần mua → B3. Tồn kho đủ → B5. Từ chối → về B1', where: 'Thẻ QT2 · khối B2' },
    { k: 'B3', t: 'Mua NVL (PO)', who: 'Mua hàng', form: 'PO', input: 'Số PO, nhà cung cấp, ngày hàng về, đơn giá', approve: 'Dung · có tin Zalo', next: 'B4', where: 'Thẻ QT2 · khối B3 · Lưu PO → Gửi duyệt PO' },
    { k: 'B4', t: 'Nhập kho & QC NVL', who: 'Kho NVL + QC', form: 'F4', input: 'Số thực nhận (điền sẵn theo PO), kg lỗi; lệch trong 0,5% / 5 kg coi là khớp', next: 'Đạt → ĐK3. Thiếu / lỗi → F7, về B3 mua bổ sung', where: 'Thẻ QT2 · khối B4 · QC đạt, nhập kho', gate: 'ĐK3' },
    { k: 'B5', t: 'Bàn giao NVL', who: 'Kho IPC → Xưởng', form: 'F6', input: 'Số thực giao (điền sẵn theo LGC), bên giao, bên nhận, biên bản đã ký', next: 'B6. Chênh lệch vượt mức → F7', where: 'Thẻ QT2 · khối B5 · Chốt bàn giao' },
    { k: 'B6', t: 'Gia công & QC thành phẩm', who: 'Xưởng · Kho/QC', input: 'Đạt / Không đạt, số pallet', next: 'Đạt → QT3. Không đạt → F7', where: 'Thẻ QT2 · khối B6', gate: 'ĐK4' }] },
  { k: 'QT3', t: 'QT3', sub: 'Giao thành phẩm', exit: 'Hoàn tất đơn', steps: [
    { k: 'B1', t: 'Nhập kho thành phẩm', who: 'Kho thành phẩm', input: 'Lấy từ QC thành phẩm QT2-B6 (số pallet)', next: 'B2', where: 'Thẻ QT3 Giao hàng · B1' },
    { k: 'B2', t: 'Thông báo giao + packing list', who: 'Admin CNC', form: 'F8', input: 'Lập packing list theo pallet (tự chia đều, sửa được), ngày giao dự kiến, địa điểm', next: 'B3', where: 'Thẻ QT3 · Lập packing list → Thông báo giao hàng' },
    { k: 'B3', t: 'Lệnh giao hàng 2 chặng', who: 'Admin CNC', form: 'F9', input: 'Mã lệnh PMKT, xe, tài xế, ngày giờ giao', approve: 'Chặng 1 CNC → IPC: Dung → Chị Trang; tự gửi chặng 2 IPC → Hanwa: Nhung → Anh Kiên · tin Zalo từng cấp', next: 'Duyệt đủ 2 chặng → B4. Từ chối → sửa lệnh', where: 'Thẻ QT3 · Gửi duyệt LGH 2 chặng' },
    { k: 'B4', t: 'Giao hàng, gửi ảnh', who: 'Kho', form: 'F9', input: 'Ảnh giao hàng (chụp bằng điện thoại)', next: 'B5', where: 'Thẻ QT3 · Tải ảnh → Đã giao xong' },
    { k: 'B5', t: 'Ký & lưu BBGH', who: 'Kho · Admin CNC', form: 'F9', input: 'Bộ LGH / BBGH đã ký. Phải đóng hết phiếu F7 trước', next: 'Hoàn tất đơn', where: 'Thẻ QT3 · Tải BBGH → Hoàn tất đơn' }] }
];

export default function ProcessGuide() {
  const [pk, setPk] = useState('QT0'); const [sk, setSk] = useState('B1');
  const P = PROCS.find((p) => p.k === pk)!; const S = P.steps.find((s) => s.k === sk) ?? P.steps[0];
  const pick = (k: string) => { setPk(k); setSk('B1'); };
  return (
    <div className="pg">
      <div className="pg-procs" role="tablist" aria-label="Chọn quy trình">
        {PROCS.map((p, i) => (
          <div key={p.k} className="pg-proc-wrap">
            {i > 0 && <span className="pg-gate" aria-hidden="true">{['ĐK1', 'ĐK2', 'ĐK4'][i - 1]}<Icon name="arrow" size={14} /></span>}
            <button role="tab" aria-selected={pk === p.k} className={'pg-proc' + (pk === p.k ? ' on' : '')} onClick={() => pick(p.k)}>
              <b>{p.t}</b><span>{p.sub}</span><span className="pg-n">{p.steps.length} bước</span>
            </button>
          </div>))}
      </div>

      <ol className="pg-steps" aria-label={'Các bước ' + P.t}>
        {P.steps.map((s) => (
          <li key={s.k}>
            <button className={'pg-step' + (S.k === s.k ? ' on' : '')} aria-pressed={S.k === s.k} onClick={() => setSk(s.k)}>
              <span className="pg-dot">{s.k}</span>
              <span className="pg-st">{s.t}{s.form && <small>{s.form}</small>}</span>
              {s.approve && <span className="chip wait pg-tag">Duyệt</span>}
            </button>
            {s.gate && <span className="pg-gatebar"><Icon name="alert" size={13} />{s.gate}</span>}
          </li>))}
      </ol>

      <div className="pg-detail" aria-live="polite">
        <h3 style={{ margin: 0 }}>{P.t} · {S.k} {S.t}</h3>
        <dl>
          <dt>Ai làm</dt><dd>{S.who}</dd>
          {S.form && <><dt>Phiếu</dt><dd>{S.form}</dd></>}
          <dt>Nhập gì</dt><dd>{S.input}</dd>
          {S.approve && <><dt>Ai duyệt</dt><dd>{S.approve}</dd></>}
          <dt>Xong thì</dt><dd>{S.next}</dd>
          <dt>Làm ở đâu</dt><dd>{S.where}</dd>
        </dl>
        <div className="small muted">Kết thúc {P.t}: <b>{P.exit}</b>. Thiếu, lỗi, chênh lệch hoặc QC không đạt ở bất kỳ bước nào → phiếu F7 (thẻ F7 Phát sinh).</div>
      </div>
    </div>);
}
