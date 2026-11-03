import Link from "next/link";
import type { ListingCard as Listing } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { BatDrawing } from "./BatDrawing";
import { CategoryIcon } from "./icons";
import { FavoriteButton } from "@/components/listing/FavoriteButton";
import { PassportBadge, StampChips, StatusBadge, cardStatus, sizeText } from "./ListingBits";

export type CardFavorite = { signedIn: boolean; saved: boolean; next: string };

/**
 * The marketplace card: real first photo (or the bat drawn on grid paper), a yellow price tag, brand, model, size,
 * stamps, the seller's condition score, city and state, one status, a Passport x/4 badge and a Save button.
 * The title is the link (stretched over the card); the Save button sits above it.
 */
export function ListingCard({ listing, favorite }: { listing: Listing; favorite?: CardFavorite }) {
  const extra = listing.extra;
  const bat = extra?.bat ?? null;
  const size = sizeText(extra);
  const place = [listing.locationCity, listing.locationState].filter(Boolean).join(", ");
  const status = cardStatus(listing);
  return (
    <article className="card group relative grid grid-rows-[auto_1fr] overflow-hidden transition-shadow focus-within:shadow-[4px_4px_0_var(--brand-ink)] hover:shadow-[4px_4px_0_var(--brand-ink)]" data-testid="listing-card">
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
        <span className="absolute left-2 top-2">
          <StatusBadge status={status} />
        </span>
        <span className="absolute bottom-2 left-2">
          <PassportBadge filled={extra?.passportFilled} />
        </span>
        <span className="price-tag absolute bottom-2 right-0 text-[1rem] sm:text-[1.05rem]">{formatPrice(listing.askingPriceCents)}</span>
      </div>
      <div className="grid content-start gap-1.5 p-2.5 sm:p-3">
        {extra?.brand && <p className="label !text-[0.625rem] text-ink-soft">{extra.brand}</p>}
        <h3 className="disp-c line-clamp-2 text-[1.05rem] sm:text-[1.2rem]">
          <Link href={listingPath(listing.id)} className="no-underline after:absolute after:inset-0 after:content-[''] group-hover:underline">
            {listing.title}
          </Link>
        </h3>
        {size && <p className="font-mono text-xs">{size}</p>}
        <StampChips stamps={extra?.stamps ?? []} max={2} />
        <p className="flex flex-wrap gap-x-2 text-[0.8125rem] text-ink-soft">
          {listing.conditionScore != null && <span className="font-mono font-semibold text-ink">{listing.conditionScore}/10</span>}
          {place && <span>{place}</span>}
        </p>
      </div>
      {favorite && (
        <div className="absolute right-0 top-0 z-10">
          <FavoriteButton listingId={listing.id} signedIn={favorite.signedIn} saved={favorite.saved} next={favorite.next} icon />
        </div>
      )}
    </article>
  );
}
