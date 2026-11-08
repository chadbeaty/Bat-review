import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, runAi, type ContentBlock } from "@/lib/ai/client";
import { EXTRACTION_SYSTEM } from "@/lib/ai/prompts";
import { ExtractionSchema } from "@/lib/ai/schemas";
import type { VideoRow } from "@/lib/data/types";
import type { Settings } from "@/lib/settings";
import { matchAndRecord, type Sighting } from "@/lib/jobs/match";
import type { Deadline } from "@/lib/jobs/lock";

// AI product extraction: reads new videos (title, description, tags and thumbnail image) in small batches and
// records each product it finds as a mention, grouped under a canonical product.

const BATCH = 6;
const MIN_CONFIDENCE = 0.5;
const MAX_ATTEMPTS = 3;

export type AnalyzeResult = { videosAnalyzed: number; videosFailed: number; errors: string[]; productsTouched: string[]; created: number; matched: number; suggestions: number; stoppedBy: string | null };

/** YouTube's 480×360 thumbnail is plenty to recognise a product and costs about a fifth of the 1280×720 one. */
export function aiThumbnail(url: string): string {
  return url.replace(/\/(maxresdefault|sddefault)\.jpg$/, "/hqdefault.jpg");
}

export function buildVideoBlocks(videos: VideoRow[], creatorNames: Map<string, string>): ContentBlock[] {
  const blocks: ContentBlock[] = [{ type: "text", text: `Videos to check: ${videos.length}. Report products per video using its ref.` }];
  videos.forEach((v, i) => {
    const desc = (v.description ?? "").replace(/https?:\/\/\S+/g, (u) => (u.length > 60 ? `${u.slice(0, 60)}…` : u)).slice(0, 2500);
    blocks.push({
      type: "text",
      text: [
        `--- ref: v${i} ---`,
        `platform: ${v.platform}`,
        `channel: ${(v.creator_id && creatorNames.get(v.creator_id)) || v.author_name || "unknown"}`,
        `published: ${v.published_at ?? "unknown"}`,
        `title: ${v.title ?? "(none)"}`,
        `tags: ${v.tags?.length ? v.tags.slice(0, 25).join(", ") : "(none)"}`,
        `description: ${desc || "(none)"}`,
        v.owner_notes ? `owner_notes (written by the tool's owner about this post): ${v.owner_notes.slice(0, 1500)}` : null,
        v.thumbnail_url ? "thumbnail: (image follows)" : "thumbnail: (none)",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (v.thumbnail_url && /^https:\/\//.test(v.thumbnail_url)) blocks.push({ type: "image", source: { type: "url", url: aiThumbnail(v.thumbnail_url) } });
  });
  return blocks;
}

export async function analyzeVideos(db: SupabaseClient, settings: Settings, deadline: Deadline, opts: { videoIds?: string[] } = {}): Promise<AnalyzeResult> {
  const result: AnalyzeResult = { videosAnalyzed: 0, videosFailed: 0, errors: [], productsTouched: [], created: 0, matched: 0, suggestions: 0, stoppedBy: null };
  if (!aiConfigured()) {
    result.stoppedBy = "AI not configured";
    return result;
  }
  let q = db.from("creator_videos").select("*").order("first_seen_at", { ascending: true });
  if (opts.videoIds?.length) q = q.in("id", opts.videoIds);
  else q = q.in("analysis_status", ["pending", "failed"]).lt("analysis_attempts", MAX_ATTEMPTS);
  const { data, error } = await q.limit(settings.ai.max_videos_per_run);
  if (error) throw new Error(error.message);
  const videos = (data ?? []) as VideoRow[];
  if (!videos.length) return result;

  const creatorIds = [...new Set(videos.map((v) => v.creator_id).filter(Boolean))] as string[];
  const { data: creators } = creatorIds.length ? await db.from("creators").select("id, display_name").in("id", creatorIds) : { data: [] };
  const creatorNames = new Map((creators ?? []).map((c) => [c.id as string, c.display_name as string]));

  for (let i = 0; i < videos.length; i += BATCH) {
    if (deadline.remaining() < 60_000) {
      result.stoppedBy = "time limit (continues next run)";
      break;
    }
    const batch = videos.slice(i, i + BATCH);
    const ids = batch.map((v) => v.id);
    const res = await runAi(db, {
      task: "extract_products",
      system: EXTRACTION_SYSTEM,
      content: buildVideoBlocks(batch, creatorNames),
      schema: ExtractionSchema,
      effort: "low",
      maxTokens: 12000,
      inputSummary: `extract from ${batch.length} video(s): ${batch.map((v) => v.external_id).join(", ")}`,
    });
    const now = new Date().toISOString();
    if (!res.ok) {
      for (const v of batch) {
        await db
          .from("creator_videos")
          .update({ analysis_status: "failed", analysis_attempts: res.budget ? v.analysis_attempts : v.analysis_attempts + 1, analysis_error: res.error.slice(0, 500) })
          .eq("id", v.id);
      }
      result.videosFailed += batch.length;
      if (!result.errors.includes(res.error)) result.errors.push(res.error);
      if (res.budget || !res.retryable) {
        result.stoppedBy = res.error;
        break;
      }
      continue;
    }

    const sightings: Sighting[] = [];
    const productVideos = new Set<string>();
    batch.forEach((v, idx) => {
      const out = res.data.videos.find((x) => x.video_ref === `v${idx}`);
      for (const p of out?.products ?? []) {
        if (p.confidence < MIN_CONFIDENCE) continue;
        productVideos.add(v.id);
        sightings.push({
          ref: `v${idx}`,
          product: p,
          videoId: v.id,
          creatorId: v.creator_id,
          platform: v.platform,
          url: v.url,
          authorName: v.author_name,
          observedAt: v.published_at ?? v.first_seen_at,
          thumbnailUrl: v.thumbnail_url,
          aiRunId: res.runId,
        });
      }
    });
    // A deliberate re-analysis replaces that video's earlier mentions instead of double-counting them.
    if (opts.videoIds?.length) await db.from("product_mentions").delete().in("video_id", ids);
    const m = await matchAndRecord(db, sightings);
    result.created += m.created;
    result.matched += m.matched;
    result.suggestions += m.suggestions;
    for (const id of m.productIds) if (!result.productsTouched.includes(id)) result.productsTouched.push(id);
    for (const id of ids) {
      await db
        .from("creator_videos")
        .update({ analysis_status: productVideos.has(id) ? "analyzed" : "skipped", analyzed_at: now, analysis_error: null, analysis_attempts: (batch.find((b) => b.id === id)?.analysis_attempts ?? 0) + 1 })
        .eq("id", id);
    }
    result.videosAnalyzed += batch.length;
  }
  return result;
}
