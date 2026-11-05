import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { PredictionCard } from "@/components/predictions";
import { ShareButtons } from "@/components/site/ShareButtons";
import { Breadcrumbs, CaseCard, CaseTypeLabel, ConfidenceBadge, DemoBadge, JsonLd, PersonAvatar, QuoteBlock, SourceLine, StatementTypeBadge } from "@/components/ui";
import { getCase } from "@/lib/data/public";
import { CASE_TYPE_LABELS, CONFIDENCE, EVIDENCE_ROLE_LABELS, OUTREACH_LABELS, humanize } from "@/lib/editorial";
import { formatDate, formatDateTime } from "@/lib/format";
import { absoluteUrl, articleJsonLd, breadcrumbJsonLd, pageMetadata } from "@/lib/seo";

export const revalidate = 300;

// Pages are rendered on first visit, then served from cache and refreshed every few minutes (and immediately when
// an editor publishes or corrects something).
export async function generateStaticParams() {
  return [];
}

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCase(slug).catch(() => null);
  if (!data) return { title: "Investigation not found", robots: { index: false } };
  const c = data.case;
  return pageMetadata({
    title: c.title,
    description: c.seo_description ?? c.summary ?? `An Aged Takes investigation into ${data.person.name}.`,
    path: `/cases/${c.slug}`,
    type: "article",
    publishedTime: c.published_at,
    modifiedTime: c.last_updated_at,
    noindex: c.is_demo,
    image: absoluteUrl(`/api/og/${c.slug}`),
  });
}

