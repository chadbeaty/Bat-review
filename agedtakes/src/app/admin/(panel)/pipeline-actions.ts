"use server";

import { audit, InputError, runAction, str, bool } from "@/lib/admin/action";
import { formValues, monitoredSourceSchema, parseOrThrow } from "@/lib/validation/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { processJobs, runMonitor } from "@/lib/jobs/runner";

function service() {
  const db = createAdminClient();
  if (!db) throw new InputError("Database not configured.");
  return db;
}

export async function runQueueNow(form: FormData) {
  await runAction("researcher", form, "/admin/research", async (staff) => {
    const out = await processJobs(service(), { worker: `manual-${staff.user.id.slice(0, 8)}`, budgetMs: 200_000, maxJobs: Math.min(Number(str(form, "max") || 5), 10) });
    await audit(staff, "run_research_queue", "research_jobs", null, { ran: out.ran });
    if (!out.ran) return out.aiSkipped ? `Nothing ran. AI jobs are paused: ${out.aiSkipped}.` : "No jobs were ready.";
    return `Ran ${out.ran} job(s): ${out.results.map((r) => `${r.type} ${r.status}`).join(", ")}.`;
  });
}

export async function retryJob(form: FormData) {
  await runAction("researcher", form, "/admin/research", async ({ db }) => {
    const { error } = await db.from("research_jobs").update({ status: "queued", attempts: 0, run_after: new Date().toISOString(), last_error: null, finished_at: null }).eq("id", str(form, "job_id")).in("status", ["failed", "cancelled"]);
    if (error) throw new InputError(error.message);
    return "Job re-queued.";
  });
}

export async function cancelJob(form: FormData) {
  await runAction("researcher", form, "/admin/research", async ({ db }) => {
    const { error } = await db.from("research_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", str(form, "job_id")).eq("status", "queued");
    if (error) throw new InputError(error.message);
    return "Job cancelled.";
  });
}

export async function queueSourceItem(form: FormData) {
  await runAction("researcher", form, "/admin/research", async ({ db, user }) => {
    const id = str(form, "item_id");
    if (str(form, "decision") === "ignore") {
      await db.from("source_items").update({ status: "ignored" }).eq("id", id);
      return "Item ignored.";
    }
    const { error } = await db.from("research_jobs").insert({ job_type: "extract_statements", payload: { source_item_id: id }, dedupe_key: `extract:${id}`, created_by: user.id, priority: 40 });
    if (error && !/duplicate/.test(error.message)) throw new InputError(error.message);
    await db.from("source_items").update({ status: "queued" }).eq("id", id);
    return "Queued for statement extraction.";
  });
}

export async function researchPerson(form: FormData) {
  await runAction("researcher", form, "/admin/research", async ({ db, user }) => {
    const sourceId = str(form, "evidence_source_id");
    if (!sourceId) throw new InputError("Choose a source with stored text to research.");
    const { error } = await db.from("research_jobs").insert({ job_type: "extract_statements", payload: { evidence_source_id: sourceId }, dedupe_key: `extract-src:${sourceId}`, created_by: user.id, priority: 30 });
    if (error) throw new InputError(/duplicate/.test(error.message) ? "Already queued." : error.message);
    return "Extraction queued.";
  });
}

export async function saveMonitoredSource(form: FormData) {
  const id = str(form, "source_id");
  await runAction("editor", form, "/admin/sources", async ({ db, user }) => {
    const v = parseOrThrow(monitoredSourceSchema, formValues(form, ["enabled"]));
    const { error } = id
      ? await db.from("monitored_sources").update(v).eq("id", id)
      : await db.from("monitored_sources").insert({ ...v, created_by: user.id });
    if (error) throw new InputError(error.message);
    return id ? "Source updated." : "Source added.";
  });
}

export async function deleteMonitoredSource(form: FormData) {
  await runAction("editor", form, "/admin/sources", async ({ db }) => {
    const { error } = await db.from("monitored_sources").delete().eq("id", str(form, "source_id"));
    if (error) throw new InputError(error.message);
    return "Source removed.";
  });
}

export async function runMonitorNow(form: FormData) {
  await runAction("researcher", form, bool(form, "from_ingestion") ? "/admin/ingestion" : "/admin/sources", async (staff) => {
    const out = await runMonitor(service(), { triggeredBy: "manual", sourceId: str(form, "source_id") || undefined });
    await audit(staff, "run_monitor", "monitored_sources", str(form, "source_id") || null, { summary: out.summary });
    return out.summary || "Monitor finished.";
  });
}
