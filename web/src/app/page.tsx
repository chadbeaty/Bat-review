import Link from "next/link";
import { brand } from "@/config/brand";
import { SearchBar } from "@/components/SearchBar";
import { ListingCard } from "@/components/ListingCard";
import { EmptyFence, Rack } from "@/components/shop/Rack";
import { NewsletterForm } from "@/components/NewsletterForm";
import { SiteJsonLd } from "@/components/SiteJsonLd";
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
  const [categories, manufacturers, newestBats, stats, rackBats, otherGear, partners, commission, minSales] = await Promise.all([
    getCategories(),
    getManufacturers(),
    getNewestBatModels(8),
    getCatalogStats(),
    getListings({ category: "bats", limit: 12 }),
    getListings({ excludeCategory: "bats", limit: 8 }),
    getHomepagePartners(),
    getCurrentFee("seller_commission"),
    getSetting<number>("price_guide_min_sales", 5),
  ]);
  const [bats, ...otherCategories] = categories;
  const newestYear = newestBats[0]?.modelYear;

  return (
    <>
      <SiteJsonLd />
      {/* Hero */}
      <section className="border-b-2 border-ink">
        <div className="wrap grid gap-8 py-10 md:py-16 lg:grid-cols-[1.45fr_1fr] lg:items-end">
          <div className="grid gap-6">
            <p className="eyebrow">Used slow-pitch bats and gear · nationwide</p>
            <h1 className="disp text-[clamp(1.75rem,5.4vw,3.1rem)]">
              Know the <span className="logo-outline">stamp</span>, the price and the hits before you buy
            </h1>
            <p className="max-w-xl text-lg text-ink-soft">
              Every bat is drawn to its real specs and comes with a Bat Passport: its stamp, what the model really sells for, how long owners say it lasts, and the seller&apos;s own damage answers.
            </p>
            <div className="hidden max-w-xl md:block">
              <SearchBar id="hero-search" large />
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-primary px-5 py-3">
                Shop equipment
              </Link>
              <Link href="/sell" className="btn btn-outline px-5 py-3">
                Sell your gear
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-2 border-ink bg-surface">
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

      {/* The Rack: real listings only */}
      <section aria-labelledby="rack-heading">
        <div className="wrap flex flex-wrap items-end justify-between gap-3 pb-4 pt-10">
          <div className="grid gap-1">
            <p className="eyebrow">Hanging now</p>
            <h2 id="rack-heading" className="disp text-3xl sm:text-4xl">
              The Rack
            </h2>
          </div>
          <Link href="/bats" className="font-semibold underline">
            Walk the whole fence
          </Link>
        </div>
        {rackBats.length ? (
          <Rack listings={rackBats} />
        ) : (
          <EmptyFence title="The fence is empty" body="Be the first to hang a bat." />
        )}
      </section>

      {/* How the Passport works */}
      <section className="guilloche border-y-2 border-ink" aria-labelledby="passport-how">
        <div className="wrap grid gap-8 py-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div className="grid content-start gap-4">
            <p className="eyebrow">Bat Passport</p>
            <h2 id="passport-how" className="disp text-3xl sm:text-4xl">
              Stamped, or not stamped yet
            </h2>
            <p className="text-ink-soft">
              Every bat listing carries a passport with four checks. A check gets an ink stamp only when real data backs it up. When it doesn&apos;t, the spot stays empty, so you can see what hasn&apos;t been verified too.
            </p>
            <p>
              <Link href="/how-it-works" className="btn btn-outline">
                How it works
              </Link>
            </p>
          </div>
          <ul className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
            {PASSPORT_KEYS.map((k) => (
              <li key={k.title} className="stamp-slot grid content-start gap-2">
                <div className={`ink-stamp ${k.shape}`} style={{ ["--c" as string]: k.color, transform: `rotate(${k.tilt}deg)` }}>
                  <div>
                    <small>{k.title}</small>
                    <span className="hd">{k.stamp}</span>
                  </div>
                </div>
                <p className="max-w-[26ch] text-center text-sm text-ink-soft">{k.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Categories */}
      <Section title="Shop by category" link={{ href: "/shop", label: "All equipment" }}>
        <div className="grid gap-3 md:grid-cols-[1.2fr_2fr]">
          {bats && (
            <Link href="/bats" className="on-ink ink-band grid content-between gap-6 border-2 border-ink p-6 no-underline hover:bg-[#1c2530]">
              <span className="eyebrow !text-[#9fb0b8]">The main event</span>
              <span className="grid gap-2">
                <span className="display text-5xl font-bold text-white">{bats.name}</span>
                <span className="text-sm text-[#c3cdd1]">{bats.description}</span>
              </span>
              <span className="font-bold">Shop bats →</span>
            </Link>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {otherCategories.map((c) => (
              <li key={c.slug}>
                <Link href={`/shop/${c.slug}`} className="card grid h-full content-between gap-3 p-4 no-underline hover:bg-ink hover:text-surface [&>span:last-child]:hover:text-[#c3cdd1]">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-ink-soft">{c.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Browse by weight */}
      <Section title="Browse bats by weight">
        <div className="flex flex-wrap gap-2">
          {batWeights.map((w) => (
            <Link key={w} href={`/bats?weight=${w}`} className="chip !px-5 !py-3 font-mono !text-lg">
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
              <Link href={`/manufacturers#${m.slug}`} className="chip !px-4 !py-2">
                {m.name}
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* Other gear: only when there are real listings */}
      {otherGear.length > 0 && (
        <Section title="Also just listed" link={{ href: "/shop?sort=newest", label: "See everything new" }}>
          <ListingGrid listings={otherGear} />
        </Section>
      )}

      {/* Price guide */}
      <section className="concrete-band border-y-2 border-ink">
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
                    <span key={c} className="stamp-chip">
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
      <section className="on-ink ink-band border-t-2 border-ink">
        <div className="wrap grid gap-4 py-12 md:grid-cols-2 md:items-center">
          <h2 className="display text-4xl font-bold text-white">Hear when the bat you want gets listed</h2>
          <NewsletterForm />
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 border-ink p-4 [&:nth-child(-n+2)]:border-b-2 [&:nth-child(odd)]:border-r-2">
      <dt className="order-2 text-sm text-ink-soft">{label}</dt>
      <dd className="order-1 font-mono text-4xl font-bold">{value}</dd>
      {note && <dd className="order-3 text-xs text-ink-soft">{note}</dd>}
    </div>
  );
}

const PASSPORT_KEYS = [
  { title: "Stamp", stamp: "On the list", shape: "circle", color: "var(--brand-cleared-green)", tilt: -9, body: "Is this model on an association's approved list? Stamped only from the catalog's recorded status." },
  { title: "Price history", stamp: "Sold here", shape: "rect", color: "var(--brand-customs-red)", tilt: 5, body: "What verified sales on the site actually paid, once enough sales exist." },
  { title: "Owner reports", stamp: "Owners say", shape: "oval", color: "var(--brand-passport-violet)", tilt: 3, body: "How many hits owners report their model lasting, once enough owners have reported." },
  { title: "Listing details", stamp: "Answered", shape: "rect", color: "var(--brand-ink)", tilt: -4, body: "This listing's own condition score, damage answers and photos." },
] as const;

function Section({ title, link, children }: { title: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="wrap grid gap-5 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-ink pb-3">
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
    <li className="grid gap-1 border-2 border-ink bg-surface px-4 py-3">
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
            <span className="grid h-10 w-10 place-items-center rounded-sm bg-ink font-mono text-lg font-bold text-surface">{i + 1}</span>
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
