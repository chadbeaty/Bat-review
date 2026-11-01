import Link from "next/link";
import type { ListingCard as Listing } from "@/lib/catalog";
import { conditionLabel, formatPrice } from "@/lib/format";

export function ListingCard({ listing }: { listing: Listing }) {
  const condition = conditionLabel(listing.conditionScore);
  return (
    <Link href={`/listings/${listing.id}`} className="card group grid overflow-hidden no-underline">
      <div className="aspect-[4/3] bg-paper">
        {listing.imageUrl ? (
          // Listing photos come from Supabase Storage; next/image remote patterns are configured per environment.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.imageUrl} alt={listing.imageAlt ?? listing.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-ink-soft">No photo</div>
        )}
      </div>
      <div className="grid gap-1 p-3">
        <p className="line-clamp-2 font-semibold text-ink group-hover:underline">{listing.title}</p>
        <p className="font-mono text-lg">{formatPrice(listing.askingPriceCents)}</p>
        <p className="text-sm text-ink-soft">
          {[condition && listing.conditionScore ? `${listing.conditionScore}/10 ${condition}` : null, [listing.locationCity, listing.locationState].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
