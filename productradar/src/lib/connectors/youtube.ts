import { decodeEntities, getJson, getText, SourceUnavailable, type FetchLike } from "@/lib/connectors/http";

// YouTube connector built on the official YouTube Data API v3 (free, 10,000 quota units/day):
//   channels.list (1 unit)       verify a channel and get its uploads playlist
//   playlistItems.list (1 unit)  newest uploads, 50 per call
//   videos.list (1 unit)         full description, tags, duration and public view/like/comment counts, 50 per call
// Not used: search.list (separate 100-call/day bucket) and captions.download, which only works for people who can
// edit the video, so other creators' transcripts are not legitimately available.
// Without an API key, the public channel upload feed (RSS) and oEmbed are used as a limited fallback.

const API = "https://www.googleapis.com/youtube/v3";

export type ChannelInfo = {
  channelId: string;
  title: string;
  handle: string | null;
  url: string;
  uploadsPlaylistId: string | null;
  subscriberCount: number | null;
  description: string;
  thumbnailUrl: string | null;
};

export type VideoInfo = {
  videoId: string;
  channelId: string | null;
  channelTitle: string | null;
  url: string;
  title: string;
  description: string;
  tags: string[];
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type YoutubeInput =
  | { kind: "channel_id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "video"; value: string }
  | { kind: "unsupported"; value: string };

export function parseYoutubeInput(raw: string): YoutubeInput {
  const input = raw.trim();
  if (/^UC[\w-]{22}$/.test(input)) return { kind: "channel_id", value: input };
  if (/^@[\w.\-·]{3,100}$/.test(input)) return { kind: "handle", value: input.slice(1) };
  let url: URL;
  try {
    url = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return { kind: "unsupported", value: input };
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? { kind: "video", value: id } : { kind: "unsupported", value: input };
  }
  if (host !== "youtube.com" && host !== "music.youtube.com") return { kind: "unsupported", value: input };
  const parts = url.pathname.split("/").filter(Boolean);
  const v = url.searchParams.get("v");
  if (parts[0] === "watch" && v && /^[\w-]{11}$/.test(v)) return { kind: "video", value: v };
  if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "") && /^[\w-]{11}$/.test(parts[1] ?? "")) return { kind: "video", value: parts[1] };
  if (parts[0]?.startsWith("@")) return { kind: "handle", value: decodeURIComponent(parts[0].slice(1)) };
  if (parts[0] === "channel" && /^UC[\w-]{22}$/.test(parts[1] ?? "")) return { kind: "channel_id", value: parts[1] };
  if (parts[0] === "user" && parts[1]) return { kind: "username", value: parts[1] };
  return { kind: "unsupported", value: input };
}

export function extractVideoId(raw: string): string | null {
  const p = parseYoutubeInput(raw);
  return p.kind === "video" ? p.value : null;
}

/** ISO 8601 duration (PT1H2M3S) to seconds. */
export function parseIsoDuration(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = d.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Math.round(Number(m[4] ?? 0));
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

type ApiChannel = {
  id: string;
  snippet?: { title?: string; description?: string; customUrl?: string; thumbnails?: Record<string, { url: string }> };
  statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean };
  contentDetails?: { relatedPlaylists?: { uploads?: string } };
};

type ApiVideo = {
  id: string;
  snippet?: { channelId?: string; channelTitle?: string; title?: string; description?: string; tags?: string[]; publishedAt?: string; thumbnails?: Record<string, { url: string }> };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
};

function bestThumb(t?: Record<string, { url: string }>): string | null {
  if (!t) return null;
  return (t.maxres ?? t.standard ?? t.high ?? t.medium ?? t.default)?.url ?? null;
}

export class YoutubeClient {
  unitsUsed = 0;
  constructor(private apiKey: string, private f: FetchLike = fetch) {}

