import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUploadsFeed, YoutubeClient, type VideoInfo } from "@/lib/connectors/youtube";
import type { CreatorRow } from "@/lib/data/types";
import type { Settings } from "@/lib/settings";
import { recordUsage, type Deadline } from "@/lib/jobs/lock";
import { log } from "@/lib/log";

// Polls each verified, active creator for new uploads and refreshes view counts on their recent videos.
// One creator failing (deleted channel, quota, network) never stops the others.

export type IngestResult = { creatorsChecked: number; newVideos: number; statsRefreshed: number; errors: { creator: string; error: string }[]; usedFallback: boolean; quotaUnits: number };

export function youtubeClient(f?: typeof fetch): YoutubeClient | null {
  const key = process.env.YOUTUBE_API_KEY;
  return key ? new YoutubeClient(key, f) : null;
}

export async function pollYoutubeCreators(db: SupabaseClient, settings: Settings, deadline: Deadline, opts: { force?: boolean; creatorId?: string; fetch?: typeof fetch } = {}): Promise<IngestResult> {
  const yt = youtubeClient(opts.fetch);
  const s = settings.youtube;
  const dueBefore = new Date(Date.now() - (s.poll_interval_hours - 0.25) * 3600_000).toISOString();
  let q = db.from("creators").select("*").eq("platform", "youtube").eq("is_active", true).order("last_polled_at", { ascending: true, nullsFirst: true });
  if (opts.creatorId) q = q.eq("id", opts.creatorId);
  else if (!opts.force) q = q.or(`last_polled_at.is.null,last_polled_at.lt.${dueBefore}`);
  const { data: creators, error } = await q.limit(50);
  if (error) throw new Error(error.message);

  const result: IngestResult = { creatorsChecked: 0, newVideos: 0, statsRefreshed: 0, errors: [], usedFallback: !yt, quotaUnits: 0 };
  const lookbackMs = s.lookback_days * 86400_000;

  for (const creator of (creators ?? []) as CreatorRow[]) {
    if (deadline.remaining() < 30_000) break;
    result.creatorsChecked++;
    try {
      let videos: VideoInfo[];
      let existingRecentIds: string[] = [];
      const { data: known } = await db
        .from("creator_videos")
        .select("external_id, published_at")
        .eq("creator_id", creator.id)
        .gte("first_seen_at", new Date(Date.now() - 90 * 86400_000).toISOString());
      const knownIds = new Set((known ?? []).map((k) => k.external_id as string));
      const statsCutoff = Date.now() - s.stats_refresh_days * 86400_000;
      existingRecentIds = (known ?? []).filter((k) => k.published_at && new Date(k.published_at as string).getTime() >= statsCutoff).map((k) => k.external_id as string);

      if (yt) {
        let playlist = creator.uploads_playlist_id;
        if (!playlist) {
          const info = await yt.resolveChannel(creator.channel_id!);
          playlist = info?.uploadsPlaylistId ?? null;
          if (!info || !playlist) throw new Error("Channel not found through the YouTube API (deleted or renamed?).");
          await db.from("creators").update({ uploads_playlist_id: playlist, subscriber_count: info.subscriberCount, channel_title: info.title }).eq("id", creator.id);
        }
        const uploads = await yt.recentUploadIds(playlist, 25);
        const fresh = uploads
          .filter((u) => !knownIds.has(u.videoId) && (!u.publishedAt || Date.now() - new Date(u.publishedAt).getTime() <= lookbackMs))
          .slice(0, s.max_new_videos_per_creator)
          .map((u) => u.videoId);
        videos = await yt.getVideos([...new Set([...fresh, ...existingRecentIds])]);
      } else {
        // No API key: the public upload feed gives titles, descriptions, thumbnails and view counts only.
        const feed = await fetchUploadsFeed(creator.channel_id!, opts.fetch);
        videos = feed.filter((v) => knownIds.has(v.videoId) ? existingRecentIds.includes(v.videoId) : !v.publishedAt || Date.now() - new Date(v.publishedAt).getTime() <= lookbackMs);
      }

      const now = new Date().toISOString();
      for (const v of videos) {
        const isNew = !knownIds.has(v.videoId);
        const row = {
          creator_id: creator.id,
          platform: "youtube",
          external_id: v.videoId,
          url: v.url,
          title: v.title,
          description: v.description,
          tags: v.tags,
          thumbnail_url: v.thumbnailUrl,
          author_name: v.channelTitle ?? creator.display_name,
          published_at: v.publishedAt,
          duration_seconds: v.durationSeconds,
          view_count: v.viewCount,
          like_count: v.likeCount,
          comment_count: v.commentCount,
          stats_observed_at: now,
        };
        const { data: saved, error: upErr } = await db.from("creator_videos").upsert(row, { onConflict: "platform,external_id" }).select("id").single();
        if (upErr || !saved) {
          log.warn("video_upsert_failed", { video: v.videoId, message: upErr?.message });
          continue;
        }
        if (v.viewCount !== null || v.likeCount !== null) {
          await db.from("video_stat_snapshots").insert({ video_id: saved.id, observed_at: now, view_count: v.viewCount, like_count: v.likeCount, comment_count: v.commentCount });
        }
        if (isNew) result.newVideos++;
        else result.statsRefreshed++;
      }
      await db.from("creators").update({ last_polled_at: now, last_error: null }).eq("id", creator.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push({ creator: creator.display_name, error: message });
      await db.from("creators").update({ last_error: message.slice(0, 500), last_polled_at: new Date().toISOString() }).eq("id", creator.id);
      log.warn("creator_poll_failed", { creator: creator.id, message });
      if (/quota/i.test(message)) break;
    }
  }
  if (yt) {
    result.quotaUnits = yt.unitsUsed;
    await recordUsage(db, "youtube", "poll", yt.unitsUsed);
  }
  return result;
}
