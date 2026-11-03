import type { Metadata } from "next";
import Link from "next/link";
import { CaseCard, DemoBadge, EmptyState, PageHeader, QuoteBlock, SourceLine } from "@/components/ui";
import { NotConfigured, Unavailable } from "@/components/site/states";
import { getNeverSell } from "@/lib/data/public";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "The Never Sell Index",
  description: "Explicit public commitments not to sell — recorded word for word, and checked against filings and on-chain records.",
  path: "/never-sell",
});

export default async function NeverSellPage() {
  const data = await getNeverSell().catch(() => undefined);
  if (data === undefined) return <Unavailable />;
  if (!data) return <NotConfigured />;
  return (
    <div className="wrap py-12">
      <PageHeader kicker="The franchise" title="The Never Sell Index">
        <p>
          “I will never sell.” “Holding until a price.” “No shares sold before a date.” This index lists only <strong>explicit</strong> public
          commitments — where the original wording supports that reading. General bullish commentary is not a promise, and we don&apos;t treat it as one.
        </p>
      </PageHeader>

      <section className="mb-16">
        <div className="mb-6 flex items-end justify-between border-b border-ink pb-2">
          <h2 className="headline text-3xl">Commitments on record</h2>
          <span className="kicker">{data.commitments.length} recorded</span>
        </div>
        {data.commitments.length === 0 ? (
          <EmptyState title="No commitments recorded yet." />
        ) : (
          <div className="grid gap-10 md:grid-cols-2">
            {data.commitments.map((s) => (
              <article key={s.id} className="border-t-[3px] border-red pt-5">
                <div className="mb-3 flex items-center gap-2">
                  {s.person && <Link href={`/people/${s.person.slug}`} className="headline text-xl hover:text-red-ink">{s.person.name}</Link>}
                  {s.is_demo && <DemoBadge />}
                </div>
                <QuoteBlock quote={s.exact_quote} size="md" attribution={<>{formatDate(s.published_at, s.date_precision)}{s.asset_or_topic ? ` · ${s.asset_or_topic}` : ""}</>} />
                {s.context && <p className="mt-3 text-ink-2">{s.context}</p>}
                <div className="mt-2"><SourceLine source={s.source} timecode={s.source_timecode} /></div>
                <p className="mt-4 font-mono text-xs uppercase tracking-[0.1em]">
                  {s.cases.length ? (
                    s.cases.map((c) => <Link key={c.slug} href={`/cases/${c.slug}`} className="link block !text-red-ink">Status: see investigation →</Link>)
                  ) : (
                    <span className="text-muted">Status: no contrary activity documented</span>
                  )}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {data.cases.length > 0 && (
        <section>
          <div className="mb-6 border-b border-ink pb-2"><h2 className="headline text-3xl">Did they hold?</h2></div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">{data.cases.map((c) => <CaseCard key={c.id} item={c} />)}</div>
        </section>
      )}

      <aside className="mt-16 border border-ink bg-paper-2/60 p-6">
        <p className="kicker mb-2">How we read the record</p>
        <ul className="grid gap-3 text-ink-2 md:grid-cols-2">
          <li><strong>A wallet transfer is not a sale.</strong> Coins can move between someone&apos;s own wallets.</li>
          <li><strong>An exchange deposit is not a trade.</strong> Deposited assets can be held, lent or withdrawn.</li>
          <li><strong>A company&apos;s holdings are not personal holdings</strong> — and the reverse.</li>
          <li><strong>A wallet is attributed</strong> only when the person identified it or ownership is independently verified.</li>
        </ul>
      </aside>
    </div>
  );
}
