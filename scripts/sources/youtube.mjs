// YouTube: comments on bat review and hitting videos. Needs YOUTUBE_API_KEY (free from Google Cloud).
// Each family search costs 100 quota units out of the free 10,000 per day, so a weekly run fits easily.

import { createClient } from "../lib/http.mjs";
import { decodeEntities } from "../lib/text.mjs";

export async function collectYouTube(config, families, log) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    log("  No YOUTUBE_API_KEY set, skipping YouTube");
    return { docs: [], stats: { skipped: 1 } };
  }
  const cfg = { videosPerFamily: 3, commentsPerVideo: 100, maxAgeDays: 730, ...config };
  const http = createClient({ delayMs: 200, log });
  const after = new Date(Date.now() - cfg.maxAgeDays * 864e5).toISOString();
  const docs = [];
  let videos = 0;

  for (const f of families) {
    const name = f.name.replace(/\(.*?\)/g, "").split("/")[0].trim();
    const q = `${f.brand} ${name} slowpitch bat`;
    let items = [];
    try {
      const res = await http.json(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${cfg.videosPerFamily}&publishedAfter=${after}&q=${encodeURIComponent(q)}&key=${key}`
      );
      items = res.items || [];
    } catch (err) {
      log(`  search ${f.id}: ${err.message}`);
      if (err.status === 403) break; // quota used up
      continue;
    }
    for (const v of items) {
      const vid = v.id?.videoId;
      if (!vid) continue;
      videos += 1;
      const title = decodeEntities(v.snippet?.title || "");
      try {
        const res = await http.json(
          `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${vid}&maxResults=${cfg.commentsPerVideo}&order=relevance&textFormat=plainText&key=${key}`
        );
        for (const t of res.items || []) {
          const c = t.snippet?.topLevelComment;
          const s = c?.snippet;
          if (!s?.textDisplay) continue;
          docs.push({
            id: `youtube:${c.id}`,
            source: "youtube",
            sourceName: "YouTube",
            url: `https://www.youtube.com/watch?v=${vid}&lc=${c.id}`,
            title,
            text: s.textDisplay,
            date: s.publishedAt,
            votes: s.likeCount ?? 0,
            softball: true,
            // A comment under a video about one bat is about that bat even if it doesn't name it.
            defaultFamily: f.id,
          });
        }
      } catch (err) {
        // Comments disabled on this video.
        if (err.status !== 403) log(`  comments ${vid}: ${err.message}`);
      }
    }
  }
  log(`  ${docs.length} YouTube comments from ${videos} videos`);
  return { docs, stats: { videos, comments: docs.length } };
}
