"use server";

import { InputError, refreshPublic, runAction, str } from "@/lib/admin/action";
import { formValues, parseOrThrow, predictionSchema } from "@/lib/validation/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJob } from "@/lib/jobs/runner";

export async function updatePrediction(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/predictions/${id}`, async ({ db }) => {
    const v = parseOrThrow(predictionSchema, formValues(form));
    const { data: current } = await db.from("predictions").select("visibility").eq("id", id).single();
    const update: Record<string, unknown> = { ...v };
    if (current?.visibility === "public") {
      for (const k of ["prediction_text", "prediction_date", "target_value", "target_currency", "deadline", "asset", "statement_id", "person_id", "resolution_criteria", "target_direction"]) delete update[k];
    }
    const { error } = await db.from("predictions").update(update).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Prediction saved.";
  });
}

export async function setPredictionVisibility(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, `/admin/predictions/${id}`, async ({ db }) => {
    const visibility = str(form, "visibility") === "public" ? "public" : "internal";
    const { error } = await db.from("predictions").update({ visibility }).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return visibility === "public" ? "Prediction is now on the public scoreboard." : "Prediction hidden.";
  });
}

export async function proposeOutcome(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/predictions/${id}`, async ({ db }) => {
    const { error } = await db.from("prediction_outcomes").insert({
      prediction_id: id, result: str(form, "result"), methodology: str(form, "methodology"), notes: str(form, "notes") || null,
      observed_value: str(form, "observed_value") ? Number(str(form, "observed_value")) : null, observed_currency: str(form, "observed_currency") || null,
      observation_time: str(form, "observation_time") ? new Date(str(form, "observation_time")).toISOString() : null, timezone: str(form, "timezone") || "UTC",
      evidence_source_id: str(form, "evidence_source_id") || null, proposed_by: "editor", status: "proposed",
    });
    if (error) throw new InputError(error.message);
    return "Outcome proposed. An editor must confirm it.";
  });
}

export async function confirmOutcome(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, `/admin/predictions/${id}`, async ({ db }) => {
    const { error } = await db.rpc("confirm_prediction_outcome", { p_outcome: str(form, "outcome_id"), p_outcome_text: str(form, "outcome_text"), p_early_reason: str(form, "early_reason") || null });
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Outcome confirmed and the prediction resolved.";
  });
}

export async function rejectOutcome(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, `/admin/predictions/${id}`, async ({ db }) => {
    const { error } = await db.from("prediction_outcomes").update({ status: "rejected" }).eq("id", str(form, "outcome_id")).eq("status", "proposed");
    if (error) throw new InputError(error.message);
    return "Proposal rejected.";
  });
}

export async function correctPrediction(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, `/admin/predictions/${id}`, async ({ db }) => {
    const { error } = await db.rpc("correct_prediction", { p_prediction: id, p_field: str(form, "field"), p_value: str(form, "value"), p_reason: str(form, "reason") });
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Correction recorded publicly.";
  });
}

/** Runs the Prediction Resolution Agent now. It only ever PROPOSES an outcome; an editor confirms it. */
export async function runResolution(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, `/admin/predictions/${id}`, async ({ user }) => {
    const service = createAdminClient();
    if (!service) throw new InputError("Database not configured.");
    const sourceIds = form.getAll("source_ids").map(String).filter(Boolean);
    const { data: job, error } = await service.from("research_jobs").insert({ job_type: "resolve_prediction", payload: { prediction_id: id, source_ids: sourceIds }, created_by: user.id, status: "running", attempts: 1, locked_at: new Date().toISOString(), locked_by: "manual" }).select("id, job_type, payload, attempts, max_attempts").single();
    if (error || !job) throw new InputError(error?.message ?? "Couldn't start the job.");
    try {
      const out = await runJob(service, job);
      await service.from("research_jobs").update({ status: "succeeded", result: { summary: out.summary }, finished_at: new Date().toISOString(), locked_at: null }).eq("id", job.id);
      return out.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await service.from("research_jobs").update({ status: "failed", last_error: message, finished_at: new Date().toISOString(), locked_at: null }).eq("id", job.id);
      throw new InputError(message);
    }
  });
}
