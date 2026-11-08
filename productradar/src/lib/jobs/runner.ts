import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSettings } from "@/lib/settings";
import { analyzeVideos } from "@/lib/jobs/analyze";
import { deadlineFrom, finishJob, startJob } from "@/lib/jobs/lock";
import { sendDigest, sendPendingAlerts } from "@/lib/jobs/notify";
import { scoreProducts } from "@/lib/jobs/score";
import { pollYoutubeCreators } from "@/lib/jobs/youtube-ingest";
import { log } from "@/lib/log";

// The scheduled workflows. Each step is isolated: if one source or step fails, the rest still run and the job is
// recorded as "partial" with the error, visible on Admin → Jobs.

/** Serverless functions get up to 300 s; work stops early and resumes on the next run. */
const BUDGET_MS = 250_000;

type StepResult = { name: string; ok: boolean; result?: unknown; error?: string };

async function step<T>(steps: StepResult[], name: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    const result = await fn();
    steps.push({ name, ok: true, result });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("job_step_failed", { name, error });
    steps.push({ name, ok: false, error });
    return null;
  }
}

/** Every 4-6 hours: new uploads → AI extraction → product grouping → scoring → instant alerts. */
export async function runIngestCycle(db: SupabaseClient, triggeredBy = "cron", opts: { force?: boolean } = {}) {
  const job = await startJob(db, "ingest_cycle", { triggeredBy });
  if (!job) return { skipped: true, reason: "Another ingestion cycle is still running." };
  const deadline = deadlineFrom(BUDGET_MS);
  const steps: StepResult[] = [];
  const settings = await loadSettings(db);

  const yt = await step(steps, "youtube_poll", () => pollYoutubeCreators(db, settings, deadline, { force: opts.force }));
  const analysis = await step(steps, "ai_extraction", () => analyzeVideos(db, settings, deadline));
  const touched = analysis?.productsTouched ?? [];
  const scoring = touched.length ? await step(steps, "scoring", () => scoreProducts(db, settings, touched, deadline, { allowAssess: true, competitionSnapshot: true })) : null;
  await step(steps, "alerts", () => sendPendingAlerts(db));

  const failed = steps.filter((s) => !s.ok).length + (yt?.errors.length ? 1 : 0) + (analysis?.videosFailed ? 1 : 0);
  await finishJob(db, job, {
    status: failed ? (steps.some((s) => s.ok) ? "partial" : "failed") : "succeeded",
    found: (yt?.newVideos ?? 0) + (yt?.statsRefreshed ?? 0),
    created: analysis?.created ?? 0,
    failed: (yt?.errors.length ?? 0) + (analysis?.videosFailed ?? 0),
    error: [...steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`), ...(yt?.errors ?? []).map((e) => `${e.creator}: ${e.error}`), ...(analysis?.errors ?? []).map((e) => `AI: ${e}`), analysis?.stoppedBy && !analysis.errors.includes(analysis.stoppedBy) ? `AI: ${analysis.stoppedBy}` : null].filter(Boolean).join(" | ") || null,
    details: { steps, scoring },
  });
  return { job: job.id, steps };
}

/** Once a day: rescore everything active (incl. watchlist), daily competition snapshots, then the digest. */
export async function runDaily(db: SupabaseClient, triggeredBy = "cron") {
  const job = await startJob(db, "daily", { triggeredBy });
  if (!job) return { skipped: true, reason: "The daily job is still running." };
  const deadline = deadlineFrom(BUDGET_MS);
  const steps: StepResult[] = [];
  const settings = await loadSettings(db);

  const ids = await step(steps, "select_products", async () => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const [{ data: active }, { data: watched }] = await Promise.all([
      db.from("products").select("id").in("status", ["new", "tracking", "saturated"]).gte("updated_at", since).order("latest_score", { ascending: false, nullsFirst: false }).limit(300),
      db.from("watchlists").select("product_id").neq("status", "rejected"),
    ]);
    // Watchlist products first so they are always refreshed.
    return [...new Set([...(watched ?? []).map((w) => w.product_id as string), ...(active ?? []).map((p) => p.id as string)])];
  });
  const scoring = ids?.length ? await step(steps, "rescore", () => scoreProducts(db, settings, ids, deadline, { allowAssess: true, competitionSnapshot: true })) : null;
  await step(steps, "alerts", () => sendPendingAlerts(db));
  const digest = await step(steps, "digest", () => sendDigest(db, settings));
  await step(steps, "cleanup", async () => {
    await db.from("rate_limits").delete().lt("window_start", new Date(Date.now() - 2 * 86400_000).toISOString());
    return true;
  });

  const failed = steps.filter((s) => !s.ok).length;
  await finishJob(db, job, {
    status: failed ? "partial" : "succeeded",
    found: ids?.length ?? 0,
    created: scoring?.scored ?? 0,
    error: [...steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error}`), ...(scoring?.errors ?? []).slice(0, 5)].join(" | ") || null,
    details: { steps, digest },
  });
  return { job: job.id, steps };
}
