import Link from "next/link";
import { brand } from "@/config/brand";
import { SearchBar } from "@/components/SearchBar";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { NewsletterForm } from "@/components/NewsletterForm";
import { getCatalogStats, getCategories, getHomepagePartners, getListings, getManufacturers, getNewestBatModels } from "@/lib/catalog";
import { getCurrentFee, getSetting } from "@/lib/settings";
import { batWeights } from "@/data/reference";
import { WEIGHTING_LABELS } from "@/lib/format";

const BUY_STEPS = [
  { title: "Find it", body: "Search by brand, model, year, weight and stamp. Every listing shows its condition score and damage answers up front." },
  { title: "Ask or offer", body: "Message the seller about the bat, or make an offer they can accept, decline or counter." },
  { title: "Pay here", body: "Pay by card through the site. Your payment details go to Stripe, never to the seller." },
  { title: "Track it", body: "The seller ships with a prepaid label and you get tracking updates until it arrives." },
];

const SELL_STEPS = [
  { title: "List it", body: "Pick the model from our catalog, add photos, answer the damage questions and set your price. Free to list." },
  { title: "Get an order", body: "We let you know as soon as a buyer pays. No meetups, no payment apps, no chasing money." },
  { title: "Print a label", body: "Buy a label sized for a long bat box right from your order, at live carrier rates." },
  { title: "Get paid", body: "Your payout goes to your bank through Stripe once the order is complete, on the schedule shown in your seller dashboard." },
];

