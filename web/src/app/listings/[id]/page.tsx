import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/env";
import { conditionLabel, formatPrice, WEIGHTING_LABELS } from "@/lib/format";
import { getListing, getSellerById, isFavorite, type ListingDetail } from "@/lib/listings";
import { batModelPath, listingPath } from "@/lib/paths";
import { humanize } from "@/lib/search";
import { getCurrentUser } from "@/lib/supabase/server";
import { Gallery } from "@/components/listing/Gallery";
import { getPassport } from "@/lib/passport-data";
import { BatPassport } from "@/components/listing/BatPassport";
import { Disclosures } from "@/components/listing/Disclosures";
import { ListingActions } from "@/components/listing/ListingActions";
import { FavoriteButton } from "@/components/listing/FavoriteButton";
import { ReportListing } from "@/components/listing/ReportListing";
import { ViewTracker } from "@/components/listing/ViewTracker";
import { SellerCard } from "@/components/SellerCard";

const PUBLIC_STATUSES = ["active", "reserved", "sold"];

function location(l: Pick<ListingDetail, "locationCity" | "locationState">) {
  return [l.locationCity, l.locationState].filter(Boolean).join(", ");
}

function conditionText(score: number | null) {
  return score == null ? null : `${score}/10 ${conditionLabel(score)}`;
}

