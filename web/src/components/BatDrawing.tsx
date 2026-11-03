import { useId } from "react";
import { batPath, brandColors, describeBat, type BatSpec } from "@/lib/bat-drawing";

const K = 10; // drawing units per inch (the viewBox scales to any size)
const PAD = 3;

/**
 * A bat drawn to scale from real fields: length, barrel length, one or two piece (joint line) and end-loaded or
 * balanced (end cap weight). Paint colors come from the brand and are decorative only.
 * `size` is on-screen pixels per inch of bat (default 8). `fluid` makes it fill its container's width instead.
 */
/** The bat itself, in local coordinates (knob at x=0, centered on y=0, K units per inch). Shared by the drawing and the ruler. */
export function BatShape({ spec, detail = true }: { spec: BatSpec; detail?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { lengthIn: L, barrelIn: B } = spec;
  const colors = brandColors(spec.brand);
  const x = (i: number) => i * K;
  const r = (d: number) => (d / 2) * K;
  const cy = 0;
  const path = batPath(L, B, K, cy);
  const split = Math.min(0.9, Math.max(0.3, (L - B - 2) / L));
  const jointX = x(L - B - 7.5);
  return (
    <>
      <defs>
        <clipPath id={`c${uid}`}>
          <path d={path} />
        </clipPath>
        <linearGradient id={`g${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset={split} stopColor={colors[0]} />
          <stop offset={split + 0.005} stopColor={colors[1]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
        <linearGradient id={`h${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#g${uid})`} stroke="#0b0d10" strokeWidth={1.2} />
      <g clipPath={`url(#c${uid})`}>
        {detail && <rect x={x(1)} y={cy - r(1.05)} width={x(9.5)} height={r(2.1)} fill="#111" opacity={0.75} />}
        {detail && spec.twoPiece && <rect x={jointX} y={cy - r(1.25)} width={Math.max(2, K * 0.35)} height={r(2.5)} fill="#0b0d10" opacity={0.55} />}
        {detail && spec.load === "end" && <rect x={x(L - 1.1)} y={cy - r(2.25)} width={x(1.1)} height={r(4.5)} fill="#0b0d10" opacity={0.45} />}
        <rect x={0} y={cy - r(2.3)} width={x(L)} height={r(4.6)} fill={`url(#h${uid})`} />
      </g>
    </>
  );
}

/**
 * A bat drawn to scale from real fields: length, barrel length, one or two piece (joint line) and end-loaded or
 * balanced (end cap weight). Paint colors come from the brand and are decorative only.
 * `size` is on-screen pixels per inch of bat (default 8). `fluid` makes it fill its container's width instead.
 */
export function BatDrawing({
  spec,
  orientation = "horizontal",
  size = 8,
  fluid = false,
  decorative = false,
  label,
  className,
  detail = true,
}: {
  spec: BatSpec;
  orientation?: "horizontal" | "vertical";
  size?: number;
  fluid?: boolean;
  /** Hide from assistive tech when the bat's details are already in nearby text. */
  decorative?: boolean;
  label?: string;
  className?: string;
  /** Draw the grip, joint line and end cap. Turn off for tiny drawings. */
  detail?: boolean;
}) {
  const W = spec.lengthIn * K + PAD * 2;
  const H = (2.25 / 2) * K * 2 + PAD * 2;
  const vertical = orientation === "vertical";
  const vbW = vertical ? H : W;
  const vbH = vertical ? W : H;
  const px = (n: number) => Math.round((n / K) * size * 10) / 10;
  const a11y = decorative
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": label ?? describeBat(spec) } as const);
  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      width={fluid ? undefined : px(vbW)}
      height={fluid ? undefined : px(vbH)}
      style={fluid ? (vertical ? { height: "100%", width: "auto" } : { width: "100%", height: "auto" }) : undefined}
      className={className}
      focusable="false"
      {...a11y}
    >
      {vertical ? (
        <g transform={`translate(${H / 2} ${PAD}) rotate(90)`}>
          <BatShape spec={spec} detail={detail} />
        </g>
      ) : (
        <g transform={`translate(${PAD} ${H / 2})`}>
          <BatShape spec={spec} detail={detail} />
        </g>
      )}
    </svg>
  );
}

/** The listing hero: the bat laid on an inch ruler, with the barrel bracketed in tag yellow. For use on ink. */
export function BatOnRuler({ spec, className }: { spec: BatSpec; className?: string }) {
  const L = spec.lengthIn;
  const B = spec.barrelIn;
  const ox = 8;
  const batCy = 36;
  const rulerY = 62;
  const width = ox * 2 + L * K;
  const height = 86;
  const wholeInches = Math.floor(L);
  const ticks = [];
  for (let i = 0; i <= wholeInches; i++) {
    const X = ox + i * K;
    const major = i % 2 === 0;
    ticks.push(
      <g key={i}>
        <line x1={X} y1={rulerY} x2={X} y2={rulerY + (major ? 8 : 4.5)} stroke="#9fb0b8" strokeWidth={0.6} />
        {major && (
          <text x={X} y={rulerY + 16} fill="#9fb0b8" fontFamily="var(--font-data), monospace" fontSize={4.6} textAnchor="middle">
            {i}&quot;
          </text>
        )}
      </g>
    );
  }
  const bs = ox + (L - B) * K;
  const be = ox + L * K;
  const barrel = `${Number(B.toFixed(2))}"`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ width: "100%", maxWidth: 980, height: "auto", display: "block" }}
      role="img"
      aria-label={`${describeBat(spec)}, laid on an inch ruler from 0 to ${wholeInches} inches. The barrel is ${barrel} long.`}
      focusable="false"
    >
      <line x1={ox} y1={rulerY} x2={ox + L * K} y2={rulerY} stroke="#9fb0b8" strokeWidth={0.6} />
      {ticks}
      <g transform={`translate(${ox} ${batCy})`}>
        <BatShape spec={spec} />
      </g>
      <path d={`M${bs} 14 L${bs} 9 L${be} 9 L${be} 14`} fill="none" stroke="#ffd23f" strokeWidth={1} />
      <text x={(bs + be) / 2} y={6} fill="#ffd23f" fontFamily="var(--font-data), monospace" fontSize={5} textAnchor="middle">
        {barrel} barrel
      </text>
    </svg>
  );
}
