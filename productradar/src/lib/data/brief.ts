import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductRow, VideoIdeas } from "@/lib/data/types";

// Everything an alert or digest needs to say about one product, each fact with its source.

export type ProductBrief = {
  product: ProductRow;
  firstSeen: { at: string | null; platform: string | null; creator: string | null; url: string | null };
  competition: { creators: number | null; promoVideos: number | null; confidence: string; note: string } | null;
  sources: { url: string; label: string; at: string }[];
  ideas: string[];
  reasons: string[];
};

export async function productBrief(db: SupabaseClient, productId: string): Promise<ProductBrief | null> {
  const { data: product } = await db.from("products").select("*").eq("id", productId).maybeSingle();
  if (!product) return null;
  const p = product as ProductRow;
  const [{ data: creator }, { data: comp }, { data: mentions }, { data: ideas }] = await Promise.all([
    p.first_observed_creator_id ? db.from("creators").select("display_name").eq("id", p.first_observed_creator_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("competition_snapshots").select("unique_creators, promo_videos, confidence, notes, source").eq("product_id", productId).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("product_mentions").select("url, author_name, platform, observed_at").eq("product_id", productId).order("observed_at", { ascending: true }).limit(5),
    db.from("video_ideas").select("ideas").eq("product_id", productId).eq("is_current", true).order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const v = ideas?.ideas as VideoIdeas | undefined;
  const ideaList = v ? [...v.problem_solution.map((i) => `${i.title}: ${i.concept}`), `${v.pov_demo.title}: ${v.pov_demo.concept}`].slice(0, 3) : [];
  return {
    product: p,
    firstSeen: { at: p.first_observed_at, platform: p.first_observed_platform, creator: (creator?.display_name as string | undefined) ?? null, url: p.first_observed_url },
    competition: comp
      ? { creators: comp.unique_creators as number | null, promoVideos: comp.promo_videos as number | null, confidence: comp.confidence as string, note: (comp.notes as string | null) ?? "" }
      : null,
    sources: (mentions ?? []).map((m) => ({ url: m.url as string, label: `${m.platform} · ${m.author_name ?? "unknown"}`, at: m.observed_at as string })),
    ideas: ideaList,
    reasons: [],
  };
}
