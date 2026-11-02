// Reddit: recent posts from softball subreddits, a name search for every bat line, and the comments on those threads.
// Uses OAuth (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET) when set, which is far more reliable than the public JSON.

import { createClient } from "../lib/http.mjs";
import { stripMarkdown } from "../lib/text.mjs";

async function getToken(http) {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  const res = await http.request("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit login failed (HTTP ${res.status}). Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.`);
  return (await res.json()).access_token;
}

function postDoc(p) {
  return {
    id: `reddit:${p.name}`,
    source: "reddit",
    sourceName: `r/${p.subreddit}`,
    url: `https://www.reddit.com${p.permalink}`,
    title: p.title,
    text: `${p.title}\n${stripMarkdown(p.selftext || "")}`,
    date: new Date(p.created_utc * 1000).toISOString(),
    votes: p.score ?? 0,
    softball: true,
  };
}

function flattenComments(children, thread, out = []) {
  for (const c of children || []) {
    if (c.kind !== "t1" || !c.data) continue;
    const d = c.data;
    if (d.body && d.body !== "[deleted]" && d.body !== "[removed]" && d.author !== "AutoModerator") {
      out.push({
        id: `reddit:${d.name}`,
        source: "reddit",
        sourceName: `r/${d.subreddit}`,
        url: `https://www.reddit.com${d.permalink}`,
        title: thread.title,
        text: stripMarkdown(d.body),
        date: new Date(d.created_utc * 1000).toISOString(),
        votes: d.score ?? 0,
        softball: true,
        threadId: thread.id,
      });
    }
    if (d.replies && d.replies.data) flattenComments(d.replies.data.children, thread, out);
  }
  return out;
}

export async function collectReddit(config, families, log) {
  const cfg = { subreddits: ["Softball"], pagesPerSubreddit: 3, maxThreads: 250, ...config };
  const probe = createClient({ delayMs: 0, log });
  const token = await getToken(probe);
  const http = createClient({ delayMs: token ? 700 : 6500, log });
  const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const suffix = token ? "" : ".json";
  log(token ? "  Signed in to the Reddit API" : "  No Reddit API keys set, using public JSON (slow and often blocked)");

  const posts = new Map();
  const add = (listing) => {
    for (const c of listing?.data?.children || []) if (c.kind === "t3") posts.set(c.data.name, c.data);
  };

  for (const sub of cfg.subreddits) {
    let after = "";
    for (let page = 0; page < cfg.pagesPerSubreddit; page++) {
      try {
        const listing = await http.json(`${base}/r/${sub}/new${suffix}?limit=100&raw_json=1${after ? "&after=" + after : ""}`, { headers });
        add(listing);
        after = listing?.data?.after;
        if (!after) break;
      } catch (err) {
        log(`  r/${sub}: ${err.message}`);
        break;
      }
    }
  }

  const multi = cfg.subreddits.join("+");
  for (const f of families) {
    const q = f.aliases.slice(0, 3).map((a) => `"${a}"`).join(" OR ");
    try {
      add(await http.json(`${base}/r/${multi}/search${suffix}?q=${encodeURIComponent(q)}&restrict_sr=1&sort=relevance&t=all&limit=50&raw_json=1`, { headers }));
    } catch (err) {
      log(`  search ${f.id}: ${err.message}`);
    }
  }
  log(`  ${posts.size} Reddit posts found`);

  const docs = [...posts.values()].map(postDoc);
  const threads = [...posts.values()].filter((p) => p.num_comments > 0).sort((a, b) => b.num_comments - a.num_comments).slice(0, cfg.maxThreads);
  let comments = 0;
  for (const p of threads) {
    try {
      const res = await http.json(`${base}/comments/${p.id}${suffix}?limit=500&depth=6&sort=top&raw_json=1`, { headers });
      const list = flattenComments(res?.[1]?.data?.children, { id: p.name, title: p.title });
      comments += list.length;
      docs.push(...list);
    } catch (err) {
      log(`  comments ${p.id}: ${err.message}`);
    }
  }
  log(`  ${comments} Reddit comments from ${threads.length} threads`);
  return { docs, stats: { posts: posts.size, comments } };
}
