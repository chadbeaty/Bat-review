import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured } from "@/lib/ai/client";
import type { ProductRow } from "@/lib/data/types";
import { evaluateAlerts, isSaturated } from "@/lib/engine/alerts";
import { scoreProduct, SCORE_VERSION, type CompetitionEvidence } from "@/lib/engine/scoring";
import { computeTrend, viewGrowth, type MentionPoint, type TrendMetrics } from "@/lib/engine/trends";
import type { Settings } from "@/lib/settings";
import { assessProduct } from "@/lib/jobs/assess";
import type { Deadline } from "@/lib/jobs/lock";
import { log } from "@/lib/log";

// Scoring cycle for a set of products: trend snapshot → (optional) AI assessment → opportunity score →
// observed-competition snapshot → saturation check → alerts. Every run appends history; nothing is overwritten
// except the "latest" summary columns on the product.

const PROMOTING = new Set(["organic_demo", "affiliate", "storefront", "paid_ad", "education"]);
/** Monitored creators are a small slice of who sells a product; competition evidence from them alone is weak. */
const MONITORED_COVERAGE = 0.3;

export type ScoreRunResult = { scored: number; assessed: number; assessFailed: number; alerts: number; saturated: number; errors: string[] };

type MentionWithVideo = {
  observed_at: string;
  creator_id: string | null;
  author_name: string | null;
  platform: string;
  mention_type: string;
  video_id: string | null;
  creator_videos: { view_count: number | null } | { view_count: number | null }[] | null;
};

