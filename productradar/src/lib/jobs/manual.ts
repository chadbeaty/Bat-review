import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPlatform, fetchProductPage, fetchTiktokOembed, tiktokVideoId } from "@/lib/connectors/manual";
import { fetchOembed, parseYoutubeInput } from "@/lib/connectors/youtube";
import type { Settings } from "@/lib/settings";
import { analyzeVideos } from "@/lib/jobs/analyze";
import { recordUsage, type Deadline } from "@/lib/jobs/lock";
import { scoreProducts } from "@/lib/jobs/score";
import { youtubeClient } from "@/lib/jobs/youtube-ingest";

// Processes one manually submitted URL: collects what the platform legitimately provides, stores it with the
// owner's notes, runs AI product extraction on it, and scores any products found.

export type SubmissionOutcome = { status: "analyzed" | "stored" | "failed"; message: string; productIds: string[] };

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 24);

export async function processSubmission(db: SupabaseClient, submissionId: string, settings: Settings, deadline: Deadline): Promise<SubmissionOutcome> {
  const { data: sub } = await db.from("manual_submissions").select("*").eq("id", submissionId).single();
  if (!sub) return { status: "failed", message: "Submission not found", productIds: [] };
  await db.from("manual_submissions").update({ status: "processing" }).eq("id", submissionId);
  const notes = (sub.notes as string | null)?.trim() || null;
  const finish = async (o: SubmissionOutcome, videoId?: string | null) => {
    await db.from("manual_submissions").update({ status: o.status, result: o.message.slice(0, 1000), processed_at: new Date().toISOString(), video_id: videoId ?? null }).eq("id", submissionId);
    return o;
  };

  const detected = detectPlatform(sub.url as string);
  if (!detected) return finish({ status: "failed", message: "That isn't a public web address.", productIds: [] });
  const { platform, url } = detected;

  let row: Record<string, unknown> | null = null;
  let note = "";

  if (platform === "youtube") {
    const input = parseYoutubeInput(url.toString());
    if (input.kind !== "video") return finish({ status: "failed", message: "That looks like a channel link. Add channels on Admin → Creators; paste individual video links here.", productIds: [] });
    const yt = youtubeClient();
    if (yt) {
      const [v] = await yt.getVideos([input.value]);
      await recordUsage(db, "youtube", "manual", yt.unitsUsed);
      if (!v) return finish({ status: "failed", message: "YouTube says that video doesn't exist or isn't public.", productIds: [] });
      const { data: creator } = v.channelId ? await db.from("creators").select("id").eq("channel_id", v.channelId).maybeSingle() : { data: null };
      row = {
        creator_id: creator?.id ?? null, platform: "youtube", external_id: v.videoId, url: v.url, title: v.title, description: v.description, tags: v.tags,
        thumbnail_url: v.thumbnailUrl, author_name: v.channelTitle, published_at: v.publishedAt, duration_seconds: v.durationSeconds,
        view_count: v.viewCount, like_count: v.likeCount, comment_count: v.commentCount, stats_observed_at: new Date().toISOString(),
      };
    } else {
      const o = await fetchOembed(url.toString());
      if (!o) return finish({ status: "failed", message: "Couldn't read that video (no YouTube API key set, and the public lookup failed).", productIds: [] });
      row = { platform: "youtube", external_id: input.value, url: `https://www.youtube.com/watch?v=${input.value}`, title: o.title, author_name: o.author_name, thumbnail_url: o.thumbnail_url };
      note = " (read without an API key: no description or view counts)";
    }
  } else if (platform === "tiktok") {
    const o = await fetchTiktokOembed(url.toString());
    const id = o?.embed_product_id ?? tiktokVideoId(url);
    if (!id) return finish({ status: "failed", message: "Couldn't find a TikTok video id in that link. Use the full link (tiktok.com/@user/video/…).", productIds: [] });
    const author = url.pathname.match(/\/@([\w.\-]+)/)?.[1] ?? o?.author_name ?? null;
    row = { platform: "tiktok", external_id: id, url: `https://www.tiktok.com/${author ? `@${author}/` : ""}video/${id}`, title: o?.title ?? null, author_name: author, thumbnail_url: o?.thumbnail_url ?? null };
    note = " TikTok's public lookup returns only the video id, so the analysis relies on your notes.";
  } else if (platform === "web") {
    const page = await fetchProductPage(url);
    if (page.ok) {
      row = {
        platform: "web", external_id: hash(url.toString()), url: url.toString(), title: page.meta.title, description: [page.meta.description, page.meta.price ? `Listed price: ${page.meta.price} ${page.meta.currency ?? ""}` : null].filter(Boolean).join("\n"),
        thumbnail_url: page.meta.image?.startsWith("https://") ? page.meta.image : null, author_name: page.meta.siteName ?? url.hostname, raw: { meta: page.meta },
      };
    } else {
      row = { platform: "web", external_id: hash(url.toString()), url: url.toString(), title: null, author_name: url.hostname };
      note = ` ${page.reason}`;
    }
  } else {
    // Instagram, Reddit and marketplaces: stored as links; their terms or APIs don't allow reading them here.
    const p = platform === "marketplace" ? "web" : platform;
    row = { platform: p, external_id: hash(url.toString()), url: url.toString(), title: null, author_name: url.hostname };
    note = platform === "marketplace"
      ? " Marketplace pages are not fetched automatically (their terms forbid it), so the analysis relies on your notes."
      : " This platform's content can't be read without an approved API, so the analysis relies on your notes.";
  }

  const hasText = Boolean(row.title || row.description || notes);
  const { data: saved, error } = await db
    .from("creator_videos")
    .upsert({ ...row, owner_notes: notes, analysis_status: hasText ? "pending" : "skipped" }, { onConflict: "platform,external_id" })
    .select("id")
    .single();
  if (error || !saved) return finish({ status: "failed", message: `Couldn't store it: ${error?.message ?? "unknown"}`, productIds: [] });

  if (!hasText) return finish({ status: "stored", message: `Saved, but there is nothing to analyse yet.${note} Add notes describing the product and submit again.`, productIds: [] }, saved.id);

  const analysis = await analyzeVideos(db, settings, deadline, { videoIds: [saved.id] });
  if (analysis.stoppedBy && !analysis.videosAnalyzed) return finish({ status: "stored", message: `Saved. Analysis didn't run: ${analysis.stoppedBy}.${note}`, productIds: [] }, saved.id);
  if (analysis.productsTouched.length) await scoreProducts(db, settings, analysis.productsTouched, deadline, { allowAssess: true, competitionSnapshot: true });
  const found = analysis.productsTouched.length;
  return finish(
    { status: "analyzed", message: found ? `Found ${found} product(s): ${analysis.created} new, ${analysis.matched} matched to existing.${note}` : `No specific physical product was identified.${note}`, productIds: analysis.productsTouched },
    saved.id,
  );
}