export async function generateMetadata({ params }: PageProps<"/listings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) return { title: "Listing not found", robots: { index: false } };
  const statusNote = listing.status === "sold" ? "Sold" : listing.status === "reserved" ? "Reserved" : formatPrice(listing.askingPriceCents);
  const description = [
    `Used ${listing.title}, ${statusNote}.`,
    conditionText(listing.conditionScore) ? `Condition ${conditionText(listing.conditionScore)}.` : null,
    listing.structuralDisclosure === "no_known_damage" ? "No known structural damage." : listing.structuralDisclosure === "damage_disclosed" ? "Damage disclosed." : null,
    location(listing) ? `Ships from ${location(listing)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const image = listing.images[0];
  return {
    title: `${listing.title} · ${statusNote}`,
    description,
    alternates: { canonical: listingPath(listing.id) },
    robots: PUBLIC_STATUSES.includes(listing.status) ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      title: listing.title,
      description,
      url: listingPath(listing.id),
      images: image ? [{ url: image.url, alt: image.alt ?? listing.title }] : undefined,
    },
  };
}

function specRows(listing: ListingDetail): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const fields = listing.category?.fields ?? [];
  for (const f of fields) {
    const raw = listing.attributes[f.key];
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) continue;
    let value: string;
    if (Array.isArray(raw)) value = raw.map(String).join(", ");
    else if (f.key === "weighting_type") value = WEIGHTING_LABELS[String(raw)] ?? humanize(String(raw));
    else if (f.key === "weight_oz") value = `${raw} oz`;
    else if (/_inches$/.test(f.key)) value = `${raw} in`;
    else value = typeof raw === "string" ? humanize(raw) : String(raw);
    rows.push({ label: f.label, value });
  }
  if (listing.manufacturer) rows.unshift({ label: "Brand", value: listing.manufacturer.name });
  return rows;
}

function jsonLd(listing: ListingDetail) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description ?? undefined,
    image: listing.images.map((i) => i.url),
    sku: listing.id,
    url: `${siteUrl}${listingPath(listing.id)}`,
    itemCondition: "https://schema.org/UsedCondition",
    brand: listing.manufacturer ? { "@type": "Brand", name: listing.manufacturer.name } : undefined,
    category: listing.category?.name,
  };
  if (listing.status === "active") {
    data.offers = {
      "@type": "Offer",
      price: (listing.askingPriceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: `${siteUrl}${listingPath(listing.id)}`,
    };
  }
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export default async function ListingPage({ params }: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  const [user, seller, passport] = await Promise.all([getCurrentUser(), getSellerById(listing.sellerId), getPassport(listing)]);
  const isOwner = user?.id === listing.sellerId;
  const saved = user ? await isFavorite(user.id, listing.id) : false;
  const isPublic = PUBLIC_STATUSES.includes(listing.status);
  const condition = conditionText(listing.conditionScore);
  const specs = specRows(listing);
  const modelHref =
    listing.product && listing.product.manufacturerSlug && listing.category?.slug === "bats"
      ? batModelPath({ manufacturerSlug: listing.product.manufacturerSlug, productSlug: listing.product.slug, modelYear: listing.product.modelYear })
      : null;
  const categoryHref = listing.category ? (listing.category.slug === "bats" ? "/bats" : `/shop/${listing.category.slug}`) : "/shop";

  return (
    <div className="wrap grid gap-8 py-8">
      {isPublic && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(listing) }} />}
      {listing.status === "active" && <ViewTracker listingId={listing.id} />}

      <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
        <ol className="flex flex-wrap gap-1">
          <li>
            <Link href="/shop" className="hover:underline">
              Shop
            </Link>{" "}
            /
          </li>
          {listing.category && (
            <li>
              <Link href={categoryHref} className="hover:underline">
                {listing.category.name}
              </Link>
            </li>
          )}
        </ol>
      </nav>

      {!isPublic && isOwner && (
        <p role="status" className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2">
          Preview: this listing is {humanize(listing.status.replace("_", " ")).toLowerCase()}. Only you can see it.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          <Gallery images={listing.images} title={listing.title} />
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <div className="grid gap-2">
            {listing.status === "sold" && <p className="eyebrow text-danger">Sold</p>}
            {listing.status === "reserved" && <p className="eyebrow text-warning">Reserved</p>}
            <h1 className="display text-4xl font-bold break-words sm:text-5xl">{listing.title}</h1>
            <p className="font-mono text-3xl">{formatPrice(listing.askingPriceCents)}</p>
            <p className="text-ink-soft">
              {[condition ? `Condition ${condition}` : "Condition not rated", location(listing) || null].filter(Boolean).join(" · ")}
            </p>
            {listing.status === "active" && listing.acceptsOffers && <p className="text-sm text-ink-soft">The seller accepts offers.</p>}
          </div>

          {passport && <BatPassport {...passport} />}

          <Disclosures listing={listing} />

          <ListingActions
            listingId={listing.id}
            status={listing.status}
            priceCents={listing.askingPriceCents}
            acceptsOffers={listing.acceptsOffers}
            isOwner={isOwner}
          />

          <div className="flex flex-wrap items-center gap-3">
            {!isOwner && <FavoriteButton listingId={listing.id} signedIn={Boolean(user)} saved={saved} next={listingPath(listing.id)} />}
            {modelHref && (
              <Link href={modelHref} className="text-sm font-semibold underline">
                About the {listing.product!.name}
              </Link>
            )}
          </div>

          {seller && <SellerCard seller={seller} />}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-6">
          {listing.description && (
            <section className="grid gap-2">
              <h2 className="display text-2xl font-bold">From the seller</h2>
              <p className="max-w-prose whitespace-pre-line break-words">{listing.description}</p>
            </section>
          )}
          <section className="grid gap-2">
            <h2 className="display text-2xl font-bold">Seller declarations</h2>
            <ul className="grid gap-1 text-sm">
              <li>{listing.ownershipDeclaration ? "✓ The seller states they own this item and can sell it." : "The seller hasn't confirmed ownership."}</li>
              <li>
                {listing.authenticityDeclaration
                  ? "✓ The seller states this item is authentic and not counterfeit."
                  : "The seller hasn't confirmed authenticity."}
              </li>
            </ul>
          </section>
        </div>
        <div className="grid min-w-0 content-start gap-6">
          {specs.length > 0 && (
            <section className="grid gap-2">
              <h2 className="display text-2xl font-bold">Specs</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm" data-testid="listing-specs">
                {specs.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="text-ink-soft">{r.label}</dt>
                    <dd className="break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-ink-soft">Specs are entered by the seller. Check the markings photo to confirm stamps and model year.</p>
            </section>
          )}
          {user && !isOwner && isPublic && <ReportListing listingId={listing.id} />}
          {!user && isPublic && (
            <Link href={`/sign-in?next=${encodeURIComponent(listingPath(listing.id))}`} className="text-sm text-ink-soft underline">
              Sign in to report this listing
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
