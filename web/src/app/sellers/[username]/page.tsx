import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { Avatar, memberSince, ratingText, TrustBadges } from "@/components/SellerCard";
import { getReviewsOf, getSellerByUsername, searchListings } from "@/lib/listings";
import { sellerPath } from "@/lib/paths";
import { parseSearchParams } from "@/lib/search";

export async function generateMetadata({ params }: PageProps<"/sellers/[username]">): Promise<Metadata> {
  const { username } = await params;
  const seller = await getSellerByUsername(decodeURIComponent(username));
  if (!seller) return { title: "Seller not found", robots: { index: false } };
  const name = seller.displayName || seller.username;
  return {
    title: `${name} (@${seller.username})`,
    description: `${name} on the marketplace: ${seller.completedSales} completed ${seller.completedSales === 1 ? "sale" : "sales"}, ${ratingText(seller).toLowerCase()}, ${seller.activeListings} active ${seller.activeListings === 1 ? "listing" : "listings"}.`,
    alternates: { canonical: sellerPath(seller.username) },
  };
}

export default async function SellerPage({ params }: PageProps<"/sellers/[username]">) {
  const { username } = await params;
  const seller = await getSellerByUsername(decodeURIComponent(username));
  if (!seller) notFound();

  const [listings, reviews] = await Promise.all([
    searchListings(parseSearchParams({}), { sellerId: seller.id, pageSize: 48 }),
    getReviewsOf(seller.id, 10),
  ]);
  const name = seller.displayName || seller.username;

  return (
    <div className="wrap grid gap-10 py-10">
      <header className="grid gap-5 md:grid-cols-[auto_1fr] md:items-center">
        <Avatar seller={seller} size={96} />
        <div className="grid min-w-0 gap-2">
          <p className="eyebrow">Seller</p>
          <h1 className="display text-5xl font-bold break-words">{name}</h1>
          <p className="text-ink-soft">
            @{seller.username} · Member since {memberSince(seller.memberSince)}
            {seller.city || seller.state ? ` · ${[seller.city, seller.state].filter(Boolean).join(", ")}` : ""}
          </p>
          <TrustBadges seller={seller} />
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4" data-testid="seller-stats">
        <Stat label="Completed sales" value={String(seller.completedSales)} />
        <Stat label="Completed purchases" value={String(seller.completedPurchases)} />
        <Stat label="Average rating" value={seller.reviewCount && seller.averageRating != null ? `${seller.averageRating.toFixed(1)} / 5` : "None yet"} />
        <Stat label="Reviews" value={String(seller.reviewCount)} />
      </dl>

      {seller.bio && <p className="max-w-prose whitespace-pre-line break-words">{seller.bio}</p>}

      <section aria-labelledby="listings-heading" className="grid gap-4">
        <h2 id="listings-heading" className="display text-3xl font-bold">
          For sale{listings.total ? ` (${listings.total})` : ""}
        </h2>
        {listings.listings.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {listings.listings.map((l) => (
              <li key={l.id} className="grid">
                <ListingCard listing={l} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing for sale right now" body={`${name} has no active listings.`} action={{ href: "/shop", label: "Shop all equipment" }} />
        )}
      </section>

      <section aria-labelledby="reviews-heading" className="grid gap-4">
        <h2 id="reviews-heading" className="display text-3xl font-bold">
          Reviews
        </h2>
        {reviews.length ? (
          <ul className="grid gap-3">
            {reviews.map((r) => (
              <li key={r.id} className="card grid gap-2 p-4">
                <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <span className="font-semibold" aria-label={`${r.rating} out of 5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-line-strong">{"★".repeat(5 - r.rating)}</span>
                  </span>
                  <span className="text-ink-soft">
                    From a {r.role}
                    {r.reviewer ? ` (@${r.reviewer})` : ""} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
                  </span>
                </p>
                {r.text && <p className="whitespace-pre-line break-words">{r.text}</p>}
                {r.response && (
                  <p className="border-l-2 border-line-strong pl-3 text-sm text-ink-soft">
                    <span className="font-semibold text-ink">Response from {name}:</span> {r.response}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No reviews yet" body="Reviews appear here after completed orders. Only the buyer and seller of an order can review each other." />
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 bg-surface p-4">
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-mono text-2xl">{value}</dd>
    </div>
  );
}
