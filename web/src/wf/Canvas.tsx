import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { END, KIND, NTYPE, ntype, hasAppr, items, targets, who, type Assignee, type Def, type Directory, type Step } from './model';

export const LANE_COLORS = ['#B8862B', '#2F6FB0', '#3B8E5A', '#8A4FB0', '#C0504D', '#5B7083'];
const CW = 210, RH = 136, BW = 176, BH = 90, PAD = 20, TOP = 26;

/** Tên ngắn cho người làm (hiện trong hộp) */
function short(a: Assignee | undefined, dir: Directory | null) {
  if (!a?.id) return { icon: 'user', text: 'Phân công', warn: true };
  const t = who(a, dir).replace(/^Nhóm |^Vai trò /, '');
  return { icon: a.type === 'user' ? 'user' : a.type === 'group' ? 'users' : 'tag', text: t, warn: false };
}
function tip(s: Step, i: number, def: Def, dir: Directory | null) {
  const l = [`${i + 1}. ${s.name || '(chưa đặt tên)'} – ${KIND[s.kind].t}`, `Người làm: ${who(s.assignee, dir)}`];
  if (s.managers?.length) l.push('Quản trị: ' + s.managers.map((m) => who(m, dir)).join(', '));
  if (s.watchers?.length) l.push('Theo dõi: ' + s.watchers.map((m) => who(m, dir)).join(', '));
  if (s.sla_hours) l.push(`Hạn: ${s.sla_hours} giờ`);
  const it = items(s); if (it.length) l.push('Checklist: ' + it.map((c) => (c.kind === 'file' ? '📎 ' : '☑ ') + c.text).join('; '));
  if (hasAppr(s)) l.push('Luồng duyệt: ' + s.approval!.levels.map((x, k) => x.name || 'Cấp ' + (k + 1)).join(' → '));
  for (const t of targets(def, i)) if (t.label && t.branch) l.push('Nhánh: ' + t.label);
  return l.join('\n');
}