export default async function HomePage() {
  const [categories, manufacturers, newestBats, stats, featuredBats, recent, partners, commission, minSales] = await Promise.all([
    getCategories(),
    getManufacturers(),
    getNewestBatModels(8),
    getCatalogStats(),
    getListings({ category: "bats", featured: true, limit: 4 }),
    getListings({ limit: 8 }),
    getHomepagePartners(),
    getCurrentFee("seller_commission"),
    getSetting<number>("price_guide_min_sales", 5),
  ]);
  const [bats, ...otherCategories] = categories;
  const newestYear = newestBats[0]?.modelYear;

  return (
    <>
      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="wrap grid gap-10 py-12 md:grid-cols-[1.3fr_1fr] md:items-end md:py-20">
          <div className="grid gap-6">
            <p className="eyebrow">Nationwide marketplace for used slow-pitch equipment</p>
            <h1 className="display text-5xl font-bold sm:text-6xl lg:text-7xl">{brand.tagline}</h1>
            <p className="max-w-xl text-lg text-ink-soft">{brand.description}</p>
            <div className="hidden md:block">
              <SearchBar id="hero-search" large />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary px-5 py-3">
                Shop equipment
              </Link>
              <Link href="/sell" className="btn btn-accent px-5 py-3">
                Sell your gear
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line">
            <Stat label="Bat models in the catalog" value={String(stats.batModels)} />
            <Stat label="Equipment categories" value={String(categories.length)} />
            <Stat label="Manufacturers" value={String(stats.manufacturers)} />
            {commission ? (
              <Stat
                label="To list. Seller fee only when it sells"
                value="Free"
                note={`${commission.fee_value}% commission on the item price`}
              />
            ) : (
              <Stat label="To list an item" value="Free" />
            )}
          </dl>
        </div>
      </section>

      {/* Categories */}
      <Section title="Shop by category" link={{ href: "/shop", label: "All equipment" }}>
        <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
          {bats && (
            <Link href="/bats" className="grid content-between gap-6 rounded-lg bg-ink p-6 text-surface no-underline hover:bg-black">
              <span className="eyebrow !text-accent">The main event</span>
              <span className="grid gap-2">
                <span className="display text-5xl font-bold">{bats.name}</span>
                <span className="text-sm text-surface/75">{bats.description}</span>
              </span>
              <span className="font-semibold">Shop bats →</span>
            </Link>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {otherCategories.map((c) => (
              <li key={c.slug}>
                <Link href={`/shop/${c.slug}`} className="card grid h-full content-between gap-3 p-4 no-underline hover:border-ink">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-ink-soft">{c.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Featured bats */}
      <Section title="Featured bats" link={{ href: "/bats", label: "All bats" }}>
        {featuredBats.length ? (
          <ListingGrid listings={featuredBats} />
        ) : (
          <EmptyState
            title="No featured bats yet"
            body="The marketplace is just opening. Featured bats will show here once sellers start listing. Have a bat you've moved on from? It could be one of the first."
            action={{ href: "/sell", label: "Sell a bat" }}
          />
        )}
      </Section>

      {/* Browse by weight */}
      <Section title="Browse bats by weight">
        <div className="flex flex-wrap gap-2">
          {batWeights.map((w) => (
            <Link key={w} href={`/bats?weight=${w}`} className="card px-5 py-3 font-mono text-lg no-underline hover:border-ink">
              {w} oz
            </Link>
          ))}
          <Link href="/bats" className="px-3 py-3 font-semibold underline">
            Other weights
          </Link>
        </div>
      </Section>

      {/* Manufacturers */}
      <Section title="Shop by manufacturer" link={{ href: "/manufacturers", label: "All manufacturers" }}>
        <ul className="flex flex-wrap gap-2">
          {manufacturers.map((m) => (
            <li key={m.slug}>
              <Link href={`/manufacturers#${m.slug}`} className="card inline-block px-4 py-2 font-medium no-underline hover:border-ink">
                {m.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* Recently added */}
      <Section title="Recently added" link={{ href: "/shop?sort=newest", label: "See everything new" }}>
        {recent.length ? (
          <ListingGrid listings={recent} />
        ) : (
          <EmptyState
            title="Nothing listed yet"
            body="New equipment from players nationwide will appear here as soon as it's listed. Every listing is real; we don't show sample inventory."
            action={{ href: "/sell", label: "List your gear" }}
          />
        )}
      </Section>

      {/* Price guide */}
      <section className="border-y border-line bg-surface">
        <div className="wrap grid gap-8 py-14 md:grid-cols-2 md:items-center">
          <div className="grid gap-4">
            <p className="eyebrow">Bat price guide</p>
            <h2 className="display text-4xl font-bold sm:text-5xl">Know what a used bat is really worth</h2>
            <p className="text-ink-soft">
              Every bat model gets its own page. We keep asking prices and actual sale prices separate, because they rarely match.
            </p>
            <p>
              <Link href="/price-guide" className="btn btn-primary">
                Open the price guide
              </Link>
            </p>
          </div>
          <ul className="grid gap-3">
            <PriceRow label="Current asking-price range" body="From live listings for the same model, year and weight." />
            <PriceRow label="Verified sold prices" body={`Only from completed sales on ${brand.name}. Shown once a model has at least ${minSales} sales.`} />
            <PriceRow label="Suggested asking price" body="Sellers see where their price sits before they publish." />
          </ul>
        </div>
      </section>

      {/* Newest models */}
      {newestBats.length > 0 && (
        <Section title={newestYear ? `New ${newestYear} bat models` : "Bat models"} link={{ href: "/bats", label: `All ${stats.batModels} models` }}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {newestBats.map((b) => (
              <li key={b.slug} className="card grid content-start gap-2 p-4">
                <span className="text-xs font-medium text-ink-soft">{b.manufacturer}</span>
                <span className="font-semibold">{b.name.replace(`${b.manufacturer} `, "")}</span>
                <span className="flex flex-wrap gap-1">
                  {b.certifications.map((c) => (
                    <span key={c} className="rounded-sm border border-ink px-1.5 py-0.5 font-mono text-[0.68rem] tracking-wider">
                      {c}
                    </span>
                  ))}
                  <span className="px-1 text-xs text-ink-soft">{WEIGHTING_LABELS[b.weightingType]}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-soft">Specs come from manufacturer and retailer listings. Always check the stamp on the barrel before you buy.</p>
        </Section>
      )}

      {/* How it works */}
      <section className="wrap grid gap-10 py-14 md:grid-cols-2">
        <Steps title="How buying works" steps={BUY_STEPS} link={{ href: "/buyer-protection", label: "Buyer protection" }} />
        <Steps title="How selling works" steps={SELL_STEPS} link={{ href: "/seller-guide", label: "Seller guide" }} />
      </section>

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
      <section className="bg-accent">
        <div className="wrap grid gap-4 py-12 md:grid-cols-2 md:items-center">
          <h2 className="display text-4xl font-bold text-accent-ink">Hear when the bat you want gets listed</h2>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 bg-surface p-5">
      <dt className="order-2 text-sm text-ink-soft">{label}</dt>
      <dd className="display order-1 text-4xl font-bold">{value}</dd>
      {note && <dd className="order-3 text-xs text-ink-soft">{note}</dd>}
    </div>
  );
}

function Section({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="wrap grid gap-5 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="display text-3xl font-bold sm:text-4xl">{title}</h2>
        {link && (
          <Link href={link.href} className="font-semibold underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function ListingGrid({ listings }: { listings: Awaited<ReturnType<typeof getListings>> }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {listings.map((l) => (
        <li key={l.id}>
          <ListingCard listing={l} />
        </li>
      ))}
    </ul>
  );
}

function PriceRow({ label, body }: { label: string; body: string }) {
  return (
    <li className="grid gap-1 border-l-4 border-accent bg-paper px-4 py-3">
      <span className="font-semibold">{label}</span>
      <span className="text-sm text-ink-soft">{body}</span>
    </li>
  );
}

function Steps({ title, steps, link }: { title: string; steps: { title: string; body: string }[]; link: { href: string; label: string } }) {
  return (
    <div className="grid content-start gap-5">
      <h2 className="display text-3xl font-bold sm:text-4xl">{title}</h2>
      <ol className="grid gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-3">
            <span className="display grid h-10 w-10 place-items-center rounded-full bg-ink text-xl font-bold text-surface">{i + 1}</span>
            <span className="grid gap-0.5">
              <span className="font-semibold">{s.title}</span>
              <span className="text-sm text-ink-soft">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <Link href={link.href} className="font-semibold underline">
        {link.label}
      </Link>
    </div>
  );
}
