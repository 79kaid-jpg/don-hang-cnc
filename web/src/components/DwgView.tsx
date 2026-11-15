import { useEffect, useRef, useState } from 'react';

/** Xem bản vẽ .dwg ngay trên trình duyệt (libredwg → SVG). Kéo để di chuyển, cuộn/chụm 2 ngón để phóng to. */
type VB = { x: number; y: number; w: number; h: number };
let lib: Promise<any> | null = null;
const getLib = () => (lib ??= import('@mlightcad/libredwg-web').then((m) => m.LibreDwg.create(new URL('dwg/', location.href.split('#')[0]).href)));

export default function DwgView({ url, light }: { url: string; light: boolean }) {
  const box = useRef<HTMLDivElement>(null); const svgEl = useRef<SVGSVGElement | null>(null);
  const home = useRef<VB | null>(null); const vb = useRef<VB | null>(null);
  const [st, setSt] = useState<'load' | 'ok' | 'err'>('load'); const [msg, setMsg] = useState('');

  const apply = () => { const s = svgEl.current, v = vb.current; if (s && v) s.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); };
  const fit = () => { if (home.current) { vb.current = { ...home.current }; apply(); } };
  const zoom = (k: number, cx = 0.5, cy = 0.5) => {
    const v = vb.current, el = box.current; if (!v || !el) return;
    // giữ điểm dưới con trỏ đứng yên (tính theo tỉ lệ khung đang hiển thị, preserveAspectRatio meet)
    const r = el.getBoundingClientRect(); const s = Math.max(v.w / r.width, v.h / r.height);
    const px = v.x + (v.w - r.width * s) / 2 + cx * r.width * s, py = v.y + (v.h - r.height * s) / 2 + cy * r.height * s;
    const w = v.w * k, h = v.h * k; vb.current = { x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h }; apply();
  };

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const [l, buf] = await Promise.all([getLib(), fetch(url).then((r) => { if (!r.ok) throw new Error('Không tải được file'); return r.arrayBuffer(); })]);
        const raw = l.dwg_read_data(buf, 0); if (!raw) throw new Error('File không đọc được (có thể bản DWG quá mới hoặc hỏng)');
        const db = l.convert(raw); const svg: string = l.dwg_to_svg(db); try { l.dwg_free(raw); } catch { /* bỏ qua */ }
        if (dead || !box.current) return;
        box.current.innerHTML = svg.replace(/^<\?xml[^>]*>/, '');
        const s = box.current.querySelector('svg'); if (!s) throw new Error('Không vẽ được');
        s.removeAttribute('width'); s.removeAttribute('height'); s.setAttribute('preserveAspectRatio', 'xMidYMid meet'); svgEl.current = s;
        // khung theo nội dung thật (viewBox của file hay rộng hơn bản vẽ)
        const b = s.getBBox(); const pad = Math.max(b.width, b.height) * 0.03;
        home.current = b.width > 0 ? { x: b.x - pad, y: b.y - pad, w: b.width + pad * 2, h: b.height + pad * 2 } : null;
        fit(); setSt('ok');
      } catch (e) { if (!dead) { setMsg((e as Error).message); setSt('err'); } }
    })();
    return () => { dead = true; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // kéo / chụm
  useEffect(() => {
    const el = box.current; if (!el) return;
    const pts = new Map<number, { x: number; y: number }>(); let d0 = 0;
    const scale = () => { const v = vb.current!, r = el.getBoundingClientRect(); return Math.max(v.w / r.width, v.h / r.height); };
    const down = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); } };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId); if (!p || !vb.current) return;
      if (pts.size === 1) { const s = scale(); vb.current.x -= (e.clientX - p.x) * s; vb.current.y -= (e.clientY - p.y) * s; apply(); }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = el.getBoundingClientRect();
        if (d0 && d) zoom(d0 / d, ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height); d0 = d;
      }
    };
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); d0 = 0; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('wheel', wheel, { passive: false });
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('wheel', wheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={'dwg' + (light ? ' light' : '')}>
    <div ref={box} className="dwg-c" />
    {st === 'load' && <div className="dwg-msg">Đang mở bản vẽ…<small>Lần đầu cần tải bộ đọc CAD (~3MB)</small></div>}
    {st === 'err' && <div className="dwg-msg">{msg}<small>Bấm “Tải về” để mở bằng AutoCAD.</small></div>}
    {st === 'ok' && <div className="dwg-tools">
      <button type="button" onClick={() => zoom(1 / 1.4)} aria-label="Phóng to">＋</button>
      <button type="button" onClick={() => zoom(1.4)} aria-label="Thu nhỏ">－</button>
      <button type="button" onClick={fit} aria-label="Vừa màn hình">⤢</button>
    </div>}
  </div>;
}
