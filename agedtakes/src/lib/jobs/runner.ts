import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessEvidence, AgentError, distribute, draftCase, extractStatements, matchHistory, resolvePrediction, triageItems, type AgentOutcome } from "@/lib/ai/agents";
import { AiDisabledError, type ClaudeLike } from "@/lib/ai/client";
import { connectorFor } from "@/lib/connectors";
import { SourceUnavailable } from "@/lib/connectors/http";
import { aiConfig } from "@/lib/env";
import { log } from "@/lib/log";

// Serverless-friendly job processing. Each cron call (or "Run now" in the newsroom) claims a few queued jobs with
// row locks (so overlapping runs never double-process), works until a time budget, and leaves the rest queued.
// Failures retry with exponential backoff (fail_research_job). For heavier workloads, run processJobs() from a
// long-lived worker instead — see docs/OPERATIONS.md ("Scaling the worker").

export type JobRow = { id: string; job_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number };
type Deps = { claude?: ClaudeLike; fetch?: typeof fetch; now?: Date };

const AI_JOBS = new Set(["extract_statements", "match_history", "assess_evidence", "draft_case", "distribution"]);

export async function aiAllowed(db: SupabaseClient): Promise<{ ok: boolean; reason?: string }> {
  if (!aiConfig.enabled) return { ok: false, reason: "ANTHROPIC_API_KEY is not set" };
  const { data } = await db.from("site_settings").select("value").eq("key", "ai_research_enabled").maybeSingle();
  if (data && data.value === false) return { ok: false, reason: "AI research is turned off in Settings" };
  return { ok: true };
}

async function enqueue(db: SupabaseClient, items: NonNullable<AgentOutcome["queue"]>) {
  for (const q of items) {
    const { error } = await db.from("research_jobs").insert({ job_type: q.job_type, payload: q.payload, dedupe_key: q.dedupe_key, person_id: q.person_id ?? null, case_id: q.case_id ?? null });
    if (error && !/duplicate key/.test(error.message)) log.warn("enqueue_failed", { job_type: q.job_type, message: error.message });
  }
}

export async function runJob(db: SupabaseClient, job: JobRow, deps: Deps = {}): Promise<AgentOutcome> {
  const ctx = { db, jobId: job.id, claude: deps.claude, fetch: deps.fetch, now: deps.now };
  const p = job.payload ?? {};
  switch (job.job_type) {
    case "monitor_sources":
      return runMonitor(db, { triggeredBy: "cron", sourceId: typeof p.source_id === "string" ? p.source_id : undefined }, deps);
    case "extract_statements":
      return extractStatements(ctx, p as { source_item_id?: string; evidence_source_id?: string });
    case "match_history":
      return matchHistory(ctx, p as { statement_id: string });
    case "assess_evidence":
      return assessEvidence(ctx, p as { case_id: string });
    case "draft_case":
      return draftCase(ctx, p as { case_id: string });
    case "resolve_prediction":
      return resolvePrediction(ctx, p as { prediction_id: string; source_ids?: string[] });
    case "distribution":
      return distribute(ctx, p as { case_id: string; overwrite?: boolean });
    default:
      throw new AgentError(`Unknown job type ${job.job_type}`, false);
  }
}

