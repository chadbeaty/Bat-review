// The AGED TAKES wordmark: "AGED" set in ink, "TAKES" set inside a slightly rotated red rubber stamp —
// the archive marking a claim as filed and dated.

export function Wordmark({ size = "md", className = "" }: { size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const scale = { sm: "text-lg", md: "text-2xl", lg: "text-5xl", xl: "text-[2.85rem] sm:text-7xl lg:text-8xl" }[size];
  return (
    <span className={`inline-flex items-center gap-[0.18em] font-[family-name:var(--font-display)] font-black leading-none tracking-[-0.02em] ${scale} ${className}`}>
      <span>AGED</span>
      <span className="relative inline-block -rotate-2 border-[0.075em] border-red px-[0.12em] pb-[0.04em] pt-[0.06em] text-red">TAKES</span>
    </span>
  );
}

/** Square monogram used for the favicon and compact spaces. */
export function Monogram({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Aged Takes">
      <rect width="64" height="64" fill="#f5f0e6" />
      <g transform="rotate(-4 32 32)">
        <rect x="7" y="9" width="50" height="46" fill="none" stroke="#b0261a" strokeWidth="5" />
        <text x="32" y="44" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="900" fontSize="30" fill="#b0261a" letterSpacing="-1">AT</text>
      </g>
    </svg>
  );
}