/** Khung vẽ swimlane: cột tên làn cố định khi trượt ngang; đường dọc nét đứt chia các cột bước; kéo hộp để đổi làn / thứ tự */
export function Canvas({ def, dir, sel, errIds, ro, onSelect, onMove, onAddLane, onRenameLane }: {
  def: Def; dir: Directory | null; sel: string | null; errIds: Set<string>; ro: boolean;
  onSelect: (id: string | null) => void; onMove: (id: string, lane: string, idx: number) => void;
  onAddLane: () => void; onRenameLane: (i: number, name: string) => void;
}) {
  const narrow = typeof window !== 'undefined' && innerWidth < 600;
  const LW = narrow ? 108 : 150;
  const [zoom, setZoom] = useState(narrow ? 0.8 : 1);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; sx: number; sy: number } | null>(null);
  const [editLane, setEditLane] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const lanes = def.lanes.length ? def.lanes : [{ id: '', name: '' }];
  const laneOf = (l: string) => Math.max(0, lanes.findIndex((x) => x.id === l));
  const n = def.steps.length;
  const X0 = LW; // toạ độ x đầu vùng vẽ (cột tên làn nằm ngoài svg)
  const W = PAD + (n + 2) * CW, H = TOP + lanes.length * RH + 48;
  const colX = (i: number) => X0 + PAD + (i + 1) * CW;
  const pos = (i: number) => ({ x: colX(i), y: TOP + laneOf(def.steps[i].lane) * RH + (RH - BH) / 2 });
  const lastLane = n ? laneOf(def.steps[n - 1].lane) : 0;
  const startP = { x: X0 + PAD + CW - 70, y: TOP + laneOf(def.steps[0]?.lane ?? '') * RH + RH / 2 };
  const endP = { x: X0 + PAD + (n + 1) * CW + 30, y: TOP + lastLane * RH + RH / 2 };
  const anchor = (id: string) => { if (id === END) return { x: endP.x - 18, y: endP.y, end: true }; const i = def.steps.findIndex((s) => s.id === id); if (i < 0) return null; const p = pos(i); return { x: p.x, y: p.y + BH / 2, i }; };

  // Cột đích khi đang kéo (để tô sáng)
  const dropCol = (() => {
    if (!drag) return null; const i = def.steps.findIndex((s) => s.id === drag.id); const cx = pos(i).x + BW / 2 + drag.dx;
    return Math.min(n - 1, Math.max(0, Math.round((cx - X0 - PAD - BW / 2) / CW) - 1));
  })();
  const dropLane = (() => { if (!drag) return null; const i = def.steps.findIndex((s) => s.id === drag.id); const cy = pos(i).y + BH / 2 + drag.dy; return Math.min(lanes.length - 1, Math.max(0, Math.floor((cy - TOP) / RH))); })();

  const toSvg = (e: React.PointerEvent) => { const r = svg.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / zoom + X0, y: (e.clientY - r.top) / zoom }; };
  const down = (e: React.PointerEvent, id: string) => { if (ro || e.pointerType === 'touch') return; /* chạm: để trình duyệt cuộn, chọn bằng onClick */ (e.currentTarget as Element).setPointerCapture(e.pointerId); const p = toSvg(e); setDrag({ id, dx: 0, dy: 0, sx: p.x, sy: p.y }); };
  const move = (e: React.PointerEvent) => { if (!drag) return; const p = toSvg(e); setDrag({ ...drag, dx: p.x - drag.sx, dy: p.y - drag.sy }); };
  const up = () => {
    if (!drag) return;
    if (Math.abs(drag.dx) + Math.abs(drag.dy) < 6) onSelect(drag.id);
    else onMove(drag.id, lanes[dropLane ?? 0].id, dropCol ?? 0);
    setDrag(null);
  };

  const edges: JSX.Element[] = []; const labels: JSX.Element[] = [];
  def.steps.forEach((s, i) => {
    const p = pos(i); const from = { x: p.x + BW, y: p.y + BH / 2 };
    targets(def, i).forEach((t, k) => {
      const a = anchor(t.to); if (!a) return;
      const back = !('end' in a) && a.i !== undefined && a.i <= i;
      let d: string; let lx: number, ly: number;
      if (back) {
        const by = Math.max(p.y, a.y - BH / 2) + BH + 20 + k * 12;
        d = `M${p.x + BW / 2},${p.y + BH} C${p.x + BW / 2},${by} ${a.x + BW / 2},${by} ${a.x + BW / 2},${a.y + BH / 2}`; lx = (p.x + a.x + BW) / 2; ly = by - 6;
      } else {
        const off = t.branch ? -(k + 1) * 14 : 0; const mx = (from.x + a.x) / 2;
        d = `M${from.x},${from.y + off} C${mx},${from.y + off} ${mx},${a.y} ${a.x - 2},${a.y}`; lx = from.x + 8; ly = t.branch ? from.y + off - 5 : from.y + 16;
      }
      edges.push(<g key={s.id + k} className={'wf-edge' + (t.branch ? ' br' : '')}><path d={d} markerEnd={t.branch ? 'url(#wf-ar-b)' : 'url(#wf-ar)'} /></g>);
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
        {!ro && <button className="btn sm" onClick={onAddLane}><Icon name="plus" size={14} />Thêm làn</button>}
        {!ro && <span className="small muted">Kéo hộp để đổi làn / thứ tự · bấm hộp để cấu hình · bấm đúp tên làn để đổi tên</span>}
      </div>
      <div className="wf-canvas-scroll" onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
        <div className="wf-canvas-in" style={{ width: (LW + W) * zoom, height: H * zoom }}>
          {/* Cột tên làn: cố định khi trượt ngang */}
          <div className="wf-lanecol" style={{ width: LW * zoom, height: H * zoom }}>
            <div style={{ height: TOP * zoom }} />
            {lanes.map((l, k) => {
              const cnt = def.steps.filter((s) => laneOf(s.lane) === k).length;
              return (
                <div key={l.id + k} className={'wf-lanehead' + (dropLane === k ? ' drop' : '')} style={{ height: RH * zoom, '--lc': LANE_COLORS[k % LANE_COLORS.length] } as React.CSSProperties}
                  onDoubleClick={() => !ro && setEditLane(k)}>
                  {editLane === k ? <input autoFocus defaultValue={l.name} aria-label="Tên làn" onBlur={(e) => { onRenameLane(k, e.target.value.trim() || l.name); setEditLane(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditLane(null); }} />
                    : <><b>{l.name || 'Làn ' + (k + 1)}</b><small>{cnt} bước</small></>}
                </div>);
            })}
            {!ro && <button className="wf-addlane" style={{ height: 40 * zoom }} onClick={onAddLane}><Icon name="plus" size={14} />Thêm làn</button>}
          </div>
          <svg ref={svg} width={W * zoom} height={H * zoom} viewBox={`${X0} 0 ${W} ${H}`} onPointerMove={move} onPointerUp={up} role="img" aria-label="Sơ đồ swimlane quy trình">
            <defs>
              <marker id="wf-ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="wf-ar" /></marker>
              <marker id="wf-ar-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="wf-ar-b" /></marker>
            </defs>
            {lanes.map((l, k) => <rect key={l.id + k} x={X0} y={TOP + k * RH} width={W} height={RH} className={(k % 2 ? 'wf-lrow alt' : 'wf-lrow') + (dropLane === k ? ' drop' : '')} />)}
            {lanes.map((_, k) => <line key={'h' + k} x1={X0} x2={X0 + W} y1={TOP + (k + 1) * RH} y2={TOP + (k + 1) * RH} className="wf-lsep" />)}
            {/* Đường dọc nét đứt chia cột bước + số cột */}
            {def.steps.map((_, i) => {
              const cx = colX(i) - (CW - BW) / 2;
              return <g key={'c' + i}>
                {dropCol === i && <rect x={cx} y={TOP} width={CW} height={lanes.length * RH} className="wf-dropcol" />}
                <line x1={cx} x2={cx} y1={TOP - 6} y2={TOP + lanes.length * RH} className="wf-colline" />
                <text x={colX(i) + BW / 2} y={17} textAnchor="middle" className="wf-colno">{i + 1}</text>
              </g>;
            })}
            {n > 0 && <line x1={colX(n - 1) + BW + (CW - BW) / 2} x2={colX(n - 1) + BW + (CW - BW) / 2} y1={TOP - 6} y2={TOP + lanes.length * RH} className="wf-colline" />}
            <g className="wf-node-s"><circle cx={startP.x} cy={startP.y} r={16} /><text x={startP.x} y={startP.y + 34} textAnchor="middle">Bắt đầu</text></g>
            {n > 0 && <path className="wf-edge" d={`M${startP.x + 16},${startP.y} L${pos(0).x - 2},${pos(0).y + BH / 2}`} markerEnd="url(#wf-ar)" />}
            {edges}
            <g className="wf-node-e"><circle cx={endP.x} cy={endP.y} r={16} /><circle cx={endP.x} cy={endP.y} r={10} className="in" /><text x={endP.x} y={endP.y + 34} textAnchor="middle">Kết thúc</text></g>
            {def.steps.map((s, i) => {
              const p = pos(i); const dg = drag?.id === s.id; const c = LANE_COLORS[laneOf(s.lane) % LANE_COLORS.length];
              const pr = short(s.assignee, dir); const it = items(s); const nFile = it.filter((x) => x.kind === 'file').length;
              return (
                <g key={s.id} transform={`translate(${p.x + (dg ? drag!.dx : 0)},${p.y + (dg ? drag!.dy : 0)})`} className={'wf-box' + (sel === s.id ? ' sel' : '') + (dg ? ' drag' : '') + (errIds.has(s.id) ? ' err' : '')}
                  onPointerDown={(e) => down(e, s.id)} onClick={() => { if (!drag) onSelect(s.id); }} tabIndex={0} role="button" aria-label={`Bước ${i + 1}: ${s.name}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }}>
                  <title>{tip(s, i, def, dir)}</title>
                  <rect className="wf-boxbg" width={BW} height={BH} rx={10} />
                  <rect width={5} height={BH} rx={2} fill={c} />
                  <foreignObject x={10} y={6} width={BW - 16} height={BH - 10}>
                    <div className="wf-boxt">
                      <div className="wf-boxtop">
                        <b className="wf-boxn" style={{ background: c }}>{i + 1}</b>
                        {ntype(s) === 'task' ? <><span className={'wf-kind ' + KIND[s.kind].c}>{KIND[s.kind].t}</span>
                        <span className={'wf-boxwho' + (pr.warn ? ' warn' : '')}><Icon name={pr.icon} size={12} />{pr.text}</span></>
                        : <span className="wf-kind k-ky">{NTYPE[ntype(s)]}</span>}
                      </div>
                      <div className="wf-boxname">{s.name || (ntype(s) === 'task' ? 'Chưa đặt tên' : NTYPE[ntype(s)])}</div>
                      <div className="wf-boxfoot">
                        {s.sla_hours ? <span title="Hạn xử lý"><Icon name="clock" size={12} />{s.sla_hours}h</span> : null}
                        {it.length ? <span title="Checklist"><Icon name="checksq" size={12} />{it.length}</span> : null}
                        {nFile ? <span title="Phải tải file"><Icon name="clip" size={12} />{nFile}</span> : null}
                        {hasAppr(s) ? <span className="ap" title="Luồng duyệt"><Icon name="shield" size={12} />{s.approval!.levels.length} cấp</span> : null}
                        {s.allow_back ? <span title="Cho trả lại"><Icon name="back" size={12} /></span> : null}
                        {s.allow_fail ? <span className="fl" title="Cho Fail"><Icon name="x" size={12} /></span> : null}
                        {errIds.has(s.id) && <span className="fl" title="Có lỗi cấu hình"><Icon name="alert" size={12} /></span>}
                      </div>
                    </div>
                  </foreignObject>
                </g>);
            })}
            {labels}
          </svg>
        </div>
      </div>
    </div>);
}
