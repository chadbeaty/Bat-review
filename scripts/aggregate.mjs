#!/usr/bin/env node
// Collects what players say about slowpitch bats and writes data/community.json for the site.
//
//   node scripts/aggregate.mjs                       all sources
//   node scripts/aggregate.mjs --only=imports,rss    some sources
//   node scripts/aggregate.mjs --docs=fixture.json   score a saved set of posts, no network
//   node scripts/aggregate.mjs --dry-run             print the summary without writing files

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildMatchers } from "./lib/match.mjs";
import { assignThreadFamilies, extractMentions, mergeMentions, summarize } from "./lib/aggregate.mjs";
import { collectReddit } from "./sources/reddit.mjs";
import { collectFeeds, collectReviewFeeds } from "./sources/rss.mjs";
import { matchReview, mergeReviews } from "./lib/reviews.mjs";
import { collectYouTube } from "./sources/youtube.mjs";
import { collectImports } from "./sources/imports.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const log = (...m) => console.log(...m);
const readJSON = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};

const families = (await readJSON(join(root, "data/families.json"), { families: [] })).families;
const config = await readJSON(join(root, "scripts/sources.json"), {});
const matchers = buildMatchers(families);
const only = typeof args.only === "string" ? new Set(args.only.split(",")) : null;
const want = (name) => !only || only.has(name);

let docs = [];
let videos = [];
let articles = [];
const stats = {};
if (args.docs) {
  docs = await readJSON(args.docs, []);
  stats.file = { docs: docs.length };
} else {
  const steps = [
    ["reddit", () => collectReddit(config.reddit, families, log)],
    ["rss", () => collectFeeds(config.feeds, log)],
    ["youtube", () => collectYouTube(config.youtube, families, log)],
    ["imports", () => collectImports(join(root, "data/imports"), log)],
    ["reviews", async () => ({ docs: [], stats: { articles: (articles = await collectReviewFeeds(config.reviewFeeds, log)).length } })],
  ];
  for (const [name, run] of steps) {
    if (!want(name)) continue;
    log(`Collecting from ${name}…`);
    try {
      const res = await run();
      docs.push(...res.docs);
      if (res.videos) videos.push(...res.videos);
      stats[name] = res.stats;
    } catch (err) {
      log(`  ${name} failed: ${err.message}`);
      stats[name] = { error: err.message };
    }
  }
}

const unique = [...new Map(docs.map((d) => [d.id, d])).values()];
assignThreadFamilies(unique, matchers);
const fresh = extractMentions(unique, matchers);
log(`Matched ${fresh.length} mentions in ${unique.length} posts and comments`);

const mentionsPath = join(root, "data/mentions.json");
const previous = args.docs ? [] : await readJSON(mentionsPath, []);
const merged = mergeMentions(previous, fresh);
const summary = summarize(merged);

const bySource = {};
for (const m of merged) bySource[m.sourceName] = (bySource[m.sourceName] || 0) + 1;

const community = {
  generatedAt: new Date().toISOString(),
  sources: {
    "Matched posts": Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v} from ${k}`)
      .join(", "),
    "Last run scanned": Object.entries(stats)
      .map(([k, v]) => `${k}: ${Object.entries(v).map(([a, b]) => `${b} ${a}`).join(", ")}`)
      .join("; "),
  },
  families: summary,
};

const top = Object.entries(summary)
  .sort((a, b) => b[1].mentions - a[1].mentions)
  .slice(0, 12)
  .map(([id, f]) => `  ${id.padEnd(28)} ${String(f.mentions).padStart(4)} posts  score ${f.score}`);
log(top.join("\n") || "  No bat lines matched yet");

// Published reviews: review videos and review-site articles, matched to bats.
const catalog = (await readJSON(join(root, "data/bats.json"), { bats: [] })).bats;
const newestYear = Math.max(...catalog.map((b) => b.year));
const reviewsPath = join(root, "data/reviews.json");
const reviewFile = await readJSON(reviewsPath, { reviews: [] });
const foundReviews = [];
for (const item of [...videos.map((v) => ({ ...v, kind: "video", source: v.channel ? `YouTube · ${v.channel}` : "YouTube" })), ...articles]) {
  const year = Number((item.title.match(/\b(20\d\d)\b/) || [])[1]);
  if (year && year < newestYear - 2) continue; // old models
  const match = matchReview(item.title, catalog, matchers);
  if (!match) continue;
  foundReviews.push({ kind: item.kind, title: item.title, url: item.url, source: item.source, date: item.date || null, rating: null, bats: match.bats, families: match.families, summary: null, auto: true });
}
const mergedReviews = mergeReviews(reviewFile.reviews || [], foundReviews);
log(`Published reviews: ${foundReviews.length} matched, ${mergedReviews.added} new`);

if (args["dry-run"]) {
  log("Dry run: nothing written");
} else {
  if (mergedReviews.added) {
    await writeFile(reviewsPath, JSON.stringify({ ...reviewFile, updated: new Date().toISOString().slice(0, 10), reviews: mergedReviews.reviews }, null, 2) + "\n");
    log(`Wrote data/reviews.json (${mergedReviews.reviews.length} reviews)`);
  }
}
if (args["dry-run"] || (!fresh.length && !previous.length)) {
  if (!args["dry-run"]) log("No posts collected, so data/community.json was left as it is.");
} else {
  await writeFile(mentionsPath, JSON.stringify(merged, null, 0).replace(/\},\{/g, "},\n{") + "\n");
  await writeFile(join(root, "data/community.json"), JSON.stringify(community, null, 2) + "\n");
  log(`Wrote data/community.json (${Object.keys(summary).length} bat lines) and data/mentions.json (${merged.length} mentions)`);
}
