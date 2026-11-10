import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Sheet } from '../components/Sheet';
import { sb, type Order } from '../lib/supabase';
import { PROC_NAME, stepOf, type Batch, type Doc, type Proc } from '../lib/proc';
import { Icon } from '../components/Icon';
import { QtTag } from '../components/QtTag';
import { useWho } from '../lib/people';

/** Sơ đồ swimlane tương tác (theo file swimlane 04/11/2026).
 *  Máy tính: làn ngang, các bước xếp theo thời gian, mũi tên nối. Điện thoại: dòng thời gian dọc, mỗi bước ghi làn.
 *  Bấm một bước: xem ai làm, làm gì, điều kiện, ở đâu trong app + các hồ sơ đang ở bước đó. */
type Kind = 'start' | 'step' | 'cond' | 'end' | 'fail';
type S = { id: string; lane: number; col: number; t: string; kind: Kind; keys?: string[]; who: string; what: string; where?: string };
type E = { a: string; b: string; l?: string; dash?: boolean };
type P = { lanes: string[]; steps: S[]; edges: E[]; note: string };
const co = (c: string, n: number) => n; // giữ chỗ cột cho dễ đọc
const D: Record<Proc, P> = {
  QT0: { note: 'Chỉ Phương Nam CNC làm. Có thể phải làm 2–3 lần mới đạt dự toán và yêu cầu kỹ thuật.',
    lanes: ['Khách hàng', 'Admin tiếp nhận', 'Bóc tách kỹ thuật', 'Kiểm tra', 'Duyệt'],
    steps: [
      { id: 's1', lane: 0, col: 0, t: 'Gửi bản vẽ', kind: 'start', who: 'Khách hàng', what: 'Gửi qua email hoặc Zalo. Có khách gửi kèm danh sách tấm, có khách chỉ có bản vẽ.' },
      { id: 's2', lane: 1, col: 1, t: 'Tiếp nhận, đưa lên', kind: 'step', keys: ['tiep_nhan'], who: 'Admin tiếp nhận', what: 'Tải bản vẽ và tài liệu lên; ghi chú yêu cầu đặc biệt của khách.', where: 'Đơn → QT0 → Bắt đầu QT0 → Tải bản vẽ → Chuyển bóc tách' },
      { id: 's3', lane: 2, col: 2, t: 'Bóc tách, lập DS tấm', kind: 'step', keys: ['boc_tach'], who: 'Kỹ thuật', what: 'Mã tấm, m² từng tấm, tổng m². Vật liệu, hao hụt, đường hàn, đường chấn, m² đột. Nêu vấn đề kỹ thuật vào ghi chú.', where: 'QT0 · tải “Excel bóc tách chi tiết” · ghi chú' },
      { id: 'c1', lane: 2, col: 3, t: 'Có file Excel?', kind: 'cond', keys: ['boc_tach'], who: 'Kỹ thuật', what: 'Bắt buộc đính kèm Excel chi tiết; không có thì không chuyển bước được (app chặn).' },
      { id: 's5', lane: 1, col: 4, t: 'Tạo DS tấm trên form', kind: 'step', keys: ['tao_ds'], who: 'Admin', what: 'Tải hàng loạt từ Excel (theo mẫu) hoặc dán từ Excel. Chỉ ký trên bảng danh sách tấm.', where: 'QT0 · bảng Danh sách tấm → Tải Excel / Dán từ Excel → Gửi kiểm tra' },
      { id: 's6', lane: 3, col: 5, t: 'Kiểm tra bản vẽ + ghi chú', kind: 'step', keys: ['kiem_tra'], who: 'Kiểm tra', what: 'Đọc bản vẽ và ghi chú kỹ thuật; thêm lưu ý: tấm quá rộng cần tăng cứng, góc chưa phù hợp, khổ vượt khả năng máy…', where: 'QT0 · Ghi chú → Đạt, gửi duyệt / Trả về' },
      { id: 'c2', lane: 4, col: 6, t: 'Sẵn sàng chạy?', kind: 'cond', keys: ['duyet'], who: 'Duyệt', what: 'Kết luận đơn có sẵn sàng sản xuất. Từ chối khi hao hụt lớn, vượt dự toán, không sản xuất được.', where: 'QT0 · Duyệt / Từ chối · Fail' },
      { id: 'ok', lane: 1, col: 7, t: 'DS tấm đã ký → QT1', kind: 'end', keys: ['hoan_tat'], who: 'Admin', what: 'Là đầu vào (tuỳ chọn) của Xác nhận đơn hàng.' },
      { id: 'x', lane: 4, col: 7, t: 'Fail · mở lại', kind: 'fail', keys: ['fail'], who: 'Duyệt', what: 'Quy trình kết thúc; làm lại từ đầu bằng “lần bóc tách mới” nếu cần.' }],
    edges: [{ a: 's1', b: 's2' }, { a: 's2', b: 's3' }, { a: 's3', b: 'c1' }, { a: 'c1', b: 's3', l: 'Không', dash: true }, { a: 'c1', b: 's5', l: 'Có' },
      { a: 's5', b: 's6' }, { a: 's6', b: 'c2' }, { a: 'c2', b: 'ok', l: 'Duyệt' }, { a: 'c2', b: 'x', l: 'Từ chối' }] },
  QT1: { note: 'Ba công ty lập form lần lượt. Danh sách tấm chép nguyên; mỗi bên chỉ đổi logo, tiêu đề, đơn giá. Kết quả 3 bộ hồ sơ.',
    lanes: ['Phương Nam CNC', 'IPC', 'Hanwa', 'Khách hàng'],
    steps: [
      { id: 'in', lane: 0, col: 0, t: 'Nhận DS tấm', kind: 'start', who: 'Phương Nam CNC', what: 'Kéo từ QT0 (tuỳ chọn, tắt được). Tắt khi phải tách đơn: đơn quá lớn hoặc tấm khác giá (cong/thẳng, hàn/không hàn). 80–90% đơn đồng giá.', where: 'QT1 → Mở XNĐH mới → tick “Lấy DS tấm từ QT0”' },
      { id: 'p1', lane: 0, col: 1, t: 'Lập + nhập đơn giá', kind: 'step', keys: ['PN.lap'], who: 'PN · Lập', what: 'Nhập đơn giá; thành tiền = m² từng tấm × đơn giá, cộng VAT ra tổng.', where: 'QT1 · bản Phương Nam CNC → Gửi kiểm tra' },
      { id: 'p2', lane: 0, col: 2, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['PN.kiem_tra', 'PN.duyet'], who: 'PN · Kiểm tra, Duyệt', what: 'Ký điện tử; duyệt xong app tự chép DS tấm sang IPC.' },
      { id: 'i1', lane: 1, col: 3, t: 'Lập + giá IPC', kind: 'step', keys: ['IPC.lap'], who: 'IPC · Lập', what: 'DS tấm, dự án, mã đơn chép nguyên; đổi số XNĐH, đơn giá.' },
      { id: 'i2', lane: 1, col: 4, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['IPC.kiem_tra', 'IPC.duyet'], who: 'IPC · Kiểm tra, Duyệt', what: 'Ký điện tử; duyệt xong chép sang Hanwa.' },
      { id: 'h1', lane: 2, col: 5, t: 'Lập + giá Hanwa', kind: 'step', keys: ['HW.lap'], who: 'Hanwa · Lập', what: 'Chép nguyên từ IPC; đổi đơn giá.' },
      { id: 'h2', lane: 2, col: 6, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['HW.kiem_tra', 'HW.duyet'], who: 'Hanwa · Kiểm tra, Duyệt', what: 'Ký điện tử.' },
      { id: 'k', lane: 3, col: 7, t: 'In ra, khách ký', kind: 'end', keys: ['ky'], who: 'Khách hàng (ký tay, đóng dấu)', what: 'Mỗi công ty tự in bộ của mình; khách ký vào ô trống; tải bản ký lên app.', where: 'QT1 · In / PDF → Tải bản đã ký' }],
    edges: [{ a: 'in', b: 'p1' }, { a: 'p1', b: 'p2' }, { a: 'p2', b: 'i1', l: 'chép DS tấm' }, { a: 'i1', b: 'i2' }, { a: 'i2', b: 'h1', l: 'chép DS tấm' }, { a: 'h1', b: 'h2' }, { a: 'h2', b: 'k' },
      { a: 'p2', b: 'k', dash: true }, { a: 'i2', b: 'k', dash: true }] },
  QT2: { note: 'Không lấy số từ QT1. Đầu vào là lệnh gia công từ phần mềm sản xuất. Chỉ một bên gia công nhưng cả 3 bên cần hồ sơ cho thuế, kế toán.',
    lanes: ['Phần mềm QL sản xuất', 'Phương Nam CNC', 'IPC', 'Hanwa', 'Kho / xưởng'],
    steps: [
      { id: 'pm', lane: 0, col: 0, t: 'Lệnh gia công (Excel)', kind: 'start', who: 'Phần mềm SX (ngoài app)', what: 'Một đơn có thể chia nhiều lệnh. Ví dụ đơn 300 tấm nhưng chỉ đủ vật tư chạy 250.' },
      { id: 'w', lane: 1, col: 1, t: 'Đủ 5 điều kiện?', kind: 'cond', who: 'Người tạo lệnh (PN)', what: '1 Bóc tách đã duyệt · 2 Đủ vật tư · 3 Đủ công cụ · 4 Vấn đề kỹ thuật đã xử lý · 5 Đã công bố tiêu chuẩn QC. Tích đủ 5 mới mở được lệnh.', where: 'QT2 → Mở lệnh gia công mới' },
      { id: 'p1', lane: 1, col: 2, t: 'Tạo lệnh', kind: 'step', keys: ['PN.lap'], who: 'PN · Lập', what: 'Dán 2 bảng nguyên liệu / thành phẩm từ phần mềm; số lệnh, số hợp đồng PN; hao hụt tự tính (~15%).', where: 'QT2 · bản Phương Nam CNC' },
      { id: 'p2', lane: 1, col: 3, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['PN.kiem_tra', 'PN.duyet'], who: 'PN · Kiểm tra, Duyệt', what: 'Ký điện tử; duyệt xong chép sang IPC.' },
      { id: 'i1', lane: 2, col: 4, t: 'Tạo lệnh', kind: 'step', keys: ['IPC.lap'], who: 'IPC · Lập', what: 'Dùng lại 2 bảng và checklist; nhập số lệnh, số hợp đồng IPC.' },
      { id: 'i2', lane: 2, col: 5, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['IPC.kiem_tra', 'IPC.duyet'], who: 'IPC', what: 'Ký điện tử.' },
      { id: 'h1', lane: 3, col: 6, t: 'Tạo lệnh', kind: 'step', keys: ['HW.lap'], who: 'Hanwa · Lập', what: 'Số lệnh, số hợp đồng Hanwa.' },
      { id: 'h2', lane: 3, col: 7, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['HW.kiem_tra', 'HW.duyet'], who: 'Hanwa', what: 'Ký điện tử.' },
      { id: 'k', lane: 4, col: 8, t: 'Ký bàn giao / nhận vật liệu', kind: 'end', keys: ['ky'], who: 'Kho / xưởng (ký tay)', what: 'In form, 2 ô ký tay: người bàn giao, người nhận vật liệu. Không có QC, nhập kho, hoàn trả.', where: 'QT2 · Tải bản đã ký' }],
    edges: [{ a: 'pm', b: 'w' }, { a: 'w', b: 'pm', l: 'Chưa đủ · chờ', dash: true }, { a: 'w', b: 'p1', l: 'Đủ 5/5' }, { a: 'p1', b: 'p2' }, { a: 'p2', b: 'i1', l: 'chép' },
      { a: 'i1', b: 'i2' }, { a: 'i2', b: 'h1', l: 'chép' }, { a: 'h1', b: 'h2' }, { a: 'h2', b: 'k' }] },
  QT3: { note: 'Thành phẩm ra dần, giao nhiều đợt. Mỗi đợt một bộ phiếu qua 3 công ty. Tổng các đợt khớp lệnh (dung sai ~5%) do phần mềm SX kiểm.',
    lanes: ['Phần mềm QL sản xuất', 'Phương Nam CNC', 'IPC', 'Hanwa', 'Khách hàng'],
    steps: [
      { id: 'pl', lane: 0, col: 0, t: 'Phiếu tạo pallet', kind: 'start', who: 'Phần mềm SX', what: 'Quét mã tấm thành phẩm. Ví dụ pallet 1 có 20 tấm, pallet 2 có 30 tấm.' },
      { id: 'x', lane: 0, col: 1, t: 'Excel đợt giao', kind: 'step', who: 'Phần mềm SX', what: 'Gom pallet thành một đợt giao (ví dụ 50 tấm); xuất Excel danh sách thành phẩm.' },
      { id: 'p1', lane: 1, col: 2, t: 'Tạo phiếu', kind: 'step', keys: ['PN.lap'], who: 'PN · Lập', what: 'Dán danh sách thành phẩm của đợt; số phiếu, ngày giao, xe, tài xế.', where: 'QT3 → Mở đợt giao mới' },
      { id: 'p2', lane: 1, col: 3, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['PN.kiem_tra', 'PN.duyet'], who: 'PN', what: 'Ký điện tử.' },
      { id: 'i1', lane: 2, col: 4, t: 'Tạo phiếu', kind: 'step', keys: ['IPC.lap'], who: 'IPC', what: 'Chép từ Phương Nam; số phiếu riêng.' },
      { id: 'i2', lane: 2, col: 5, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['IPC.kiem_tra', 'IPC.duyet'], who: 'IPC', what: 'Ký điện tử.' },
      { id: 'h1', lane: 3, col: 6, t: 'Tạo phiếu', kind: 'step', keys: ['HW.lap'], who: 'Hanwa', what: 'Chép từ IPC.' },
      { id: 'h2', lane: 3, col: 7, t: 'Kiểm tra → Duyệt', kind: 'step', keys: ['HW.kiem_tra', 'HW.duyet'], who: 'Hanwa', what: 'Ký điện tử.' },
      { id: 'k', lane: 4, col: 8, t: 'Khách ký nhận', kind: 'end', keys: ['ky'], who: 'Khách hàng (ký tay)', what: 'In phiếu, khách ký nhận; tải bản ký. Lặp lại cho đến khi giao đủ lệnh.', where: 'QT3 · Tải bản đã ký → Mở đợt giao mới' }],
    edges: [{ a: 'pl', b: 'x' }, { a: 'x', b: 'p1' }, { a: 'p1', b: 'p2' }, { a: 'p2', b: 'i1' }, { a: 'i1', b: 'i2' }, { a: 'i2', b: 'h1' }, { a: 'h1', b: 'h2' }, { a: 'h2', b: 'k' },
      { a: 'k', b: 'pl', l: 'đợt giao tiếp theo', dash: true }] }
};
void co;
const PROCS: Proc[] = ['QT0', 'QT1', 'QT2', 'QT3'];
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
const KIND: Record<Kind, string> = { start: 'Bắt đầu', step: 'Bước làm', cond: 'Điều kiện', end: 'Kết quả', fail: 'Dừng (Fail)' };

