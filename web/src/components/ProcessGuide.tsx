import { useState } from 'react';
import { Icon } from './Icon';

/** Sơ đồ quy trình tương tác QT0 → QT3 theo swimlane 04/11/2026 (4 quy trình chạy riêng).
 *  Bấm một quy trình để xem các bước, bấm một bước để xem ai làm, nhập gì, ai duyệt, xong thì sang đâu, làm ở đâu trong app. */
type Step = { k: string; t: string; who: string; form?: string; input: string; approve?: string; next: string; where: string; gate?: string };
type Proc = { k: string; t: string; sub: string; steps: Step[]; exit: string; back: string };

const PROCS: Proc[] = [
  { k: 'QT0', t: 'QT0', sub: 'Bóc tách bản vẽ', exit: 'Danh sách tấm đã ký (đầu vào tuỳ chọn của QT1) hoặc Fail', back: 'Kiểm tra / duyệt trả về bóc tách. Duyệt từ chối (hao hụt lớn, vượt dự toán, không sản xuất được) = Fail; mở “lần bóc tách mới” nếu làm lại. Chỉ Phương Nam CNC làm.', steps: [
    { k: 'B1', t: 'Admin tiếp nhận', who: 'Admin (Viên / Phụng)', form: 'Form 1', input: 'Bản vẽ khách gửi qua email / Zalo, ngày nhận, kênh; ghi chú yêu cầu đặc biệt', next: 'Bóc tách kỹ thuật', where: 'Đơn → thẻ QT0 → Bắt đầu QT0 → tải bản vẽ → Chuyển bóc tách' },
    { k: 'B2', t: 'Bóc tách kỹ thuật', who: 'Kỹ thuật (anh Hậu)', form: 'Form 1', input: 'Vật liệu, hao hụt, đường hàn / chấn, m² đột, vấn đề kỹ thuật; bắt buộc đính kèm Excel bóc tách chi tiết', next: 'Tạo danh sách tấm', where: 'Thẻ QT0 · tải “Excel bóc tách chi tiết” → Xong bóc tách', gate: 'Có Excel?' },
    { k: 'B3', t: 'Tạo danh sách tấm', who: 'Admin', form: 'Form 1', input: 'Mã tấm, dày, dài, rộng, số tấm, m² trải phẳng/tấm (tổng m², kg tự tính). Tải Excel theo mẫu hoặc dán từ Excel', next: 'Kiểm tra', where: 'Thẻ QT0 · bảng Danh sách tấm → Gửi kiểm tra' },
    { k: 'B4', t: 'Kiểm tra', who: 'Kiểm tra (anh Mai Anh)', input: 'Đọc bản vẽ + ghi chú, thêm lưu ý (tấm quá rộng cần tăng cứng, góc chưa phù hợp, khổ vượt khả năng máy…)', next: 'Đạt → Duyệt. Chưa đạt → trả về bóc tách', where: 'Thẻ QT0 · Ghi chú → Đạt, gửi duyệt / Trả về' },
    { k: 'B5', t: 'Duyệt', who: 'Duyệt (Dung)', input: 'Sẵn sàng sản xuất?', approve: 'Ký điện tử · có tin Zalo', next: 'Duyệt → DS tấm đã ký. Từ chối → Fail', where: 'Thẻ QT0 · Duyệt / Từ chối · Fail', gate: 'Sẵn sàng?' }] },
  { k: 'QT1', t: 'QT1', sub: 'Xác nhận đơn hàng', exit: '3 bộ XNĐH (PN, IPC, Hanwha) + bản khách ký tay', back: 'Kiểm tra / duyệt của mỗi công ty trả về bước Lập của chính công ty đó.', steps: [
    { k: 'B1', t: 'Phương Nam lập + đơn giá', who: 'PN · Lập', form: 'Form 2', input: 'Lấy DS tấm từ QT0 (tắt được khi tách đơn), nhập đơn giá; thành tiền = m² × đơn giá, cộng VAT', next: 'Kiểm tra → Duyệt PN', where: 'Thẻ QT1 → Mở XNĐH → Gửi kiểm tra' },
    { k: 'B2', t: 'PN kiểm tra → duyệt', who: 'PN · Kiểm tra, Duyệt', approve: 'Ký điện tử', input: 'Xem lại giá, điều kiện', next: 'Tự chép DS tấm sang IPC', where: 'Thẻ QT1 · bản Phương Nam CNC' },
    { k: 'B3', t: 'IPC lập + giá IPC', who: 'IPC · Lập', form: 'Form 2', input: 'DS tấm, dự án, mã đơn chép nguyên; đổi đơn giá, số XNĐH', next: 'IPC kiểm tra → duyệt', where: 'Thẻ QT1 · bản IPC' },
    { k: 'B4', t: 'Hanwha lập + giá Hanwha', who: 'Hanwha · Lập → Kiểm tra → Duyệt', form: 'Form 2', input: 'Chép từ IPC; đổi giá', approve: 'Ký điện tử', next: 'Khách ký', where: 'Thẻ QT1 · bản Hanwha' },
    { k: 'B5', t: 'Khách ký xác nhận', who: 'Khách hàng (ký tay, đóng dấu)', input: 'Mỗi công ty in bộ của mình; tải bản đã ký lên', next: 'Hoàn tất XNĐH', where: 'Thẻ QT1 · In / PDF → Tải bản đã ký' }] },
  { k: 'QT2', t: 'QT2', sub: 'Lệnh gia công & bàn giao vật liệu', exit: 'Biên bản bàn giao / nhận vật liệu đã ký tay', back: 'Chưa đủ 5 điều kiện thì chờ. Kiểm tra / duyệt trả về bước Lập của công ty đó. Không có QC, nhập kho, hoàn trả.', steps: [
    { k: 'B1', t: 'Đủ 5 điều kiện?', who: 'Người tạo lệnh (PN)', input: 'Bóc tách đã duyệt · đủ vật tư · đủ công cụ · vấn đề kỹ thuật đã xử lý · đã công bố tiêu chuẩn QC', next: 'Đủ 5/5 → tạo lệnh. Chưa đủ → chờ', where: 'Thẻ QT2 → Mở lệnh gia công mới (tích 5 ô)', gate: '5/5' },
    { k: 'B2', t: 'PN tạo lệnh → duyệt', who: 'PN · Lập, Kiểm tra, Duyệt', form: 'Form 3', input: 'Dán 2 bảng nguyên liệu / thành phẩm từ Excel phần mềm SX; số lệnh, số hợp đồng PN; hao hụt tự tính (định mức ~15%)', approve: 'Ký điện tử', next: 'Chép sang IPC', where: 'Thẻ QT2 · bản Phương Nam CNC' },
    { k: 'B3', t: 'IPC tạo → duyệt', who: 'IPC', form: 'Form 3', input: 'Dùng lại 2 bảng + checklist; số lệnh, số HĐ của IPC', approve: 'Ký điện tử', next: 'Chép sang Hanwha', where: 'Thẻ QT2 · bản IPC' },
    { k: 'B4', t: 'Hanwha tạo → duyệt', who: 'Hanwha', form: 'Form 3', input: 'Số lệnh, số HĐ của Hanwha', approve: 'Ký điện tử', next: 'Ký bàn giao', where: 'Thẻ QT2 · bản Hanwha' },
    { k: 'B5', t: 'Ký bàn giao / nhận vật liệu', who: 'Kho / xưởng (ký tay)', input: 'In form, ký 2 ô: người bàn giao, người nhận vật liệu; tải bản ký', next: 'Hoàn tất lệnh', where: 'Thẻ QT2 · Tải bản đã ký' }] },
  { k: 'QT3', t: 'QT3', sub: 'Xuất kho kiêm biên bản giao hàng', exit: 'Khách ký nhận; lặp mỗi đợt đến khi giao đủ lệnh', back: 'Kiểm tra / duyệt trả về bước Lập của công ty đó. Tổng các đợt khớp lệnh (dung sai ~5%) do phần mềm SX kiểm.', steps: [
    { k: 'B1', t: 'Excel đợt giao', who: 'Phần mềm SX (ngoài app)', input: 'Phiếu tạo pallet → gom thành một đợt giao → xuất Excel danh sách thành phẩm', next: 'PN tạo phiếu', where: 'Phần mềm quản lý sản xuất' },
    { k: 'B2', t: 'PN tạo phiếu → duyệt', who: 'PN · Lập, Kiểm tra, Duyệt', form: 'Form 4', input: 'Dán danh sách thành phẩm của đợt (mã pallet, mã tấm, số tấm, m², kg); số phiếu, ngày giao, xe, tài xế', approve: 'Ký điện tử', next: 'Chép sang IPC', where: 'Thẻ QT3 → Mở đợt giao mới' },
    { k: 'B3', t: 'IPC → Hanwha', who: 'IPC, Hanwha', form: 'Form 4', input: 'Chép từ bên trước; số phiếu riêng', approve: 'Ký điện tử', next: 'Khách ký nhận', where: 'Thẻ QT3 · bản IPC / Hanwha' },
    { k: 'B4', t: 'Khách ký nhận', who: 'Khách hàng (ký tay)', input: 'In phiếu, khách ký nhận; tải bản ký', next: 'Hoàn tất đợt; mở đợt tiếp theo nếu còn', where: 'Thẻ QT3 · Tải bản đã ký' }] }
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
            {i > 0 && <span className="pg-gate" aria-hidden="true">{['riêng', 'riêng', 'riêng'][i - 1]}<Icon name="arrow" size={14} /></span>}
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
        <div className="small muted">Kết thúc {P.t}: <b>{P.exit}</b>. {P.back}</div>
      </div>
    </div>);
}
