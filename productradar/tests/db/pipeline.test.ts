import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canConnect, TestDb } from "./harness";
import { connectPgSupabase } from "../support/pg-supabase";
import { setClaudeClientForTests } from "@/lib/ai/client";
import { ASSESSMENT_SYSTEM, EXTRACTION_SYSTEM, MATCH_SYSTEM } from "@/lib/ai/prompts";
import { runIngestCycle, runDaily } from "@/lib/jobs/runner";
import { processSubmission } from "@/lib/jobs/manual";
import { loadSettings } from "@/lib/settings";
import { deadlineFrom } from "@/lib/jobs/lock";

// End to end on a real database: scheduled ingestion → AI extraction → product grouping → scoring → alerts →
// digest, plus a manual TikTok submission. YouTube, Claude and Resend are replaced by fakes that answer like the
// real APIs; everything else (SQL, constraints, functions, matching, scoring) is the production code.

const tdb = new TestDb();
let available = false;
let db: SupabaseClient;

const CHANNELS: Record<string, { id: string; title: string; videos: { id: string; title: string; description: string; views: number }[] }> = {};
const emails: { to: string[]; subject: string; html: string; text: string }[] = [];
const claudeCalls: string[] = [];
let failExtraction = false;

function product(name: string, suggested: string, alternates: string[], fn: string) {
  return {
    name_as_mentioned: name, suggested_canonical_name: suggested, function: fn, physical_characteristics: ["palm-sized", "USB-C rechargeable"],
    visual_description: "Small white handheld device", category: "kitchen", alternate_names: alternates, search_terms: [`${suggested} amazon`],
    problem_solved: "Keeps snacks fresh", evidence_location: "title", evidence_quote: name, mention_type: "organic_demo", stated_price_usd: null, confidence: 0.9,
  };
}

