import { lazy, Suspense, useRef, useState } from 'react';
const MiniMap = lazy(() => import('./MiniMap'));
import { isNumOk, numTyping } from '../lib/proc';
import type { FDef } from '../lib/fields';

/** Ô nhập cho trường đầu phiếu theo kiểu dữ liệu. Giá trị luôn là chuỗi. */
export const NUM_TYPES = ['number', 'int', 'money', 'percent'];
export const isNumType = (t: string) => NUM_TYPES.includes(t);
const toN = (s: string) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const money = (s: string) => { if (!String(s).trim() || !isNumOk(s)) return s; return new Intl.NumberFormat('vi-VN').format(Number(String(s).replace(',', '.'))); };
export const fmtHead = (f: Pick<FDef, 'type'>, v: string) => (f.type === 'money' ? money(v) + (String(v).trim() ? ' đ' : '') : f.type === 'percent' && String(v).trim() ? v + ' %' : f.type === 'bool' ? (v ? 'Có' : 'Không') : v);
/** Lỗi định dạng (null = hợp lệ) */
export function headErr(t: string, v: string): string | null {
  const s = String(v ?? '').trim(); if (!s) return null;
  if (isNumType(t) && !isNumOk(s)) return 'Phải là số, VD: 12 hoặc 12,5';
  if (t === 'int' && !/^\d+$/.test(s)) return 'Chỉ nhập số nguyên';
  if (t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Email chưa đúng, VD: ten@congty.vn';
  if (t === 'phone' && !/^\+?[\d\s.-]{8,15}$/.test(s)) return 'Số điện thoại chưa đúng';
  if (t === 'url' && !/^https?:\/\/\S+\.\S+/.test(s)) return 'Link phải bắt đầu bằng http:// hoặc https://';
  return null;
}

export function HeadInput({ f, v, on, disabled, opts = [], calc }: { f: FDef; v: string; on: (x: string) => void; disabled?: boolean; opts?: string[]; calc?: string }) {
  const [focus, setFocus] = useState(false);
  const t = f.type;
  if (t === 'formula') return <input readOnly className="f-calc" value={calc ?? ''} title="Tự tính theo công thức" aria-readonly="true" />;
  if (t === 'select' || t === 'lookup') { const l = t === 'lookup' ? opts : f.options;
    return <select disabled={disabled} value={v} onChange={(e) => on(e.target.value)}><option value="">—</option>{l.map((o) => <option key={o}>{o}</option>)}{v && !l.includes(v) && <option>{v}</option>}</select>; }
  if (t === 'multi') { const cur = v.split(';').map((x) => x.trim()).filter(Boolean); const all = [...new Set([...f.options, ...cur])];
    const tog = (o: string) => on((cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join('; '));
    return <div className="hi-chips" role="group" aria-label={f.label}>{all.map((o) => <button key={o} type="button" disabled={disabled} aria-pressed={cur.includes(o)} className={cur.includes(o) ? 'on' : ''} onClick={() => tog(o)}>{cur.includes(o) ? '✓ ' : ''}{o}</button>)}
      {!all.length && <span className="small muted">Chưa có lựa chọn – thêm trong Quản trị</span>}</div>; }
  if (t === 'bool') return <span className="hi-bool"><input type="checkbox" disabled={disabled} checked={!!v} onChange={(e) => on(e.target.checked ? 'Có' : '')} /><span>{v ? 'Có' : 'Không'}</span></span>;
  if (t === 'location') return <LocInput v={v} on={on} disabled={disabled} />;
  if (t === 'textarea') return <textarea rows={2} disabled={disabled} value={v} onChange={(e) => on(e.target.value)} />;
  if (t === 'date' || t === 'datetime') return <input type={t === 'date' ? 'date' : 'datetime-local'} disabled={disabled} value={v} onChange={(e) => on(e.target.value)} />;
  const link = !focus && v && !headErr(t, v) ? (t === 'email' ? 'mailto:' + v : t === 'phone' ? 'tel:' + v.replace(/[^\d+]/g, '') : t === 'url' ? v : '') : '';
  const shown = !focus && t === 'money' ? money(v) : v;
  return <span className={'hi-wrap' + (t === 'money' || t === 'percent' ? ' hi-unit' : '')} data-unit={t === 'money' ? 'đ' : t === 'percent' ? '%' : undefined}>
    <input type={t === 'email' ? 'email' : t === 'phone' ? 'tel' : t === 'url' ? 'url' : 'text'} disabled={disabled} value={shown}
      inputMode={t === 'int' ? 'numeric' : isNumType(t) ? 'decimal' : t === 'phone' ? 'tel' : t === 'email' ? 'email' : t === 'url' ? 'url' : undefined}
      aria-invalid={headErr(t, v) ? true : undefined} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      onChange={(e) => on(isNumType(t) ? (t === 'int' ? e.target.value.replace(/\D/g, '') : t === 'money' ? numTyping(e.target.value).replace(/\./g, '') : numTyping(e.target.value)) : e.target.value)} />
    {link && <a className="hi-go" href={link} target={t === 'url' ? '_blank' : undefined} rel="noreferrer" aria-label={t === 'phone' ? 'Gọi' : t === 'email' ? 'Gửi mail' : 'Mở link'}>{t === 'phone' ? '📞' : t === 'email' ? '✉' : '↗'}</a>}
  </span>;
}
export { toN };

/** Vị trí: "địa chỉ @lat,lng" – toạ độ lấy từ GPS hoặc link Google Maps dán vào */
const LL = /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/;
export const parseLoc = (v: string) => { const m = LL.exec(v ?? ''); return { addr: (v ?? '').replace(/\s*@-?\d{1,2}\.\d+,\s*-?\d{1,3}\.\d+/, '').replace(/^\s+/, ''), ll: m ? m[1] + ',' + m[2] : '' }; };
export const mapUrl = (v: string) => { const { addr, ll } = parseLoc(v); return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ll || addr); };
/** Tra ngược toạ độ → địa chỉ (Nominatim, tiếng Việt) */
async function revGeo(ll: string): Promise<string> {
  const [lat, lon] = ll.split(',');
  const clean = (x: string) => x.replace(/,?\s*\d{5,6}(?=,|$)/g, '').replace(/,\s*(Việt Nam|Vietnam|VNM)$/i, '').trim();
  // 1) Esri (nhanh, ổn định, không cần khoá)
  try { const r = await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&langCode=vi&location=${lon},${lat}`);
    const j = await r.json() as { address?: { LongLabel?: string; Match_addr?: string } }; const v = j.address?.LongLabel || j.address?.Match_addr; if (v) return clean(v); } catch (e) { console.warn('[geo] esri', e); }
  // 2) Nominatim (OpenStreetMap)
  try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=vi&zoom=18`); if (r.ok) {
    const j = await r.json() as { display_name?: string; address?: Record<string, string> }; const a = j.address ?? {};
    const parts = [[a.house_number, a.road].filter(Boolean).join(' '), a.quarter || a.suburb || a.neighbourhood, a.city_district || a.county || a.town, a.city || a.state].filter(Boolean);
    const v = parts.length >= 2 ? [...new Set(parts)].join(', ') : j.display_name ?? ''; if (v) return clean(v); } } catch (e) { console.warn('[geo] osm', e); }
  return '';
}
/** Gợi ý địa chỉ (Esri), ưu tiên quanh vị trí đang có / TP.HCM */
const ESRI = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/';
type Sug = { text: string; magicKey: string };
async function suggest(q: string, near: string, sig: AbortSignal): Promise<Sug[]> {
  const [lat, lon] = (near || '10.7769,106.7009').split(',');
  const r = await fetch(`${ESRI}suggest?f=json&countryCode=VNM&maxSuggestions=5&langCode=vi&location=${lon},${lat}&text=${encodeURIComponent(q)}`, { signal: sig });
  const j = await r.json() as { suggestions?: Sug[] }; return j.suggestions ?? []; }
