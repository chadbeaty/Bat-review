/** Each swing in a session as a thin bar (height = score). The best is lit; unscored swings are short hatched stubs. */
export function SparkBars({ scores, className = "" }: { scores: (number | null)[]; className?: string }) {
  if (!scores.length) return null;
  const best = Math.max(...scores.map((s) => s ?? -1));
  const W = Math.max(40, scores.length * 7);
  return (
    <svg viewBox={`0 0 ${W} 28`} className={`h-7 ${className}`} style={{ width: Math.min(140, W) }} aria-hidden="true" preserveAspectRatio="none">
      {scores.map((s, i) => {
        const h = s === null ? 4 : Math.max(3, (s / 100) * 26);
        return <rect key={i} x={i * 7 + 1} y={28 - h} width="4" height={h} rx="1" fill={s === null ? "var(--color-line-2)" : s === best ? "var(--color-optic)" : "var(--color-chalk-3)"} />;
      })}
    </svg>
  );
}
