import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAi, type ContentBlock } from "@/lib/ai/client";
import { ASSESSMENT_SYSTEM } from "@/lib/ai/prompts";
import { AssessmentSchema } from "@/lib/ai/schemas";
import type { ProductRow } from "@/lib/data/types";
import type { TrendMetrics } from "@/lib/engine/trends";

// AI product assessment: organic-video potential, problem-solving appeal, cost and price estimates (labelled as
// estimates), a recommendation, and the organic video ideas. Runs only for products that clear the preliminary
// score threshold (or on request), and again only after new evidence arrives.

export async function assessProduct(db: SupabaseClient, product: ProductRow, trend: TrendMetrics): Promise<{ ok: boolean; error?: string }> {
  const [{ data: aliases }, { data: mentions }, { data: images }] = await Promise.all([
    db.from("product_aliases").select("alias, source").eq("product_id", product.id).neq("source", "search_term").limit(20),
    db
      .from("product_mentions")
      .select("platform, url, author_name, mentioned_name, mention_type, evidence_quote, observed_at, creator_videos(title, view_count, like_count)")
      .eq("product_id", product.id)
      .order("observed_at", { ascending: false })
      .limit(15),
    db.from("product_images").select("url").eq("product_id", product.id).limit(2),
  ]);

  const evidence = (mentions ?? [])
    .map((m) => {
      const v = (Array.isArray(m.creator_videos) ? m.creator_videos[0] : m.creator_videos) as { title?: string; view_count?: number | null; like_count?: number | null } | null;
      return `- ${String(m.observed_at).slice(0, 10)} ${m.platform} by ${m.author_name ?? "unknown"} (${m.mention_type}): "${m.mentioned_name}"${v?.title ? ` in "${v.title}"` : ""}${typeof v?.view_count === "number" ? `, ${v.view_count} views` : ""}${m.evidence_quote ? `; evidence: "${String(m.evidence_quote).slice(0, 200)}"` : ""}`;
    })
    .join("\n");

  const text = [
    `Product: ${product.canonical_name}`,
    `Other names seen: ${(aliases ?? []).map((a) => a.alias).join("; ") || "none"}`,
    `Function: ${product.function_summary ?? "unknown"}`,
    `Looks: ${product.visual_description ?? "unknown"}`,
    `Traits: ${product.physical_attributes?.join(", ") || "unknown"}`,
    `Category: ${product.category ?? "unknown"}`,
    "",
    "Observed trend metrics (from the sources this tool monitors only):",
    `first seen ${trend.age_days.toFixed(1)} days ago; mentions 24h/72h/7d/total: ${trend.mentions_24h}/${trend.mentions_72h}/${trend.mentions_7d}/${trend.mentions_total}; unique creators this week ${trend.unique_creators_7d}, all time ${trend.unique_creators_total}; platforms ${trend.unique_platforms}; acceleration ×${trend.acceleration}.`,
    `View growth: ${trend.engagement_growth === null ? "not measurable yet" : `${(trend.engagement_growth * 100).toFixed(0)}% per day`}. Search interest: not connected. Marketplace sellers: not researched.`,
    "",
    "Mentions (newest first):",
    evidence || "(none)",
  ].join("\n");

  const content: ContentBlock[] = [{ type: "text", text }];
  for (const img of images ?? []) if (/^https:\/\//.test(img.url as string)) content.push({ type: "image", source: { type: "url", url: img.url as string } });

  const res = await runAi(db, {
    task: "assess_product",
    system: ASSESSMENT_SYSTEM,
    content,
    schema: AssessmentSchema,
    effort: "medium",
    maxTokens: 16000,
    inputSummary: `assess ${product.canonical_name}`,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const a = res.data;
  const now = new Date().toISOString();
  const money = (n: number | null) => (n === null || !Number.isFinite(n) || n < 0 || n > 10000 ? null : Math.round(n * 100) / 100);

  await db
    .from("products")
    .update({
      description: a.description.slice(0, 1500),
      function_summary: product.function_summary ?? a.function_summary.slice(0, 500),
      problem_solved: a.problem_solved,
      est_supplier_cost_low: money(a.estimates.supplier_cost_low_usd),
      est_supplier_cost_high: money(a.estimates.supplier_cost_high_usd),
      est_shipping_cost: money(a.estimates.shipping_cost_usd),
      suggested_price_low: money(a.estimates.suggested_price_low_usd),
      suggested_price_high: money(a.estimates.suggested_price_high_usd),
      price_basis: a.estimates.basis.slice(0, 1000),
      ai_recommendation: a.recommendation.summary.slice(0, 2000),
      ai_verdict: a.recommendation.verdict,
      ai_risks: a.recommendation.risks.slice(0, 8),
      ai_recommendation_at: now,
      ai_organic_score: Math.max(0, Math.min(100, a.organic_video_potential.score)),
      ai_problem_score: Math.max(0, Math.min(100, a.problem_solving_appeal.score)),
      ai_reasons: { organic_video_potential: a.organic_video_potential.reason, problem_solving: a.problem_solving_appeal.reason },
      assessed_at: now,
      assessment_mentions: trend.mentions_total,
    })
    .eq("id", product.id);

  await db.from("video_ideas").update({ is_current: false }).eq("product_id", product.id).eq("is_current", true);
  await db.from("video_ideas").insert({ product_id: product.id, ideas: a.video_ideas, ai_run_id: res.runId, is_current: true });
  return { ok: true };
}
