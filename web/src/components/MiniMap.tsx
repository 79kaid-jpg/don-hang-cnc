import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/** Bản đồ nhỏ OpenStreetMap: ghim kéo được, chạm để đặt ghim. Điện thoại: 1 ngón cuộn trang, 2 ngón phóng/kéo bản đồ. */
const pin = L.divIcon({ className: 'mm-pin', html: '<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="#C0392B"/><circle cx="15" cy="15" r="6" fill="#fff"/></svg>', iconSize: [30, 40], iconAnchor: [15, 40] });
export default function MiniMap({ ll, onPick, readOnly }: { ll: string; onPick: (ll: string) => void; readOnly?: boolean }) {
  const box = useRef<HTMLDivElement>(null); const map = useRef<L.Map | null>(null); const mk = useRef<L.Marker | null>(null);
  const cb = useRef(onPick); cb.current = onPick;
  const pos = (): L.LatLngExpression => { const [a, b] = ll.split(',').map(Number); return [a, b]; };
  useEffect(() => {
    const touch = matchMedia('(pointer:coarse)').matches;
    const m = L.map(box.current!, { center: pos(), zoom: 16, scrollWheelZoom: !touch, dragging: !touch, touchZoom: true, attributionControl: true });
    // Nền Esri World Street Map (không cần khoá); lỗi nhiều ô → chuyển sang OSM
    let errs = 0; const osm = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' }).addTo(m);
    esri.on('tileerror', () => { if (++errs === 3) { m.removeLayer(esri); osm().addTo(m); } });
    const set = (p: L.LatLng) => cb.current(p.lat.toFixed(6) + ',' + p.lng.toFixed(6));
    mk.current = L.marker(pos(), { icon: pin, draggable: !readOnly, keyboard: false }).addTo(m);
    if (!readOnly) { mk.current.on('dragend', () => set(mk.current!.getLatLng())); m.on('click', (e: L.LeafletMouseEvent) => set(e.latlng)); }
    // 2 ngón trên điện thoại → cho kéo bản đồ
    if (touch) { const el = box.current!; const on = (e: TouchEvent) => { if (e.touches.length > 1) m.dragging.enable(); else m.dragging.disable(); };
      el.addEventListener('touchstart', on, { passive: true }); el.addEventListener('touchend', on, { passive: true }); }
    map.current = m; setTimeout(() => m.invalidateSize(), 50);
    return () => { m.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!map.current || !mk.current) return; const p = pos(); mk.current.setLatLng(p); if (!map.current.getBounds().pad(-0.2).contains(p)) map.current.setView(p); }, [ll]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} className="mm" role="application" aria-label={'Bản đồ vị trí ' + ll + (readOnly ? '' : '. Chạm vào bản đồ hoặc kéo ghim để đổi vị trí')} />;
}
