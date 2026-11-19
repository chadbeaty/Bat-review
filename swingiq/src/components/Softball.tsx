/** An optic-yellow slow-pitch ball with red stitching. Used as the Live button and the score marker. */
export function Softball({ size = 48, className = "", spin = false }: { size?: number; className?: string; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#e4f542" />
      <g className={spin ? "origin-center animate-[spin_3s_linear_infinite]" : undefined} style={{ transformOrigin: "24px 24px" }}>
        <path d="M10 9c7 5 10 10 10 15s-3 10-10 15" fill="none" stroke="#e5483a" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.6 2.4" />
        <path d="M38 9c-7 5-10 10-10 15s3 10 10 15" fill="none" stroke="#e5483a" strokeWidth="2" strokeLinecap="round" strokeDasharray="2.6 2.4" />
      </g>
    </svg>
  );
}
