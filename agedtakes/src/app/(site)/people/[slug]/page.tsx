import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, CaseCard, DemoBadge, EmptyState, JsonLd, PersonAvatar, SourceLine, StatementTypeBadge } from "@/components/ui";
import { PredictionCard } from "@/components/predictions";
import { FollowButton } from "@/components/site/FollowButton";
import { getPerson } from "@/lib/data/public";
import { accuracySentence, excludedSentence, normalizeStats } from "@/lib/editorial/scoring";
import { TRANSACTION_OWNER_LABELS, WALLET_ATTRIBUTION_LABELS, WALLET_EVENT_LABELS, humanize } from "@/lib/editorial";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatShortDate } from "@/lib/format";
import { breadcrumbJsonLd, pageMetadata, personJsonLd } from "@/lib/seo";

export const revalidate = 300;

// Pages are rendered on first visit, then served from cache and refreshed every few minutes (and immediately when
// an editor publishes or corrects something).
export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPerson(slug).catch(() => null);
  if (!data) return { title: "Person not found", robots: { index: false } };
  const s = normalizeStats(data.stats);
  const p = data.person;
  return pageMetadata({
    title: `${p.name}: statements, predictions and track record`,
    description: `${p.name}${p.occupation ? `, ${p.occupation}` : ""}. ${accuracySentence(s)} ${s.cases_published} published investigation${s.cases_published === 1 ? "" : "s"}, with original sources.`,
    path: `/people/${p.slug}`,
    type: "profile",
    // Thin profiles (no published investigations or public statements) stay out of search indexes.
    noindex: p.is_demo || (data.cases.length === 0 && data.statements.length === 0),
  });
}

