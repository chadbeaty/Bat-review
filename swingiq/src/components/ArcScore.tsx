/**
 * The score drawn as a slow-pitch arc: the ball sits along a 6–12 ft pitch arc at a height set by the score.
 * 0 sits at the release point, 100 lands on the plate. A null score shows an empty arc.
 */
export function ArcScore({ score, size = 220, label = "SwingIQ score" }: { score: number | null; size?: number; label?: string }) {
  const w = 300;
  const h = 150;
  // The number sits in the hollow under the arc, so the arc is drawn high and wide.
  const p0 = { x: 14, y: 140 };
  const c = { x: 150, y: -95 };
  const p1 = { x: 286, y: 140 };
  const t = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const bx = (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x;
  const by = (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y;
  const path = `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}`;
  return (
    <div style={{ width: size }} role="img" aria-label={score === null ? `${label}: not enough data` : `${label}: ${score} out of 100`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full overflow-visible">
        <path d={path} fill="none" stroke="var(--color-night-4)" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" />
        {score !== null && (
          <path d={path} fill="none" stroke="var(--color-optic)" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray={`${t * 100} 100`} />
        )}
        {/* Plate */}
        <path d="M274,144 h24 v5 l-12,7 l-12,-7 z" fill="var(--color-chalk-3)" />
        {score !== null && (
          <g transform={`translate(${bx - 11},${by - 11})`}>
            <circle cx="11" cy="11" r="11" fill="#e4f542" />
            <path d="M4 4c3 2.5 5 5 5 7s-2 4.5-5 7M18 4c-3 2.5-5 5-5 7s2 4.5 5 7" fill="none" stroke="#e5483a" strokeWidth="1.3" strokeDasharray="1.4 1.3" />
          </g>
        )}
      </svg>
      <div className="-mt-[22%] text-center">
        <div className="num text-[2.6rem] leading-none text-chalk">{score ?? "—"}</div>
        <div className="mt-1 text-xs text-chalk-3">{label}</div>
      </div>
    </div>
  );
}
