import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { MentionsChart, ScoreHistoryChart } from "@/components/charts";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Card, ConfidenceBadge, Empty, Estimate, Flash, PageHeader, ScoreBadge, StatusBadge, Thumb, Unknown, btn, input, label } from "@/components/ui";
import { requireMember } from "@/lib/auth/member";
import type { MentionRow, ProductRow, ScoreRow, VideoIdeas } from "@/lib/data/types";
import { CATEGORY_LABELS, estimateMargin, type Category } from "@/lib/engine/scoring";
import { readFlash } from "@/lib/flash";
import { ago, compact, dateTime, day, money, range, requestTime } from "@/lib/format";
import { loadSettings } from "@/lib/settings";
import { addAlias, addTestResult, mergeInto, removeAlias, renameProduct, rescoreNow, setProductStatus, setWatchStatus } from "./actions";

export const maxDuration = 300;

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  return { title: decodeURIComponent((await params).slug).replace(/-/g, " ") };
}

const MENTION_LABEL: Record<string, string> = {
  organic_demo: "Organic demo", affiliate: "Affiliate", storefront: "Storefront", paid_ad: "Paid ad", education: "Education / case study", discussion: "Discussion", unknown: "Unclassified",
};
const VERDICT: Record<string, { label: string; tone: "good" | "accent" | "bad" | "neutral" }> = {
  test_now: { label: "Worth testing now", tone: "good" }, watch: { label: "Watch", tone: "accent" }, avoid: { label: "Avoid", tone: "bad" }, insufficient_data: { label: "Not enough data", tone: "neutral" },
};
const NOT_CONNECTED = [
  ["TikTok Shop listings & TikTok videos", "Needs a licensed TikTok data provider (Phase 2/3)."],
  ["Instagram promotions", "Needs Meta app review for hashtag search (Phase 2)."],
  ["Amazon listings", "Needs Creators API eligibility or a licensed provider such as Keepa (Phase 3)."],
  ["Shopify stores & Google Shopping", "Needs a licensed search API such as SerpApi (Phase 3)."],
];

