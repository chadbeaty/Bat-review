import Link from "next/link";
import type { ListingCard as Listing } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { BatDrawing } from "./BatDrawing";
import { CategoryIcon } from "./icons";
import { StampChips, conditionText, sizeText } from "./ListingBits";

/** A listing card: the photo (or the bat drawn on grid paper), a hang-tag price, the model, stamps and size. */
export function ListingCard({ listing }: { listing: Listing }) {
  const extra = listing.extra;
  const bat = extra?.bat ?? null;
  const size = sizeText(extra);
  const place = [listing.locationCity, listing.locationState].filter(Boolean).join(", ");
  return (
    <Link href={listingPath(listing.id)} className="card group relative grid grid-rows-[auto_1fr] overflow-hidden no-underline transition-shadow hover:shadow-[4px_4px_0_var(--brand-ink)]">
      <div className="relative aspect-[4/3] border-b-[1.5px] border-ink bg-surface">
        {listing.imageUrl ? (
          // Listing photos come from Supabase Storage; next/image remote patterns are configured per environment.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrl} alt={listing.imageAlt ?? listing.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid-paper grid h-full place-items-center overflow-hidden px-[8%]" role="img" aria-label="No photo yet. The picture is a drawing based on the listing's specs.">
            {bat ? (
              <div className="w-full" style={{ transform: "rotate(-14deg) scale(.96)" }}>
                <BatDrawing spec={bat} fluid decorative />
              </div>
            ) : (
              <CategoryIcon slug={extra?.categorySlug} size={64} className="text-ink-soft" />
            )}
          </div>
        )}
        <span className="price-tag absolute bottom-2 right-0 text-[1.05rem]">{formatPrice(listing.askingPriceCents)}</span>
      </div>
      <div className="grid content-start gap-2 p-3">
        {extra?.brand && <p className="label !text-[0.625rem] text-ink-soft">{extra.brand}</p>}
        <p className="disp-c line-clamp-2 text-[1.2rem] group-hover:underline">{listing.title}</p>
        <StampChips stamps={extra?.stamps ?? []} />
        {(size || bat) && (
          <div className="flex items-center gap-2.5">
            {listing.imageUrl && bat && (
              <span className="w-[4.5rem] shrink-0">
                <BatDrawing spec={bat} fluid decorative detail={false} />
              </span>
            )}
            {size && <span className="font-mono text-xs">{size}</span>}
          </div>
        )}
        <p className="text-sm text-ink-soft">{[conditionText(listing), place].filter(Boolean).join(" · ")}</p>
      </div>
    </Link>
  );
}
