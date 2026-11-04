/** Mẫu in Excel: điền biến {ten}, lặp dòng {#bang} … {bang.cot}, giữ định dạng / ô gộp / logo / công thức */
import type ExcelJS from 'exceljs';
import type { Order, Profile } from './supabase';
import { HEADER, PROC_TABLES, ROLE_OF, TABLES, numIn, sumOf, type Batch, type Doc, type Proc, type Row } from './proc';

export type TplData = { vars: Record<string, string | number>; tables: Record<string, Record<string, string | number>[]> };
const RE = /\{([#/]?)([a-z0-9_]+(?:\.[a-z0-9_]+)?)\}/gi;

async function XL() { return (await import('exceljs')).default; }

/* ---------- số tiền bằng chữ ---------- */
const DV = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function doc3(n: number, full: boolean) {
  const t = Math.floor(n / 100), c = Math.floor((n % 100) / 10), d = n % 10; const o: string[] = [];
  if (full || t) o.push(DV[t] + ' trăm');
  if (c > 1) { o.push(DV[c] + ' mươi'); if (d === 1) o.push('mốt'); else if (d === 5) o.push('lăm'); else if (d) o.push(DV[d]); }
  else if (c === 1) { o.push('mười'); if (d === 5) o.push('lăm'); else if (d) o.push(DV[d]); }
  else if (d) { if (full || t) o.push('lẻ'); o.push(DV[d]); }
  return o.join(' ');
}
export function soChu(v: number) {
  v = Math.round(Math.abs(v)); if (!v) return 'Không đồng';
  const u = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ']; const g: number[] = []; while (v) { g.push(v % 1000); v = Math.floor(v / 1000); }
  const out: string[] = [];
  for (let i = g.length - 1; i >= 0; i--) { if (!g[i]) continue; out.push(doc3(g[i], i < g.length - 1) + u[i]); }
  const s = out.join(' ').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
}

/* ---------- dữ liệu của một phiếu ---------- */
export function buildData(o: Order, b: Batch, d: Doc, people: Record<string, Profile>, cust: Record<string, string>): TplData {
  const nm = (id?: string) => (id ? people[id]?.full_name ?? '' : '');
  const fd = (s?: string) => (s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  const sg = (r: string) => [...(d.signs ?? [])].reverse().find((x) => x.role === r && x.action === 'ky');
  const lastAt = sg('duyet')?.at ?? d.status_at; const dt = new Date(lastAt);
  const vars: Record<string, string | number> = {
    ma_don: o.code, du_an: o.project, khach_hang: cust[o.kh2_id ?? ''] ?? cust[o.kh1_id ?? ''] ?? '', kh1: cust[o.kh1_id ?? ''] ?? '', kh2: cust[o.kh2_id ?? ''] ?? '',
    lien_he: o.contact ?? '', mo_ta: o.description ?? '', han_giao: fd(o.due_date ?? undefined), lo: b.title, cong_ty: { PN: 'Phương Nam CNC', IPC: 'IPC', HW: 'Hanwha' }[d.company] ?? d.company,
    ngay: String(dt.getDate()).padStart(2, '0'), thang: String(dt.getMonth() + 1).padStart(2, '0'), nam: dt.getFullYear(), ngay_in: fd(new Date().toISOString()), ngay_duyet_full: fd(lastAt),
    ghi_chu: (d.notes ?? []).map((n) => n.text).join('; ')
  };
  for (const [k] of HEADER[b.proc as Proc]) vars[k] = d.header?.[k] ?? '';
  for (const k of Object.keys(d.header ?? {})) if (vars[k] == null) vars[k] = d.header[k];
  for (const r of ['lap', 'kiem_tra', 'duyet', 'admin', 'ky_thuat']) { const s = sg(r); vars['nguoi_' + r] = nm(s?.user); vars['ngay_' + r] = fd(s?.at); }
  const tables: TplData['tables'] = {};
  for (const [key, def] of PROC_TABLES[b.proc as Proc]) {
    const T = TABLES[def]; const rows: Row[] = d.tables?.[key] ?? [];
    tables[key] = rows.map((r, i) => { const o2: Record<string, string | number> = { stt: i + 1 };
      for (const c of T.cols) { const v = c.calc ? c.calc(r) : c.n ? numIn(r[c.k]) : r[c.k]; o2[c.k] = v == null ? '' : c.n ? Math.round(Number(v) * 10 ** (c.d ?? 0)) / 10 ** (c.d ?? 0) : String(v); }
      return o2; });
    for (const c of T.cols) if (c.n) vars['tong_' + key + '_' + c.k] = Math.round(sumOf(rows, c) * 100) / 100;
  }
  if (b.proc === 'QT1') { const c = TABLES.ds1.cols.find((x) => x.k === 'tt')!; const sm = sumOf(d.tables?.ds ?? [], c); const v = numIn(d.header?.vat) ?? 8;
    vars.tong_tien = Math.round(sm); vars.tien_vat = Math.round(sm * v / 100); vars.tong_tt = Math.round(sm + sm * v / 100); vars.tong_tt_chu = soChu(sm + sm * v / 100); }
  void ROLE_OF; return { vars, tables };
}

/** Danh sách biến có thể dùng cho một quy trình (để hiện trong Quản trị) */
export function varList(proc: Proc): { k: string; t: string }[] {
  const L: { k: string; t: string }[] = [
    { k: 'ma_don', t: 'Mã đơn hàng' }, { k: 'du_an', t: 'Dự án' }, { k: 'khach_hang', t: 'Khách hàng (KH cuối)' }, { k: 'kh1', t: 'KH1' }, { k: 'kh2', t: 'KH2' },
    { k: 'lien_he', t: 'Liên hệ' }, { k: 'han_giao', t: 'Hạn giao' }, { k: 'cong_ty', t: 'Công ty của phiếu' }, { k: 'lo', t: 'Tên lô / đợt' },
    { k: 'ngay', t: 'Ngày duyệt (dd)' }, { k: 'thang', t: 'Tháng' }, { k: 'nam', t: 'Năm' }, { k: 'ngay_duyet_full', t: 'Ngày duyệt dd/mm/yyyy' }, { k: 'ngay_in', t: 'Ngày in' }, { k: 'ghi_chu', t: 'Ghi chú phiếu' }];
  for (const [k, t] of HEADER[proc]) L.push({ k, t });
  for (const r of proc === 'QT0' ? ['admin', 'ky_thuat', 'kiem_tra', 'duyet'] : ['lap', 'kiem_tra', 'duyet']) { L.push({ k: 'nguoi_' + r, t: 'Người ký ' + r }, { k: 'ngay_' + r, t: 'Ngày ký ' + r }); }
  if (proc === 'QT1') L.push({ k: 'tong_tien', t: 'Tổng tiền' }, { k: 'tien_vat', t: 'Tiền VAT' }, { k: 'tong_tt', t: 'Tổng thanh toán' }, { k: 'tong_tt_chu', t: 'Tổng TT bằng chữ' });
  for (const [key, def] of PROC_TABLES[proc]) { const T = TABLES[def];
    L.push({ k: '#' + key, t: 'Lặp dòng: ' + T.t + ' (đặt ở ô đầu dòng)' }, { k: key + '.stt', t: 'STT' });
    for (const c of T.cols) { L.push({ k: key + '.' + c.k, t: c.t }); if (c.n) L.push({ k: 'tong_' + key + '_' + c.k, t: 'Tổng ' + c.t }); } }
  return L;
}

/** Đọc biến trong file mẫu */
export async function scanVars(buf: ArrayBuffer) {
  const E = await XL(); const wb = new E.Workbook(); await wb.xlsx.load(buf); const found = new Set<string>();
  wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { const s = cellText(c); for (const m of s.matchAll(RE)) found.add((m[1] === '#' ? '#' : '') + m[2]); })));
  return [...found];
}
function cellText(c: ExcelJS.Cell): string {
  if (c.isMerged && c.master !== c) return '';
  const v = c.value as unknown; if (v == null) return ''; if (typeof v === 'string') return v;
  if (typeof v === 'object' && v && 'richText' in v) return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join('');
  return '';
}

/* ---------- điền ---------- */
const colN = (s: string) => s.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const colL = (n: number) => { let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
function shiftFormula(f: string, at: number, k: number) {
  // range qua dòng mẫu → kéo dài; tham chiếu dưới dòng mẫu → dời xuống k dòng
  return f.replace(/(\$?[A-Z]{1,3}\$?)(\d+)(?::(\$?[A-Z]{1,3}\$?)(\d+))?/g, (m, c1, r1, c2, r2) => {
    const a = +r1; if (!c2) return c1 + (a > at ? a + k : a);
    const b = +r2; return c1 + (a > at ? a + k : a) + ':' + c2 + (b >= at ? b + k : b);
  });
}

export async function fillXlsx(buf: ArrayBuffer, data: TplData): Promise<ExcelJS.Workbook> {
  const E = await XL(); const wb = new E.Workbook(); await wb.xlsx.load(buf);
  wb.eachSheet((ws) => {
    // tìm dòng lặp, xử lý từ dưới lên
    const loops: { row: number; key: string }[] = [];
    ws.eachRow((r, n) => r.eachCell((c) => { const m = cellText(c).match(/\{#([a-z0-9_]+)\}/i); if (m) loops.push({ row: n, key: m[1] }); }));
    loops.sort((a, z) => z.row - a.row);
    for (const L of loops) {
      const items = data.tables[L.key] ?? []; const k = Math.max(0, items.length - 1);
      const merges: string[] = [...((ws.model as unknown as { merges: string[] }).merges ?? [])];
      merges.forEach((m) => ws.unMergeCells(m));
      if (k) {
        // dời công thức phía dưới trước khi chèn
        ws.eachRow((r, n) => { if (n <= L.row) return; r.eachCell((c) => { const v = c.value as { formula?: string } | null; if (v && typeof v === 'object' && v.formula) c.value = { formula: shiftFormula(v.formula, L.row, k) } as ExcelJS.CellFormulaValue; }); });
        ws.duplicateRow(L.row, k, true);
      }
      // gộp ô lại theo vị trí mới + nhân bản gộp ô của dòng mẫu
      for (const m of merges) { const [a, z] = m.split(':'); const ra = +a.replace(/\D/g, ''), rz = +z.replace(/\D/g, ''); const ca = a.replace(/\d/g, ''), cz = z.replace(/\d/g, '');
        if (ra === L.row && rz === L.row) { for (let i = 0; i <= k; i++) ws.mergeCells(`${ca}${L.row + i}:${cz}${L.row + i}`); }
        else ws.mergeCells(`${ca}${ra > L.row ? ra + k : ra}:${cz}${rz > L.row ? rz + k : rz}`); }
      for (let i = 0; i <= k; i++) { const it = items[i] ?? {}; const r = ws.getRow(L.row + i);
        r.eachCell({ includeEmpty: false }, (c) => { const s = cellText(c); if (!s.includes('{')) return;
          if (!items.length) { c.value = s.replace(RE, ''); return; }
          const only = s.match(/^\s*(?:\{#[a-z0-9_]+\})?\s*\{([a-z0-9_]+)\.([a-z0-9_]+)\}\s*$/i);
          if (only && typeof it[only[2]] === 'number') { c.value = it[only[2]] as number; return; }
          c.value = s.replace(RE, (_m, p, name: string) => (p ? '' : name.includes('.') ? String(it[name.split('.')[1]] ?? '') : String(data.vars[name] ?? ''))); });
        r.commit(); }
    }
    // biến đơn
    ws.eachRow((r) => r.eachCell((c) => { const s = cellText(c); if (!s.includes('{')) return;
      const only = s.match(/^\s*\{([a-z0-9_]+)\}\s*$/i); if (only && typeof data.vars[only[1]] === 'number') { c.value = data.vars[only[1]] as number; return; }
      c.value = s.replace(RE, (_m, p, name: string) => (p ? '' : String(data.vars[name] ?? ''))); }));
    // tính sẵn kết quả SUM để xem trước / in PDF (Excel vẫn tự tính lại)
    ws.eachRow((r) => r.eachCell((c) => { const v = c.value as { formula?: string } | null; if (!v || typeof v !== 'object' || !v.formula) return;
      const m = v.formula.match(/^SUM\((\$?[A-Z]+)\$?(\d+):(\$?[A-Z]+)\$?(\d+)\)$/i); if (!m) return; let t = 0;
      for (let rr = +m[2]; rr <= +m[4]; rr++) for (let cc = colN(m[1].replace('$', '')); cc <= colN(m[3].replace('$', '')); cc++) { const x = ws.getCell(rr, cc).value; if (typeof x === 'number') t += x; }
      c.value = { formula: v.formula, result: Math.round(t * 1000) / 1000 } as ExcelJS.CellFormulaValue; }));
  });
  return wb;
}

/* ---------- HTML để in / PDF ---------- */
const argb = (x?: { argb?: string }) => (x?.argb && x.argb.length >= 6 ? '#' + x.argb.slice(-6) : '');
export function toHtml(wb: ExcelJS.Workbook): string {
  const ws = wb.worksheets[0]; const maxR = ws.rowCount, maxC = ws.columnCount;
  const span: Record<string, [number, number]> = {}; const hide = new Set<string>();
  for (const m of ((ws.model as unknown as { merges: string[] }).merges ?? [])) { const [a, z] = m.split(':'); const ra = +a.replace(/\D/g, ''), rz = +z.replace(/\D/g, ''), ca = colN(a.replace(/\d/g, '')), cz = colN(z.replace(/\d/g, ''));
    span[ra + ':' + ca] = [rz - ra + 1, cz - ca + 1]; for (let r = ra; r <= rz; r++) for (let c = ca; c <= cz; c++) if (r !== ra || c !== ca) hide.add(r + ':' + c); }
  let used = 1; for (let c = 1; c <= maxC; c++) for (let r = 1; r <= maxR; r++) if (ws.getCell(r, c).value != null) used = Math.max(used, c);
  for (const k of Object.keys(span)) { const [, c] = k.split(':').map(Number); used = Math.max(used, c + span[k][1] - 1); }
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!));
  const cols = Array.from({ length: used }, (_, i) => (ws.getColumn(i + 1).width ?? 9) * 7);
  const total = cols.reduce((a, w) => a + w, 0);
  const bd = (b?: Partial<ExcelJS.Border>) => (b?.style ? `1px solid ${argb(b.color) || '#000'}` : '');
  let h = `<table style="border-collapse:collapse;width:100%;table-layout:fixed;font-family:'Times New Roman',serif;font-size:12px"><colgroup>${cols.map((w) => `<col style="width:${(w / total * 100).toFixed(2)}%">`).join('')}</colgroup>`;
  for (let r = 1; r <= maxR; r++) { const row = ws.getRow(r); h += `<tr style="height:${(row.height ?? 15) * 1.33}px">`;
    for (let c = 1; c <= used; c++) { if (hide.has(r + ':' + c)) continue; const cell = ws.getCell(r, c); const sp = span[r + ':' + c];
      let v = ''; const raw = cell.value as unknown;
      if (raw && typeof raw === 'object' && 'formula' in (raw as object)) { const res = (raw as { result?: unknown }).result; v = res == null ? '' : typeof res === 'number' ? res.toLocaleString('vi-VN') : String(res); }
      else if (typeof raw === 'number') v = raw.toLocaleString('vi-VN'); else if (raw instanceof Date) v = raw.toLocaleDateString('vi-VN'); else v = cellText(cell) || (raw == null ? '' : String(raw));
      const f = cell.font ?? {}; const a = cell.alignment ?? {}; const b = cell.border ?? {}; const fill = (cell.fill as { fgColor?: { argb?: string }; pattern?: string } | undefined);
      const st = [f.bold ? 'font-weight:700' : '', f.italic ? 'font-style:italic' : '', f.size ? `font-size:${f.size * 1.2}px` : '', argb(f.color) && argb(f.color) !== '#000000' ? `color:${argb(f.color)}` : '',
        `text-align:${a.horizontal === 'centerContinuous' ? 'center' : a.horizontal ?? (typeof raw === 'number' ? 'right' : 'left')}`, `vertical-align:${a.vertical === 'middle' ? 'middle' : a.vertical ?? 'bottom'}`,
        a.wrapText ? 'white-space:pre-wrap;overflow:hidden' : 'white-space:pre;overflow:visible', fill?.pattern === 'solid' && argb(fill.fgColor) ? `background:${argb(fill.fgColor)}` : '',
        bd(b.top) && `border-top:${bd(b.top)}`, bd(b.bottom) && `border-bottom:${bd(b.bottom)}`, bd(b.left) && `border-left:${bd(b.left)}`, bd(b.right) && `border-right:${bd(b.right)}`, 'padding:2px 4px'].filter(Boolean).join(';');
      h += `<td${sp ? ` rowspan="${sp[0]}" colspan="${sp[1]}"` : ''} style="${st}">${esc(v)}</td>`; }
    h += '</tr>'; }
  h += '</table>';
  const imgs = ws.getImages().map((im) => { const m = wb.getImage(+im.imageId) as { base64?: string; buffer?: ArrayBuffer; extension: string };
    let b64 = m.base64 ?? ''; if (!b64 && m.buffer) { const u = new Uint8Array(m.buffer as ArrayBuffer); let s = ''; u.forEach((x) => { s += String.fromCharCode(x); }); b64 = btoa(s); }
    if (b64.includes(',')) b64 = b64.split(',')[1];
    const tl = im.range.tl as { nativeCol: number; nativeRow: number; col: number; row: number }; const br = im.range.br as { nativeCol: number; nativeRow: number } | undefined;
    const left = cols.slice(0, Math.floor(tl.col)).reduce((a, w) => a + w, 0) / total * 100;
    const ext = (im.range as unknown as { ext?: { width: number; height: number } }).ext;
    const wpx = ext?.width ?? (br ? cols.slice(Math.floor(tl.col), br.nativeCol).reduce((a, w) => a + w, 0) : 90);
    let top = 0; for (let r = 1; r <= Math.floor(tl.row); r++) top += (ws.getRow(r).height ?? 15) * 1.33;
    return `<img src="data:image/${m.extension};base64,${b64}" style="position:absolute;left:${left}%;top:${top}px;width:${Math.min(wpx, 220)}px">`; }).join('');
  return `<div style="position:relative">${imgs}${h}</div>`;
}

export async function downloadWb(wb: ExcelJS.Workbook, name: string) {
  const out = await wb.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function printHtml(html: string, title: string) {
  const w = window.open('', '_blank'); if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4 landscape;margin:10mm}body{margin:0}</style></head><body>${html}<script>onload=()=>setTimeout(()=>print(),300)</script></body></html>`); w.document.close();
}

export type Tpl = { id: string; proc: string; company: string | null; name: string; path: string; file_name: string | null; version: number; vars: string[]; active: boolean; created_at: string };
export { colL };
