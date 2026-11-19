/** A plain white ball with its two seams: the "live session" icon. The brand mark is LogoMark. */
export function Softball({ size = 48, className = "", spin = false }: { size?: number; className?: string; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="var(--color-chalk)" />
      <g className={spin ? "origin-center animate-[spin_3s_linear_infinite]" : undefined} style={{ transformOrigin: "24px 24px" }}>
        <path d="M11 10c6.5 4.5 9.5 9 9.5 14s-3 9.5-9.5 14" fill="none" stroke="var(--color-night)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M37 10c-6.5 4.5-9.5 9-9.5 14s3 9.5 9.5 14" fill="none" stroke="var(--color-night)" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
