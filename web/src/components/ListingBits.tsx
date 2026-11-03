import type { CardExtra, ListingCard } from "@/lib/catalog";
import { conditionLabel } from "@/lib/format";

/** Stamps on the barrel, drawn as little ink stamps. Shows nothing when no stamp is known (never invents one). */
export function StampChips({ stamps, max = 3 }: { stamps: string[]; max?: number }) {
  if (!stamps.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label={`Stamps: ${stamps.join(", ")}`}>
      {stamps.slice(0, max).map((s) => (
        <span key={s} className="stamp-chip" aria-hidden="true">
          {s}
        </span>
      ))}
    </span>
  );
}

/** "34" / 26 oz", printing only what is really known. */
export function sizeText(extra: CardExtra | undefined): string | null {
  if (!extra) return null;
  const len = extra.bat?.lengthKnown ? `${Number(extra.bat.lengthIn.toFixed(2))}"` : null;
  const wt = extra.weightOz ? `${extra.weightOz} oz` : null;
  return [len, wt].filter(Boolean).join(" / ") || null;
}

export function conditionText(listing: Pick<ListingCard, "conditionScore">): string | null {
  const label = conditionLabel(listing.conditionScore);
  return label && listing.conditionScore ? `${listing.conditionScore}/10 ${label}` : null;
}

/** Four small diamonds, one filled per Bat Passport check that has data. */
export function PassportDiamonds({ filled }: { filled: number | null | undefined }) {
  if (filled == null) return <span className="text-ink-soft">n/a</span>;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${filled} of 4 Bat Passport checks have data`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} aria-hidden="true" className={`block h-2.5 w-2.5 rotate-45 border-[1.5px] border-ink ${i < filled ? "bg-ink" : "bg-transparent"}`} />
      ))}
    </span>
  );
}
