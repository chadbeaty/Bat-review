import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAi } from "@/lib/ai/client";
import { MATCH_SYSTEM } from "@/lib/ai/prompts";
import { MatchSchema, type ExtractedProduct } from "@/lib/ai/schemas";
import { decideMatch, normalizeName, slugify, uniqueAliases, type MatchCandidate } from "@/lib/engine/names";

// Product identification: turns extracted product sightings into mentions of canonical products.
//  1. Look up existing products with similar names (pg_trgm on every known alias).
//  2. Same informative words → same product, no AI needed.
//  3. Otherwise ask Claude, giving each candidate's function and look, whether it is the same product.
//     Confident + same function → merge. Unsure → new product plus a suggestion for a person to review.
// Look-alikes with a different function are never merged automatically.

export type Sighting = {
  ref: string;
  product: ExtractedProduct;
  videoId: string | null;
  creatorId: string | null;
  platform: string;
  url: string;
  authorName: string | null;
  observedAt: string;
  thumbnailUrl: string | null;
  aiRunId: string | null;
};

export type MatchOutcome = { productIds: string[]; created: number; matched: number; suggestions: number; aiUnavailable: boolean };

const ACCEPT = 0.75;
const SUGGEST = 0.5;

type Decision = { s: Sighting; productId: string | null; method: "alias" | "ai" | "new"; confidence: number | null; suggestion?: { productId: string; confidence: number; reason: string } };

export async function matchAndRecord(db: SupabaseClient, sightings: Sighting[]): Promise<MatchOutcome> {
  const outcome: MatchOutcome = { productIds: [], created: 0, matched: 0, suggestions: 0, aiUnavailable: false };
  if (!sightings.length) return outcome;
  // Sightings that become new products in this batch, by normalised name, so repeats share one record.
  const createdInBatch = new Map<string, string>();

  type Pending = { s: Sighting; names: string[]; candidates: MatchCandidate[] };
  const needsAi: Pending[] = [];

  // One at a time, so a product created from an earlier sighting is already a candidate for the next one.
  for (const s of sightings) {
    const names = [s.product.suggested_canonical_name, s.product.name_as_mentioned, ...s.product.alternate_names].filter(Boolean);
    const d = decideMatch(names, await candidatesFor(db, names));
    if (d.kind === "exact") await record(db, { s, productId: d.productId, method: "alias", confidence: d.confidence }, createdInBatch, outcome);
    else if (d.kind === "needs_ai") needsAi.push({ s, names, candidates: d.candidates });
    else await record(db, { s, productId: null, method: "new", confidence: null }, createdInBatch, outcome);
  }

  if (needsAi.length) {
    const ids = [...new Set(needsAi.flatMap((p) => p.candidates.map((c) => c.productId)))];
    const { data: prods } = await db.from("products").select("id, canonical_name, function_summary, visual_description, physical_attributes, category").in("id", ids);
    const byId = new Map((prods ?? []).map((p) => [p.id as string, p]));
    const text = needsAi
      .map((p, i) => {
        const cands = p.candidates
          .map((c) => byId.get(c.productId))
          .filter(Boolean)
          .map((c) => `    - id ${c!.id}: "${c!.canonical_name}" | function: ${c!.function_summary ?? "unknown"} | looks: ${c!.visual_description ?? "unknown"} | traits: ${(c!.physical_attributes as string[] | null)?.join(", ") || "unknown"}`)
          .join("\n");
        return `Item ${i}:\n  name: ${p.s.product.suggested_canonical_name} (as written: "${p.s.product.name_as_mentioned}")\n  function: ${p.s.product.function}\n  looks: ${p.s.product.visual_description}\n  traits: ${p.s.product.physical_characteristics.join(", ")}\n  candidates:\n${cands}`;
      })
      .join("\n\n");
    const res = await runAi(db, {
      task: "match_products",
      system: MATCH_SYSTEM,
      content: [{ type: "text", text: `Decide for each item. Use item_ref "Item N".\n\n${text}` }],
      schema: MatchSchema,
      effort: "low",
      maxTokens: 8000,
      inputSummary: `match ${needsAi.length} item(s)`,
    });
    if (!res.ok) outcome.aiUnavailable = true;
    for (let i = 0; i < needsAi.length; i++) {
      const p = needsAi[i];
      const decision = res.ok ? res.data.decisions.find((d) => d.item_ref.replace(/\D/g, "") === String(i)) : undefined;
      const valid = decision?.match_product_id && p.candidates.some((c) => c.productId === decision.match_product_id) && decision.same_function;
      let d: Decision;
      if (valid && decision!.confidence >= ACCEPT) {
        d = { s: p.s, productId: decision!.match_product_id!, method: "ai", confidence: decision!.confidence };
      } else if (valid && decision!.confidence >= SUGGEST) {
        d = { s: p.s, productId: null, method: "new", confidence: null, suggestion: { productId: decision!.match_product_id!, confidence: decision!.confidence, reason: decision!.reason } };
      } else {
        // A product created from a later sighting in this batch may now be an exact name match.
        const again = decideMatch(p.names, await candidatesFor(db, p.names));
        if (again.kind === "exact") {
          await record(db, { s: p.s, productId: again.productId, method: "alias", confidence: again.confidence }, createdInBatch, outcome);
          continue;
        }
        // Without an AI answer, near-matches are flagged for a person instead of silently merged or lost.
        const top = p.candidates[0];
        d = {
          s: p.s, productId: null, method: "new", confidence: null,
          suggestion: !res.ok && top && top.similarity >= 0.45 ? { productId: top.productId, confidence: top.similarity, reason: "Similar name; automatic matching was unavailable." } : undefined,
        };
      }
      await record(db, d, createdInBatch, outcome);
    }
  }
  return outcome;
}