export default async function CasePage({ params }: { params: Params }) {
  const { slug } = await params;
  const data = await getCase(slug);
  if (!data) notFound();
  const { case: c, person, statement, prediction, evidence, timeline, responses, corrections, related } = data;
  const url = absoluteUrl(`/cases/${c.slug}`);
  const response = responses[0];

  return (
    <article className="pb-10">
      {c.is_demo && (
        <div className="border-b border-ink bg-ink text-paper">
          <p className="wrap py-2 font-mono text-[0.6875rem] uppercase tracking-[0.14em]">
            Demo only — this investigation, its subject and its sources are fictional. It demonstrates how a real case is presented.
          </p>
        </div>
      )}
      {c.status === "disputed" && (
        <div className="border-b border-amber bg-amber-wash">
          <p className="wrap py-2 font-mono text-xs text-amber">This case is marked DISPUTED: credible evidence or interpretations conflict. Both are presented below.</p>
        </div>
      )}

      <div className="wrap pt-8">
        <Breadcrumbs items={[{ label: "Investigations", href: "/cases" }, { label: person.name, href: `/people/${person.slug}` }, { label: CASE_TYPE_LABELS[c.case_type] }]} />

        <header className="mx-auto max-w-4xl border-b-[3px] border-double border-ink pb-8 text-center">
          <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
            <CaseTypeLabel type={c.case_type} />
            <ConfidenceBadge level={c.evidence_confidence} />
            {c.is_demo && <DemoBadge />}
          </div>
          <h1 className="headline text-4xl sm:text-5xl lg:text-6xl">{c.title}</h1>
          {c.summary && <p className="mx-auto mt-6 max-w-3xl text-xl leading-relaxed text-ink-2">{c.summary}</p>}
          <div className="meta mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>Subject: <Link href={`/people/${person.slug}`} className="link !text-ink">{person.name}</Link></span>
            <span>Published <time dateTime={c.published_at}>{formatDate(c.published_at)}</time></span>
            <span>Last updated <time dateTime={c.last_updated_at}>{formatDateTime(c.last_updated_at)}</time></span>
            {c.methodology_version && <Link href="/methodology" className="link">Methodology v{c.methodology_version}</Link>}
          </div>
          {c.is_sponsored && (
            <p className="mx-auto mt-4 max-w-xl border border-amber px-3 py-2 font-mono text-xs text-amber">
              Sponsored placement: {c.sponsor_disclosure}. Sponsors have no influence over our evidence assessment or conclusions.
            </p>
          )}
        </header>
      </div>

      <div className="wrap mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-14">
          {statement && (
            <section aria-labelledby="original">
              <SectionLabel id="original" label="The original statement" note="Exact quotation" />
              <div className="border-l-[3px] border-red pl-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatementTypeBadge type={statement.statement_type} />
                  {statement.quote_verified_verbatim && <span className="meta">Checked word for word against the source</span>}
                </div>
                <QuoteBlock quote={statement.exact_quote} size="lg" attribution={<>{person.name} · {formatDate(statement.published_at, statement.date_precision)}{statement.source_timecode ? ` · at ${statement.source_timecode}` : ""}</>} />
                <div className="mt-3"><SourceLine source={statement.source} timecode={statement.source_timecode} /></div>
                {statement.context && (
                  <div className="mt-5 bg-paper-2/60 p-4">
                    <p className="kicker mb-1">Context</p>
                    <p className="text-ink-2">{statement.context}</p>
                    {statement.conditions && <p className="mt-2 text-ink-2"><strong>Conditions stated:</strong> {statement.conditions}</p>}
                  </div>
                )}
              </div>
            </section>
          )}

          {c.what_happened && (
            <section aria-labelledby="after">
              <SectionLabel id="after" label="What happened afterward" note="Documented record" />
              <p className="headline text-2xl !font-medium !leading-snug">{c.what_happened}</p>
            </section>
          )}

          {prediction && (
            <section aria-labelledby="prediction">
              <SectionLabel id="prediction" label="The prediction, scored" note="Resolution criteria" />
              <PredictionCard p={prediction} showPerson={false} />
            </section>
          )}

          <section aria-labelledby="investigation">
            <SectionLabel id="investigation" label="The investigation" />
            <Markdown source={c.article_body} />
          </section>

          {evidence.length > 0 && (
            <section aria-labelledby="evidence">
              <SectionLabel id="evidence" label="Evidence" note={`${evidence.length} source${evidence.length === 1 ? "" : "s"}`} />
              <ol className="space-y-5">
                {evidence.map((e, i) => (
                  <li key={`${e.source.id}-${e.role}`} className="border border-rule bg-paper p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold">Exhibit {String.fromCharCode(65 + i)}</span>
                      <span className="meta">· {EVIDENCE_ROLE_LABELS[e.role]}</span>
                      {e.classification && <span className="meta">· {CONFIDENCE[e.classification].label}</span>}
                      {e.source.is_primary && <span className="meta">· Primary source</span>}
                      <span className="meta">· {humanize(e.source.source_type)}</span>
                    </div>
                    <p className="font-semibold">{e.source.title}</p>
                    <SourceLine source={e.source} />
                    {e.source.source_excerpt && <p className="mt-3 border-l-2 border-rule pl-3 font-mono text-[0.8rem] leading-relaxed text-ink-2">{e.source.source_excerpt}</p>}
                    <dl className="mt-4 grid gap-3 text-[0.95rem] sm:grid-cols-2">
                      {e.what_it_proves && <div><dt className="kicker !text-well">What it shows</dt><dd className="text-ink-2">{e.what_it_proves}</dd></div>}
                      {e.what_it_does_not_prove && <div><dt className="kicker !text-red-ink">What it does not show</dt><dd className="text-ink-2">{e.what_it_does_not_prove}</dd></div>}
                      {e.limitations && <div><dt className="kicker">Limitations</dt><dd className="text-ink-2">{e.limitations}</dd></div>}
                      {e.identity_established !== null && <div><dt className="kicker">Identity / ownership</dt><dd className="text-ink-2">{e.identity_established ? "Independently established" : "Not independently established"}</dd></div>}
                    </dl>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {timeline.length > 0 && (
            <section aria-labelledby="timeline">
              <SectionLabel id="timeline" label="Timeline" />
              <ol className="relative border-l border-ink pl-6">
                {timeline.map((t, i) => (
                  <li key={i} className="relative pb-6 last:pb-0">
                    <span aria-hidden className={`absolute -left-[1.86rem] top-1.5 h-3 w-3 border border-ink ${t.kind === "statement" ? "bg-red" : t.kind === "correction" ? "bg-amber" : "bg-paper"}`} />
                    <time className="meta" dateTime={t.occurred_at}>{formatDate(t.occurred_at, t.date_precision)}</time>
                    <p className="font-semibold">{t.label}</p>
                    {t.description && <p className="text-ink-2">{t.description}</p>}
                    {t.source && <SourceLine source={t.source} />}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {c.limitations && (
            <section aria-labelledby="limits">
              <SectionLabel id="limits" label="Limitations" note="What this does not establish" />
              <p className="text-lg text-ink-2">{c.limitations}</p>
            </section>
          )}

          <section aria-labelledby="response">
            <SectionLabel id="response" label="Subject response" note="Right of reply" />
            {response ? (
              <div className="border border-rule p-5">
                <p className="font-mono text-sm font-semibold">{OUTREACH_LABELS[response.outreach_status]}</p>
                {response.contacted_at && <p className="meta">Contacted {formatDate(response.contacted_at)}{response.contact_method ? ` via ${humanize(response.contact_method)}` : ""}{response.response_deadline ? ` · response requested by ${formatDate(response.response_deadline)}` : ""}</p>}
                {response.response_text && (
                  <blockquote className="mt-4 border-l-[3px] border-ink pl-4 text-lg italic text-ink-2">“{response.response_text}”</blockquote>
                )}
                {response.response_source && <p className="meta mt-2">{response.response_source}{response.received_at ? ` · ${formatDate(response.received_at)}` : ""}</p>}
              </div>
            ) : (
              <p className="text-ink-2">Outreach status not yet recorded.</p>
            )}
            <p className="meta mt-3">Are you the subject of this case? <Link href="/about#contact" className="link">Send us your response</Link> and we will publish it.</p>
          </section>

          <section aria-labelledby="corrections">
            <SectionLabel id="corrections" label="Correction history" />
            {corrections.length === 0 ? (
              <p className="text-ink-2">No corrections. If you spot an error, <Link href="/submit" className="link">tell us</Link>.</p>
            ) : (
              <ul className="space-y-4">
                {corrections.map((k, i) => (
                  <li key={i} className="border-l-[3px] border-amber pl-4">
                    <p className="meta">{formatDateTime(k.created_at)}{k.field ? ` · ${humanize(k.field)}` : ""}</p>
                    <p className="text-ink-2">{k.reason}</p>
                    {k.previous_text && <p className="meta mt-1 line-through decoration-red/60">{k.previous_text}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:self-start">
          <div className="border border-ink p-5">
            <p className="kicker mb-3">Subject</p>
            <div className="flex items-center gap-3">
              <PersonAvatar name={person.name} imageUrl={person.image_url} size={48} />
              <div>
                <Link href={`/people/${person.slug}`} className="headline text-xl hover:text-red-ink">{person.name}</Link>
                {person.occupation && <p className="text-sm text-ink-2">{person.occupation}</p>}
              </div>
            </div>
            <Link href={`/people/${person.slug}`} className="meta link mt-3 inline-block">Full track record →</Link>
          </div>

          {c.editorial_conclusion && (
            <div className="border-[3px] border-double border-ink bg-paper-2/60 p-5">
              <p className="kicker mb-2 !text-red">Editorial conclusion</p>
              <p className="text-[1.05rem] leading-relaxed">{c.editorial_conclusion}</p>
              <p className="meta mt-3">This is our interpretation of the evidence above, labeled separately from the facts.</p>
            </div>
          )}

          {c.evidence_confidence && (
            <div className="border border-rule p-5">
              <p className="kicker mb-2">Evidence confidence</p>
              <p className="headline text-2xl">{CONFIDENCE[c.evidence_confidence].label}</p>
              <p className="mt-1 text-sm text-ink-2">{CONFIDENCE[c.evidence_confidence].description}</p>
              <Link href="/methodology#confidence" className="meta link mt-2 inline-block">How we classify evidence</Link>
            </div>
          )}

          <div className="border border-rule p-5">
            <p className="kicker mb-2">How to read this page</p>
            <ul className="space-y-1 text-sm text-ink-2">
              <li><strong>Quotation marks</strong> mean exact, verified wording.</li>
              <li><strong>Opinion, prediction, commitment and action</strong> are labeled as such.</li>
              <li><strong>Editorial conclusion</strong> is our interpretation.</li>
            </ul>
          </div>

          <ShareButtons url={url} title={c.title} text={c.social_post ?? c.title} />
        </aside>
      </div>

      {related.length > 0 && (
        <section className="wrap mt-20">
          <h2 className="headline mb-6 border-t-[3px] border-double border-ink pt-3 text-3xl">Related investigations</h2>
          <div className="grid gap-8 md:grid-cols-3">{related.map((r) => <CaseCard key={r.id} item={r} />)}</div>
        </section>
      )}

      <JsonLd data={[
        articleJsonLd({ title: c.title, description: c.seo_description ?? c.summary ?? c.title, path: `/cases/${c.slug}`, publishedAt: c.published_at, modifiedAt: c.last_updated_at, personName: person.name, personPath: `/people/${person.slug}` }),
        breadcrumbJsonLd([{ name: "Investigations", path: "/cases" }, { name: c.title, path: `/cases/${c.slug}` }]),
      ]} />
    </article>
  );
}

function SectionLabel({ id, label, note }: { id: string; label: string; note?: string }) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-ink pb-2">
      <h2 id={id} className="headline text-2xl sm:text-3xl">{label}</h2>
      {note && <span className="kicker">{note}</span>}
    </div>
  );
}
