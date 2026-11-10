import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { onView, type ViewItem } from '../lib/viewer';
import { Icon } from './Icon';

const ext = (n = '') => n.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'svg'];

/** Gắn 1 lần ở App. Đóng: nút ✕, phím Esc, nút Back của Android. */
export function Viewer() {
  const [v, setV] = useState<ViewItem | null>(null); const fr = useRef<HTMLIFrameElement>(null);
  useEffect(() => onView(setV), []);
  useEffect(() => {
    if (!v) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setV(null);
    history.pushState({ viewer: 1 }, ''); const pop = () => setV(null);
    addEventListener('keydown', k); addEventListener('popstate', pop); document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); removeEventListener('popstate', pop); document.body.style.overflow = ''; };
  }, [v]);
  if (!v) return null;
  const close = () => { if (history.state?.viewer) history.back(); else setV(null); };
  const e = ext(v.name ?? v.url); const isImg = IMG.includes(e); const isPdf = e === 'pdf';
  const dl = v.url ? v.url + (v.url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(v.name ?? 'file') : '';
  const clean = v.html?.replace(/<script[\s\S]*?<\/script>/gi, '') ?? '';
  const doc = !v.html ? '' : /^\s*(<!doctype|<html)/i.test(clean) ? clean : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"><style>@page{size:A4 ${v.landscape ? 'landscape' : 'portrait'};margin:10mm}html,body{margin:0;background:#fff}body{padding:8px}tr,img{page-break-inside:avoid;break-inside:avoid}@media print{body{padding:0}}</style></head><body>${clean}</body></html>`;
  return createPortal(<div className="vw" role="dialog" aria-modal="true" aria-label={v.title}>
    <header className="vw-h">
      <button className="btn icon-only vw-x" onClick={close} aria-label="Đóng" title="Đóng (Esc)"><Icon name="x" size={20} /></button>
      <b className="vw-t">{v.title}</b>
      {v.html && <button className="btn sm primary" onClick={() => fr.current?.contentWindow?.print()}><Icon name="print" size={16} />In</button>}
      {v.url && <a className="btn sm" href={dl}><Icon name="download" size={16} />Tải về</a>}
    </header>
    <div className="vw-b">
      {v.html ? <iframe ref={fr} title={v.title} srcDoc={doc} />
        : isImg ? <div className="vw-img"><img src={v.url} alt={v.name} /></div>
        : isPdf ? <iframe title={v.title} src={v.url} />
        : <div className="vw-none"><Icon name="file" size={40} /><p>Không xem trước được loại file này{e ? ' (.' + e + ')' : ''}.</p><a className="btn primary" href={dl}><Icon name="download" size={16} />Tải về để mở</a></div>}
    </div>
  </div>, document.body);
}
