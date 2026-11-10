/** Từ thông báo lỗi chặn → tìm đúng chỗ cần sửa trên màn hình, cuộn tới, nháy viền, đặt con trỏ */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const firstOf = (err: string, re: RegExp) => err.match(re)?.[1]?.split(/,\s*/)[0]?.trim();
const tblByTitle = (t: string) => [...document.querySelectorAll<HTMLElement>('.pp-tbl')].find((x) => norm(x.querySelector('.pp-th')?.textContent ?? '').includes(norm(t)));
const emptyTbl = () => [...document.querySelectorAll<HTMLElement>('.pp-tbl')].find((x) => /·\s*0 dòng/.test(x.querySelector('.pp-th')?.textContent ?? ''));
const tblByCol = (c: string) => [...document.querySelectorAll<HTMLElement>('.pp-tbl, .wf-formview .tbl-wrap, .wf-formview table')].find((x) => [...x.querySelectorAll('th')].some((th) => norm(th.textContent ?? '').startsWith(norm(c))));
const fieldByLabel = (l: string) => [...document.querySelectorAll<HTMLElement>('label.f, .wf-formview .f')].find((x) => norm(x.querySelector('span')?.textContent ?? x.textContent ?? '').startsWith(norm(l)));
const byText = (sel: string, t: string) => [...document.querySelectorAll<HTMLElement>(sel)].find((x) => norm(x.textContent ?? '').includes(norm(t)));

type Fix = { label: string; find: () => HTMLElement | null | undefined; check?: boolean };
export function fixOf(err: string): Fix | null {
  if (!err) return null;
  if (/checklist bắt buộc/i.test(err)) return { label: 'Xem mục còn thiếu', find: () => null, check: true };
  let x = firstOf(err, /Chưa tích:\s*(.+)$/i); if (x) { const v = x; return { label: 'Xem mục còn thiếu', find: () => byText('.wf-toggles', v) }; }
  x = firstOf(err, /Chưa tải file:\s*(.+)$/i); if (x) { const v = x; return { label: 'Đi tới chỗ tải file', find: () => byText('.wf-file', v) }; }
  x = firstOf(err, /(?:bắt buộc|Sai kiểu số):\s*(.+?)(?:\.\s|$)/i);
  if (x) { const v = x;
    if (/^Tệp:/i.test(v)) return { label: 'Đi tới chỗ tải file', find: () => document.querySelector<HTMLElement>('.pp-files') };
    const tb = v.match(/^Bảng\s+(.+?)\s*\(/i)?.[1]; if (tb) return { label: 'Đi tới bảng cần nhập', find: () => tblByTitle(tb) ?? emptyTbl() };
    const col = v.match(/^Cột\s+(.+)$/i)?.[1]; if (col) return { label: 'Đi tới cột cần nhập', find: () => tblByCol(col) };
    return { label: 'Đi tới ô cần nhập', find: () => fieldByLabel(v) ?? tblByCol(v) }; }
  if (/số lệnh/i.test(err)) return { label: 'Đi tới ô cần nhập', find: () => fieldByLabel('Số lệnh') };
  if (/đủ 2 bảng/i.test(err)) return { label: 'Đi tới bảng còn trống', find: () => emptyTbl() };
  if (/excel|đính kèm/i.test(err)) return { label: 'Đi tới chỗ tải file', find: () => document.querySelector<HTMLElement>('.pp-files') };
  if (/đơn giá/i.test(err)) return { label: 'Đi tới cột đơn giá', find: () => tblByCol('Đơn giá') ?? document.querySelector<HTMLElement>('.pp-tbl') };
  if (/danh sách|thành phẩm|nguyên liệu/i.test(err)) return { label: 'Đi tới bảng cần nhập', find: () => emptyTbl() ?? document.querySelector<HTMLElement>('.pp-tbl') };
  if (/ghi chú/i.test(err)) return { label: 'Đi tới ô ghi chú', find: () => fieldByLabel('Ghi chú') };
  return null;
}
export function goFix(err: string): boolean {
  const f = fixOf(err); if (!f) return false;
  if (f.check) { dispatchEvent(new Event('pms-goto-check')); return true; }
  const el = f.find(); if (!el) return false;
  const smooth = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  el.scrollIntoView({ behavior: smooth, block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2400);
  (el.querySelector('input:not([type=file]):not([disabled]),select,textarea') as HTMLElement | null)?.focus({ preventScroll: true });
  return true;
}
