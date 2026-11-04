import { useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { END, KIND, NTYPE, hasAppr, items, ntype, targets, who, type Def, type Directory, type NodeType } from './model';

const NW = 196, NH = 76, GX = 260, GY = 120, PAD = 60;
const ICON: Record<NodeType, string> = { task: 'checksq', action: 'bolt', parallel: 'split', join: 'merge', subprocess: 'flow' };
type Pt = { x: number; y: number };
type Edge = { from: string; to: string; k: number; label?: string; branch?: boolean; par?: boolean };

/** Tự sắp xếp: xếp tầng theo khoảng cách từ nút đầu (BFS), trong tầng xếp theo thứ tự danh sách */
export function autoLayout(def: Def): Record<string, Pt> {
  const depth = new Map<string, number>(); const ids = def.steps.map((s) => s.id);
  if (ids.length) { depth.set(ids[0], 0); const q = [ids[0]];
    while (q.length) { const id = q.shift()!; const i = ids.indexOf(id); for (const t of targets(def, i)) if (t.to !== END && ids.includes(t.to) && !depth.has(t.to)) { depth.set(t.to, depth.get(id)! + 1); q.push(t.to); } } }
  let maxD = Math.max(0, ...depth.values()); ids.forEach((id) => { if (!depth.has(id)) depth.set(id, ++maxD); });
  const rows = new Map<number, number>(); const out: Record<string, Pt> = {};
  for (const id of ids) { const d = depth.get(id)!; const r = rows.get(d) ?? 0; rows.set(d, r + 1); out[id] = { x: PAD + 160 + d * GX, y: PAD + r * GY }; }
  // canh giữa theo chiều dọc mỗi tầng
  const maxR = Math.max(1, ...rows.values());
  for (const id of ids) { const d = depth.get(id)!; const n = rows.get(d)!; out[id].y += ((maxR - n) * GY) / 2; }
  return out;
}

/** Canvas tự do kiểu 1Office: nút đặt tự do, kéo chấm nối để tạo mũi tên, nút "+" trên dây để chèn nút, chọn dây để xoá */
export function GraphCanvas({ def, dir, sel, errIds, ro, onSelect, onPos, onConnect, onInsert, onRemoveEdge, onAdd, onLayout, onUndo, onRedo, canUndo, canRedo }: {
  def: Def; dir: Directory | null; sel: string | null; errIds: Set<string>; ro: boolean;
  onSelect: (id: string | null) => void; onPos: (id: string, p: Pt) => void; onConnect: (from: string, to: string) => void;
  onInsert: (e: Edge, type: NodeType) => void; onRemoveEdge: (e: Edge) => void; onAdd: (type: NodeType, p: Pt) => void;
  onLayout: () => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null);
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null);
  const [selE, setSelE] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; edge?: Edge } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const auto = useMemo(() => autoLayout(def), [def]);
  const pos = (id: string): Pt => { const s = def.steps.find((x) => x.id === id); const p = s?.x != null && s?.y != null ? { x: s.x, y: s.y } : auto[id] ?? { x: 0, y: 0 };
    return drag?.id === id ? { x: p.x + drag.dx, y: p.y + drag.dy } : p; };
  const start: Pt = def.steps[0] ? { x: pos(def.steps[0].id).x - 150, y: pos(def.steps[0].id).y + NH / 2 } : { x: PAD, y: PAD };
  const xs = def.steps.map((s) => pos(s.id)); const maxX = Math.max(400, ...xs.map((p) => p.x)) + NW + 220; const maxY = Math.max(300, ...xs.map((p) => p.y)) + NH + 120;
  const end: Pt = { x: maxX - 120, y: (def.steps.length ? xs.reduce((a, p) => a + p.y, 0) / xs.length : PAD) + NH / 2 };
  const W = maxX, H = maxY;

  const edges: Edge[] = []; def.steps.forEach((s, i) => targets(def, i).forEach((t, k) => edges.push({ from: s.id, to: t.to, k, label: t.label, branch: t.branch, par: t.par })));
  const eid = (e: Edge) => e.from + '>' + e.to + '#' + e.k;
  const inP = (id: string): Pt => id === END ? { x: end.x - 18, y: end.y } : { x: pos(id).x, y: pos(id).y + NH / 2 };
  const outP = (id: string): Pt => ({ x: pos(id).x + NW, y: pos(id).y + NH / 2 });
  const path = (a: Pt, b: Pt) => {
    if (b.x > a.x + 30) { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; }
    const dy = Math.max(a.y, b.y) + NH; return `M${a.x},${a.y} C${a.x + 80},${a.y} ${a.x + 80},${dy} ${(a.x + b.x) / 2},${dy} S${b.x - 80},${b.y} ${b.x},${b.y}`;
  };
  const mid = (a: Pt, b: Pt): Pt => b.x > a.x + 30 ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + NH };
  const toSvg = (e: { clientX: number; clientY: number }): Pt => { const r = svg.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }; };
  const hitNode = (p: Pt) => def.steps.find((s) => { const q = pos(s.id); return p.x >= q.x && p.x <= q.x + NW && p.y >= q.y && p.y <= q.y + NH; })?.id
    ?? (Math.hypot(p.x - end.x, p.y - end.y) < 30 ? END : null);

  const move = (e: React.PointerEvent) => {
    if (drag) { const p = toSvg(e); setDrag({ ...drag, dx: p.x - drag.sx, dy: p.y - drag.sy }); }
    if (wire) { const p = toSvg(e); setWire({ ...wire, x: p.x, y: p.y }); }
  };
  const up = (e: React.PointerEvent) => {
    if (drag) {
      if (Math.abs(drag.dx) + Math.abs(drag.dy) < 5) { onSelect(drag.id); setSelE(null); }
      else { const s = def.steps.find((x) => x.id === drag.id); const b = s?.x != null && s?.y != null ? { x: s.x, y: s.y } : auto[drag.id];
        onPos(drag.id, { x: Math.round((b.x + drag.dx) / 10) * 10, y: Math.round((b.y + drag.dy) / 10) * 10 }); }
      setDrag(null);
    }
    if (wire) { const to = hitNode(toSvg(e)); if (to && to !== wire.from) onConnect(wire.from, to); setWire(null); }
  };
  const nodeColor = (t: NodeType) => ({ task: 'var(--blue)', action: '#B8862B', parallel: '#8A4FB0', join: '#8A4FB0', subprocess: '#C0504D' })[t];
  const curE = edges.find((e) => eid(e) === selE);

  return (
    <div className="wf-canvas wf-graph">
      <div className="wf-canvas-bar">
        {!ro && <>
          <button className="btn sm icon-btn" title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác" disabled={!canUndo} onClick={onUndo}>↶</button>
          <button className="btn sm icon-btn" title="Làm lại (Ctrl+Y)" aria-label="Làm lại" disabled={!canRedo} onClick={onRedo}>↷</button>
          <button className="btn sm" onClick={onLayout} title="Xếp lại các nút gọn gàng"><Icon name="kanban" size={14} />Tự sắp xếp</button>
          <span className="wf-tb-sep" />
          {(Object.keys(NTYPE) as NodeType[]).map((t) => <button key={t} className="btn sm" onClick={() => onAdd(t, { x: end.x - NW - 60, y: maxY - NH - 40 })} title={'Thêm ' + NTYPE[t]}><Icon name={ICON[t]} size={14} />{NTYPE[t]}</button>)}
          <span className="wf-tb-sep" />
        </>}
        <button className="btn sm icon-btn" aria-label="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(1)))}>−</button>
        <span className="small muted" style={{ minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn sm icon-btn" aria-label="Phóng to" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}>+</button>
        {curE && !ro && <span className="wf-edgebar"><span className="small">Mũi tên đang chọn</span>
          <button className="btn sm" onClick={() => setMenu({ ...mid(outP(curE.from), inP(curE.to)), edge: curE })}><Icon name="plus" size={14} />Chèn nút</button>
          <button className="btn sm danger" onClick={() => { onRemoveEdge(curE); setSelE(null); }}><Icon name="x" size={14} />Xoá mũi tên</button></span>}
      </div>
      <div className="wf-canvas-scroll wf-dots" onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelect(null); setSelE(null); setMenu(null); } }}>
        <svg ref={svg} width={W * zoom} height={H * zoom} viewBox={`0 0 ${W} ${H}`} onPointerMove={move} onPointerUp={up} role="img" aria-label="Sơ đồ quy trình dạng tự do"
          onPointerDown={(e) => { if (e.target === svg.current) { onSelect(null); setSelE(null); setMenu(null); } }}>
          <defs>
            <marker id="g-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8C8577" /></marker>
            <marker id="g-ar-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--gold)" /></marker>
            <marker id="g-ar-p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8A4FB0" /></marker>
          </defs>
          {/* Bắt đầu / Kết thúc */}
          <g className="g-start"><rect x={start.x - 60} y={start.y - 22} width={120} height={44} rx={22} /><text x={start.x} y={start.y + 5} textAnchor="middle">▶ Bắt đầu</text></g>
          {def.steps[0] && <path className="g-edge" d={path({ x: start.x + 60, y: start.y }, inP(def.steps[0].id))} markerEnd="url(#g-ar)" />}
          <g className="g-end"><circle cx={end.x} cy={end.y} r={18} /><circle cx={end.x} cy={end.y} r={11} className="in" /><text x={end.x} y={end.y + 36} textAnchor="middle">Kết thúc</text></g>
          {/* Mũi tên */}
          {edges.map((e) => { const a = outP(e.from), b = inP(e.to); if (e.to !== END && !def.steps.some((s) => s.id === e.to)) return null; const m = mid(a, b); const on = selE === eid(e);
            return <g key={eid(e)} className={'g-e' + (e.branch ? ' br' : '') + (e.par ? ' par' : '') + (on ? ' on' : '')}>
              <path d={path(a, b)} className="g-hit" onPointerDown={(ev) => { ev.stopPropagation(); setSelE(eid(e)); onSelect(null); }} />
              <path d={path(a, b)} className="g-edge" markerEnd={e.branch ? 'url(#g-ar-b)' : e.par ? 'url(#g-ar-p)' : 'url(#g-ar)'} />
              {e.label && <text x={m.x} y={m.y - 10} textAnchor="middle" className="g-lbl"><title>{e.label}</title>{e.label.length > 26 ? e.label.slice(0, 25) + '…' : e.label}</text>}
              {!ro && <g className="g-plus" transform={`translate(${m.x},${m.y})`} onPointerDown={(ev) => { ev.stopPropagation(); setMenu({ x: m.x, y: m.y, edge: e }); }}>
                <circle r={10} /><path d="M-5,0 H5 M0,-5 V5" /><title>Chèn nút vào giữa</title></g>}
            </g>; })}
          {wire && <path className="g-edge g-wire" d={path(outP(wire.from), { x: wire.x, y: wire.y })} />}
          {/* Nút */}
          {def.steps.map((s, i) => {
            const t = ntype(s); const p = pos(s.id); const c = nodeColor(t); const it = items(s);
            return (
              <g key={s.id} transform={`translate(${p.x},${p.y})`} className={'g-node t-' + t + (sel === s.id ? ' sel' : '') + (errIds.has(s.id) ? ' err' : '') + (drag?.id === s.id ? ' drag' : '')}
                tabIndex={0} role="button" aria-label={`${NTYPE[t]} ${i + 1}: ${s.name}`}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }}
                onPointerDown={(e) => { e.stopPropagation(); setMenu(null); if (ro) { onSelect(s.id); return; } (e.currentTarget as Element).setPointerCapture(e.pointerId); const q = toSvg(e); setDrag({ id: s.id, dx: 0, dy: 0, sx: q.x, sy: q.y }); }}>
                <title>{`${NTYPE[t]} #${i + 1}${s.name ? ': ' + s.name : ''}${t === 'task' ? '\nNgười làm: ' + who(s.assignee, dir) : ''}`}</title>
                <rect className="g-bg" width={NW} height={NH} rx={t === 'parallel' || t === 'join' ? NH / 2 : 10} style={{ '--nc': c } as React.CSSProperties} />
                <rect width={44} height={NH} rx={10} fill={c} className="g-side" />
                <foreignObject x={0} y={0} width={44} height={NH}><div className="g-ico"><Icon name={ICON[t]} size={18} /><small>#{i + 1}</small></div></foreignObject>
                <foreignObject x={50} y={6} width={NW - 56} height={NH - 12}>
                  <div className="g-txt">
                    <b>{s.name || NTYPE[t]}</b>
                    {t === 'task' ? <span className="g-sub"><Icon name="user" size={11} />{who(s.assignee, dir)}</span>
                      : <span className="g-sub">{t === 'parallel' ? `${(s.branches ?? []).length} nhánh cùng lúc` : t === 'join' ? (s.join_mode === 'any' ? 'Một nhánh là đủ' : 'Chờ đủ các nhánh') : t === 'action' ? `${(s.actions ?? []).length} hành động` : 'Gọi quy trình khác'}</span>}
                    {t === 'task' && <span className="g-foot">{KIND[s.kind].t}{s.sla_hours ? <><Icon name="clock" size={11} />{s.sla_hours}h</> : null}{it.length ? <><Icon name="checksq" size={11} />{it.length}</> : null}{hasAppr(s) ? <><Icon name="shield" size={11} />{s.approval!.levels.length}</> : null}</span>}
                  </div>
                </foreignObject>
                {!ro && <circle className="g-port" cx={NW} cy={NH / 2} r={7} onPointerDown={(e) => { e.stopPropagation(); setDrag(null); const q = toSvg(e); setWire({ from: s.id, x: q.x, y: q.y }); }}><title>Kéo để nối tới nút khác</title></circle>}
                <circle className="g-port in" cx={0} cy={NH / 2} r={5} />
              </g>);
          })}
        </svg>
        {menu && !ro && <div className="g-menu" style={{ left: menu.x * zoom + 8, top: menu.y * zoom + 8 }} role="menu">
          <b className="small">{menu.edge ? 'Chèn vào giữa' : 'Thêm nút'}</b>
          {(Object.keys(NTYPE) as NodeType[]).map((t) => <button key={t} role="menuitem" onClick={() => { if (menu.edge) onInsert(menu.edge, t); else onAdd(t, { x: menu.x, y: menu.y }); setMenu(null); setSelE(null); }}>
            <Icon name={ICON[t]} size={14} />{NTYPE[t]}</button>)}
          <button role="menuitem" onClick={() => setMenu(null)}>Đóng</button>
        </div>}
      </div>
      <div className="small muted" style={{ padding: '6px 10px' }}>Kéo nút để di chuyển · kéo <b>chấm tròn bên phải</b> sang nút khác để nối · bấm <b>+</b> trên mũi tên để chèn nút · bấm mũi tên để chọn rồi xoá</div>
    </div>);
}