  private async call<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, key: this.apiKey });
    this.unitsUsed += 1;
    try {
      return await getJson<T>(`${API}/${path}?${qs}`, { fetch: this.f });
    } catch (err) {
      if (err instanceof SourceUnavailable && /403/.test(err.message)) {
        throw new SourceUnavailable("YouTube refused the request (HTTP 403): the API key is invalid, the API is not enabled, or today's quota is used up.");
      }
      throw err;
    }
  }

  async resolveChannel(raw: string): Promise<ChannelInfo | null> {
    const input = parseYoutubeInput(raw);
    const params: Record<string, string> = { part: "snippet,statistics,contentDetails", maxResults: "1" };
    if (input.kind === "channel_id") params.id = input.value;
    else if (input.kind === "handle") params.forHandle = input.value;
    else if (input.kind === "username") params.forUsername = input.value;
    else if (input.kind === "video") {
      const [v] = await this.getVideos([input.value]);
      if (!v?.channelId) return null;
      params.id = v.channelId;
    } else return null;
    const res = await this.call<{ items?: ApiChannel[] }>("channels", params);
    const c = res.items?.[0];
    if (!c) return null;
    return {
      channelId: c.id,
      title: c.snippet?.title ?? "",
      handle: c.snippet?.customUrl ?? null,
      url: c.snippet?.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
      uploadsPlaylistId: c.contentDetails?.relatedPlaylists?.uploads ?? null,
      subscriberCount: c.statistics?.hiddenSubscriberCount ? null : num(c.statistics?.subscriberCount),
      description: c.snippet?.description ?? "",
      thumbnailUrl: bestThumb(c.snippet?.thumbnails),
    };
  }

  /** Newest video ids in an uploads playlist (newest first). */
  async recentUploadIds(playlistId: string, max = 25): Promise<{ videoId: string; publishedAt: string | null }[]> {
    const res = await this.call<{ items?: { contentDetails?: { videoId?: string; videoPublishedAt?: string } }[] }>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: String(Math.min(50, Math.max(1, max))),
    });
    return (res.items ?? [])
      .map((i) => ({ videoId: i.contentDetails?.videoId ?? "", publishedAt: i.contentDetails?.videoPublishedAt ?? null }))
      .filter((i) => i.videoId);
  }

  async getVideos(ids: string[]): Promise<VideoInfo[]> {
    const out: VideoInfo[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      if (!chunk.length) continue;
      const res = await this.call<{ items?: ApiVideo[] }>("videos", { part: "snippet,statistics,contentDetails", id: chunk.join(",") });
      for (const v of res.items ?? []) out.push(mapApiVideo(v));
    }
    return out;
  }
}

export function mapApiVideo(v: ApiVideo): VideoInfo {
  return {
    videoId: v.id,
    channelId: v.snippet?.channelId ?? null,
    channelTitle: v.snippet?.channelTitle ?? null,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: v.snippet?.title ?? "",
    description: v.snippet?.description ?? "",
    tags: v.snippet?.tags ?? [],
    thumbnailUrl: bestThumb(v.snippet?.thumbnails),
    publishedAt: v.snippet?.publishedAt ?? null,
    durationSeconds: parseIsoDuration(v.contentDetails?.duration),
    viewCount: num(v.statistics?.viewCount),
    likeCount: num(v.statistics?.likeCount),
    commentCount: num(v.statistics?.commentCount),
  };
}

/** Parses YouTube's public channel upload feed (the fallback when no API key is configured). */
export function parseUploadsFeed(xml: string): VideoInfo[] {
  const entries = xml.split("<entry>").slice(1);
  const tag = (s: string, name: string) => {
    const m = s.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
    return m ? decodeEntities(m[1].trim()) : null;
  };
  return entries
    .map((e) => {
      const videoId = tag(e, "yt:videoId") ?? "";
      const views = e.match(/<media:statistics views="(\d+)"/);
      const thumb = e.match(/<media:thumbnail url="([^"]+)"/);
      const link = e.match(/<link rel="alternate" href="([^"]+)"/);
      return {
        videoId,
        channelId: tag(e, "yt:channelId") ? `UC${tag(e, "yt:channelId")!.replace(/^UC/, "")}` : null,
        channelTitle: tag(e, "name"),
        url: link?.[1] ?? `https://www.youtube.com/watch?v=${videoId}`,
        title: tag(e, "media:title") ?? tag(e, "title") ?? "",
        description: tag(e, "media:description") ?? "",
        tags: [],
        thumbnailUrl: thumb?.[1] ?? null,
        publishedAt: tag(e, "published"),
        durationSeconds: null,
        viewCount: views ? Number(views[1]) : null,
        likeCount: null,
        commentCount: null,
      } satisfies VideoInfo;
    })
    .filter((v) => v.videoId);
}

export async function fetchUploadsFeed(channelId: string, f: FetchLike = fetch): Promise<VideoInfo[]> {
  const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { fetch: f });
  return parseUploadsFeed(xml);
}

/** Public oEmbed lookup for one video (title, channel name, thumbnail). No key needed; no description or stats. */
export async function fetchOembed(videoUrl: string, f: FetchLike = fetch): Promise<{ title: string; author_name: string; author_url: string; thumbnail_url: string } | null> {
  try {
    return await getJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`, { fetch: f, retries: 1 });
  } catch {
    return null;
  }
}