async function candidatesFor(db: SupabaseClient, names: string[]): Promise<MatchCandidate[]> {
  const { data } = await db.rpc("match_product_candidates", { p_names: names.map(normalizeName), p_limit: 8 });
  return ((data ?? []) as { product_id: string; best_alias: string; similarity: number }[]).map((r) => ({
    productId: r.product_id,
    alias: r.best_alias,
    similarity: Number(r.similarity),
  }));
}

async function record(db: SupabaseClient, d: Decision, createdInBatch: Map<string, string>, outcome: MatchOutcome) {
  let productId = d.productId;
  const key = normalizeName(d.s.product.suggested_canonical_name);
  if (!productId && createdInBatch.has(key)) productId = createdInBatch.get(key)!;
  if (!productId) {
    productId = await createProduct(db, d.s.product);
    createdInBatch.set(key, productId);
    outcome.created++;
    if (d.suggestion) {
      await db.from("match_suggestions").upsert(
        { product_id: productId, candidate_product_id: d.suggestion.productId, confidence: d.suggestion.confidence, reason: d.suggestion.reason.slice(0, 500) },
        { onConflict: "product_id,candidate_product_id", ignoreDuplicates: true },
      );
      outcome.suggestions++;
    }
  } else {
    outcome.matched++;
  }
  await addAliases(db, productId, d.s.product);
  const { data: mention } = await db
    .from("product_mentions")
    .insert({
      product_id: productId,
      video_id: d.s.videoId,
      creator_id: d.s.creatorId,
      platform: d.s.platform,
      url: d.s.url,
      author_name: d.s.authorName,
      mentioned_name: d.s.product.name_as_mentioned.slice(0, 300),
      evidence_location: d.s.product.evidence_location,
      evidence_quote: d.s.product.evidence_quote.slice(0, 1000),
      mention_type: d.s.product.mention_type,
      observed_at: d.s.observedAt,
      match_method: d.method,
      match_confidence: d.confidence,
      extraction: d.s.product,
      ai_run_id: d.s.aiRunId,
    })
    .select("id")
    .single();
  if (d.s.thumbnailUrl && d.s.product.evidence_location === "thumbnail") {
    await db.from("product_images").upsert(
      { product_id: productId, url: d.s.thumbnailUrl, source_url: d.s.url, kind: "thumbnail", mention_id: mention?.id ?? null },
      { onConflict: "product_id,url", ignoreDuplicates: true },
    );
    await db.from("products").update({ primary_image_url: d.s.thumbnailUrl }).eq("id", productId).is("primary_image_url", null);
  }
  await db.rpc("refresh_first_observed", { p_product: productId });
  if (!outcome.productIds.includes(productId)) outcome.productIds.push(productId);
}

async function createProduct(db: SupabaseClient, p: ExtractedProduct): Promise<string> {
  const base = slugify(p.suggested_canonical_name);
  for (let n = 0; n < 50; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const { data, error } = await db
      .from("products")
      .insert({
        canonical_name: p.suggested_canonical_name.slice(0, 120),
        slug,
        function_summary: p.function.slice(0, 500),
        category: p.category.slice(0, 60),
        physical_attributes: p.physical_characteristics.slice(0, 12),
        visual_description: p.visual_description.slice(0, 500),
        problem_solved: p.problem_solved,
      })
      .select("id")
      .single();
    if (!error && data) return data.id as string;
    if (error && error.code !== "23505") throw new Error(`Could not create product: ${error.message}`);
  }
  throw new Error("Could not find a free product slug");
}

async function addAliases(db: SupabaseClient, productId: string, p: ExtractedProduct) {
  const rows = [
    ...uniqueAliases([p.suggested_canonical_name, p.name_as_mentioned]).map((a) => ({ ...a, source: "mention" as const, confidence: p.confidence })),
    ...uniqueAliases(p.alternate_names).map((a) => ({ ...a, source: "ai" as const, confidence: 0.6 })),
    ...uniqueAliases(p.search_terms).map((a) => ({ ...a, source: "search_term" as const, confidence: 0.4 })),
  ];
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.normalized) ? false : (seen.add(r.normalized), true))).slice(0, 25);
  if (!unique.length) return;
  await db.from("product_aliases").upsert(
    unique.map((r) => ({ product_id: productId, alias: r.alias, alias_normalized: r.normalized, source: r.source, confidence: r.confidence })),
    { onConflict: "product_id,alias_normalized", ignoreDuplicates: true },
  );
}