/** Claims and runs queued jobs until `budgetMs` is used up. Returns a summary per job. */
export async function processJobs(db: SupabaseClient, opts: { worker: string; budgetMs: number; maxJobs?: number; types?: string[] } & Deps) {
  const started = Date.now();
  const results: { id: string; type: string; status: string; summary: string }[] = [];
  const ai = await aiAllowed(db);
  const types = (opts.types ?? ["monitor_sources", "extract_statements", "match_history", "assess_evidence", "draft_case", "resolve_prediction", "distribution"])
    .filter((t) => ai.ok || !AI_JOBS.has(t));

  while (Date.now() - started < opts.budgetMs && results.length < (opts.maxJobs ?? 20)) {
    const { data: claimed, error } = await db.rpc("claim_research_jobs", { p_worker: opts.worker, p_limit: 1, p_types: types });
    if (error) {
      log.error("claim_jobs_failed", { message: error.message });
      break;
    }
    const job = (claimed as JobRow[] | null)?.[0];
    if (!job) break;
    try {
      const out = await runJob(db, job, opts);
      await db.from("research_jobs").update({ status: "succeeded", result: { summary: out.summary, ...(out.details ?? {}) }, finished_at: new Date().toISOString(), locked_at: null, locked_by: null, last_error: null }).eq("id", job.id);
      if (out.queue?.length) await enqueue(db, out.queue);
      results.push({ id: job.id, type: job.job_type, status: "succeeded", summary: out.summary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const permanent = (err instanceof AgentError && !err.retryable) || err instanceof AiDisabledError;
      if (permanent) {
        await db.from("research_jobs").update({ status: "failed", last_error: message.slice(0, 2000), finished_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", job.id);
      } else {
        await db.rpc("fail_research_job", { p_job: job.id, p_error: message });
      }
      log.warn("research_job_failed", { id: job.id, type: job.job_type, message, permanent });
      results.push({ id: job.id, type: job.job_type, status: permanent ? "failed" : "retrying", summary: message });
    }
  }
  return { ran: results.length, results, aiSkipped: ai.ok ? null : ai.reason };
}

/** Source Monitor: runs every due connector, stores new items, then (when AI is on) triages them for extraction. */
export async function runMonitor(db: SupabaseClient, opts: { triggeredBy: "cron" | "manual"; sourceId?: string }, deps: Deps = {}): Promise<AgentOutcome> {
  const now = deps.now ?? new Date();
  let query = db.from("monitored_sources").select("*").eq("enabled", true);
  if (opts.sourceId) query = db.from("monitored_sources").select("*").eq("id", opts.sourceId);
  const { data: sources } = await query;
  const due = (sources ?? []).filter((s) => opts.sourceId || !s.last_checked_at || now.getTime() - new Date(s.last_checked_at).getTime() >= s.check_interval_hours * 3600_000 * 0.9);
  const { data: people } = await db.from("people").select("name").in("status", ["active", "research_candidate"]);
  const newIds: string[] = [];
  let summary: string[] = [];

  for (const s of due) {
    const connector = connectorFor(s.connector);
    const { data: job } = await db.from("ingestion_jobs").insert({ connector: s.connector, monitored_source_id: s.id, triggered_by: opts.triggeredBy }).select("id").single();
    const finish = (fields: Record<string, unknown>) => (job ? db.from("ingestion_jobs").update({ ...fields, finished_at: new Date().toISOString() }).eq("id", job.id) : null);
    if (!connector) {
      await finish({ status: "failed", error_message: `Unknown connector ${s.connector}` });
      continue;
    }
    try {
      const res = await connector.fetchItems(s.config ?? {}, { fetch: deps.fetch ?? fetch, env: process.env, trackedNames: (people ?? []).map((p) => p.name), now });
      if (res.status !== "ok") {
        await finish({ status: res.status === "skipped" ? "skipped" : "failed", error_message: res.status === "skipped" ? res.reason : res.message });
        await db.from("monitored_sources").update({ last_checked_at: now.toISOString(), last_error: res.status === "error" ? res.message : null }).eq("id", s.id);
        summary.push(`${s.label}: ${res.status === "skipped" ? res.reason : res.message}`);
        continue;
      }
      let added = 0;
      for (const item of res.items) {
        const { data: inserted } = await db.from("source_items").upsert({
          monitored_source_id: s.id, connector: s.connector, external_id: item.externalId, url: item.url, title: item.title, author: item.author,
          published_at: item.publishedAt, content_text: item.contentText, metadata: item.metadata ?? {}, person_id: s.person_id,
        }, { onConflict: "connector,external_id", ignoreDuplicates: true }).select("id");
        if (inserted?.length) {
          added++;
          newIds.push(inserted[0].id);
        }
      }
      await finish({ status: "succeeded", items_found: res.items.length, items_new: added });
      await db.from("monitored_sources").update({ last_checked_at: now.toISOString(), last_error: null }).eq("id", s.id);
      summary.push(`${s.label}: ${added} new of ${res.items.length}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finish({ status: err instanceof SourceUnavailable ? "skipped" : "failed", error_message: message.slice(0, 2000) });
      await db.from("monitored_sources").update({ last_checked_at: now.toISOString(), last_error: message.slice(0, 500) }).eq("id", s.id);
      summary.push(`${s.label}: ${message}`);
    }
  }

  const queue: NonNullable<AgentOutcome["queue"]> = [];
  if (newIds.length && (await aiAllowed(db)).ok) {
    for (let i = 0; i < newIds.length; i += 20) {
      try {
        const t = await triageItems({ db, claude: deps.claude }, newIds.slice(i, i + 20));
        queue.push(...(t.queue ?? []));
      } catch (err) {
        summary.push(`Triage skipped: ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }
    await enqueue(db, queue);
  }
  if (!due.length) summary = ["No sources due."];
  return { summary: summary.join(" · ").slice(0, 1500), details: { newItems: newIds.length, queued: queue.length } };
}

/** Queues resolution checks for open predictions whose deadline has passed or that track a configured price. */
export async function queueDuePredictions(db: SupabaseClient, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const { data } = await db.from("predictions").select("id, deadline, price_provider").eq("status", "open").or(`deadline.lte.${today},price_provider.in.(coingecko,financial_modeling_prep)`).limit(200);
  const rows = (data ?? []).map((p) => ({ job_type: "resolve_prediction", payload: { prediction_id: p.id }, dedupe_key: `resolve:${p.id}:${today}` }));
  await enqueue(db, rows);
  return rows.length;
}
