/** A gold ball with its two seams. The "live session" icon; the brand mark is LogoMark. */
export function Softball({ size = 48, className = "", spin = false }: { size?: number; className?: string; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sb-g" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f6e4ad" />
          <stop offset="0.45" stopColor="#d7b46a" />
          <stop offset="1" stopColor="#94692f" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="url(#sb-g)" />
      <g className={spin ? "origin-center animate-[spin_3s_linear_infinite]" : undefined} style={{ transformOrigin: "24px 24px" }}>
        <path d="M11 10c6.5 4.5 9.5 9 9.5 14s-3 9.5-9.5 14" fill="none" stroke="#14110a" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M37 10c-6.5 4.5-9.5 9-9.5 14s3 9.5 9.5 14" fill="none" stroke="#14110a" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}
