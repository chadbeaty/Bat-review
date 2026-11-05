"use server";

import { InputError, refreshPublic, runAction, str, bool } from "@/lib/admin/action";
import { caseEvidenceSchema, caseSchema, distributionSchema, formValues, parseOrThrow, responseSchema, timelineSchema } from "@/lib/validation/admin";
import { CASE_STATUSES, type CaseStatus } from "@/lib/editorial";
import { LEGAL_CHECKLIST } from "@/lib/editorial/legal";
import { createAdminClient } from "@/lib/supabase/admin";
import { runJob } from "@/lib/jobs/runner";
import { slugify } from "@/lib/format";

const caseUrl = (id: string, anchor = "") => `/admin/cases/${id}${anchor}`;

function caseRow(form: FormData) {
  const values = formValues(form, ["is_sponsored"]);
  if (!values.slug) values.slug = slugify(String(values.title ?? ""));
  const v = parseOrThrow(caseSchema, values);
  if (v.is_sponsored && !v.sponsor_disclosure) throw new InputError("Sponsored cases need a disclosure.");
  return v;
}

export async function createCase(form: FormData) {
  await runAction("researcher", form, "/admin/cases/new", async ({ db, user }) => {
    const v = caseRow(form);
    const { data, error } = await db.from("cases").insert({ ...v, status: "discovered", origin: "editor", created_by: user.id }).select("id").single();
    if (error) throw new InputError(error.message);
    return { notice: "Case opened. Add evidence next.", to: caseUrl(data.id) };
  });
}

export async function updateCase(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id), async ({ db }) => {
    const { data: c } = await db.from("cases").select("status").eq("id", id).single();
    if (c && ["published", "disputed"].includes(c.status)) throw new InputError("This case is published. Use “Publish a correction” instead.");
    const v = caseRow(form);
    const { error } = await db.from("cases").update(v).eq("id", id);
    if (error) throw new InputError(error.message);
    return c?.status === "approved" ? "Saved. Because the content changed, the case went back to Needs review." : "Saved.";
  });
}

export async function transitionCase(form: FormData) {
  const id = str(form, "id");
  const to = str(form, "to") as CaseStatus;
  await runAction(to === "approved" ? "editor" : "researcher", form, caseUrl(id), async ({ db, user }) => {
    if (!CASE_STATUSES.includes(to)) throw new InputError("Unknown status.");
    const { error } = await db.rpc("transition_case", { p_case: id, p_to: to, p_notes: str(form, "notes") || null });
    if (error) throw new InputError(error.message);
    if (bool(form, "queue_research")) {
      await db.from("research_jobs").insert({ job_type: "assess_evidence", payload: { case_id: id }, dedupe_key: `assess:${id}`, case_id: id, created_by: user.id });
    }
    if (["published", "disputed", "archived"].includes(to) || to === "needs_review") refreshPublic();
    return `Moved to ${to.replace(/_/g, " ")}.`;
  });
}

/** Publishing requires an editor, a prior approval, a ticked confirmation and the case address typed in full. */
export async function publishCase(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, caseUrl(id), async ({ db }) => {
    if (!bool(form, "confirm")) throw new InputError("Tick the confirmation box to publish.");
    const { data, error } = await db.rpc("publish_case", { p_case: id, p_confirm_slug: str(form, "confirm_slug"), p_notes: str(form, "notes") || null });
    if (error) throw new InputError(error.message);
    const slug = (data as { slug?: string } | null)?.slug;
    refreshPublic(slug ? [`/cases/${slug}`] : []);
    return "Published. It is now live on the public site.";
  });
}

export async function correctCase(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, caseUrl(id, "#correct"), async ({ db }) => {
    const patch: Record<string, string> = {};
    for (const f of ["title", "summary", "article_body", "what_happened", "limitations", "editorial_conclusion", "evidence_confidence"]) {
      const v = form.get(f);
      if (typeof v === "string" && form.get(`change_${f}`) === "on") patch[f] = v.trim();
    }
    if (!Object.keys(patch).length) throw new InputError("Tick at least one field to correct.");
    const { error } = await db.rpc("correct_published_case", { p_case: id, p_patch: patch, p_reason: str(form, "reason"), p_public: !bool(form, "internal_only") });
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Correction published with the case and in the corrections log.";
  });
}

export async function saveLegalReview(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, caseUrl(id, "#legal"), async ({ db }) => {
    const review = Object.fromEntries(LEGAL_CHECKLIST.map((i) => [i.key, form.get(i.key) === "on"]));
    const { error } = await db.from("cases").update({ legal_review: { ...review, notes: str(form, "legal_notes") || null } }).eq("id", id);
    if (error) throw new InputError(error.message);
    return "Legal review saved.";
  });
}