export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const member = await requireMember(`/products/${slug}`);
  const { db } = member;
  const isOwner = member.role === "owner";

  const { data: p } = await db.from("products").select("*").eq("slug", slug).maybeSingle();
  if (!p) notFound();
  const product = p as ProductRow;
  if (product.status === "merged" && product.merged_into) {
    const { data: target } = await db.from("products").select("slug").eq("id", product.merged_into).maybeSingle();
    if (target) redirect(`/products/${target.slug}`);
  }

  const [aliases, images, mentions, scores, ideas, comp, trend, watch, feedback, creator, settings, suggestions] = await Promise.all([
    db.from("product_aliases").select("id, alias, source, confidence").eq("product_id", product.id).order("source").order("alias"),
    db.from("product_images").select("url, source_url, kind").eq("product_id", product.id).limit(8),
    db.from("product_mentions").select("*, creators(display_name), creator_videos(title, view_count, like_count, comment_count, published_at, url, thumbnail_url)").eq("product_id", product.id).order("observed_at", { ascending: true }).limit(500),
    db.from("opportunity_scores").select("*").eq("product_id", product.id).order("scored_at", { ascending: true }).limit(200),
    db.from("video_ideas").select("ideas, generated_at").eq("product_id", product.id).eq("is_current", true).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("competition_snapshots").select("*").eq("product_id", product.id).order("captured_at", { ascending: false }).limit(10),
    db.from("trend_snapshots").select("*").eq("product_id", product.id).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("watchlists").select("status, notes").eq("product_id", product.id).eq("user_id", member.user.id).maybeSingle(),
    db.from("user_feedback").select("*").eq("product_id", product.id).order("created_at", { ascending: false }).limit(20),
    product.first_observed_creator_id ? db.from("creators").select("display_name, channel_url").eq("id", product.first_observed_creator_id).maybeSingle() : Promise.resolve({ data: null }),
    loadSettings(db),
    isOwner ? db.from("match_suggestions").select("id, confidence, reason, candidate_product_id, product_id, products!match_suggestions_candidate_product_id_fkey(slug, canonical_name)").eq("product_id", product.id).eq("status", "open") : Promise.resolve({ data: [] }),
  ]);

  type M = MentionRow & {
    creators: { display_name: string } | null;
    creator_videos: { title: string | null; view_count: number | null; like_count: number | null; comment_count: number | null; published_at: string | null; url: string; thumbnail_url: string | null } | null;
  };
  const ms = (mentions.data ?? []) as M[];
  const scoreRows = (scores.data ?? []) as ScoreRow[];
  const latest = scoreRows[scoreRows.length - 1] ?? null;
  const v = ideas.data?.ideas as VideoIdeas | undefined;
  const margin = estimateMargin(
    product.suggested_price_low === null && product.est_supplier_cost_low === null ? null : {
      costLow: num(product.est_supplier_cost_low), costHigh: num(product.est_supplier_cost_high), shipping: num(product.est_shipping_cost),
      priceLow: num(product.suggested_price_low), priceHigh: num(product.suggested_price_high),
    },
    settings.economics,
  );

  // Mentions per day for the last 30 days, and how many creators appeared for the first time that day.
  const firstByCreator = new Map<string, string>();
  for (const m of ms) {
    const k = m.creator_id ?? `${m.platform}:${m.author_name ?? ""}`;
    if (!firstByCreator.has(k)) firstByCreator.set(k, day(m.observed_at));
  }
  const now = requestTime();
  const days: { day: string; mentions: number; creators: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400_000).toISOString().slice(0, 10);
    days.push({ day: d.slice(5), mentions: ms.filter((m) => day(m.observed_at) === d).length, creators: [...firstByCreator.values()].filter((x) => x === d).length });
  }
  const byCreator = new Map<string, { name: string; count: number; types: Set<string>; first: string }>();
  for (const m of ms) {
    const k = m.creator_id ?? `${m.platform}:${m.author_name ?? "unknown"}`;
    const e = byCreator.get(k) ?? { name: m.creators?.display_name ?? m.author_name ?? "unknown", count: 0, types: new Set<string>(), first: m.observed_at };
    e.count++;
    e.types.add(m.mention_type);
    byCreator.set(k, e);
  }
  const videos = new Map<string, NonNullable<M["creator_videos"]> & { author: string; platform: string }>();
  for (const m of ms) if (m.creator_videos && !videos.has(m.creator_videos.url)) videos.set(m.creator_videos.url, { ...m.creator_videos, author: m.creators?.display_name ?? m.author_name ?? "", platform: m.platform });

  const latestObserved = (comp.data ?? []).find((c) => c.source === "monitored_sources");
  const t = trend.data;
  const flash = readFlash(sp);
  const hidden = (
    <>
      <input type="hidden" name="product_id" value={product.id} />
      <input type="hidden" name="slug" value={product.slug} />
    </>
  );

  return (
    <>
      <Flash flash={flash} />
      <PageHeader
        title={product.canonical_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} />
            {product.category && <Badge>{product.category}</Badge>}
            <span>First seen {product.first_observed_at ? `${ago(product.first_observed_at)} on ${product.first_observed_platform}` : "unknown"}</span>
            {product.scored_at && <span>· scored {ago(product.scored_at)}</span>}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <ScoreBadge score={product.latest_score} />
            <ConfidenceBadge value={product.latest_confidence} />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 16. AI recommendation */}
          <Card title="AI recommendation" subtitle={product.ai_recommendation_at ? `Written ${ago(product.ai_recommendation_at)} from the evidence on this page.` : undefined}>
            {product.ai_recommendation ? (
              <div className="space-y-2 text-sm">
                {product.ai_verdict && <Badge tone={VERDICT[product.ai_verdict]?.tone}>{VERDICT[product.ai_verdict]?.label}</Badge>}
                <p>{product.ai_recommendation}</p>
                {product.ai_risks?.length > 0 && (
                  <ul className="list-disc pl-5 text-ink-2">{product.ai_risks.map((r) => <li key={r}>{r}</li>)}</ul>
                )}
              </div>
            ) : (
              <Empty title="Not assessed yet">The AI assessment runs once a product&apos;s preliminary score reaches {settings.ai.assess_min_prelim_score}{isOwner ? ", or when you click “Assess with AI now”" : ""}.</Empty>
            )}
          </Card>

          {/* 15. Score breakdown and history */}
          <Card title="Opportunity score" subtitle="Each category is scored separately. Missing data counts against the score, never for it.">
            {latest ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(CATEGORY_LABELS) as Category[]).map((k) => {
                    const val = latest[k] as number | null;
                    return (
                      <div key={k} className="rounded-lg border border-line p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-ink-2">{CATEGORY_LABELS[k]} <span className="text-muted">· weight {latest.weights?.[k] ?? "?"}</span></span>
                          {val === null ? <Badge>no data</Badge> : <ScoreBadge score={val} />}
                        </div>
                        {latest.reasons?.[k] && <p className="mt-1 text-xs text-muted">{latest.reasons[k]}</p>}
                      </div>
                    );
                  })}
                </div>
                {latest.missing?.length > 0 && <p className="mt-3 text-xs text-muted"><strong>Not yet measured:</strong> {latest.missing.join("; ")}.</p>}
                {scoreRows.length > 1 && (
                  <div className="mt-4">
                    <ScoreHistoryChart data={scoreRows.map((s) => ({ at: s.scored_at.slice(5, 16).replace("T", " "), overall: Number(s.overall), momentum: n(s.early_momentum), demand: n(s.demand_acceleration), competition: n(s.competition) }))} />
                  </div>
                )}
              </>
            ) : (
              <Empty title="Not scored yet">Scoring runs after each ingestion cycle.</Empty>
            )}
          </Card>

          {/* 5 + 10. Discovery timeline and trend history */}
          <Card title="Discovery timeline" subtitle="Mentions per day over the last 30 days, from monitored sources and submitted links.">
            <MentionsChart data={days} />
            {t && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Metric k="Mentions 24h / 72h / 7d" v={`${t.mentions_24h} / ${t.mentions_72h} / ${t.mentions_7d}`} />
                <Metric k="Previous 7 days" v={String(t.mentions_prev_7d)} />
                <Metric k="Growth rate (7d)" v={`${(Number(t.growth_rate) * 100).toFixed(0)}%`} />
                <Metric k="Acceleration" v={`×${Number(t.acceleration).toFixed(1)}`} />
                <Metric k="Unique creators (7d / all)" v={`${t.unique_creators_7d} / ${t.unique_creators_total}`} />
                <Metric k="Platforms" v={String(t.unique_platforms)} />
                <Metric k="Views on recent videos" v={t.views_7d === null ? "unknown" : compact(t.views_7d)} />
                <Metric k="View growth" v={t.engagement_growth === null ? "not measurable yet" : `${(Number(t.engagement_growth) * 100).toFixed(0)}%/day`} />
              </div>
            )}
            <div className="mt-4 rounded-lg border border-dashed border-line p-3 text-xs text-muted">
              <strong className="text-ink-2">Search trend history:</strong> Google Trends isn&apos;t connected yet (the official API is invitation-only; a licensed provider is planned for Phase 2), so search interest is shown as unknown rather than zero.
            </div>
          </Card>

          {/* 6 + 7 + 9. Evidence */}
          <Card title="Mentions and sources" subtitle="Every sighting, oldest first, with where the evidence was found.">
            {ms.length ? (
              <ol className="space-y-3">
                {ms.map((m) => (
                  <li key={m.id} className="flex gap-3 text-sm">
                    <Thumb src={m.creator_videos?.thumbnail_url} alt="" size={56} />
                    <div className="min-w-0">
                      <p className="font-medium">
                        <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-accent">{m.creator_videos?.title ?? m.url}</a>
                      </p>
                      <p className="text-xs text-muted">
                        {dateTime(m.observed_at)} · {m.platform} · {m.creators?.display_name ?? m.author_name ?? "unknown"} · <Badge>{MENTION_LABEL[m.mention_type] ?? m.mention_type}</Badge>{" "}
                        {m.match_method !== "new" && <Badge tone="accent" title="How this sighting was matched to the product">matched: {m.match_method}{m.match_confidence ? ` ${Math.round(Number(m.match_confidence) * 100)}%` : ""}</Badge>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-2">Called “{m.mentioned_name}”{m.evidence_quote ? <> · in {m.evidence_location}: “{m.evidence_quote}”</> : null}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <Empty title="No mentions recorded" />
            )}
          </Card>

          {/* 8. Social video links */}
          <Card title="Social videos" subtitle="Engagement counts are public counts at the last check, not estimates.">
            {videos.size ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-1 text-left font-medium">Video</th><th className="text-right font-medium">Views</th><th className="text-right font-medium">Likes</th><th className="text-right font-medium">Comments</th><th className="text-right font-medium">Published</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {[...videos.values()].map((x) => (
                      <tr key={x.url}>
                        <td className="py-1.5"><a className="hover:text-accent" href={x.url} target="_blank" rel="noopener noreferrer nofollow">{x.title ?? x.url}</a><span className="block text-xs text-muted">{x.platform} · {x.author}</span></td>
                        <td className="tabular text-right">{x.view_count === null ? "—" : compact(x.view_count)}</td>
                        <td className="tabular text-right">{x.like_count === null ? "—" : compact(x.like_count)}</td>
                        <td className="tabular text-right">{x.comment_count === null ? "—" : compact(x.comment_count)}</td>
                        <td className="text-right text-xs">{day(x.published_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty title="No videos linked" />
            )}
          </Card>

          {/* 14. Organic video ideas */}
          <Card title="Organic video ideas" subtitle={ideas.data ? `Generated ${ago(ideas.data.generated_at as string)}. Original concepts; no format is claimed to be viral.` : undefined}>
            {v ? (
              <div className="space-y-4 text-sm">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Metric k="Suggested length" v={`${v.duration_seconds} seconds`} />
                  <Metric k="First frame" v={v.first_frame} />
                  <Metric k="Call to action" v={v.call_to_action} />
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Hooks</h3>
                  <ol className="list-decimal space-y-1 pl-5">{v.hooks.map((h) => <li key={h}>{h}</li>)}</ol>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Problem / solution</h3>
                  <ul className="space-y-1">{v.problem_solution.map((i) => <Idea key={i.title} i={i} />)}</ul>
                </div>
                <ul className="space-y-1">
                  <Idea i={v.three_two_one} tag="3-2-1" />
                  <Idea i={v.run_to_store} tag="Run to the store" />
                  <Idea i={v.pov_demo} tag="POV demo" />
                  <Idea i={v.curiosity} tag="Curiosity" />
                  {v.before_after ? <Idea i={v.before_after} tag="Before / after" /> : <li className="text-xs text-muted">Before/after: not a good fit for this product.</li>}
                </ul>
                <p className="text-xs text-muted">{v.format_notes}</p>
              </div>
            ) : (
              <Empty title="No video ideas yet">They are written together with the AI assessment.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {/* Watchlist */}
          <Card title="Your watchlist">
            <form action={setWatchStatus} className="space-y-2">
              {hidden}
              <select name="status" defaultValue={watch.data?.status ?? "saved"} className={input}>
                <option value="saved">Saved</option>
                <option value="following">Following</option>
                <option value="testing">Testing</option>
                <option value="tested">Tested</option>
                <option value="launched">Launched</option>
                <option value="rejected">Rejected</option>
                {watch.data && <option value="remove">Remove from watchlist</option>}
              </select>
              <textarea name="notes" rows={2} defaultValue={watch.data?.notes ?? ""} placeholder="Notes" className={input} />
              <SubmitButton className={btn.primary}>{watch.data ? "Update" : "Add to watchlist"}</SubmitButton>
            </form>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-accent">Record a test or sales result</summary>
              <form action={addTestResult} className="mt-2 grid grid-cols-2 gap-2">
                {hidden}
                <div className="col-span-2"><label className={label}>Type</label><select name="kind" className={input}><option value="test_result">Test result</option><option value="sales">Sales after launch</option><option value="note">Note</option></select></div>
                <div><label className={label}>From</label><input name="period_start" type="date" className={input} /></div>
                <div><label className={label}>To</label><input name="period_end" type="date" className={input} /></div>
                <div><label className={label}>Revenue $</label><input name="revenue" type="number" step="0.01" min="0" className={input} /></div>
                <div><label className={label}>Orders</label><input name="orders" type="number" min="0" className={input} /></div>
                <div><label className={label}>Product costs $</label><input name="units_cost" type="number" step="0.01" min="0" className={input} /></div>
                <div><label className={label}>Ad spend $</label><input name="ad_spend" type="number" step="0.01" min="0" className={input} /></div>
                <div><label className={label}>Video views</label><input name="video_views" type="number" min="0" className={input} /></div>
                <div><label className={label}>Verdict</label><select name="verdict" className={input}><option value="">—</option><option value="winner">Winner</option><option value="promising">Promising</option><option value="loser">Loser</option><option value="inconclusive">Inconclusive</option></select></div>
                <div className="col-span-2"><label className={label}>Notes</label><textarea name="notes" rows={2} className={input} /></div>
                <div className="col-span-2"><SubmitButton className={btn.secondary}>Save result</SubmitButton></div>
              </form>
            </details>
            {(feedback.data ?? []).length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
                {(feedback.data ?? []).map((f) => (
                  <li key={f.id as string}>
                    <strong>{String(f.kind).replace("_", " ")}</strong> {f.period_start ? `${f.period_start}→${f.period_end ?? ""}` : day(f.created_at as string)}
                    {f.revenue !== null && ` · revenue ${money(f.revenue as number)}`}{f.orders !== null && ` · ${f.orders} orders`}{f.verdict && ` · ${f.verdict}`}
                    {f.notes && <span className="block text-muted">{f.notes as string}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* 3. Images */}
          <Card title="Images">
            {(images.data ?? []).length ? (
              <div className="grid grid-cols-3 gap-2">
                {(images.data ?? []).map((i) => (
                  <a key={i.url as string} href={(i.source_url as string) ?? (i.url as string)} target="_blank" rel="noopener noreferrer nofollow" title={i.kind === "thumbnail" ? "Video thumbnail where the product appears" : String(i.kind)}>
                    <Thumb src={i.url as string} alt={product.canonical_name} size={96} />
                  </a>
                ))}
              </div>
            ) : (
              <Empty title="No product image yet">Images are kept only when the product is visible in a source thumbnail or listing.</Empty>
            )}
          </Card>

          {/* 1-2, 4. Identity */}
          <Card title="What it is">
            <dl className="space-y-2 text-sm">
              <Row k="Description">{product.description ?? <Unknown label="Written with the AI assessment" />}</Row>
              <Row k="Function">{product.function_summary ?? <Unknown />}</Row>
              <Row k="Problem solved">{product.problem_solved ?? <Unknown label="None stated" />}</Row>
              <Row k="Looks like">{product.visual_description ?? <Unknown />}</Row>
              <Row k="Traits">{product.physical_attributes?.length ? product.physical_attributes.join(", ") : <Unknown />}</Row>
              <Row k="Earliest known appearance">
                {product.first_observed_at ? (
                  <>
                    {dateTime(product.first_observed_at)} on {product.first_observed_platform}
                    {creator.data ? ` by ${creator.data.display_name}` : ""}
                    {product.first_observed_url && <> · <a className="text-accent hover:underline" href={product.first_observed_url} target="_blank" rel="noopener noreferrer nofollow">source</a></>}
                    <span className="block text-xs text-muted">Earliest in the sources this tool monitors; it may have appeared elsewhere earlier.</span>
                  </>
                ) : <Unknown />}
              </Row>
            </dl>
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Also sold as</p>
              <ul className="flex flex-wrap gap-1">
                {(aliases.data ?? []).filter((a) => a.source !== "search_term").map((a) => (
                  <li key={a.id as string} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {a.alias as string}
                    {isOwner && (
                      <form action={removeAlias}>{hidden}<input type="hidden" name="alias_id" value={a.id as string} /><button title="Remove this name" className="text-muted hover:text-bad">×</button></form>
                    )}
                  </li>
                ))}
              </ul>
              {(aliases.data ?? []).some((a) => a.source === "search_term") && (
                <p className="mt-2 text-xs text-muted">Search terms: {(aliases.data ?? []).filter((a) => a.source === "search_term").map((a) => a.alias as string).join(", ")}</p>
              )}
              {isOwner && (
                <form action={addAlias} className="mt-2 flex gap-2">{hidden}<input name="alias" placeholder="Add another name" className={input} /><SubmitButton className={btn.small}>Add</SubmitButton></form>
              )}
            </div>
          </Card>

          {/* 11-13. Economics */}
          <Card title="Costs, price and margin" subtitle="AI estimates from typical prices for comparable goods. Verify with real supplier quotes.">
            <dl className="space-y-2 text-sm">
              <Row k="Supplier cost">{range(product.est_supplier_cost_low, product.est_supplier_cost_high) ? <Estimate>{range(product.est_supplier_cost_low, product.est_supplier_cost_high)}</Estimate> : <Unknown label="Not estimated" />}</Row>
              <Row k="Shipping">{product.est_shipping_cost !== null ? <Estimate>{money(product.est_shipping_cost)}</Estimate> : <Unknown label={`Not estimated (margin uses $${settings.economics.default_shipping})`} />}</Row>
              <Row k="Suggested selling price">{range(product.suggested_price_low, product.suggested_price_high) ? <Estimate>{range(product.suggested_price_low, product.suggested_price_high)}</Estimate> : <Unknown label="Not estimated" />}</Row>
              <Row k="Estimated gross margin">
                {margin ? (
                  <>
                    <Estimate>{money(margin.margin)} per order ({Math.round(margin.marginPct * 100)}%)</Estimate>
                    <span className="block text-xs text-muted">At {money(margin.price)}: cost {money(margin.cost)}, shipping {money(margin.shipping)}, payment fees + refund reserve + other {money(margin.fees)}.</span>
                  </>
                ) : <Unknown label="Needs a price and cost estimate" />}
              </Row>
              {product.price_basis && <Row k="Basis">{product.price_basis}</Row>}
            </dl>
          </Card>

          {/* 9. Competition */}
          <Card title="Competition" subtitle="Never an exact count of sellers on the internet.">
            {latestObserved ? (
              <dl className="space-y-1 text-sm">
                <Row k="Seen in monitored sources">{latestObserved.unique_creators} creator(s), {latestObserved.promo_videos} promotional post(s) <ConfidenceBadge value={latestObserved.confidence as string} /></Row>
                <Row k="By type">{latestObserved.organic_creators} organic demo · {latestObserved.affiliates} affiliate · {latestObserved.storefronts} storefront · {latestObserved.paid_ads} paid ad</Row>
                <Row k="New in the last 7 days">{latestObserved.new_sellers_7d}</Row>
                <Row k="Earliest promoter">{latestObserved.earliest_seller_at ? dateTime(latestObserved.earliest_seller_at as string) : <Unknown />}</Row>
                <Row k="Names in use">{latestObserved.names_in_use} different name(s)</Row>
                <p className="pt-1 text-xs text-muted">{latestObserved.notes as string}</p>
              </dl>
            ) : (
              <Empty title="Not analysed yet" />
            )}
            <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs">
              {NOT_CONNECTED.map(([k, why]) => <li key={k}><strong className="text-ink-2">{k}:</strong> <span className="text-muted">not researched yet. {why}</span></li>)}
            </ul>
          </Card>

          {/* Creator mentions */}
          <Card title="Creators mentioning it">
            {byCreator.size ? (
              <ul className="space-y-1 text-sm">
                {[...byCreator.values()].sort((a, b) => b.count - a.count).map((c) => (
                  <li key={c.name} className="flex justify-between gap-2"><span>{c.name} <span className="text-xs text-muted">({[...c.types].map((x) => MENTION_LABEL[x] ?? x).join(", ")})</span></span><span className="tabular text-muted">{c.count}</span></li>
                ))}
              </ul>
            ) : <Empty title="None yet" />}
          </Card>

          {isOwner && (
            <Card title="Owner tools">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <form action={rescoreNow}>{hidden}<SubmitButton className={btn.secondary} pendingText="Rescoring…">Rescore now</SubmitButton></form>
                  <form action={rescoreNow}>{hidden}<input type="hidden" name="assess" value="1" /><SubmitButton className={btn.secondary} pendingText="Assessing… (up to a minute)">Assess with AI now</SubmitButton></form>
                </div>
                {(suggestions.data ?? []).length > 0 && (
                  <div className="rounded-lg bg-warn-wash p-2 text-xs text-warn">
                    Possibly the same as:{" "}
                    {(suggestions.data ?? []).map((s) => {
                      const c = (Array.isArray(s.products) ? s.products[0] : s.products) as { slug: string; canonical_name: string } | null;
                      return c ? <Link key={s.id as string} className="underline" href={`/products/${c.slug}`}>{c.canonical_name} </Link> : null;
                    })}
                    — review on <Link className="underline" href="/admin/products">Products & matching</Link>.
                  </div>
                )}
                <form action={renameProduct} className="flex gap-2">{hidden}<input name="canonical_name" defaultValue={product.canonical_name} className={input} /><SubmitButton className={btn.small}>Rename</SubmitButton></form>
                <form action={mergeInto} className="flex gap-2">
                  {hidden}
                  <input name="target" placeholder="Merge into: paste the other product's link" className={input} required />
                  <SubmitButton className={btn.small} confirm="Merge this product into the other one? Its mentions, names and history move there.">Merge</SubmitButton>
                </form>
                <div className="flex flex-wrap gap-2">
                  {product.status !== "saturated" && <form action={setProductStatus}>{hidden}<input type="hidden" name="status" value="saturated" /><SubmitButton className={btn.small}>Mark saturated</SubmitButton></form>}
                  {product.status !== "tracking" && <form action={setProductStatus}>{hidden}<input type="hidden" name="status" value="tracking" /><SubmitButton className={btn.small}>Mark active</SubmitButton></form>}
                  {product.status !== "not_a_product" && <form action={setProductStatus}>{hidden}<input type="hidden" name="status" value="not_a_product" /><SubmitButton className={btn.danger} confirm="Hide this from all lists and alerts?">Not a product</SubmitButton></form>}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-canvas p-2">
      <p className="text-[11px] text-muted">{k}</p>
      <p className="text-sm font-medium">{v}</p>
    </div>
  );
}
function Idea({ i, tag }: { i: { title: string; concept: string }; tag?: string }) {
  return (
    <li className="rounded-lg border border-line p-2">
      <p className="font-medium">{tag && <Badge tone="accent">{tag}</Badge>} {i.title}</p>
      <p className="text-ink-2">{i.concept}</p>
    </li>
  );
}