export default function FlowMap() {
  const [sp, setSp] = useSearchParams(); const one = sp.get('don') ?? '';
  const all = sp.get('qt') === 'TQ' || (!sp.get('qt') && !one);
  const proc = (PROCS.includes(sp.get('qt') as Proc) ? sp.get('qt') : 'QT0') as Proc;
  const setProc = (p: Proc) => { const n = new URLSearchParams(sp); n.set('qt', p); setSp(n); setSel(''); };
  const [orders, setOrders] = useState<Order[]>([]); const [bs, setBs] = useState<Batch[]>([]); const [ds, setDs] = useState<Doc[]>([]);
  const [q, setQ] = useState(''); const [sel, setSel] = useState(''); const W = useWho();
  useEffect(() => {
    sb.from('orders').select('*').neq('status', 'huy').order('created_at', { ascending: false }).then(({ data }) => setOrders((data as Order[]) ?? []));
    sb.from('batches').select('*').neq('status', 'huy').then(({ data }) => setBs((data as Batch[]) ?? []));
    sb.from('docs_v').select('id, batch_id, company, status, status_at').then(({ data }) => setDs((data as Doc[]) ?? []));
  }, []);
  // chọn một đơn → tự mở QT mà đơn đang chạy (thay vì giữ tab cũ nơi đơn chưa có hồ sơ)
  const jumped = useRef('');
  useEffect(() => { if (!one || !bs.length || jumped.current === one) return; jumped.current = one;
    const mine = bs.filter((b) => b.order_id === one); if (!mine.length) return;
    const live = mine.filter((b) => ['dang_lam', 'cho_ky'].includes(b.status)).map((b) => b.proc).sort();
    const target = (live[0] ?? mine.map((b) => b.proc).sort().pop()) as Proc;
    if (target && target !== sp.get('qt')) { const n = new URLSearchParams(sp); n.set('qt', target); setSp(n, { replace: true }); } }, [one, bs]); // eslint-disable-line react-hooks/exhaustive-deps
  const O = orders.find((o) => o.id === one);
  const P = D[proc];
  // hồ sơ đang ở từng khoá bước
  const at = useMemo(() => { const m: Record<string, Batch[]> = {};
    for (const b of bs.filter((x) => x.proc === proc && (!one || x.order_id === one))) {
      const k = b.status === 'hoan_tat' ? 'hoan_tat' : b.status === 'fail' ? 'fail' : stepOf(b, ds).key; (m[k] ??= []).push(b); }
    return m; }, [bs, ds, proc, one]);
  const inStep = (s: S) => (s.keys ?? []).flatMap((k) => (k === 'hoan_tat' && !one ? [] : at[k] ?? []));
  // chế độ một đơn: bước đã qua / đang ở
  const order = P.steps.slice().sort((a, z) => a.col - z.col);
  const curIdx = one ? Math.max(-1, ...P.steps.filter((s) => inStep(s).length).map((s) => order.indexOf(s))) : -1;
  const allDone = one && bs.some((b) => b.order_id === one && b.proc === proc && b.status === 'hoan_tat') && !bs.some((b) => b.order_id === one && b.proc === proc && ['dang_lam', 'cho_ky'].includes(b.status));
  const st = (s: S) => !one ? '' : allDone ? (s.kind === 'fail' ? '' : 'done') : inStep(s).length && s.kind !== 'end' ? 'cur' : curIdx >= 0 && order.indexOf(s) < curIdx && s.kind !== 'fail' ? 'done' : '';
  const hits = q.trim() ? orders.filter((o) => norm(o.code + ' ' + o.project).includes(norm(q.trim()))).slice(0, 8) : [];
  const S0 = P.steps.find((s) => s.id === sel);
  const ncols = Math.max(...P.steps.map((s) => s.col)) + 1;

  // vẽ mũi tên theo vị trí thật của các ô (máy tính)
  const wrap = useRef<HTMLDivElement>(null); const [paths, setPaths] = useState<{ d: string; dash?: boolean; l?: string; lx: number; ly: number; on: boolean }[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const draw = () => {
      const R = el.getBoundingClientRect(); const r = (id: string) => { const n = el.querySelector<HTMLElement>(`[data-s="${id}"]`)?.getBoundingClientRect(); return n && { x: n.left - R.left, y: n.top - R.top, w: n.width, h: n.height }; };
      const out: typeof paths = [];
      for (const e of P.edges) {
        const a = r(e.a), b = r(e.b); if (!a || !b) continue; const on = sel === e.a || sel === e.b;
        if (b.x > a.x + a.w / 2) { // tiến: phải → trái
          const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2; const mx = e.dash ? x2 - 18 : Math.max(x1 + 10, Math.min(x2 - 10, (x1 + x2) / 2));
          out.push({ d: `M${x1} ${y1} H${mx} V${y2} H${x2 - 2}`, dash: e.dash, l: e.l, lx: mx + 4, ly: (y1 + y2) / 2 + (y1 === y2 ? -6 : 0), on });
        } else { // quay lại: vòng phía dưới
          const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y + b.h; const yy = Math.max(y1, y2) + 18;
          out.push({ d: `M${x1} ${y1} V${yy} H${x2} V${y2 + 2}`, dash: e.dash, l: e.l, lx: (x1 + x2) / 2 - 30, ly: yy - 4, on });
        }
      }
      setPaths(out); setBox({ w: el.scrollWidth, h: el.scrollHeight });
    };
    draw(); const ro = new ResizeObserver(draw); ro.observe(el); return () => ro.disconnect();
  }, [proc, sel, P, bs.length]);

  const Step = ({ s }: { s: S }) => { const n = inStep(s).length;
    return <button data-s={s.id} className={'sw-step ' + s.kind + ' ' + st(s) + (sel === s.id ? ' sel' : '')} onClick={() => setSel(sel === s.id ? '' : s.id)} aria-pressed={sel === s.id}>
      <span className="sw-t">{s.kind === 'cond' && <i className="sw-dia" aria-hidden="true" />}{s.t}</span>{n > 0 && <span className="sw-n">{one ? 'đang ở đây' : n}</span>}{st(s) === 'done' && <span className="sw-ok"><Icon name="check" size={12} /></span>}</button>; };

  return (
    <>
      <div className="page-head"><div><h1>Sơ đồ quy trình</h1><p className="muted">Swimlane 4 quy trình chạy riêng; hồ sơ gom theo mã đơn / dự án. Bấm một bước để xem chi tiết và các hồ sơ đang ở đó.</p></div>
        <Link className="btn sm hide-m" to="/bang"><Icon name="kanban" size={18} />Bảng Kanban</Link></div>
      <div className="fm2-search">
        <label className="search" style={{ maxWidth: 'none' }}><Icon name="search" size={18} />
          <input placeholder={O ? O.code + ' · ' + O.project : 'Xem một đơn: gõ mã đơn hoặc dự án'} value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {O && <button className="btn sm" onClick={() => { const n = new URLSearchParams(sp); n.delete('don'); setSp(n); }}><Icon name="x" size={16} />Tất cả đơn</button>}
        {hits.length > 0 && <ul className="fm2-hits">{hits.map((o) => <li key={o.id}><button onClick={() => { const n = new URLSearchParams(sp); n.set('don', o.id); setSp(n); setQ(''); }}><b>{o.code}</b> <span className="small muted">{o.project}</span></button></li>)}</ul>}
      </div>
      <div className="qt-group">
        <div className="qt-tabs" role="tablist"><button role="tab" aria-selected={all} className={all ? 'on' : ''} onClick={() => { const n = new URLSearchParams(sp); n.set('qt', 'TQ'); setSp(n); setSel(''); }}>
          <b>Tổng quan</b><span>Đơn kẹt ở đâu</span></button>{PROCS.map((p) => <button key={p} role="tab" aria-selected={!all && proc === p} className={(!all && proc === p ? 'on ' : '') + 'q' + p.slice(2)} onClick={() => setProc(p)}>
          <b>{p}</b><span>{PROC_NAME[p].replace(' & bàn giao vật liệu', '').replace('Xuất kho kiêm biên bản giao hàng', 'Giao hàng')}</span></button>)}</div>
        {all ? <Overview orders={orders} bs={bs} ds={ds} onOpen={(p) => setProc(p)} /> :
        <div className={'qt-panel sw ' + proc.toLowerCase()} key={proc}>
          <div className="sw-top"><span className="row" style={{ gap: 8 }}><QtTag qt={proc} /><b>{PROC_NAME[proc]}</b></span><span className="small muted">{P.note}</span>
            <span className="sw-legend small">{(['start', 'step', 'cond', 'end', 'fail'] as Kind[]).map((k) => <span key={k}><i className={'lg ' + k} />{KIND[k]}</span>)}</span>
            {O && <span className="small">Đang xem <b>{O.code}</b>: <i className="lg done" /> đã qua · <i className="lg cur" /> đang ở{!bs.some((b) => b.order_id === one && b.proc === proc) && <b style={{ color: 'var(--wait)' }}> · đơn chưa tới {proc}</b>}</span>}</div>

          {/* Máy tính: làn ngang */}
          <div className="sw-desk">
            <div className="sw-grid" ref={wrap} style={{ gridTemplateColumns: `112px repeat(${ncols}, minmax(88px, 1fr))`, gridTemplateRows: `repeat(${P.lanes.length}, minmax(92px, auto))` }}>
              {P.lanes.map((l, i) => <div key={l} className={'sw-lane' + (i % 2 ? ' alt' : '')} style={{ gridRow: i + 1, gridColumn: `1 / span ${ncols + 1}` }}><span>{l}</span></div>)}
              {P.steps.map((s) => <div key={s.id} className="sw-cell" style={{ gridRow: s.lane + 1, gridColumn: s.col + 2 }}><Step s={s} /></div>)}
              <svg className="sw-svg" width={box.w} height={box.h} aria-hidden="true">
                <defs><marker id="sw-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#8F8470" /></marker>
                  <marker id="sw-a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#5B8FCB" /></marker></defs>
                {paths.map((p, i) => <g key={i} className={p.on ? 'on' : ''}><path d={p.d} className={'sw-e' + (p.dash ? ' dash' : '')} markerEnd={`url(#${p.on ? 'sw-a2' : 'sw-a'})`} />
                  {p.l && <text x={p.lx} y={p.ly} className="sw-el">{p.l}</text>}</g>)}
              </svg>
            </div>
          </div>

          {/* Điện thoại: dòng thời gian dọc */}
          <ol className="sw-mob">
            {order.map((s) => { const outs = P.edges.filter((e) => e.a === s.id && (e.l || e.dash)); return (
              <li key={s.id} className={st(s)}>
                <span className={'sw-lane-chip l' + s.lane}>{P.lanes[s.lane]}</span>
                <Step s={s} />
                {outs.map((e) => <span key={e.b} className={'sw-branch' + (e.dash ? ' dash' : '')}>{e.dash ? '↺' : '→'} {e.l ?? ''} {e.l ? '·' : ''} {P.steps.find((x) => x.id === e.b)?.t}</span>)}
              </li>); })}
          </ol>
        </div>}
      </div>

      {S0 && createPortal(<div className="sw-sheet-bg" onClick={() => setSel('')}><aside className="sw-detail" role="dialog" aria-label={S0.t} onClick={(e) => e.stopPropagation()}>
        <div className="mv-head"><span className="row" style={{ gap: 8 }}><QtTag qt={proc} /><b style={{ fontSize: 17 }}>{S0.t}</b></span>
          <button className="btn sm icon-btn" onClick={() => setSel('')} aria-label="Đóng"><Icon name="x" size={18} /></button></div>
        <span className={'sw-kind ' + S0.kind}>{KIND[S0.kind]} · làn {P.lanes[S0.lane]}</span>
        <dl className="sw-dl"><dt>Ai làm</dt><dd>{S0.keys?.some((k) => k !== 'fail') ? W.who(proc, S0.keys.filter((k) => k !== 'fail')) : S0.who}</dd><dt>Làm gì</dt><dd>{S0.what}</dd>{S0.where && <><dt>Trong app</dt><dd>{S0.where}</dd></>}
          {P.edges.filter((e) => e.a === S0.id).length > 0 && <><dt>Đi tiếp</dt><dd>{P.edges.filter((e) => e.a === S0.id).map((e) => <div key={e.b}>{e.l ? <b>{e.l}: </b> : null}{P.steps.find((x) => x.id === e.b)?.t}{e.dash ? ' (quay vòng)' : ''}</div>)}</dd></>}</dl>
        {S0.keys && <div><b className="small">{one ? 'Đơn này' : 'Hồ sơ đang ở bước này'} ({inStep(S0).length})</b>
          <ul className="fm2-list">{inStep(S0).length === 0 ? <li className="muted small">Không có.</li> : inStep(S0).map((b) => { const o = orders.find((x) => x.id === b.order_id);
            return <li key={b.id}><Link to={'/don/' + b.order_id + '?tab=' + proc}><b>{o?.code}</b> · {b.title} <span className="small muted">{o?.project}</span><Icon name="arrow" size={16} /></Link></li>; })}</ul></div>}
      </aside></div>, document.body)}
    </>
  );
}

