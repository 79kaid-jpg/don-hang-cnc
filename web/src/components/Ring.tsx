/** Vòng tiến độ checklist (donut): xám → hổ phách → xanh khi đủ */
export function Ring({ done, total, size = 34, stroke = 4, label = true, title }: { done: number; total: number; size?: number; stroke?: number; label?: boolean; title?: string }) {
  if (!total) return null;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = Math.min(1, done / total);
  const st = p >= 1 ? 'full' : p > 0 ? 'part' : 'zero';
  return (
    <span className={'ring ' + st} style={{ width: size, height: size }} role="img" aria-label={title ?? `Checklist ${done}/${total}`} title={title ?? `Checklist ${done}/${total}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {label && <span className="ring-t" style={{ fontSize: Math.max(9, size * 0.27) }}>{p >= 1 ? '✓' : `${done}/${total}`}</span>}
    </span>);
}
