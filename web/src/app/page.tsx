import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { EmptyFence, Rack } from "@/components/shop/Rack";
import { NewsletterForm } from "@/components/NewsletterForm";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { getHomepagePartners, getListings, getMostListedProductIds, getRecentlySold } from "@/lib/catalog";
import { getFacets, getSavedIds } from "@/lib/listings";
import { getAllBats, type BatSummary } from "@/lib/bats";
import { getCurrentUser } from "@/lib/supabase/server";
import { WEIGHTING_LABELS } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { SourceLabel } from "@/components/listing/SourceLabel";
import { ArrowIcon } from "@/components/icons";
import { EbayHomeStrip } from "@/components/EbayHomeStrip";

export default async function HomePage() {
  const [user, listings, rackBats, sold, facets, partners, allBats, mostListed] = await Promise.all([
    getCurrentUser(),
    getListings({ category: "bats", limit: 8 }),
    getListings({ category: "bats", limit: 12 }),
    getRecentlySold(4),
    getFacets("bats"),
    getHomepagePartners(),
    getAllBats().catch(() => [] as BatSummary[]),
    getMostListedProductIds(8),
  ]);
  const saved = await getSavedIds(user?.id, listings.map((l) => l.id));
  const certCount = (v: string) => facets.certification?.find((f) => f.value === v)?.listings ?? 0;

  // Popular models only from real data (active listing counts); otherwise honestly the newest catalog models.
  const byId = new Map(allBats.map((b) => [b.id, b]));
  const popular = mostListed.map((m) => ({ bat: byId.get(m.productId), listings: m.listings })).filter((m): m is { bat: BatSummary; listings: number } => Boolean(m.bat));
  const hasPopular = popular.length >= 3 && popular[0].listings >= 2;
  const newest = [...allBats].sort((a, b) => (b.modelYear ?? 0) - (a.modelYear ?? 0) || a.productName.localeCompare(b.productName));
  const seen = new Set<string>();
  const varied = [...newest.filter((b) => !seen.has(b.manufacturerSlug) && seen.add(b.manufacturerSlug)), ...newest.filter((b) => !seen.has(b.id))];
  const models = hasPopular ? popular.slice(0, 8) : varied.slice(0, 8).map((bat) => ({ bat, listings: 0 }));

  const CERTS = [
    { label: "USSSA", sub: "USSSA stamp", href: "/bats?stamp=USSSA", n: certCount("USSSA") },
    { label: "USA / ASA", sub: "USA Softball stamp", href: "/bats?stamp=USA", n: certCount("USA") },
    { label: "Senior", sub: "Senior SSUSA stamp", href: "/bats?stamp=SSUSA", n: certCount("SSUSA") },
    { label: "Dual-stamp", sub: "Two or more stamps", href: "/bats?dual=1", n: 0 },
  ];

  return (
    <>
      <SiteJsonLd />

      {/* 2. Hero: short, still loud */}
      <section className="border-b-2 border-ink">
        <div className="wrap grid gap-3 py-6 sm:py-10 lg:grid-cols-[1.6fr_1fr] lg:items-end lg:gap-10">
          <div className="grid gap-3">
            <h1 className="disp text-[clamp(2.4rem,11.5vw,5.25rem)] leading-[0.95]">
              Know your <span className="logo-outline">bat.</span>
            </h1>
            <p className="font-mono text-[0.8125rem] font-semibold uppercase tracking-wider sm:text-sm">Know the stamp. Know the condition. Know the price.</p>
          </div>
          <div className="grid gap-4">
            <p className="max-w-md text-ink-soft">Every used slow-pitch bat here is drawn to its real specs and comes with a Bat Passport that shows where each fact came from.</p>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <Link href="/bats" className="btn btn-primary min-h-12 px-5">
                Shop bats
              </Link>
              <Link href="/sell" className="btn btn-outline min-h-12 px-5">
                Sell your bat
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Shop by certification */}
      <Section title="Shop by certification" link={{ href: "/bats", label: "All bats" }}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {CERTS.map((c) => (
            <li key={c.label}>
              <Link href={c.href} className="card grid h-full min-h-24 content-between gap-2 p-3 no-underline hover:bg-ink hover:text-surface sm:p-4">
                <span className="stamp-chip w-fit">{c.label}</span>
                <span className="text-sm">
                  {c.sub}
                  {c.n > 0 && <span className="block font-mono text-xs text-ink-soft">{c.n} listed now</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {listings.length > 0 ? (
        <>
          {/* 4. Just listed */}
          <Section title="Just listed" link={{ href: "/bats", label: "See all bats" }} tight>
            <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>li:nth-child(n+7)]:hidden lg:[&>li:nth-child(n+7)]:grid" data-testid="just-listed">
              {listings.map((l) => (
                <li key={l.id} className="grid">
                  <ListingCard listing={l} favorite={{ signedIn: Boolean(user), saved: saved.has(l.id), next: "/" }} />
                </li>
              ))}
            </ul>
          </Section>

          {/* 5. The Rack */}
          <section aria-labelledby="rack-heading" className="mt-2">
            <div className="wrap flex flex-wrap items-end justify-between gap-2 pb-3 pt-6">
              <div className="grid gap-1">
                <p className="eyebrow">Hanging now</p>
                <h2 id="rack-heading" className="disp text-2xl sm:text-4xl">
                  The Rack
                </h2>
              </div>
              <Link href="/bats?view=rack" className="inline-flex min-h-11 items-center font-semibold underline">
                Walk the whole fence
              </Link>
            </div>
            <Rack listings={rackBats} wrap={false} />
          </section>
        </>
      ) : (
        <section aria-labelledby="rack-heading" className="mt-6">
          <h2 id="rack-heading" className="sr-only">
            The Rack
          </h2>
          <EmptyFence title="The fence is empty" body="Be the first to hang a bat." />
        </section>
      )}

      {/* Elsewhere right now: eBay listings, only while we have few of our own and eBay is configured */}
      {listings.length < 6 && <EbayHomeStrip models={models.map((m) => m.bat)} />}

      {/* 6. Recently sold: only when real completed sales exist */}
      {sold.length > 0 && (
        <Section title="Recently sold">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="recently-sold">
            {sold.map((s) => (
              <li key={s.id} className="card overflow-hidden">
                <Link href={listingPath(s.id)} className="grid no-underline">
                  <span className="relative block aspect-[4/3] border-b-[1.5px] border-ink bg-surface">
                    {s.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.imageUrl} alt={s.imageAlt ?? s.title} className="h-full w-full object-cover" loading="lazy" />
                    )}
                    <span className="label absolute left-2 top-2 bg-stamp-red px-1.5 py-1 !text-[0.625rem] leading-none text-white">Sold</span>
                  </span>
                  <span className="grid gap-0.5 p-2.5">
                    {s.brand && <span className="label !text-[0.625rem] text-ink-soft">{s.brand}</span>}
                    <span className="disp-c line-clamp-2 text-[1.05rem]">{s.title}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 7. Bat Passport explainer */}
      <section className="guilloche mt-8 border-y-2 border-ink" aria-labelledby="passport-how">
        <div className="wrap grid gap-5 py-8 lg:grid-cols-[1fr_1.6fr] lg:items-center">
          <div className="grid content-start gap-3">
            <p className="eyebrow">Bat Passport</p>
            <h2 id="passport-how" className="disp text-2xl sm:text-4xl">
              Stamped, or not stamped yet
            </h2>
            <p className="text-ink-soft">Four checks on every bat. A check is stamped only when real data backs it, and each line says who said it.</p>
            <p>
              <Link href="/how-it-works" className="btn btn-outline min-h-11">
                How it works
              </Link>
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {PASSPORT_LINES.map((k) => (
              <li key={k.title} className="grid gap-1 border-2 border-ink bg-surface p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{k.title}</span>
                  <SourceLabel source={k.source} />
                </span>
                <span className="text-sm text-ink-soft">{k.body}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 8. Models from the bat archive */}
      {models.length > 0 && (
        <Section
          title={hasPopular ? "Most-listed bat models" : "Newest bat models"}
          link={{ href: "/manufacturers", label: "Open the bat archive" }}
        >
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="home-models">
            {models.map(({ bat, listings: n }) => (
              <li key={bat.id}>
                <Link href={bat.path} className="card grid h-full content-start gap-1.5 p-3 no-underline hover:bg-ink hover:text-surface">
                  <span className="label !text-[0.625rem] opacity-70">{bat.manufacturerName}</span>
                  <span className="disp-c text-[1.05rem]">{bat.modelName || bat.productName}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {bat.stamps.slice(0, 2).map((c) => (
                      <span key={c} className="stamp-chip">
                        {c}
                      </span>
                    ))}
                  </span>
                  <span className="font-mono text-xs opacity-70">
                    {[bat.modelYear, bat.weightingType !== "unknown" ? WEIGHTING_LABELS[bat.weightingType] : null, n ? `${n} listed` : null].filter(Boolean).join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            <Link href="/price-guide" className="inline-flex min-h-11 items-center gap-1 font-semibold underline">
              Bat price guide <ArrowIcon size={16} />
            </Link>
          </p>
        </Section>
      )}

      {/* Partners: only real, paid placements */}
      {partners.length > 0 && (
        <Section title="Partners">
          <ul className="flex flex-wrap gap-4">
            {partners.map((p) => (
              <li key={p.id}>
                <a href={p.destinationUrl ?? "#"} rel="sponsored noopener" className="card inline-block px-4 py-3">
                  {p.advertiserName}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Newsletter */}
      <section className="on-ink ink-band mt-8 border-t-2 border-ink">
        <div className="wrap grid gap-4 py-10 md:grid-cols-2 md:items-center">
          <h2 className="display text-3xl font-bold text-white">Hear when the bat you want gets listed</h2>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

const PASSPORT_LINES = [
  { title: "Stamp", source: "verified", body: "On an association's list? From the catalog's recorded, verified status." },
  { title: "Price history", source: "verified", body: "What completed sales on the site paid, once enough exist." },
  { title: "Owner reports", source: "owners", body: "How many hits owners say the model lasts, once enough owners report." },
  { title: "Listing details", source: "seller", body: "The seller's own condition score, damage answers and photos." },
] as const;

function Section({ title, link, tight, children }: { title: string; link?: { href: string; label: string }; tight?: boolean; children: React.ReactNode }) {
  return (
    <section className={`wrap grid gap-4 ${tight ? "pt-6" : "pt-8"} sm:pt-10`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b-2 border-ink pb-2">
        <h2 className="display text-2xl font-bold sm:text-4xl">{title}</h2>
        {link && (
          <Link href={link.href} className="inline-flex min-h-11 items-center font-semibold underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