export async function loadTrend(db: SupabaseClient, product: ProductRow, now = new Date()): Promise<{ trend: TrendMetrics; promoters: number; marketplaceSellers: number | null }> {
  const { data: rows } = await db
    .from("product_mentions")
    .select("observed_at, creator_id, author_name, platform, mention_type, video_id, creator_videos(view_count)")
    .eq("product_id", product.id)
    .limit(2000);
  const mentions = (rows ?? []) as MentionWithVideo[];
  const points: MentionPoint[] = mentions.map((m) => {
    const v = Array.isArray(m.creator_videos) ? m.creator_videos[0] : m.creator_videos;
    return {
      observedAt: new Date(m.observed_at),
      creatorKey: m.creator_id ?? (m.author_name ? `${m.platform}:${m.author_name.toLowerCase()}` : null),
      platform: m.platform,
      views: v?.view_count ?? null,
    };
  });

  const recentVideoIds = [...new Set(mentions.filter((m) => m.video_id && now.getTime() - new Date(m.observed_at).getTime() < 14 * 86400_000).map((m) => m.video_id!))];
  let growth: number | null = null;
  if (recentVideoIds.length) {
    const { data: snaps } = await db.from("video_stat_snapshots").select("video_id, observed_at, view_count").in("video_id", recentVideoIds).order("observed_at").limit(5000);
    const byVideo = new Map<string, { observedAt: Date; views: number | null }[]>();
    for (const s of snaps ?? []) {
      const list = byVideo.get(s.video_id as string) ?? [];
      list.push({ observedAt: new Date(s.observed_at as string), views: s.view_count as number | null });
      byVideo.set(s.video_id as string, list);
    }
    growth = viewGrowth([...byVideo.values()]);
  }

  const [{ count: sellerCount }, { data: marketSnap }] = await Promise.all([
    db.from("seller_products").select("id", { count: "exact", head: true }).eq("product_id", product.id),
    db.from("competition_snapshots").select("unique_sellers").eq("product_id", product.id).neq("source", "monitored_sources").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const trend = computeTrend({
    mentions: points,
    firstObservedAt: product.first_observed_at ? new Date(product.first_observed_at) : null,
    engagementGrowth: growth,
    searchInterest: null,
    searchInterestGrowth: null,
    sellersDetected: sellerCount ? sellerCount : null,
    now,
  });
  const promoters = new Set(
    mentions.filter((m) => PROMOTING.has(m.mention_type)).map((m) => m.creator_id ?? `${m.platform}:${(m.author_name ?? "").toLowerCase()}`),
  ).size;
  return { trend, promoters, marketplaceSellers: (marketSnap?.unique_sellers as number | null | undefined) ?? null };
}

function scoreFor(product: ProductRow, trend: TrendMetrics, competition: CompetitionEvidence, settings: Settings) {
  return scoreProduct({
    trend,
    competition,
    organicVideoPotential: product.ai_organic_score === null ? null : Number(product.ai_organic_score),
    problemSolving: product.ai_problem_score === null ? null : Number(product.ai_problem_score),
    estimates:
      product.suggested_price_low === null && product.est_supplier_cost_low === null
        ? null
        : {
            costLow: num(product.est_supplier_cost_low), costHigh: num(product.est_supplier_cost_high), shipping: num(product.est_shipping_cost),
            priceLow: num(product.suggested_price_low), priceHigh: num(product.suggested_price_high),
          },
    weights: settings.scoring_weights,
    economics: settings.economics,
  });
}
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function scoreProducts(
  db: SupabaseClient,
  settings: Settings,
  productIds: string[],
  deadline: Deadline,
  opts: { allowAssess?: boolean; forceAssess?: boolean; competitionSnapshot?: boolean } = {},
): Promise<ScoreRunResult> {
  const out: ScoreRunResult = { scored: 0, assessed: 0, assessFailed: 0, alerts: 0, saturated: 0, errors: [] };
  for (const id of productIds) {
    if (deadline.remaining() < 20_000) {
      out.errors.push("Stopped early (time limit); remaining products are scored next run.");
      break;
    }
    try {
      const { data: p } = await db.from("products").select("*").eq("id", id).maybeSingle();
      let product = p as ProductRow | null;
      if (!product || product.status === "merged" || product.status === "not_a_product") continue;

      const { trend, promoters, marketplaceSellers } = await loadTrend(db, product);
      if (trend.mentions_total === 0) continue;
      const competition: CompetitionEvidence = { observedPromoters: promoters, marketplaceSellers, coverage: marketplaceSellers === null ? MONITORED_COVERAGE : 0.6 };

      // Assess with AI when the preliminary score earns it, at most every few days, and only with new evidence.
      const prelim = scoreFor(product, trend, competition, settings);
      const stale = !product.assessed_at || Date.now() - new Date(product.assessed_at).getTime() > settings.ai.reassess_after_days * 86400_000;
      const newEvidence = (product.assessment_mentions ?? 0) < trend.mentions_total;
      const shouldAssess = aiConfigured() && (opts.forceAssess || (opts.allowAssess !== false && prelim.overall >= settings.ai.assess_min_prelim_score && (!product.assessed_at || (stale && newEvidence))));
      if (shouldAssess && deadline.remaining() > 90_000) {
        const a = await assessProduct(db, product, trend);
        if (a.ok) {
          out.assessed++;
          const { data: refreshed } = await db.from("products").select("*").eq("id", id).single();
          product = refreshed as typeof product;
        } else {
          out.assessFailed++;
          out.errors.push(`${product!.canonical_name}: assessment failed (${a.error})`);
        }
      }

      const score = scoreFor(product!, trend, competition, settings);
      const { data: snap } = await db
        .from("trend_snapshots")
        .insert({ product_id: id, ...trend })
        .select("id")
        .single();
      const { data: prev } = await db.from("opportunity_scores").select("overall").eq("product_id", id).order("overall", { ascending: false }).limit(1).maybeSingle();
      await db.from("opportunity_scores").insert({
        product_id: id,
        overall: score.overall,
        ...score.categories,
        weights: settings.scoring_weights,
        confidence: score.confidence,
        missing: score.missing,
        reasons: { ...score.reasons, ...(product!.ai_reasons ?? {}) },
        trend_snapshot_id: snap?.id ?? null,
        version: SCORE_VERSION,
      });

      if (opts.competitionSnapshot) {
        const { data: lastComp } = await db.from("competition_snapshots").select("captured_at").eq("product_id", id).eq("source", "monitored_sources").order("captured_at", { ascending: false }).limit(1).maybeSingle();
        if (!lastComp || Date.now() - new Date(lastComp.captured_at as string).getTime() > 20 * 3600_000) await snapshotObservedCompetition(db, id, trend);
      }

      const saturatedNow = isSaturated(trend, marketplaceSellers, settings.alert_thresholds);
      const ageDays = (Date.now() - new Date(product!.created_at).getTime()) / 86400_000;
      const status = saturatedNow || product!.status === "saturated" ? "saturated" : ageDays > 3 ? "tracking" : product!.status;
      await db
        .from("products")
        .update({
          latest_score: score.overall,
          latest_confidence: score.confidence,
          latest_acceleration: trend.acceleration,
          latest_competition: score.categories.competition,
          latest_creators: trend.unique_creators_total,
          scored_at: new Date().toISOString(),
          status,
        })
        .eq("id", id);
      if (saturatedNow && product!.status !== "saturated") out.saturated++;

      const candidates = evaluateAlerts({
        productId: id,
        score,
        trend,
        thresholds: settings.alert_thresholds,
        previousBestScore: prev ? Number(prev.overall) : null,
        saturated: saturatedNow && product!.status !== "saturated",
      });
      for (const c of candidates) {
        const { error } = await db.from("product_alerts").insert({ product_id: id, alert_type: c.type, fingerprint: c.fingerprint, reason: c.reason, payload: { score: score.overall } });
        if (!error) out.alerts++;
      }
      out.scored++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("score_failed", { product: id, message });
      out.errors.push(message);
    }
  }
  return out;
}

/** Competition as observed in the monitored sources only. Labelled as such everywhere it is shown. */
async function snapshotObservedCompetition(db: SupabaseClient, productId: string, trend: TrendMetrics) {
  const { data: rows } = await db.from("product_mentions").select("creator_id, author_name, platform, mention_type, observed_at, mentioned_name, url").eq("product_id", productId).limit(2000);
  const ms = rows ?? [];
  const key = (m: (typeof ms)[number]) => (m.creator_id as string | null) ?? `${m.platform}:${String(m.author_name ?? "").toLowerCase()}`;
  const byType = (t: string) => new Set(ms.filter((m) => m.mention_type === t).map(key)).size;
  const weekAgo = Date.now() - 7 * 86400_000;
  const firstByCreator = new Map<string, number>();
  for (const m of ms) {
    const t = new Date(m.observed_at as string).getTime();
    const k = key(m);
    firstByCreator.set(k, Math.min(firstByCreator.get(k) ?? t, t));
  }
  const promo = ms.filter((m) => PROMOTING.has(m.mention_type as string));
  const earliest = promo.length ? new Date(Math.min(...promo.map((m) => new Date(m.observed_at as string).getTime()))).toISOString() : null;
  await db.from("competition_snapshots").insert({
    product_id: productId,
    source: "monitored_sources",
    method: "Distinct creators seen promoting the product in the creators and links this tool monitors.",
    unique_creators: trend.unique_creators_total,
    promo_videos: promo.length,
    new_sellers_7d: [...firstByCreator.values()].filter((t) => t >= weekAgo).length,
    earliest_seller_at: earliest,
    names_in_use: new Set(ms.map((m) => String(m.mentioned_name).toLowerCase())).size,
    organic_creators: byType("organic_demo"),
    affiliates: byType("affiliate"),
    storefronts: byType("storefront"),
    paid_ads: byType("paid_ad"),
    confidence: "low",
    notes: "Covers only monitored sources; the real number of sellers is higher and unknown until marketplace research is connected.",
    evidence: promo.slice(0, 20).map((m) => ({ url: m.url, type: m.mention_type, at: m.observed_at })),
  });
}
