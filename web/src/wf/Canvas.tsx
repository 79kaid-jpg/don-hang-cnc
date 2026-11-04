import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { END, KIND, targets, who, type Def, type Directory } from './model';

export const LANE_COLORS = ['#B8862B', '#2F6FB0', '#3B8E5A', '#8A4FB0', '#C0504D', '#5B7083'];
const LW = 140, CW = 210, RH = 132, BW = 172, BH = 78, PAD = 24;

/** Khung vẽ swimlane: làn = hàng, bước = hộp theo thứ tự cột; kéo hộp để đổi làn / đổi thứ tự; mũi tên nét đứt = nhánh điều kiện */
export function Canvas({ def, dir, sel, errIds, ro, onSelect, onMove }: {
  def: Def; dir: Directory | null; sel: string | null; errIds: Set<string>; ro: boolean;
  onSelect: (id: string | null) => void; onMove: (id: string, lane: string, idx: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const lanes = def.lanes.length ? def.lanes : [{ id: '', name: '' }];
  const laneOf = (l: string) => Math.max(0, lanes.findIndex((x) => x.id === l));
  const n = def.steps.length;
  const W = LW + PAD + (n + 2) * CW, H = lanes.length * RH + 48;
  const pos = (i: number) => ({ x: LW + PAD + (i + 1) * CW, y: laneOf(def.steps[i].lane) * RH + (RH - BH) / 2 });
  const lastLane = n ? laneOf(def.steps[n - 1].lane) : 0;
  const startP = { x: LW + PAD + CW - 70, y: laneOf(def.steps[0]?.lane ?? '') * RH + RH / 2 };
  const endP = { x: LW + PAD + (n + 1) * CW + 30, y: lastLane * RH + RH / 2 };
  const anchor = (id: string) => { if (id === END) return { x: endP.x - 18, y: endP.y, end: true }; const i = def.steps.findIndex((s) => s.id === id); if (i < 0) return null; const p = pos(i); return { x: p.x, y: p.y + BH / 2, i }; };

  const toSvg = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  const down = (e: React.PointerEvent, id: string) => { if (ro) return onSelect(id); (e.target as Element).setPointerCapture(e.pointerId); const p = toSvg(e); setDrag({ id, dx: 0, dy: 0, sx: p.x, sy: p.y }); };
  const move = (e: React.PointerEvent) => { if (!drag) return; const p = toSvg(e); setDrag({ ...drag, dx: p.x - drag.sx, dy: p.y - drag.sy }); };
  const up = () => {
    if (!drag) return;
    const i = def.steps.findIndex((s) => s.id === drag.id);
    if (Math.abs(drag.dx) + Math.abs(drag.dy) < 6) onSelect(drag.id);
    else {
      const p = pos(i); const cy = p.y + BH / 2 + drag.dy, cx = p.x + BW / 2 + drag.dx;
      const lane = lanes[Math.min(lanes.length - 1, Math.max(0, Math.floor(cy / RH)))].id;
      const idx = Math.min(n - 1, Math.max(0, Math.round((cx - LW - PAD - BW / 2) / CW) - 1));
      onMove(drag.id, lane, idx);
    }
    setDrag(null);
  };

  // Mũi tên
  const edges: JSX.Element[] = []; const labels: JSX.Element[] = [];
  def.steps.forEach((s, i) => {
    const p = pos(i); const from = { x: p.x + BW, y: p.y + BH / 2 };
    targets(def, i).forEach((t, k) => {
      const a = anchor(t.to); if (!a) return;
      const back = !('end' in a) && a.i !== undefined && a.i <= i;
      let d: string; let lx: number, ly: number;
      if (back) {
        const by = Math.max(p.y, a.y - BH / 2) + BH + 22 + k * 12;
        d = `M${p.x + BW / 2},${p.y + BH} C${p.x + BW / 2},${by} ${a.x + BW / 2},${by} ${a.x + BW / 2},${a.y + BH / 2}`; lx = (p.x + a.x + BW) / 2; ly = by - 6;
      } else {
        const off = t.branch ? -(k + 1) * 14 : 0; const mx = (from.x + a.x) / 2;
        d = `M${from.x},${from.y + off} C${mx},${from.y + off} ${mx},${a.y} ${a.x - 2},${a.y}`; lx = from.x + 8; ly = t.branch ? from.y + off - 5 : from.y + 16;
      }
      edges.push(<g key={s.id + k} className={'wf-edge' + (t.branch ? ' br' : '')}>
        <path d={d} markerEnd={t.branch ? 'url(#wf-ar-b)' : 'url(#wf-ar)'} /></g>);
      if (t.label) labels.push(<g key={'l' + s.id + k} className={'wf-edge' + (t.branch ? ' br' : '')}><text x={lx} y={ly} textAnchor={back ? 'middle' : 'start'}><title>{t.label}</title>{t.label.length > 30 ? t.label.slice(0, 29) + '…' : t.label}</text></g>);
    });
  });

  return (
    <div className="wf-canvas">
      <div className="wf-canvas-bar">
        <button className="btn sm icon-btn" aria-label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))}>−</button>
        <span className="small muted" style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn sm icon-btn" aria-label="Phóng to" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}>+</button>
        <button className="btn sm" onClick={() => setZoom(1)}>100%</button>
        {!ro && <span className="small muted">Kéo hộp để đổi làn hoặc thứ tự · bấm hộp để cấu hình · nét đứt = nhánh điều kiện</span>}
      </div>
      <div className="wf-canvas-scroll" onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
        <svg ref={svg} width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={up} role="img" aria-label="Sơ đồ swimlane quy trình">
          <defs>
            <marker id="wf-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="wf-ar" /></marker>
            <marker id="wf-ar-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="wf-ar-b" /></marker>
          </defs>
          {lanes.map((l, k) => <g key={l.id + k}>
            <rect x={0} y={k * RH} width={W} height={RH} className={k % 2 ? 'wf-lrow alt' : 'wf-lrow'} />
            <rect x={0} y={k * RH} width={6} height={RH} fill={LANE_COLORS[k % LANE_COLORS.length]} />
            <foreignObject x={10} y={k * RH} width={LW - 16} height={RH}><div className="wf-lname">{l.name}</div></foreignObject>
            <line x1={LW} x2={LW} y1={k * RH} y2={(k + 1) * RH} className="wf-lsep" />
          </g>)}
          <g className="wf-node-s"><circle cx={startP.x} cy={startP.y} r={16} /><text x={startP.x} y={startP.y + 34} textAnchor="middle">Bắt đầu</text></g>
          {n > 0 && <path className="wf-edge" d={`M${startP.x + 16},${startP.y} L${pos(0).x - 2},${pos(0).y + BH / 2}`} markerEnd="url(#wf-ar)" />}
          {edges}
          <g className="wf-node-e"><circle cx={endP.x} cy={endP.y} r={16} /><circle cx={endP.x} cy={endP.y} r={10} className="in" /><text x={endP.x} y={endP.y + 34} textAnchor="middle">Kết thúc</text></g>
          {def.steps.map((s, i) => {
            const p = pos(i); const dg = drag?.id === s.id; const c = LANE_COLORS[laneOf(s.lane) % LANE_COLORS.length];
            return (
              <g key={s.id} transform={`translate(${p.x + (dg ? drag!.dx : 0)},${p.y + (dg ? drag!.dy : 0)})`} className={'wf-box' + (sel === s.id ? ' sel' : '') + (dg ? ' drag' : '') + (errIds.has(s.id) ? ' err' : '')}
                onPointerDown={(e) => down(e, s.id)} tabIndex={0} role="button" aria-label={`Bước ${i + 1}: ${s.name}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }}>
                <rect width={BW} height={BH} rx={10} />
                <rect width={5} height={BH} rx={2} fill={c} />
                <foreignObject x={10} y={6} width={BW - 16} height={BH - 10}>
                  <div className="wf-boxt">
                    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><b className="wf-boxn" style={{ background: c }}>{i + 1}</b><span className={'wf-kind ' + KIND[s.kind].c}>{KIND[s.kind].t}</span>{errIds.has(s.id) && <Icon name="alert" size={13} />}</div>
                    <div className="wf-boxname">{s.name || 'Chưa đặt tên'}</div>
                    <div className="wf-boxwho">{who(s.assignee, dir)}{s.sla_hours ? ` · ${s.sla_hours}h` : ''}</div>
                  </div>
                </foreignObject>
              </g>);
          })}
          {labels}
        </svg>
      </div>
    </div>);
}
