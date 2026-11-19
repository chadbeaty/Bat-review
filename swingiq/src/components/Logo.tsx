import { useId } from "react";

const SEAM = "M47.5 9.5 C 27 12.5 20.5 26.5 32 32 C 43.5 37.5 37 51.5 16.5 54.5";
const CURVES: [number, number][][] = [
  [[47.5, 9.5], [27, 12.5], [20.5, 26.5], [32, 32]],
  [[32, 32], [43.5, 37.5], [37, 51.5], [16.5, 54.5]],
];

/**
 * Stitch marks: slanted ticks on both sides of the seam, evenly spaced along its length like the lacing on a real
 * ball. A tick is skipped where the seam bends too tightly on that side for it to fit cleanly.
 */
function stitchPath(): string {
  const pts: { x: number; y: number; tx: number; ty: number; k: number }[] = [];
  for (const [p0, p1, p2, p3] of CURVES) {
    for (let i = 0; i < 200; i++) {
      const t = i / 200;
      const u = 1 - t;
      const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
      const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
      const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
      const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      const ddx = 6 * u * (p2[0] - 2 * p1[0] + p0[0]) + 6 * t * (p3[0] - 2 * p2[0] + p1[0]);
      const ddy = 6 * u * (p2[1] - 2 * p1[1] + p0[1]) + 6 * t * (p3[1] - 2 * p2[1] + p1[1]);
      const len = Math.hypot(dx, dy) || 1;
      pts.push({ x, y, tx: dx / len, ty: dy / len, k: (dx * ddy - dy * ddx) / len ** 3 });
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = cum[cum.length - 1];
  const count = 15;
  const out: string[] = [];
  let j = 0;
  for (let s = 1; s < count; s++) {
    const target = (s / count) * total;
    while (cum[j] < target) j++;
    const { x, y, tx, ty, k } = pts[j];
    const nx = -ty;
    const ny = tx;
    for (const side of [1, -1]) {
      // k > 0 bends toward +normal: that side is the inside of the bend.
      if (side * k > 0 && 1 / Math.abs(k) < 9) continue;
      const a = { x: x + nx * side * 2.5 - tx * 1.5, y: y + ny * side * 2.5 - ty * 1.5 };
      const b = { x: x + nx * side * 4.9 + tx * 1.5, y: y + ny * side * 4.9 + ty * 1.5 };
      out.push(`M${a.x.toFixed(2)} ${a.y.toFixed(2)}L${b.x.toFixed(2)} ${b.y.toFixed(2)}`);
    }
  }
  return out.join("");
}
const STITCHES = stitchPath();

/**
 * The SwingIQ mark: a gold ball whose seam runs as one "S" (for swing), stitched along its length. Gold for the
 * championship ring a slow-pitch tournament is played for.
 */
export function LogoMark({ size = 32, className = "", stitches = true }: { size?: number; className?: string; stitches?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6e4ad" />
          <stop offset="0.42" stopColor="#d7b46a" />
          <stop offset="1" stopColor="#94692f" />
        </linearGradient>
        <radialGradient id={`${id}-h`} cx="22" cy="18" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-c`}>
          <circle cx="32" cy="32" r="28" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-g)`} />
      <circle cx="32" cy="32" r="28" fill={`url(#${id}-h)`} />
      <g clipPath={`url(#${id}-c)`}>
        <path d={SEAM} fill="none" stroke="#0c0b09" strokeWidth="3.6" strokeLinecap="round" />
        {stitches && <path d={STITCHES} fill="none" stroke="#0c0b09" strokeWidth="1.25" strokeLinecap="round" opacity="0.8" />}
      </g>
      <circle cx="32" cy="32" r="27.4" fill="none" stroke="#fff3cf" strokeOpacity="0.35" strokeWidth="0.8" />
    </svg>
  );
}

/** Mark + wide wordmark. */
export function Wordmark({ compact = false, size = 30 }: { compact?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="SwingIQ">
      <LogoMark size={size} />
      {!compact && (
        <span className="num text-[15px] leading-none tracking-[0.14em] text-chalk" aria-hidden="true">
          SWING<span className="text-optic">IQ</span>
        </span>
      )}
    </span>
  );
}

/** The mark as standalone SVG markup (for icons rendered outside React). */
export const LOGO_SVG = (bg: string | null, pad = 0) => {
  const v = 64 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${v} ${v}">${
    bg ? `<rect x="${-pad}" y="${-pad}" width="${v}" height="${v}" fill="${bg}"/>` : ""
  }<defs><linearGradient id="g" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#f6e4ad"/><stop offset="0.42" stop-color="#d7b46a"/><stop offset="1" stop-color="#94692f"/></linearGradient><radialGradient id="h" cx="22" cy="18" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient><clipPath id="c"><circle cx="32" cy="32" r="28"/></clipPath></defs><circle cx="32" cy="32" r="28" fill="url(#g)"/><circle cx="32" cy="32" r="28" fill="url(#h)"/><g clip-path="url(#c)"><path d="${SEAM}" fill="none" stroke="#0c0b09" stroke-width="3.6" stroke-linecap="round"/><path d="${STITCHES}" fill="none" stroke="#0c0b09" stroke-width="1.25" stroke-linecap="round" opacity="0.8"/></g><circle cx="32" cy="32" r="27.4" fill="none" stroke="#fff3cf" stroke-opacity="0.35" stroke-width="0.8"/></svg>`;
};
