import type { PassportSource } from "@/lib/passport";
import { SOURCE_LABELS } from "@/lib/passport";

const STYLES: Record<PassportSource, string> = {
  verified: "border-visa bg-visa text-white",
  seller: "border-ink bg-ink text-surface",
  owners: "border-steel bg-surface text-ink-soft",
};

/** A small tag saying where a passport line comes from: VERIFIED (violet), SELLER SAYS (ink) or OWNERS REPORT (steel). */
export function SourceLabel({ source, className = "" }: { source: PassportSource; className?: string }) {
  return (
    <span
      className={`label inline-block shrink-0 border-[1.5px] px-1.5 py-0.5 !text-[0.5625rem] leading-none ${STYLES[source]} ${className}`}
      data-source={source}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
