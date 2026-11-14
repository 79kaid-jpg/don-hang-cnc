import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

type Tool = 'hl' | 'pen' | 'box' | 'note';
type Note = { x: number; y: number; t: string };
type Stroke = { tool: Tool; pts: [number, number][] };
const STY: Record<Exclude<Tool, 'note'>, { c: string; w: number; a: number }> = { hl: { c: '#FFE14D', w: 22, a: 0.45 }, pen: { c: '#E5341D', w: 4, a: 1 }, box: { c: '#E5341D', w: 4, a: 1 } };

/** Ảnh ghi chú lý do trả về: chụp phiếu đang mở / chọn ảnh / dán ảnh → vẽ highlight, bút đỏ, khung → gắn vào lý do hoặc copy */
export function Annotate({ capture, onDone, onClose }: { capture?: () => Promise<Blob | null>; onDone: (b: Blob, notes?: string) => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null); const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('hl'); const [ss, setSs] = useState<Stroke[]>([]); const cur = useRef<Stroke | null>(null);
  const [ns, setNs] = useState<Note[]>([]); const [ed, setEd] = useState<number | null>(null); const hist = useRef<('s' | 'n')[]>([]); const drag = useRef<{ i: number; moved: boolean } | null>(null);
  const undo = () => { const h = hist.current.pop(); if (h === 'n') { setNs((a) => a.slice(0, -1)); setEd(null); } else if (h === 's') setSs((a) => a.slice(0, -1)); };
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const load = (b: Blob) => { const u = URL.createObjectURL(b); const im = new Image(); im.onload = () => { setImg(im); setSs([]); setNs([]); setEd(null); hist.current = []; }; im.src = u; };
  const shot = async () => { if (!capture) return; setBusy(true); setMsg(''); try { const b = await capture(); if (b) load(b); else setMsg('Không chụp được, hãy chọn ảnh.'); } finally { setBusy(false); } };
  useEffect(() => { if (capture && !matchMedia('(pointer:coarse)').matches) shot(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const p = (e: ClipboardEvent) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); load(f); } };
    addEventListener('paste', p); const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; if (e.key === 'Escape') onClose(); if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') undo(); };
    addEventListener('keydown', k); return () => { removeEventListener('paste', p); removeEventListener('keydown', k); }; }, [onClose]);
  const draw = (withNotes = false) => { const c = cv.current; if (!c || !img) return; const g = c.getContext('2d')!; c.width = img.naturalWidth; c.height = img.naturalHeight; g.drawImage(img, 0, 0);
    const k = Math.max(1, img.naturalWidth / 900);
    for (const s of [...ss, ...(cur.current ? [cur.current] : [])]) { const st = STY[s.tool as Exclude<Tool, 'note'>]; g.globalAlpha = st.a; g.strokeStyle = st.c; g.lineWidth = st.w * k; g.lineCap = 'round'; g.lineJoin = 'round';
      if (s.tool === 'box') { const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]]; if (a && b) g.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
      else { g.beginPath(); s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); } }
    g.globalAlpha = 1;
    if (withNotes) ns.forEach((n, i) => { const r = 13 * k; g.font = `600 ${14 * k}px 'Be Vietnam Pro', system-ui, sans-serif`;
      if (n.t.trim()) { const tw = g.measureText(n.t).width; const bx = n.x + r + 6 * k, by = n.y - 13 * k, bw = tw + 16 * k, bh = 26 * k;
        g.fillStyle = '#fff'; g.strokeStyle = '#E5341D'; g.lineWidth = 2 * k; g.beginPath(); g.roundRect(bx, by, bw, bh, 6 * k); g.fill(); g.stroke();
        g.fillStyle = '#1B1F24'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(n.t, bx + 8 * k, n.y + 1); }
      g.fillStyle = '#E5341D'; g.beginPath(); g.arc(n.x, n.y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2.5 * k; g.stroke();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), n.x, n.y + 1); }); };
  useEffect(() => draw()); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.current!.width / r.width), (e.clientY - r.top) * (cv.current!.height / r.height)] as [number, number]; };
  const down = (e: React.PointerEvent) => { if (!img) return; e.preventDefault();
    if (tool === 'note') { const [x, y] = pos(e); setNs((a) => [...a, { x, y, t: '' }]); hist.current.push('n'); setEd(ns.length); return; } (e.target as HTMLElement).setPointerCapture(e.pointerId); cur.current = { tool, pts: [pos(e)] }; draw(); };
  const move = (e: React.PointerEvent) => { if (!cur.current) return; cur.current.pts.push(pos(e)); draw(); };
  const up = () => { const st = cur.current; cur.current = null; if (st && st.pts.length > 1) { setSs((s) => [...s, st]); hist.current.push('s'); } };
  const pct = (n: Note) => ({ left: (n.x / (cv.current?.width || 1)) * 100 + '%', top: (n.y / (cv.current?.height || 1)) * 100 + '%' });
  const pinMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; d.moved = true; const [x, y] = pos(e); setNs((a) => a.map((n, j) => (j === d.i ? { ...n, x, y } : n))); };
  const noteText = () => ns.map((n, i) => n.t.trim() ? '①②③④⑤⑥⑦⑧⑨⑩'.charAt(i) || '(' + (i + 1) + ')' : '').map((c, i) => c && c + ' ' + ns[i].t.trim()).filter(Boolean).join('\n');
  const blob = () => new Promise<Blob | null>((r) => { draw(true); cv.current?.toBlob((b) => { r(b); draw(); }, 'image/png'); });
  const attach = async () => { const b = await blob(); if (b) onDone(b, noteText()); };
  const copy = async () => { const b = await blob(); if (!b) return; try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); setMsg('Đã copy ảnh – có thể dán (Ctrl+V) vào Zalo/Email'); } catch { setMsg('Trình duyệt không cho copy ảnh, hãy dùng “Gắn vào lý do”.'); } };
  return createPortal(<div className="modal-bg an-bg" role="dialog" aria-modal="true" aria-label="Ảnh ghi chú lý do">
    <div className="an-box">
      <div className="an-bar">
        <b>Ảnh ghi chú</b>
        <div className="pd-seg an-tools" role="group" aria-label="Công cụ vẽ">
          {([['hl', 'Highlight'], ['pen', 'Bút đỏ'], ['box', 'Khung đỏ'], ['note', 'Ghi chú']] as [Tool, string][]).map(([k, t]) => <button key={k} type="button" aria-pressed={tool === k} onClick={() => setTool(k)}><span className={'an-sw ' + (k === 'note' ? 'an-sw-note' : 'an-' + k)} />{t}</button>)}
        </div>
        <button type="button" className="btn sm" disabled={!ss.length && !ns.length} onClick={undo}><Icon name="back" size={14} />Hoàn tác</button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm icon-btn" aria-label="Đóng" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div className="an-stage">{img ? <div className={'an-wrap' + (tool === 'note' ? ' noting' : '')}><canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ touchAction: 'none' }} />
          {ns.map((n, i) => <div key={i} className={'an-note' + (ed === i ? ' on' : '')} style={pct(n)}>
            <button type="button" className="an-pin" aria-label={'Ghi chú ' + (i + 1) + (n.t ? ': ' + n.t : '') + '. Kéo để dời, bấm để sửa'} style={{ touchAction: 'none' }}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { i, moved: false }; }} onPointerMove={pinMove}
              onPointerUp={() => { const d = drag.current; drag.current = null; if (d && !d.moved) setEd(i); }}>{i + 1}</button>
            {ed === i ? <span className="an-in"><input autoFocus value={n.t} placeholder="Gõ ghi chú…" aria-label={'Nội dung ghi chú ' + (i + 1)}
                onChange={(e) => setNs((a) => a.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEd(null); } }} onBlur={() => setEd(null)} />
                <button type="button" aria-label="Xoá ghi chú" onPointerDown={(e) => e.preventDefault()} onClick={() => { setNs((a) => a.filter((_, j) => j !== i)); hist.current = hist.current.filter((h, k, arr) => !(h === 'n' && arr.slice(0, k + 1).filter((z) => z === 'n').length === i + 1)); setEd(null); }}><Icon name="x" size={14} /></button></span>
              : n.t && <span className="an-lbl">{n.t}</span>}
          </div>)}</div>
        : <div className="an-empty">{busy ? 'Đang chụp phiếu…' : <>
          {capture && <button type="button" className="btn primary" onClick={shot}><Icon name="file" size={16} />Chụp phiếu đang mở</button>}
          <label className="btn"><Icon name="upload" size={16} />Chọn ảnh / chụp màn hình<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
          <span className="small muted">Hoặc dán ảnh (Ctrl+V). Trên điện thoại: chụp màn hình bằng nút của máy rồi chọn ảnh.</span></>}</div>}</div>
      {msg && <div className="small muted an-msg" role="status">{msg}</div>}
      <div className="an-foot">
        {img && <label className="btn sm"><Icon name="upload" size={14} />Đổi ảnh<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" disabled={!img} onClick={copy}>Copy</button>
        <button type="button" className="btn primary" disabled={!img} onClick={attach}><Icon name="check" size={16} />Gắn vào lý do</button>
      </div>
    </div>
  </div>, document.body);
}