async function locate(sg: Sug): Promise<{ addr: string; ll: string } | null> {
  const r = await fetch(`${ESRI}findAddressCandidates?f=json&maxLocations=1&langCode=vi&outFields=LongLabel&SingleLine=${encodeURIComponent(sg.text)}&magicKey=${encodeURIComponent(sg.magicKey)}`);
  const j = await r.json() as { candidates?: { address: string; location: { x: number; y: number }; attributes?: { LongLabel?: string } }[] }; const c = j.candidates?.[0]; if (!c) return null;
  return { addr: (c.attributes?.LongLabel || c.address || sg.text).replace(/,\s*(Việt Nam|Vietnam|VNM)$/i, ''), ll: c.location.y.toFixed(6) + ',' + c.location.x.toFixed(6) }; }
let autoAddr = ''; // địa chỉ do app điền gần nhất (để không ghi đè địa chỉ người dùng gõ)
function LocInput({ v, on, disabled }: { v: string; on: (x: string) => void; disabled?: boolean }) {
  const { addr, ll } = parseLoc(v); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [geo, setGeo] = useState(false);
  const join = (a: string, l: string) => a.replace(/^\s+/, '') + (l ? ' @' + l : '');
  const [sugs, setSugs] = useState<Sug[]>([]); const [si, setSi] = useState(0); const tm = useRef(0); const ac = useRef<AbortController | null>(null);
  const ask = (q: string) => { clearTimeout(tm.current); ac.current?.abort(); if (q.trim().length < 3) { setSugs([]); return; }
    tm.current = window.setTimeout(() => { const c = new AbortController(); ac.current = c; suggest(q, ll, c.signal).then((l) => { setSugs(l); setSi(0); }).catch(() => {}); }, 400); };
  const choose = async (sg: Sug) => { setSugs([]); setGeo(true); setErr(''); const r = await locate(sg).catch(() => null); setGeo(false);
    if (r) { autoAddr = ''; on(join(r.addr, r.ll)); } else setErr('Không tìm thấy vị trí của địa chỉ này'); };
  const pick = async (nl: string) => { on(join(addr, nl)); if (addr && addr !== autoAddr) return; setGeo(true); setErr(''); const a = await revGeo(nl); setGeo(false); if (a) { autoAddr = a; on(join(a, nl)); } else setErr('Không tìm được địa chỉ cho điểm này – gõ tay vào ô trên'); };
  const typed = (x: string) => { // dán link Google Maps → tách toạ độ
    const m = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(x) ?? /[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(x) ?? /^\s*(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})\s*$/.exec(x);
    if (m && /maps|goo\.gl|^\s*-?\d/.test(x)) { if (addr === x) return; const nl = (+m[1]).toFixed(6) + ',' + (+m[2]).toFixed(6); if (!addr || addr === autoAddr) { on(join('', nl)); autoAddr = ''; setGeo(true); revGeo(nl).then((a) => { setGeo(false); if (a) { autoAddr = a; on(join(a, nl)); } }); } else on(join(addr, nl)); }
    else { on(join(x, ll)); ask(x); } };
  const gps = () => { if (!navigator.geolocation) return setErr('Thiết bị không hỗ trợ định vị'); setBusy(true); setErr('');
    navigator.geolocation.getCurrentPosition((p) => { setBusy(false); pick(p.coords.latitude.toFixed(6) + ',' + p.coords.longitude.toFixed(6)); },
      (e) => { setBusy(false); setErr(e.code === 1 ? 'Chưa cho phép truy cập vị trí – bật trong cài đặt trình duyệt' : 'Không lấy được vị trí, thử lại'); }, { enableHighAccuracy: true, timeout: 15000 }); };
  return <span className="hi-loc" onClick={(e) => { if ((e.target as HTMLElement).closest('.mm')) e.preventDefault(); /* không để <label> chuyển cú bấm sang ô nhập */ }}>
    <span className="hi-loc-in"><input type="text" disabled={disabled} value={addr} placeholder="Gõ địa chỉ để tìm, hoặc dán link Google Maps" onChange={(e) => typed(e.target.value)}
      role="combobox" aria-expanded={sugs.length > 0} aria-autocomplete="list" onBlur={() => setTimeout(() => setSugs([]), 200)}
      onKeyDown={(e) => { if (!sugs.length) return; if (e.key === 'ArrowDown') { e.preventDefault(); setSi((si + 1) % sugs.length); } else if (e.key === 'ArrowUp') { e.preventDefault(); setSi((si - 1 + sugs.length) % sugs.length); } else if (e.key === 'Enter') { e.preventDefault(); choose(sugs[si]); } else if (e.key === 'Escape') setSugs([]); }} />
      {sugs.length > 0 && <ul className="hi-sug" role="listbox">{sugs.map((x, i) => <li key={x.magicKey} role="option" aria-selected={i === si}>
        <button type="button" className={i === si ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(x)}>📍 {x.text}</button></li>)}</ul>}</span>
    <span className="hi-loc-bar">
      {!disabled && <button type="button" className="btn sm" onClick={gps} disabled={busy}>📍 {busy ? 'Đang lấy…' : 'Vị trí hiện tại'}</button>}
      {(addr || ll) && <a className="btn sm" href={mapUrl(v)} target="_blank" rel="noreferrer">🗺 Mở bản đồ</a>}
      {ll && <span className="small muted">{ll}{!disabled && <button type="button" className="link-btn" onClick={() => on(addr)} aria-label="Bỏ toạ độ"> ✕</button>}</span>}
    </span>
    {err && <small className="f-err">{err}</small>}{geo && <small className="muted">Đang tìm địa chỉ…</small>}
    {ll ? <Suspense fallback={<div className="mm mm-ph">Đang tải bản đồ…</div>}><MiniMap ll={ll} readOnly={disabled} onPick={pick} /></Suspense>
      : <div className="mm mm-ph">Chưa có vị trí – bấm 📍 hoặc dán link Google Maps</div>}
    {ll && !disabled && <small className="muted">Kéo ghim hoặc chạm vào bản đồ để chỉnh vị trí{matchMedia('(pointer:coarse)').matches ? ' · 2 ngón để kéo/phóng bản đồ' : ''}.</small>}
  </span>;
}
