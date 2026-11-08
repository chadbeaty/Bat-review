import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";

// Job bookkeeping and duplicate protection. A unique index allows only one "running" row per lock key, so two
// overlapping cron calls (or a cron call and a "Run now" click) can't process the same work twice.
// A job that died without finishing releases its lock after STALE_MINUTES.

const STALE_MINUTES = 15;

export type JobHandle = { id: string; type: string };

export async function startJob(db: SupabaseClient, type: string, opts: { lockKey?: string | null; triggeredBy?: string; sourceId?: string | null } = {}): Promise<JobHandle | null> {
  const lockKey = opts.lockKey === undefined ? type : opts.lockKey;
  if (lockKey) {
    const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
    await db
      .from("ingestion_jobs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_message: "Timed out without finishing (lock released)." })
      .eq("lock_key", lockKey)
      .eq("status", "running")
      .lt("started_at", staleBefore);
  }
  const { data, error } = await db
    .from("ingestion_jobs")
    .insert({ job_type: type, lock_key: lockKey, triggered_by: opts.triggeredBy ?? "cron", source_id: opts.sourceId ?? null })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      log.info("job_skipped_locked", { type });
      return null;
    }
    throw new Error(`Could not start job ${type}: ${error.message}`);
  }
  return { id: data.id as string, type };
}

export async function finishJob(
  db: SupabaseClient,
  job: JobHandle,
  result: { status: "succeeded" | "partial" | "failed" | "skipped"; found?: number; created?: number; failed?: number; error?: string | null; details?: Record<string, unknown> },
) {
  await db
    .from("ingestion_jobs")
    .update({
      status: result.status,
      finished_at: new Date().toISOString(),
      items_found: result.found ?? 0,
      items_new: result.created ?? 0,
      items_failed: result.failed ?? 0,
      error_message: result.error ? result.error.slice(0, 2000) : null,
      details: result.details ?? {},
    })
    .eq("id", job.id);
}

export async function recordUsage(db: SupabaseClient, provider: string, operation: string, units: number, cost = 0) {
  if (units <= 0) return;
  await db.from("api_usage").insert({ provider, operation, units, estimated_cost: cost });
}

export function deadlineFrom(ms: number) {
  const end = Date.now() + ms;
  return { remaining: () => end - Date.now(), passed: () => Date.now() >= end };
}
export type Deadline = ReturnType<typeof deadlineFrom>;
