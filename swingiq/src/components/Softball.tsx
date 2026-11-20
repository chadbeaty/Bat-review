/**
 * A slow-pitch softball: optic yellow with red stitched seams, the ball slow-pitch players actually hit (USA, USSSA
 * and NSA game balls). Not a white baseball. The navy keyline keeps it readable on the lime buttons too.
 */
export function Softball({ size = 48, className = "", spin = false }: { size?: number; className?: string; spin?: boolean }) {
  // Stitch ticks across each seam: short strokes at right angles to the curve.
  const ticks = (side: 1 | -1) =>
    [-0.78, -0.47, -0.16, 0.16, 0.47, 0.78].map((k) => {
      // The seam runs from 13.5 off center at the top and bottom to 4.1 off center at the middle.
      const y = 24 + k * 14.5;
      const x = 24 + side * (4.1 + 9.4 * k * k);
      return `M${(x - side * 2.2).toFixed(2)} ${(y - 1).toFixed(2)}L${(x + side * 2.2).toFixed(2)} ${(y + 1).toFixed(2)}`;
    });
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="#d9f24a" stroke="var(--color-night)" strokeWidth="1.6" />
      <g className={spin ? "origin-center animate-[spin_3s_linear_infinite]" : undefined} style={{ transformOrigin: "24px 24px" }}>
        <path d="M10.5 9.5c6.8 4.6 9.4 9.2 9.4 14.5s-2.6 9.9-9.4 14.5" fill="none" stroke="#c8362b" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M37.5 9.5c-6.8 4.6-9.4 9.2-9.4 14.5s2.6 9.9 9.4 14.5" fill="none" stroke="#c8362b" strokeWidth="1.8" strokeLinecap="round" />
        <path d={[...ticks(-1), ...ticks(1)].join("")} fill="none" stroke="#c8362b" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
