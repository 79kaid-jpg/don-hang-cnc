/** Công thức cột bảng – bộ đọc riêng, không chạy code tuỳ ý.
 *  Hỗ trợ: số, {cot} hoặc cot, + - * / ^, ( ), so sánh > < >= <= = <>, hàm ROUND MIN MAX ABS IF SUM… */
type Tok = { t: 'n' | 'id' | 'op' | '(' | ')' | ','; v: string };
type Node = { k: 'n'; v: number } | { k: 'id'; v: string } | { k: 'u'; o: string; a: Node } | { k: 'b'; o: string; a: Node; b: Node } | { k: 'f'; f: string; a: Node[] };
export const FUNCS: Record<string, string> = { ROUND: 'ROUND(x; số lẻ)', MIN: 'MIN(a; b; …)', MAX: 'MAX(a; b; …)', ABS: 'ABS(x)', IF: 'IF(điều kiện; nếu đúng; nếu sai)', CEIL: 'CEIL(x)', FLOOR: 'FLOOR(x)' };

function lex(s: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++; out.push({ t: 'n', v: s.slice(i, j) }); i = j; continue; }
    if (c === '{') { const j = s.indexOf('}', i); if (j < 0) throw new Error('Thiếu dấu }'); out.push({ t: 'id', v: s.slice(i + 1, j).trim() }); i = j + 1; continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; out.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
    const two = s.slice(i, i + 2); if (['>=', '<=', '<>', '!='].includes(two)) { out.push({ t: 'op', v: two === '!=' ? '<>' : two }); i += 2; continue; }
    if ('+-*/^<>='.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c, v: c }); i++; continue; }
    if (c === ',' || c === ';') { out.push({ t: ',', v: ',' }); i++; continue; }
    throw new Error('Ký tự không hợp lệ: ' + c);
  }
  return out;
}
const PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 };
function parse(src: string): Node {
  const tk = lex(src); let p = 0;
  const peek = () => tk[p];
  const prim = (): Node => {
    const x = tk[p++]; if (!x) throw new Error('Công thức chưa hết');
    if (x.t === 'n') { const v = Number(x.v); if (!isFinite(v)) throw new Error('Số sai: ' + x.v); return { k: 'n', v }; }
    if (x.t === 'op' && (x.v === '-' || x.v === '+')) return { k: 'u', o: x.v, a: prim() };
    if (x.t === '(') { const e = expr(0); if (tk[p++]?.t !== ')') throw new Error('Thiếu dấu )'); return e; }
    if (x.t === 'id') {
      if (peek()?.t === '(') { const f = x.v.toUpperCase(); if (!FUNCS[f]) throw new Error('Không có hàm ' + x.v); p++; const a: Node[] = [];
        if (peek()?.t !== ')') { for (;;) { a.push(expr(0)); if (peek()?.t === ',') { p++; continue; } break; } }
        if (tk[p++]?.t !== ')') throw new Error('Thiếu dấu ) của ' + f); return { k: 'f', f, a }; }
      return { k: 'id', v: x.v };
    }
    throw new Error('Không hiểu "' + x.v + '"');
  };
  const expr = (min: number): Node => { let a = prim();
    for (;;) { const o = peek(); if (!o || o.t !== 'op' || PREC[o.v] < min || PREC[o.v] == null) break; p++; const b = expr(o.v === '^' ? PREC[o.v] : PREC[o.v] + 1); a = { k: 'b', o: o.v, a, b }; }
    return a; };
  const e = expr(0); if (p < tk.length) throw new Error('Thừa "' + tk[p].v + '"'); return e;
}
export function idsOf(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === 'id') out.add(n.v); else if (n.k === 'u') idsOf(n.a, out); else if (n.k === 'b') { idsOf(n.a, out); idsOf(n.b, out); } else if (n.k === 'f') n.a.forEach((x) => idsOf(x, out));
  return out;
}
function ev(n: Node, get: (k: string) => number | null): number | null {
  switch (n.k) {
    case 'n': return n.v;
    case 'id': return get(n.v);
    case 'u': { const a = ev(n.a, get); return a == null ? null : n.o === '-' ? -a : a; }
    case 'b': { const a = ev(n.a, get), b = ev(n.b, get);
      if (['=', '<>', '<', '>', '<=', '>='].includes(n.o)) { const x = a ?? 0, y = b ?? 0; return ({ '=': x === y, '<>': x !== y, '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y } as Record<string, boolean>)[n.o] ? 1 : 0; }
      if (a == null || b == null) return null;
      if (n.o === '+') return a + b; if (n.o === '-') return a - b; if (n.o === '*') return a * b; if (n.o === '^') return a ** b;
      return b === 0 ? null : a / b; }
    case 'f': { const v = (i: number) => ev(n.a[i], get);
      if (n.f === 'IF') { const c = v(0); return c ? v(1) : n.a.length > 2 ? v(2) : null; }
      const xs = n.a.map((_, i) => v(i));
      if (n.f === 'ROUND') { const x = xs[0]; if (x == null) return null; const d = xs[1] ?? 0; return Math.round(x * 10 ** d) / 10 ** d; }
      if (n.f === 'ABS') return xs[0] == null ? null : Math.abs(xs[0]); if (n.f === 'CEIL') return xs[0] == null ? null : Math.ceil(xs[0]); if (n.f === 'FLOOR') return xs[0] == null ? null : Math.floor(xs[0]);
      const ok = xs.filter((x): x is number => x != null); if (!ok.length) return null; return n.f === 'MIN' ? Math.min(...ok) : Math.max(...ok); }
  }
}
const cache = new Map<string, Node | Error>();
/** Kiểm tra công thức với danh sách cột được phép; trả lỗi tiếng Việt hoặc null */
export function checkFormula(src: string, keys: string[]): string | null {
  if (!src.trim()) return 'Chưa nhập công thức';
  try { const n = parse(src); const bad = [...idsOf(n)].filter((k) => !keys.includes(k)); return bad.length ? 'Không có cột: ' + bad.join(', ') : null; } catch (e) { return (e as Error).message; }
}
/** Tính công thức; get(k) trả giá trị số của cột k trong dòng */
export function evalFormula(src: string, get: (k: string) => number | null): number | null {
  let n = cache.get(src); if (!n) { try { n = parse(src); } catch (e) { n = e as Error; } cache.set(src, n); }
  if (n instanceof Error) return null; const v = ev(n, get); return v == null || !isFinite(v) ? null : v;
}
