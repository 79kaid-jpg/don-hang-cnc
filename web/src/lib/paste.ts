/** Dữ liệu chép từ Excel: tách bảng, chuẩn hoá số */
/** Tách dữ liệu chép từ Excel (TSV): hỗ trợ ô có xuống dòng / dấu tab nằm trong ngoặc kép */
export function parseTsv(t: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cell = ''; let q = false; const s = t.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) { const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}
/** Số chép từ Excel có định dạng: 1.500 / 1,500.25 / 5.500.000 / 8,25 → dạng chuẩn */
export function normNum(v: string): string {
  let x = v.replace(/[\s\u00a0]/g, ''); if (!x) return '';
  const d = x.lastIndexOf('.'), c = x.lastIndexOf(',');
  if (d >= 0 && c >= 0) { const dec = d > c ? '.' : ','; x = x.split(dec === '.' ? ',' : '.').join(''); return x.replace(',', '.'); }
  const sep = d >= 0 ? '.' : c >= 0 ? ',' : ''; if (!sep) return x;
  const parts = x.split(sep);
  if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0] !== '0')) return parts.join(''); // dấu phân cách hàng nghìn
  return parts.join('.');
}
