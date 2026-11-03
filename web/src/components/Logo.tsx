import { brand } from "@/config/brand";

// The Gamer Bat mark: a bat crossing a round passport-style stamp ring. Same drawing as src/app/icon.svg (the favicon).
const BAT_MARK_PATH = "M0 -1.58 L1.26 -1.58 Q2.1 -1.58 2.1 -1 L28.88 -1.05 C37.27 -1.1 40.43 -2.36 44.63 -2.36 L70.56 -2.36 Q71.4 -2.36 71.4 0 Q71.4 2.36 70.56 2.36 L44.63 2.36 C40.43 2.36 37.27 1.1 28.88 1.05 L2.1 1 Q2.1 1.58 1.26 1.58 L0 1.58 Z";

export function LogoMark({ size = 36, title, className }: { size?: number; title?: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <circle cx="32" cy="32" r="29.5" fill="#f7f5ef" stroke="#4b2fa0" strokeWidth="3" />
      <circle cx="32" cy="32" r="23.5" fill="none" stroke="#4b2fa0" strokeWidth="1.2" strokeDasharray="2.2 2.2" />
      <g transform="translate(32 32) rotate(-45) translate(-35.7 0)">
        <path d={BAT_MARK_PATH} fill="#121820" stroke="#121820" strokeWidth=".6" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** "GAMER BAT" in wide italic with BAT outlined, and a tapering bat-shaped rule underneath. Sized by font-size. */
export function LogoWordmark({ className = "", rule = true }: { className?: string; rule?: boolean }) {
  const [first, second] = brand.wordmark;
  return (
    <span className={`disp relative inline-block whitespace-nowrap leading-none ${className}`} aria-label={brand.name}>
      <span aria-hidden="true">
        {first.toUpperCase()} <span className="logo-outline">{second.toUpperCase()}</span>
      </span>
      {rule && (
        <svg viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="mt-[0.12em] block h-[0.14em] min-h-[3px] w-full">
          <path d="M0 7 L6 2 L8 4 L120 5.5 L190 3 L398 2.5 Q400 7 398 11.5 L190 11 L120 8.5 L8 10 L6 12 Z" fill="currentColor" />
        </svg>
      )}
    </span>
  );
}
