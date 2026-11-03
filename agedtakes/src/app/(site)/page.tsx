import Link from "next/link";
import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { CaseCard, DemoBadge, PersonCard, QuoteBlock, SectionHeading } from "@/components/ui";
import { PredictionCard } from "@/components/predictions";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { DemoNotice, NotConfigured, Unavailable } from "@/components/site/states";
import { getHome } from "@/lib/data/public";
import { BRAND, pageMetadata } from "@/lib/seo";
import { formatDate } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  ...pageMetadata({ title: `${BRAND.name} — ${BRAND.tagline}`, description: BRAND.description, path: "/" }),
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
};

export default async function HomePage() {
  const home = await getHome().catch(() => undefined);
  if (home === undefined) return <Unavailable />;
  if (!home) return <NotConfigured />;
  const [lead, ...rest] = home.latest;

  return (
    <>
      {home.has_demo && <DemoNotice />}

      <section className="border-b border-ink">
        <div className="wrap py-14 text-center sm:py-20">
          <h1 className="sr-only">{BRAND.wordmark}</h1>
          <Wordmark size="xl" className="justify-center" />
          <p className="mt-8 font-mono text-sm font-semibold uppercase tracking-[0.28em] sm:text-base">{BRAND.tagline}</p>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl">
            {BRAND.secondary} We track what influential people said, what they did, and how their claims held up.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/cases" className="btn">Explore the latest takes</Link>
            <form action="/search" role="search" className="flex w-full max-w-sm">
              <label htmlFor="hero-search" className="sr-only">Search people and predictions</label>
              <input id="hero-search" name="q" type="search" placeholder="Search people and predictions" className="field !border-ink" />
              <button className="btn btn-ghost !border-l-0" type="submit">Search</button>
            </form>
          </div>
        </div>
      </section>

      <div className="wrap space-y-20 py-14">
        {lead && (
          <section aria-labelledby="latest">
            <SectionHeading kicker="On the record" title="Latest investigations" href="/cases" linkLabel="The full archive" />
            <h2 id="latest" className="sr-only">Latest investigations</h2>
            <div className="grid gap-10 lg:grid-cols-[1.7fr_1fr]">
              <CaseCard item={lead} variant="lead" />
              {rest.length > 0 && (
                <div className="border-t border-ink lg:border-l lg:border-t-0 lg:pl-8">
                  {rest.slice(0, 5).map((c) => <CaseCard key={c.id} item={c} variant="compact" />)}
                </div>
              )}
            </div>
          </section>
        )}

        {home.trending.length > 0 && (
          <section>
            <SectionHeading kicker="Who we're watching" title="Trending personalities" href="/people" linkLabel="All people" />
            <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {home.trending.map((p) => <PersonCard key={p.id} person={p} />)}
            </div>
          </section>
        )}

        {(home.aged_poorly.length > 0 || home.aged_well.length > 0) && (
          <div className="grid gap-14 lg:grid-cols-2">
            {home.aged_poorly.length > 0 && (
              <section>
                <SectionHeading kicker="Didn't hold up" title="Predictions that aged poorly" href="/cases?type=prediction_aged_poorly" />
                <div className="space-y-8">{home.aged_poorly.map((c) => <CaseCard key={c.id} item={c} />)}</div>
              </section>
            )}
            {home.aged_well.length > 0 && (
              <section>
                <SectionHeading kicker="Called it" title="Predictions that aged well" href="/cases?type=prediction_aged_well" />
                <div className="space-y-8">{home.aged_well.map((c) => <CaseCard key={c.id} item={c} />)}</div>
              </section>
            )}
          </div>
        )}

        {home.did_they_sell.length > 0 && (
          <section>
            <SectionHeading kicker="Follow the money" title="Did they sell?" href="/cases?type=did_they_sell">
              We separate a sale from a transfer, an exchange deposit, a spouse&apos;s trade and a fund&apos;s holdings — and we say which one the record shows.
            </SectionHeading>
            <div className="grid gap-8 md:grid-cols-2">{home.did_they_sell.map((c) => <CaseCard key={c.id} item={c} />)}</div>
          </section>
        )}

        {home.never_sell.length > 0 && (
          <section className="bg-ink px-5 py-10 text-paper sm:px-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-paper/30 pb-4">
              <div>
                <p className="kicker !text-red-wash">The franchise</p>
                <h2 className="headline text-4xl">The Never Sell Index</h2>
                <p className="mt-2 max-w-xl text-paper/80">Explicit public commitments not to sell — recorded word for word, then checked against the record.</p>
              </div>
              <Link href="/never-sell" className="meta link !text-paper">The full index →</Link>
            </div>
            <div className="grid gap-10 md:grid-cols-2">
              {home.never_sell.map((s) => (
                <div key={s.id}>
                  <QuoteBlock quote={s.exact_quote} size="sm" />
                  <p className="mt-3 font-mono text-xs text-paper/70">
                    {s.person && <Link href={`/people/${s.person.slug}`} className="underline">{s.person.name}</Link>} · {formatDate(s.published_at)}
                    {s.is_demo && <DemoBadge className="ml-2 !bg-paper !text-ink" />}
                  </p>
                  {s.cases[0] && <Link href={`/cases/${s.cases[0].slug}`} className="mt-2 inline-block font-mono text-xs uppercase tracking-[0.1em] text-red-wash underline">What happened →</Link>}
                </div>
              ))}
            </div>
          </section>
        )}

        {home.resolved.length > 0 && (
          <section>
            <SectionHeading kicker="The scoreboard" title="Recently resolved predictions" href="/predictions" linkLabel="All predictions" />
            {home.resolved.slice(0, 4).map((p) => <PredictionCard key={p.id} p={p} />)}
          </section>
        )}

        <section id="newsletter" className="grid gap-8 border-[3px] border-double border-ink p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="kicker mb-2 !text-red">Every week</p>
            <h2 className="headline text-4xl">{BRAND.newsletter}</h2>
            <p className="mt-3 text-lg text-ink-2">{BRAND.newsletterTagline}</p>
            <p className="meta mt-3">New investigations, resolved predictions and every correction. No spam, no unpublished drafts.</p>
          </div>
          <NewsletterForm source="homepage" />
        </section>

        {home.latest.length === 0 && (
          <section className="border border-dashed border-rule p-10 text-center">
            <p className="headline text-3xl">The first investigations are being researched.</p>
            <p className="mt-3 text-ink-2">Nothing is published until an editor has checked every source. Subscribe above to hear when they land.</p>
          </section>
        )}
      </div>
    </>
  );
}