const STUCK = 2; // ngày nằm yên ở một bước thì coi là kẹt
const ago = (t?: string) => (t ? (Date.now() - new Date(t).getTime()) / 864e5 : 0);
/** Tổng quan: mọi giai đoạn của QT0→QT3 trên một màn, mỗi ô = số hồ sơ đang nằm ở đó, số bị kẹt, chờ lâu nhất */
function Overview({ orders, bs, ds, onOpen }: { orders: Order[]; bs: Batch[]; ds: Doc[]; onOpen: (p: Proc) => void }) {
  const [pick, setPick] = useState<{ p: Proc; s: S } | null>(null);
  const live = bs.filter((b) => b.status === 'dang_lam' || b.status === 'cho_ky');
  const since = (b: Batch) => { const l = ds.filter((d) => d.batch_id === b.id).map((d) => d.status_at).sort(); return l[l.length - 1] ?? b.created_at; };
  const stages = (p: Proc) => { const seen = new Set<string>();
    return D[p].steps.filter((s) => s.keys && !['end', 'fail', 'start'].includes(s.kind)).sort((a, z) => a.col - z.col)
      .filter((s) => { const k = s.keys!.join(); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((s) => { const items = live.filter((b) => b.proc === p && s.keys!.includes(stepOf(b, ds).key)).map((b) => ({ b, d: ago(since(b)) })).sort((a, z) => z.d - a.d);
        return { s, items, stuck: items.filter((x) => x.d >= STUCK).length }; }); };
  const rows = PROCS.map((p) => ({ p, st: stages(p) }));
  const max = Math.max(1, ...rows.flatMap((r) => r.st.map((x) => x.items.length)));
  const tot = live.length, stuck = rows.reduce((a, r) => a + r.st.reduce((x, y) => x + y.stuck, 0), 0);
  const worst = rows.flatMap((r) => r.st.map((x) => ({ p: r.p, ...x }))).sort((a, z) => z.stuck - a.stuck || z.items.length - a.items.length)[0];
  return (
    <div className="qt-panel ov">
      <div className="ov-kpi">
        <div><i className="ov-ic run"><Icon name="run" size={20} /></i><b>{tot}</b><span>Hồ sơ đang chạy</span></div>
        <div className={stuck ? 'bad' : ''}><i className={'ov-ic ' + (stuck ? 'stuck' : 'ok')}><Icon name={stuck ? 'hourglass' : 'check'} size={20} /></i><b>{stuck}</b><span>Kẹt ≥ {STUCK} ngày</span></div>
        <div><i className="ov-ic hot"><Icon name="flame" size={20} /></i><b>{worst && worst.items.length ? worst.p + ' · ' + worst.s.t : '—'}</b><span>Điểm nghẽn lớn nhất</span></div>
      </div>
      {rows.map(({ p, st }) => (
        <section key={p} className={'ov-row q' + p.slice(2)}>
          <button className="ov-head" onClick={() => onOpen(p)}><QtTag qt={p} /><span>{PROC_NAME[p]}</span><span className="small muted">{st.reduce((a, x) => a + x.items.length, 0)} hồ sơ</span><Icon name="arrow" size={16} /></button>
          <ol className="ov-stages">{st.map(({ s, items, stuck: k }) => { const n = items.length; const lane = D[p].lanes[s.lane];
            return <li key={s.id}><button className={'ov-cell' + (n ? '' : ' zero') + (k ? ' stuck' : '')} style={{ ['--h' as string]: n / max }} onClick={() => n && setPick({ p, s })} disabled={!n}
              aria-label={`${p} ${s.t}: ${n} hồ sơ, ${k} kẹt`}>
              <span className={'ov-ic ' + (k ? 'stuck' : n ? 'run' : 'idle')} aria-hidden="true"><Icon name={k ? 'hourglass' : n ? 'run' : 'pause'} size={20} /></span>
              <span className="ov-lane">{lane}</span><span className="ov-t">{s.t}</span>
              <span className="ov-n">{n}</span>
              <span className="ov-sub">{k ? <><Icon name="alert" size={12} />{k} kẹt · lâu nhất {Math.floor(items[0].d)} ngày</> : n ? 'đúng tiến độ' : 'trống'}</span>
              <i className="ov-bar" /></button></li>; })}</ol>
        </section>))}
      <p className="small muted">Kẹt = hồ sơ nằm yên ở một bước từ {STUCK} ngày trở lên. Bấm một ô để xem danh sách đơn.</p>
      {pick && createPortal(<Sheet onClose={() => setPick(null)} label={pick.s.t}
        head={<><QtTag qt={pick.p} /><b style={{ fontSize: 17 }}>{pick.s.t}</b></>} sub={pick.s.who + ' · ' + (stages(pick.p).find((x) => x.s.id === pick.s.id)?.items.length ?? 0) + ' hồ sơ'}>
        <ul className="sh-list">{stages(pick.p).find((x) => x.s.id === pick.s.id)?.items.map(({ b, d }) => { const o = orders.find((x) => x.id === b.order_id);
          return <li key={b.id}><Link to={'/don/' + b.order_id + '?tab=' + pick.p}>
            <span className="sh-main"><b>{o?.code}</b><span>{b.title}</span>{o?.project && <span className="small muted">{o.project}</span>}</span>
            <span className={'chip ' + (d >= STUCK ? 'bad' : 'idle')}>{d < 1 ? 'hôm nay' : Math.floor(d) + ' ngày'}</span><Icon name="arrow" size={18} /></Link></li>; })}</ul>
      </Sheet>, document.body)}
    </div>);
}

