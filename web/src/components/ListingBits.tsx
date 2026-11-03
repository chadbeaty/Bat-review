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

export type CardStatus = { label: string; tone: "new" | "offers" | "reserved" | "sold" };

const NEW_WINDOW_MS = 72 * 60 * 60 * 1000;

/** The one status a card shows: Sold and Reserved win, then Just listed (under 72 hours old), then Offers. */
export function cardStatus(
  listing: Pick<ListingCard, "publishedAt" | "acceptsOffers" | "status">,
  now: number = Date.now()
): CardStatus | null {
  if (listing.status === "sold") return { label: "Sold", tone: "sold" };
  if (listing.status === "reserved") return { label: "Reserved", tone: "reserved" };
  const published = listing.publishedAt ? Date.parse(listing.publishedAt) : NaN;
  if (Number.isFinite(published) && now - published >= 0 && now - published < NEW_WINDOW_MS) return { label: "Just listed", tone: "new" };
  if (listing.acceptsOffers) return { label: "Offers", tone: "offers" };
  return null;
}

const TONES: Record<CardStatus["tone"], string> = {
  new: "bg-ink text-surface",
  offers: "bg-surface text-ink",
  reserved: "bg-surface text-ink",
  sold: "bg-stamp-red text-white",
};

export function StatusBadge({ status }: { status: CardStatus | null }) {
  if (!status) return null;
  return <span className={`label !text-[0.625rem] border-[1.5px] border-ink px-1.5 py-1 leading-none ${TONES[status.tone]}`}>{status.label}</span>;
}

/** "2/4 stamped": how many Bat Passport checks have data. */
export function PassportBadge({ filled }: { filled: number | null | undefined }) {
  if (filled == null) return null;
  return (
    <span
      className="inline-flex items-center gap-1 border-[1.5px] border-visa bg-surface px-1.5 py-1 font-mono text-[0.6875rem] font-bold leading-none text-visa"
      role="img"
      aria-label={`Bat Passport: ${filled} of 4 checks stamped`}
      title="Bat Passport checks with data"
    >
      <span aria-hidden="true" className="block h-2 w-2 rotate-45 border-[1.5px] border-visa bg-visa" />
      <span aria-hidden="true">{filled}/4</span>
    </span>
  );
}