export async function addEvidence(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#evidence"), async ({ db }) => {
    const v = parseOrThrow(caseEvidenceSchema, formValues(form));
    const { error } = await db.from("case_evidence").upsert({ case_id: id, ...v }, { onConflict: "case_id,evidence_source_id,evidence_role" });
    if (error) throw new InputError(error.message);
    return "Evidence saved.";
  });
}

export async function removeEvidence(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#evidence"), async ({ db }) => {
    const { error } = await db.from("case_evidence").delete().eq("case_id", id).eq("evidence_source_id", str(form, "evidence_source_id")).eq("evidence_role", str(form, "evidence_role"));
    if (error) throw new InputError(error.message);
    return "Evidence removed from this case.";
  });
}

export async function addTimelineEvent(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#timeline"), async ({ db }) => {
    const v = parseOrThrow(timelineSchema, formValues(form));
    const { error } = await db.from("case_timeline_events").insert({ case_id: id, ...v, occurred_at: new Date(v.occurred_at).toISOString() });
    if (error) throw new InputError(error.message);
    return "Timeline event added.";
  });
}

export async function removeTimelineEvent(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#timeline"), async ({ db }) => {
    await db.from("case_timeline_events").delete().eq("id", str(form, "event_id")).eq("case_id", id);
    return "Timeline event removed.";
  });
}

export async function saveResponse(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#response"), async ({ db, user }) => {
    const v = parseOrThrow(responseSchema, formValues(form));
    const iso = (x: string | null) => (x ? new Date(x).toISOString() : null);
    const { error } = await db.from("subject_responses").insert({ case_id: id, ...v, contacted_at: iso(v.contacted_at), response_deadline: iso(v.response_deadline), received_at: iso(v.received_at), created_by: user.id });
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Outreach recorded.";
  });
}

export async function saveDistribution(form: FormData) {
  const id = str(form, "id");
  await runAction("editor", form, caseUrl(id, "#distribution"), async ({ db }) => {
    const { data: c } = await db.from("cases").select("status").eq("id", id).single();
    if (!c || !["approved", "published"].includes(c.status)) throw new InputError("Distribution copy is only for approved or published cases.");
    const v = parseOrThrow(distributionSchema, formValues(form));
    const { error } = await db.from("cases").update(v).eq("id", id);
    if (error) throw new InputError(error.message);
    refreshPublic();
    return "Distribution copy saved.";
  });
}

export async function addReviewNote(form: FormData) {
  const id = str(form, "id");
  await runAction("researcher", form, caseUrl(id, "#history"), async ({ db, user }) => {
    const notes = str(form, "notes");
    if (notes.length < 2) throw new InputError("Write a note.");
    const { data: c } = await db.from("cases").select("status").eq("id", id).single();
    const { error } = await db.from("editorial_reviews").insert({ case_id: id, reviewer_id: user.id, decision: str(form, "decision") === "request_changes" ? "request_changes" : "comment", from_status: c?.status, to_status: c?.status, notes });
    if (error) throw new InputError(error.message);
    return "Note added.";
  });
}

const AI_JOBS: Record<string, string> = { assess: "assess_evidence", draft: "draft_case", distribution: "distribution" };

/** Queues an AI agent for this case, and optionally runs it immediately. Agents never approve or publish. */
export async function runCaseAgent(form: FormData) {
  const id = str(form, "id");
  const jobType = AI_JOBS[str(form, "agent")];
  await runAction(jobType === "distribution" ? "editor" : "researcher", form, caseUrl(id, "#ai"), async ({ user }) => {
    if (!jobType) throw new InputError("Unknown agent.");
    const service = createAdminClient();
    if (!service) throw new InputError("Database not configured.");
    const payload = { case_id: id, overwrite: bool(form, "overwrite") };
    if (!bool(form, "now")) {
      const { error } = await service.from("research_jobs").insert({ job_type: jobType, payload, dedupe_key: `${jobType}:${id}`, case_id: id, created_by: user.id, priority: 20 });
      if (error) throw new InputError(/duplicate/.test(error.message) ? "That job is already queued." : error.message);
      return "Queued. It runs with the next scheduled research run, or from the research queue.";
    }
    const { data: job, error } = await service.from("research_jobs").insert({ job_type: jobType, payload, case_id: id, created_by: user.id, status: "running", attempts: 1, locked_at: new Date().toISOString(), locked_by: "manual" }).select("id, job_type, payload, attempts, max_attempts").single();
    if (error || !job) throw new InputError(error?.message ?? "Couldn't start.");
    try {
      const out = await runJob(service, job);
      await service.from("research_jobs").update({ status: "succeeded", result: { summary: out.summary, ...(out.details ?? {}) }, finished_at: new Date().toISOString(), locked_at: null }).eq("id", job.id);
      return out.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await service.from("research_jobs").update({ status: "failed", last_error: message, finished_at: new Date().toISOString(), locked_at: null }).eq("id", job.id);
      throw new InputError(message);
    }
  });
}
