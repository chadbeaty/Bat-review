import { joined, mark, tagline, wordmark } from "@/brand/geometry";

/*
  Gapper logos for the app, drawn from the same geometry as the files in public/brand/ (src/brand/geometry.ts).
  Colors default to the dark-background version: white letters, lime ball. Pass `fill`/`ball` for other grounds
  (e.g. navy on the lime action button).
*/

const MARK = mark();
const MARK_D = joined(MARK.paths);
const WORD = wordmark();
const WORD_D = joined(WORD.paths);
const TAG = tagline();
const TAG_D = joined(TAG.paths);

type Ink = { fill?: string; ball?: string; className?: string };

/** The G symbol: the outfield arc with the ball in the gap. */
export function LogoMark({ size = 32, fill = "var(--color-chalk)", ball = "var(--color-optic)", className = "" }: Ink & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-2 -4 108 108" className={className} aria-hidden="true">
      <path d={MARK_D} fill={fill} />
      {MARK.ball && <circle cx={MARK.ball.cx} cy={MARK.ball.cy} r={MARK.ball.r} fill={ball} />}
    </svg>
  );
}

/** The primary logo: GAPPER, led by the G symbol. `height` is the cap height in px. */
export function Wordmark({ height = 20, fill = "var(--color-chalk)", ball = "var(--color-optic)", className = "" }: Ink & { height?: number }) {
  const k = height / 100;
  return (
    <svg width={(WORD.w + 4) * k} height={108 * k} viewBox={`-2 -4 ${WORD.w + 4} 108`} className={className} role="img" aria-label="Gapper">
      <path d={WORD_D} fill={fill} />
      {WORD.balls.map((b) => (
        <circle key={b.cx} cx={b.cx} cy={b.cy} r={b.r} fill={ball} />
      ))}
    </svg>
  );
}

/** The secondary logo: the wordmark over OWN THE GAP., the tagline set to the same width. */
export function Lockup({ width = 220, fill = "var(--color-chalk)", sub = "var(--color-chalk-3)", ball = "var(--color-optic)", className = "" }: Ink & { width?: number; sub?: string }) {
  const s = WORD.w / TAG.w;
  const y = 136;
  const h = y + 100 * s + 8;
  return (
    <svg width={width} height={(width * h) / (WORD.w + 4)} viewBox={`-2 -4 ${WORD.w + 4} ${h}`} className={className} role="img" aria-label="Gapper. Own the gap.">
      <path d={WORD_D} fill={fill} />
      {WORD.balls.map((b) => (
        <circle key={b.cx} cx={b.cx} cy={b.cy} r={b.r} fill={ball} />
      ))}
      <g transform={`translate(0 ${y}) scale(${s})`}>
        <path d={TAG_D} fill={sub} />
        {TAG.balls.map((b) => (
          <circle key={b.cx} cx={b.cx} cy={b.cy} r={b.r} fill={ball} />
        ))}
      </g>
    </svg>
  );
}
