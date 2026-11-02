import Link from "next/link";
import type { SellerSummary } from "@/lib/listings";
import { sellerPath } from "@/lib/paths";

export function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function Avatar({ seller, size = 48 }: { seller: Pick<SellerSummary, "username" | "photoUrl" | "displayName">; size?: number }) {
  if (seller.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={seller.photoUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-ink font-semibold uppercase text-surface"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {(seller.displayName || seller.username).slice(0, 1)}
    </span>
  );
}

/** Rating as text, or an honest "No reviews yet". */
export function ratingText(s: Pick<SellerSummary, "averageRating" | "reviewCount">): string {
  if (!s.reviewCount || s.averageRating == null) return "No reviews yet";
  return `${s.averageRating.toFixed(1)} out of 5 (${s.reviewCount} ${s.reviewCount === 1 ? "review" : "reviews"})`;
}

/** Badges for the two separate kinds of trust: a seller's track record, and identity checked by Stripe. */
export function TrustBadges({ seller }: { seller: Pick<SellerSummary, "sellerVerified" | "identityVerified"> }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs font-semibold">
      <li className={`rounded-full border px-2.5 py-1 ${seller.sellerVerified ? "border-success/40 bg-success/10 text-success" : "border-line text-ink-soft"}`}>
        {seller.sellerVerified ? "Verified seller" : "Not a verified seller yet"}
      </li>
      <li className={`rounded-full border px-2.5 py-1 ${seller.identityVerified ? "border-success/40 bg-success/10 text-success" : "border-line text-ink-soft"}`}>
        {seller.identityVerified ? "Identity verified" : "Identity not verified"}
      </li>
    </ul>
  );
}

/** Seller summary on a listing page. */
export function SellerCard({ seller }: { seller: SellerSummary }) {
  return (
    <section aria-labelledby="seller-heading" className="card grid gap-3 p-4" data-testid="seller-card">
      <h2 id="seller-heading" className="eyebrow">
        Seller
      </h2>
      <div className="flex items-center gap-3">
        <Avatar seller={seller} />
        <div className="min-w-0">
          <Link href={sellerPath(seller.username)} className="font-semibold underline">
            {seller.displayName || seller.username}
          </Link>
          <p className="truncate text-sm text-ink-soft">@{seller.username}</p>
        </div>
      </div>
      <TrustBadges seller={seller} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-soft">Member since</dt>
        <dd>{memberSince(seller.memberSince)}</dd>
        <dt className="text-ink-soft">Completed sales</dt>
        <dd>{seller.completedSales}</dd>
        <dt className="text-ink-soft">Rating</dt>
        <dd>{ratingText(seller)}</dd>
      </dl>
    </section>
  );
}