const fakeClaude = {
  beta: {
    messages: {
      parse: async (params: { system: string; messages: { content: { type: string; text?: string }[] }[] }) => {
        const text = params.messages[0].content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
        const base = { id: "msg_test", model: "claude-opus-5-5", stop_reason: "end_turn", usage: { input_tokens: 1000, output_tokens: 300 } };
        if (params.system === EXTRACTION_SYSTEM) {
          claudeCalls.push("extract");
          if (failExtraction) throw new Error("simulated outage");
          const videos = text.split("--- ref: ").slice(1).map((chunk) => {
            const ref = chunk.slice(0, chunk.indexOf(" ---"));
            const lower = chunk.toLowerCase();
            const products = lower.includes("food sealer")
              ? [product("Mini handheld food sealer", "handheld bag sealer", ["rechargeable bag closer"], "Heat-seals open snack bags")]
              : lower.includes("bag sealer")
                ? [product("magnetic bag sealer", "magnetic bag sealer", ["mini handheld food sealer", "snack bag sealing machine"], "Heat-seals open snack bags")]
                : lower.includes("milk frother")
                  ? [product("electric milk frother", "handheld milk frother", ["milk foam wand"], "Whisks milk into foam")]
                  : [];
            return { video_ref: ref, is_product_content: products.length > 0, products, notes: null };
          });
          return { ...base, parsed_output: { videos } };
        }
        if (params.system === MATCH_SYSTEM) {
          claudeCalls.push("match");
          const items = [...text.matchAll(/Item (\d+):/g)].map((m) => m[1]);
          // A frother is not a bag sealer, however similar the names look.
          return { ...base, parsed_output: { decisions: items.map((i) => ({ item_ref: `Item ${i}`, match_product_id: null, same_function: false, confidence: 0.2, reason: "Different function" })) } };
        }
        if (params.system === ASSESSMENT_SYSTEM) {
          claudeCalls.push("assess");
          const idea = { title: "Snack rescue", concept: "Seal a half-eaten chip bag in one swipe." };
          return {
            ...base,
            parsed_output: {
              canonical_name: "Handheld bag sealer", description: "A palm-sized heat sealer that closes snack bags.", function_summary: "Heat-seals bags", problem_solved: "Stale snacks",
              organic_video_potential: { score: 85, reason: "Instant visual result" }, problem_solving_appeal: { score: 80, reason: "Everyone has stale chips" },
              estimates: { supplier_cost_low_usd: 3, supplier_cost_high_usd: 5, shipping_cost_usd: 4, suggested_price_low_usd: 19.99, suggested_price_high_usd: 24.99, basis: "Comparable generic sealers" },
              recommendation: { verdict: "watch", summary: "Two creators showed it this week; competition unknown.", risks: ["Low price ceiling"] },
              video_ideas: {
                hooks: ["Stop throwing away stale chips", "This $5 tool", "Watch this"], problem_solution: [idea, idea, idea], three_two_one: idea, run_to_store: idea, pov_demo: idea, curiosity: idea,
                before_after: idea, duration_seconds: 15, first_frame: "Open chip bag", call_to_action: "Link in bio", format_notes: "Satisfying close-ups",
              },
            },
          };
        }
        throw new Error("unexpected AI call");
      },
    },
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === "www.googleapis.com") {
    const path = url.pathname.split("/").pop();
    if (path === "channels") {
      const c = CHANNELS[url.searchParams.get("id") ?? ""];
      return json({ items: c ? [{ id: c.id, snippet: { title: c.title }, statistics: { subscriberCount: "1000" }, contentDetails: { relatedPlaylists: { uploads: `UU${c.id.slice(2)}` } } }] : [] });
    }
    if (path === "playlistItems") {
      const c = Object.values(CHANNELS).find((x) => `UU${x.id.slice(2)}` === url.searchParams.get("playlistId"));
      return json({ items: (c?.videos ?? []).map((v) => ({ contentDetails: { videoId: v.id, videoPublishedAt: new Date(Date.now() - 3600_000).toISOString() } })) });
    }
    if (path === "videos") {
      const ids = (url.searchParams.get("id") ?? "").split(",");
      const items = Object.values(CHANNELS).flatMap((c) => c.videos.filter((v) => ids.includes(v.id)).map((v) => ({
        id: v.id,
        snippet: { channelId: c.id, channelTitle: c.title, title: v.title, description: v.description, tags: [], publishedAt: new Date(Date.now() - 3600_000).toISOString(), thumbnails: { high: { url: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` } } },
        contentDetails: { duration: "PT45S" },
        statistics: { viewCount: String(v.views), likeCount: "10", commentCount: "2" },
      })));
      return json({ items });
    }
  }
  if (url.hostname === "www.tiktok.com" && url.pathname === "/oembed") return json({ embed_product_id: "7300000000000000001", embed_type: "video" });
  if (url.hostname === "api.resend.com") {
    emails.push(JSON.parse(String(init?.body)));
    return json({ id: `email_${emails.length}` });
  }
  return new Response("not found", { status: 404 });
}

beforeAll(async () => {
  available = await canConnect();
  if (!available) return;
  await tdb.setup();
  db = (await connectPgSupabase(await tdb.connect())).asClient<SupabaseClient>();
  const active = await tdb.owner<{ channel_id: string; display_name: string }>("select channel_id, display_name from creators where is_active order by display_name");
  for (const c of active) CHANNELS[c.channel_id] = { id: c.channel_id, title: c.display_name, videos: [] };
  const [a, b, c] = active;
  CHANNELS[a.channel_id].videos = [
    { id: "vidA0000001", title: "This $12 bag sealer changed my kitchen", description: "Seal any snack bag.", views: 5000 },
    { id: "vidA0000002", title: "How I made $10k this month", description: "Business update", views: 9000 },
  ];
  CHANNELS[b.channel_id].videos = [{ id: "vidB0000001", title: "Mini handheld food sealer is crazy", description: "", views: 12000 }];
  CHANNELS[c.channel_id].videos = [{ id: "vidC0000001", title: "Electric milk frother review", description: "", views: 800 }];
  // Lower the alert threshold so this run produces an alert email.
  await tdb.owner(`update app_settings set value = jsonb_set(value, '{score}', '60') where key = 'alert_thresholds'`);
  process.env.YOUTUBE_API_KEY = "test-key";
  process.env.RESEND_API_KEY = "re_test";
  process.env.ALERT_FROM_EMAIL = "radar@example.com";
  process.env.ADMIN_EMAIL = "owner@example.com";
  vi.stubGlobal("fetch", fakeFetch);
  setClaudeClientForTests(fakeClaude as never);
});

afterAll(async () => {
  setClaudeClientForTests(null);
  vi.unstubAllGlobals();
  if (available) await tdb.teardown();
});

const maybe = (name: string, fn: () => Promise<void>) => it(name, async (ctx) => (available ? fn() : ctx.skip()));

describe("ingestion pipeline", () => {
  maybe("collects uploads, extracts and groups products, scores them and alerts", async () => {
    const res = await runIngestCycle(db, "test");
    expect("skipped" in res).toBe(false);

    const videos = await tdb.owner<{ external_id: string; analysis_status: string }>("select external_id, analysis_status from creator_videos order by external_id");
    expect(videos.map((v) => v.external_id)).toEqual(["vidA0000001", "vidA0000002", "vidB0000001", "vidC0000001"]);
    expect(videos.find((v) => v.external_id === "vidA0000002")?.analysis_status).toBe("skipped");

    // "magnetic bag sealer" and "Mini handheld food sealer" are one product (matched through a known alias);
    // the frother looked similar enough to ask the AI, which said it does a different job.
    const products = await tdb.owner<{ id: string; canonical_name: string; latest_score: number; latest_creators: number; assessed_at: string | null }>(
      "select id, canonical_name, latest_score, latest_creators, assessed_at from products order by canonical_name",
    );
    expect(products).toHaveLength(2);
    const sealer = products.find((p) => p.canonical_name.includes("bag sealer"))!;
    const frother = products.find((p) => p.canonical_name.includes("frother"))!;
    expect(sealer && frother).toBeTruthy();
    expect(sealer.latest_creators).toBe(2);
    const mentions = await tdb.owner<{ match_method: string }>("select match_method from product_mentions where product_id = $1 order by detected_at", [sealer.id]);
    expect(mentions.map((m) => m.match_method).sort()).toEqual(["alias", "new"]);
    const aliases = (await tdb.owner<{ alias: string }>("select alias from product_aliases where product_id = $1", [sealer.id])).map((a) => a.alias.toLowerCase());
    expect(aliases).toEqual(expect.arrayContaining(["magnetic bag sealer", "mini handheld food sealer", "rechargeable bag closer"]));

    // Two independent creators within hours: assessed by AI (ideas + estimates). One mention: not yet.
    expect(sealer.assessed_at).not.toBeNull();
    expect(frother.assessed_at).toBeNull();
    const [ideas] = await tdb.owner<{ ideas: { hooks: string[] } }>("select ideas from video_ideas where product_id = $1 and is_current", [sealer.id]);
    expect(ideas.ideas.hooks).toHaveLength(3);

    const [score] = await tdb.owner<Record<string, unknown>>("select * from opportunity_scores where product_id = $1 order by scored_at desc limit 1", [sealer.id]);
    expect(Number(score.overall)).toBeGreaterThan(55);
    expect(Number(score.overall)).toBeLessThan(80);
    expect(score.confidence).toBe("medium");
    expect(score.missing).toEqual(expect.arrayContaining(["Search interest (Google Trends not connected)", "Marketplace seller research"]));
    const [frotherScore] = await tdb.owner<Record<string, unknown>>("select * from opportunity_scores where product_id = $1", [frother.id]);
    expect(frotherScore.organic_video_potential).toBeNull();
    expect(frotherScore.confidence).toBe("low");

    const [comp] = await tdb.owner<Record<string, unknown>>("select * from competition_snapshots where product_id = $1", [sealer.id]);
    expect(comp).toMatchObject({ source: "monitored_sources", unique_creators: 2, confidence: "low" });
    const [trend] = await tdb.owner<Record<string, unknown>>("select * from trend_snapshots where product_id = $1", [sealer.id]);
    expect(trend).toMatchObject({ mentions_72h: 2, unique_creators_7d: 2, search_interest: null, sellers_detected: null });

    const alerts = await tdb.owner<{ alert_type: string; status: string }>("select alert_type, status from product_alerts where product_id = $1", [sealer.id]);
    expect(alerts).toEqual([{ alert_type: "score_80", status: "sent" }]);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toEqual(["owner@example.com"]);
    expect(emails[0].html).toContain("AI estimate");
    expect(emails[0].text).toContain("https://www.youtube.com/watch?v=");

    const [job] = await tdb.owner<{ status: string; items_new: number }>("select status, items_new from ingestion_jobs where job_type = 'ingest_cycle'");
    expect(job.status).toBe("succeeded");
    const [{ units }] = await tdb.owner<{ units: number }>("select sum(units)::int as units from api_usage where provider = 'youtube'");
    expect(units).toBeGreaterThanOrEqual(14); // playlist + videos call per active creator, plus channel lookups
    expect(claudeCalls).toEqual(expect.arrayContaining(["extract", "match", "assess"]));
  });

  maybe("a second run adds no duplicates and sends no repeat alerts", async () => {
    const before = await tdb.owner<{ n: number }>("select count(*)::int as n from product_mentions");
    await runIngestCycle(db, "test", { force: true });
    const after = await tdb.owner<{ n: number }>("select count(*)::int as n from product_mentions");
    expect(after[0].n).toBe(before[0].n);
    expect(await tdb.owner("select 1 from creator_videos")).toHaveLength(4);
    expect(emails).toHaveLength(1);
    // View counts were refreshed: each recent video now has two stat snapshots.
    const [{ n }] = await tdb.owner<{ n: number }>("select count(*)::int as n from video_stat_snapshots where video_id = (select id from creator_videos where external_id = 'vidB0000001')");
    expect(n).toBe(2);
  });

  maybe("a cycle is skipped while another is still running", async () => {
    await tdb.owner("insert into ingestion_jobs (job_type, lock_key, triggered_by) values ('ingest_cycle', 'ingest_cycle', 'other')");
    const res = await runIngestCycle(db, "test");
    expect(res).toMatchObject({ skipped: true });
    await tdb.owner("update ingestion_jobs set status = 'failed' where triggered_by = 'other'");
  });

  maybe("an AI outage marks videos for retry and the job continues with other steps", async () => {
    CHANNELS[Object.keys(CHANNELS)[3]].videos = [{ id: "vidD0000001", title: "Pet hair remover roller", description: "", views: 100 }];
    failExtraction = true;
    await runIngestCycle(db, "test", { force: true });
    failExtraction = false;
    const [v] = await tdb.owner<{ analysis_status: string; analysis_attempts: number }>("select analysis_status, analysis_attempts from creator_videos where external_id = 'vidD0000001'");
    expect(v).toEqual({ analysis_status: "failed", analysis_attempts: 1 });
    const [job] = await tdb.owner<{ status: string; error_message: string }>("select status, error_message from ingestion_jobs where job_type = 'ingest_cycle' order by started_at desc limit 1");
    expect(job.status).toBe("partial");
    expect(job.error_message).toContain("simulated outage");
  });
});

describe("manual submission", () => {
  maybe("a TikTok link with notes becomes a second-platform mention of the same product", async () => {
    const owner = await tdb.createUser("owner");
    const [sub] = await tdb.owner<{ id: string }>(
      "insert into manual_submissions (url, platform, notes, submitted_by) values ($1, 'tiktok', $2, $3) returning id",
      ["https://www.tiktok.com/@kitchenfinds/video/7300000000000000001", "Magnetic bag sealer demo, 2M views", owner.id],
    );
    const outcome = await processSubmission(db, sub.id, await loadSettings(db), deadlineFrom(200_000));
    expect(outcome).toMatchObject({ status: "analyzed", message: expect.stringMatching(/1 matched/) });
    const [p] = await tdb.owner<{ id: string }>("select id from products where canonical_name like '%bag sealer'");
    const platforms = await tdb.owner<{ platform: string }>("select distinct platform from product_mentions where product_id = $1 order by platform", [p.id]);
    expect(platforms.map((x) => x.platform)).toEqual(["tiktok", "youtube"]);
    const [m] = await tdb.owner<{ evidence_location: string; author_name: string }>("select evidence_location, author_name from product_mentions where platform = 'tiktok'");
    expect(m.author_name).toBe("kitchenfinds");
  });

  maybe("marketplace links are never fetched", async () => {
    const owner = await tdb.createUser("member");
    const calls: string[] = [];
    vi.stubGlobal("fetch", (u: RequestInfo | URL, i?: RequestInit) => {
      calls.push(String(u));
      return fakeFetch(u, i);
    });
    const [sub] = await tdb.owner<{ id: string }>("insert into manual_submissions (url, platform, submitted_by) values ('https://www.amazon.com/dp/B000TEST', 'marketplace', $1) returning id", [owner.id]);
    const outcome = await processSubmission(db, sub.id, await loadSettings(db), deadlineFrom(30_000));
    expect(outcome.status).toBe("stored");
    expect(calls.some((c) => c.includes("amazon.com"))).toBe(false);
    vi.stubGlobal("fetch", fakeFetch);
  });
});

describe("daily job", () => {
  maybe("rescores, snapshots and sends the digest once per day", async () => {
    const sent = emails.length;
    await runDaily(db, "test");
    const digest = emails.slice(sent).find((e) => e.subject.includes("Top"));
    expect(digest).toBeTruthy();
    expect(digest!.html).toMatch(/bag sealer/);
    await runDaily(db, "test");
    expect(emails.slice(sent).filter((e) => e.subject.includes("Top"))).toHaveLength(1);
    const [{ n }] = await tdb.owner<{ n: number }>("select count(*)::int as n from product_alerts where alert_type = 'daily_digest' and status = 'sent'");
    expect(n).toBe(1);
  });
});