export default async function PersonPage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getPerson(slug);
  if (!data) notFound();
  const { person } = data;
  const stats = normalizeStats(data.stats);
  const excluded = excludedSentence(stats);
  const resolved = data.predictions.filter((p) => p.status !== "open");
  const open = data.predictions.filter((p) => p.status === "open");
  const commitments = data.statements.filter((s) => s.statement_type === "explicit_commitment");
  const otherStatements = data.statements.filter((s) => s.statement_type !== "explicit_commitment");

  return (
    <div className="wrap py-10">
      <Breadcrumbs items={[{ label: "People", href: "/people" }, { label: person.name }]} />

      <header className="grid gap-8 border-b-[3px] border-double border-ink pb-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex gap-6">
          <PersonAvatar name={person.name} imageUrl={person.image_url} size={112} />
          <div>
            {person.is_demo && <DemoBadge className="mb-3" />}
            <h1 className="headline text-5xl sm:text-6xl">{person.name}</h1>
            {person.occupation && <p className="mt-2 text-xl text-ink-2">{person.occupation}{person.organization ? ` · ${person.organization}` : ""}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {person.categories.map((c) => (
                <Link key={c.slug} href={`/people?category=${c.slug}`} className="meta border border-rule px-2 py-0.5 hover:border-ink">{c.name}</Link>
              ))}
            </div>
            {person.biography && <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2">{person.biography}</p>}
            {person.image_url && person.image_credit && <p className="meta mt-3">Photo: {person.image_credit}{person.image_license ? ` (${person.image_license})` : ""}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <FollowButton personId={person.id} slug={person.slug} />
              <Link href={`/submit?person=${encodeURIComponent(person.name)}`} className="btn btn-ghost btn-sm">Submit a receipt</Link>
            </div>
          </div>
        </div>

        <aside className="border border-ink bg-paper-2/50 p-5" aria-label="Track record">
          <p className="kicker mb-3">Track record</p>
          <p className="headline text-2xl !leading-tight">{accuracySentence(stats)}</p>
          {excluded && <p className="meta mt-2">{excluded} Open predictions are never counted as wrong.</p>}
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-rule pt-4">
            <Stat label="Published investigations" value={stats.cases_published} />
            <Stat label="Documented contradictions" value={stats.contradiction_cases} />
            <Stat label="Statements on record" value={stats.statements_reviewed} />
            <Stat label="Predictions tracked" value={data.predictions.length} />
          </dl>
          <p className="meta mt-4 border-t border-rule pt-3">
            No composite score. <Link href="/methodology#scoring" className="link">How we count</Link>
            <br />Last updated {formatDateTime(stats.last_updated_at ?? person.updated_at)}
          </p>
        </aside>
      </header>

      <div className="mt-12 space-y-16">
        <section>
          <h2 className="headline mb-6 border-b border-ink pb-2 text-3xl">Investigations</h2>
          {data.cases.length ? (
            <div className="grid gap-8 md:grid-cols-2">{data.cases.map((c) => <CaseCard key={c.id} item={c} />)}</div>
          ) : (
            <EmptyState title="No published investigations yet." />
          )}
        </section>

        {commitments.length > 0 && (
          <section>
            <h2 className="headline mb-6 border-b border-ink pb-2 text-3xl">Explicit commitments</h2>
            <StatementList items={commitments} />
          </section>
        )}

        <section>
          <h2 className="headline mb-1 border-b border-ink pb-2 text-3xl">Predictions</h2>
          {data.predictions.length === 0 && <EmptyState title="No predictions recorded yet." />}
          {resolved.length > 0 && (
            <>
              <h3 className="kicker mb-1 mt-6">Resolved ({resolved.length})</h3>
              {resolved.map((p) => <PredictionCard key={p.id} p={p} showPerson={false} />)}
            </>
          )}
          {open.length > 0 && (
            <>
              <h3 className="kicker mb-1 mt-8">Open — not yet scorable ({open.length})</h3>
              {open.map((p) => <PredictionCard key={p.id} p={p} showPerson={false} />)}
            </>
          )}
        </section>

        {otherStatements.length > 0 && (
          <section>
            <h2 className="headline mb-6 border-b border-ink pb-2 text-3xl">Statements on record</h2>
            <StatementList items={otherStatements} />
          </section>
        )}

        {(data.transactions.length > 0 || data.wallets.length > 0) && (
          <section>
            <h2 className="headline mb-2 border-b border-ink pb-2 text-3xl">Documented activity</h2>
            <p className="meta mb-6 max-w-3xl">
              Records exactly as their sources state them. A transfer is not a sale; an exchange deposit is not a trade; a spouse&apos;s or a fund&apos;s transaction is not the person&apos;s own.
            </p>
            {data.transactions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left">
                  <thead><tr className="border-b border-ink">{["Date", "Asset", "Type", "Owner", "Amount", "Source"].map((h) => <th key={h} className="kicker py-2 pr-4">{h}</th>)}</tr></thead>
                  <tbody>
                    {data.transactions.map((t) => (
                      <tr key={t.id} className="border-b border-rule align-top">
                        <td className="meta py-3 pr-4">{formatShortDate(t.transaction_date)}{t.disclosed_at && <><br />disclosed {formatShortDate(t.disclosed_at)}</>}</td>
                        <td className="py-3 pr-4">{t.asset}{t.is_demo && <div><DemoBadge /></div>}</td>
                        <td className="py-3 pr-4">{humanize(t.transaction_type)}</td>
                        <td className="py-3 pr-4"><strong>{TRANSACTION_OWNER_LABELS[t.owner] ?? t.owner}</strong></td>
                        <td className="py-3 pr-4">
                          {t.amount !== null ? formatMoney(t.amount, t.currency ?? "USD") : t.amount_low !== null ? `${formatMoney(t.amount_low, t.currency ?? "USD")}–${formatMoney(t.amount_high, t.currency ?? "USD")} (range)` : "—"}
                        </td>
                        <td className="py-3"><SourceLine source={t.source} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.wallets.map((w) => (
              <div key={w.id} className="mt-8 border border-rule p-5">
                <p className="kicker">Wallet · {w.chain}</p>
                <p className="mt-1 break-all font-mono text-sm">{w.address}</p>
                <p className="mt-2 text-ink-2">{w.label}</p>
                <p className="meta mt-1">Attribution: <strong className="text-ink">{WALLET_ATTRIBUTION_LABELS[w.attribution_status]?.label ?? w.attribution_status}</strong></p>
                {w.attribution_source && <div className="mt-1"><SourceLine source={w.attribution_source} /></div>}
                {w.events.length > 0 && (
                  <ul className="mt-4 space-y-3 border-t border-rule pt-3">
                    {w.events.map((e) => (
                      <li key={e.tx_hash + e.event_type}>
                        <p><strong>{WALLET_EVENT_LABELS[e.event_type]?.label ?? e.event_type}</strong>: {formatNumber(e.amount)} {e.asset}{e.counterparty_label ? ` → ${e.counterparty_label}` : ""} <span className="meta">· {formatShortDate(e.occurred_at)}</span></p>
                        {WALLET_EVENT_LABELS[e.event_type]?.caveat && <p className="meta !text-amber">{WALLET_EVENT_LABELS[e.event_type]?.caveat}</p>}
                        {e.notes && <p className="text-sm text-ink-2">{e.notes}</p>}
                        {e.source && <SourceLine source={e.source} />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}
      </div>

      <JsonLd data={[
        personJsonLd({ name: person.name, path: `/people/${person.slug}`, jobTitle: person.occupation, organization: person.organization, sameAs: person.website_url }),
        breadcrumbJsonLd([{ name: "People", path: "/people" }, { name: person.name, path: `/people/${person.slug}` }]),
      ]} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="kicker !text-[0.625rem]">{label}</dt>
      <dd className="headline text-3xl">{value}</dd>
    </div>
  );
}

function StatementList({ items }: { items: import("@/lib/data/types").Statement[] }) {
  return (
    <ul className="space-y-8">
      {items.map((s) => (
        <li key={s.id} className="border-l-[3px] border-ink pl-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatementTypeBadge type={s.statement_type} />
            {s.asset_or_topic && <span className="meta">{s.asset_or_topic}</span>}
            {s.is_demo && <DemoBadge />}
          </div>
          <p className="headline text-2xl !font-medium !leading-snug"><span className="text-red">“</span>{s.exact_quote}<span className="text-red">”</span></p>
          <p className="meta mt-2">{formatDate(s.published_at, s.date_precision)}{s.quote_verified_verbatim ? " · Quote checked word for word against the source" : ""}</p>
          {s.context && <p className="mt-2 text-ink-2"><span className="kicker mr-2">Context</span>{s.context}</p>}
          <div className="mt-2"><SourceLine source={s.source} timecode={s.source_timecode} /></div>
          {s.cases.map((c) => <Link key={c.slug} href={`/cases/${c.slug}`} className="meta link mt-2 block !text-red-ink">Investigation: {c.title} →</Link>)}
        </li>
      ))}
    </ul>
  );
}
