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
import type { PassportSource } from "@/lib/passport";
import { getPassport } from "@/lib/passport-data";
import { BatPassport } from "@/components/listing/BatPassport";
import { Disclosures } from "@/components/listing/Disclosures";
import { ListingActions } from "@/components/listing/ListingActions";
import { FavoriteButton } from "@/components/listing/FavoriteButton";
import { ReportListing } from "@/components/listing/ReportListing";
import { ViewTracker } from "@/components/listing/ViewTracker";
import { SellerCard } from "@/components/SellerCard";
import { BatOnRuler } from "@/components/BatDrawing";
import { LifeMeter } from "@/components/listing/LifeMeter";
import { ShieldIcon } from "@/components/icons";
import { StampChips } from "@/components/ListingBits";
import { batSpecFrom } from "@/lib/bat-drawing";
import { parseHits } from "@/lib/life-meter";
import { buildMrz } from "@/lib/mrz";
import { isCategoryVisible } from "@/lib/launch";
import { optionLabel } from "@/lib/sell/attributes";
import { EbayElsewhere } from "@/components/EbayElsewhere";
import { getBatById } from "@/lib/bats";
import { matchModelForBat } from "@/lib/catalog-match-data";
import { isEbayEnabled } from "@/lib/ebay/config";

/** Where each passport ident line comes from: the seller's listing, or the site's own completed-sales record. */
const ROW_SOURCES: Record<string, PassportSource> = {
  Model: "seller",
  Size: "seller",
  Build: "seller",
  Stamp: "seller",
  Seller: "verified",
  Condition: "seller",
};

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
    if (f.key === "approx_hits") continue; // shown on the life meter
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
  if (!listing || !(await isCategoryVisible(listing.category?.slug))) notFound();

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

  const isBat = listing.category?.slug === "bats";
  const attrs = listing.attributes;
  const bat = isBat ? batSpecFrom(attrs, listing.manufacturer?.name) : null;
  const hits = isBat ? parseHits(attrs.approx_hits) : null;
  const stamps = Array.isArray(attrs.certification) ? attrs.certification.map(String) : [];
  const modelYear = typeof attrs.model_year === "number" ? attrs.model_year : (listing.product?.modelYear ?? null);
  const place = location(listing);

  const ident =
    isBat && passport && bat
      ? {
          number: `GB-${listing.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
          rows: [
            { label: "Model", value: listing.product?.name ?? listing.title },
            { label: "Size", value: [bat.lengthKnown ? `${Number(bat.lengthIn.toFixed(2))}"` : null, attrs.weight_oz ? `${attrs.weight_oz} oz` : null, !bat.assumed ? `${Number(bat.barrelIn.toFixed(2))}" barrel` : null].filter(Boolean).join(" / ") || "Not listed" },
            { label: "Build", value: [attrs.construction_type ? optionLabel(String(attrs.construction_type)) : null, attrs.weighting_type ? (WEIGHTING_LABELS[String(attrs.weighting_type)] ?? null) : null].filter(Boolean).join(", ") || "Not listed" },
            { label: "Stamp", value: stamps.length ? stamps.join(" / ") : "Not listed" },
            { label: "Seller", value: seller ? `@${seller.username} · ${seller.completedSales} ${seller.completedSales === 1 ? "sale" : "sales"}` : "Not listed" },
            { label: "Condition", value: [condition ?? "Not rated", hits != null ? `about ${hits.toLocaleString("en-US")} hits` : null].filter(Boolean).join(", ") },
          ].map((r) => ({ ...r, source: ROW_SOURCES[r.label] })),
          mrz: buildMrz({
            brand: listing.manufacturer?.name,
            model: listing.product?.name ?? listing.title,
            listingId: listing.id.replace(/-/g, ""),
            modelYear,
            lengthIn: bat.lengthKnown ? bat.lengthIn : null,
            weightOz: bat.weightOz,
            twoPiece: attrs.construction_type === "two_piece" ? true : attrs.construction_type === "one_piece" ? false : null,
            load: attrs.weighting_type ? bat.load : null,
            stamps,
            hits,
          }),
        }
      : undefined;

  // Live eBay listings for this listing's catalog model, below everything of ours. Off unless eBay is configured.
  const catalogBat = isPublic && isBat && listing.product && isEbayEnabled() ? await getBatById(listing.product.id) : null;
  const ebayModel = catalogBat ? await matchModelForBat(catalogBat) : null;
  const priceCheckForCompare = passport?.checks.find((c) => c.key === "price");
  const stampCheckForCompare = passport?.checks.find((c) => c.key === "stamp");

  return (
    <div>
      {isPublic && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(listing) }} />}
      {listing.status === "active" && <ViewTracker listingId={listing.id} />}

      <div className="wrap pt-6">
        <nav aria-label="Breadcrumb" className="font-mono text-xs uppercase tracking-wider text-ink-soft">
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
          <p role="status" className="mt-4 border-2 border-warning bg-warning/10 px-3 py-2">
            Preview: this listing is {humanize(listing.status.replace("_", " ")).toLowerCase()}. Only you can see it.
          </p>
        )}
      </div>

      {bat ? (
        <section className="on-ink ink-band mt-4 py-8" aria-label="The bat, measured">
          <div className="wrap grid gap-5">
            <div className="grid gap-2">
              <p className="label text-[#9fb0b8]">
                {[modelYear, listing.manufacturer?.name, stamps.join(" / ") || null].filter(Boolean).join(" · ")}
                {listing.status === "sold" && <span className="ml-3 bg-stamp-red px-1.5 py-0.5 text-white">Sold</span>}
                {listing.status === "reserved" && <span className="ml-3 bg-surface px-1.5 py-0.5 text-ink">Reserved</span>}
              </p>
              <h1 className="disp break-words text-[clamp(1.6rem,5.4vw,3.4rem)] text-white">{listing.title}</h1>
              <p className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[0.8125rem] text-[#b9c4c9]">
                {bat.lengthKnown && <span>{Number(bat.lengthIn.toFixed(2))}&quot;{bat.weightOz ? ` / ${bat.weightOz} oz` : ""}</span>}
                {attrs.construction_type && attrs.construction_type !== "unknown" ? <span>{optionLabel(String(attrs.construction_type))}</span> : null}
                {!bat.assumed && <span>{Number(bat.barrelIn.toFixed(2))}&quot; barrel</span>}
                {attrs.weighting_type && attrs.weighting_type !== "unknown" ? <span>{WEIGHTING_LABELS[String(attrs.weighting_type)] ?? humanize(String(attrs.weighting_type))}</span> : null}
                {condition && <span>Condition {condition}</span>}
              </p>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <BatOnRuler spec={bat} />
              </div>
            </div>
            {bat.assumed && (
              <p className="max-w-[70ch] text-[0.8125rem] text-[#9fb0b8]">
                The seller didn&apos;t list {bat.lengthKnown ? "the barrel length" : "the length or barrel length"}, so the drawing uses a typical {bat.lengthKnown ? "" : "34 inch bat with a "}12.75 inch barrel. Colors are decorative.
              </p>
            )}
            <LifeMeter hits={hits} />
          </div>
        </section>
      ) : (
        <div className="wrap pt-4">
          {listing.status === "sold" && <p className="eyebrow text-danger">Sold</p>}
          {listing.status === "reserved" && <p className="eyebrow text-warning">Reserved</p>}
          <h1 className="display break-words text-4xl font-bold sm:text-5xl">{listing.title}</h1>
        </div>
      )}

      <div className="wrap grid gap-8 py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <aside className="grid min-w-0 content-start gap-5 lg:order-2" aria-label="Price and purchase">
          <div className="card grid gap-4 p-4 sm:p-5">
            <div className="grid gap-2">
              <p className="price-tag w-fit text-[clamp(2rem,8vw,2.75rem)] leading-tight" aria-label={`Price ${formatPrice(listing.askingPriceCents)}`}>
                {formatPrice(listing.askingPriceCents)}
              </p>
              <p className="text-ink-soft">
                {[condition ? `Condition ${condition}` : "Condition not rated", place || null].filter(Boolean).join(" · ")}
              </p>
              {listing.status === "active" && listing.acceptsOffers && <p className="text-sm text-ink-soft">The seller accepts offers.</p>}
              {bat && stamps.length > 0 && <StampChips stamps={stamps} max={4} />}
            </div>
            <ListingActions
              listingId={listing.id}
              status={listing.status}
              priceCents={listing.askingPriceCents}
              acceptsOffers={listing.acceptsOffers}
              isOwner={isOwner}
            />
            <p className="flex items-start gap-2 border-t-2 border-dashed border-steel pt-3 text-sm font-semibold">
              <ShieldIcon size={20} className="mt-0.5 shrink-0 text-stamp-green" />
              <span>
                Payment held until it&apos;s in your hands.
                <span className="block font-normal text-ink-soft">The seller is paid after the bat arrives as described.</span>
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!isOwner && <FavoriteButton listingId={listing.id} signedIn={Boolean(user)} saved={saved} next={listingPath(listing.id)} />}
              {modelHref && (
                <Link href={modelHref} className="text-sm font-semibold underline">
                  About the {listing.product!.name}
                </Link>
              )}
            </div>
          </div>

          <Disclosures listing={listing} />

          {seller && <SellerCard seller={seller} />}
        </aside>

        <div className="grid min-w-0 content-start gap-8 lg:order-1">
          <Gallery images={listing.images} title={listing.title} />
          {listing.description && (
            <section className="grid gap-2">
              <h2 className="display text-2xl font-bold">From the seller</h2>
              <p className="max-w-prose whitespace-pre-line break-words">{listing.description}</p>
            </section>
          )}
          {specs.length > 0 && (
            <section className="grid gap-2">
              <h2 className="display text-2xl font-bold">Specs</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-0 text-sm" data-testid="listing-specs">
                {specs.map((r) => (
                  <div key={r.label} className="contents">
                    <dt className="border-b border-dashed border-steel py-1.5 text-ink-soft">{r.label}</dt>
                    <dd className="border-b border-dashed border-steel py-1.5 font-mono break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-ink-soft">Specs are entered by the seller. Check the markings photo to confirm stamps and model year.</p>
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
          {user && !isOwner && isPublic && <ReportListing listingId={listing.id} />}
          {!user && isPublic && (
            <Link href={`/sign-in?next=${encodeURIComponent(listingPath(listing.id))}`} className="text-sm text-ink-soft underline">
              Sign in to report this listing
            </Link>
          )}
        </div>
      </div>

      {passport && (
        <section className="concrete-band border-t-2 border-ink py-10" aria-label="Bat Passport">
          <div className="wrap grid gap-4">
            <div className="grid gap-1">
              <p className="eyebrow">Trust</p>
              <p className="disp text-2xl sm:text-3xl">Stamped</p>
            </div>
            <BatPassport {...passport} ident={ident} />
          </div>
        </section>
      )}

      {ebayModel && (
        <div className="wrap pb-10 pt-8">
          <EbayElsewhere
            model={ebayModel}
            headingId="ebay-heading"
            compare={
              stampCheckForCompare && priceCheckForCompare
                ? { stamp: stampCheckForCompare, price: priceCheckForCompare, modelHref: modelHref ?? undefined }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
