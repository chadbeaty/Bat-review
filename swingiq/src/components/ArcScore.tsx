/**
 * The score drawn as a slow-pitch arc: the ball sits along a 6–12 ft pitch arc at a height set by the score.
 * 0 sits at the release point, 100 lands on the plate. A null score shows an empty arc. An optional clay tick marks a
 * previous score for comparison.
 */
export function ArcScore({ score, size = 220, label = "SwingIQ score", previous = null }: { score: number | null; size?: number; label?: string; previous?: number | null }) {
  const w = 300;
  const h = 150;
  const p0 = { x: 14, y: 140 };
  const c = { x: 150, y: -95 };
  const p1 = { x: 286, y: 140 };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p1.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p1.y,
  });
  const norm = (s: number) => Math.max(0, Math.min(100, s)) / 100;
  const t = score === null ? 0 : norm(score);
  const b = at(t);
  const path = `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}`;
  const prev = previous !== null ? at(norm(previous)) : null;
  return (
    <div style={{ width: size }} role="img" aria-label={score === null ? `${label}: not enough data` : `${label}: ${score} out of 100`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="block w-full overflow-visible">
        <defs>
          <radialGradient id="arc-glow">
            <stop offset="0" stopColor="#e4f542" stopOpacity="0.55" />
            <stop offset="1" stopColor="#e4f542" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={path} fill="none" stroke="var(--color-night-4)" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" />
        {[0.25, 0.5, 0.75].map((f) => {
          const q = at(f);
          return <circle key={f} cx={q.x} cy={q.y} r="1.8" fill="var(--color-line-2)" />;
        })}
        {score !== null && (
          <path d={path} fill="none" stroke="var(--color-optic)" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray={`${t * 100} 100`} style={{ transition: "stroke-dasharray .9s cubic-bezier(.3,.7,.2,1)" }} />
        )}
        {prev && <circle cx={prev.x} cy={prev.y} r="4.5" fill="var(--color-night)" stroke="var(--color-clay)" strokeWidth="2" />}
        {/* Plate */}
        <path d="M274,144 h24 v5 l-12,7 l-12,-7 z" fill="var(--color-chalk-3)" />
        {score !== null && (
          <g>
            <circle cx={b.x} cy={b.y} r="26" fill="url(#arc-glow)" />
            <g transform={`translate(${b.x - 11},${b.y - 11})`}>
              <circle cx="11" cy="11" r="11" fill="#e4f542" />
              <path d="M4 4c3 2.5 5 5 5 7s-2 4.5-5 7M18 4c-3 2.5-5 5-5 7s2 4.5 5 7" fill="none" stroke="#e5483a" strokeWidth="1.3" strokeDasharray="1.4 1.3" />
            </g>
          </g>
        )}
      </svg>
      <div className="-mt-[23%] text-center">
        <div className="num text-[2.9rem] leading-none text-chalk">{score ?? "—"}</div>
        <div className="mt-1.5 text-[12px] text-chalk-3">{label}</div>
      </div>
    </div>
  );
}
