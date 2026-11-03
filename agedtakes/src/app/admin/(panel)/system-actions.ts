"use server";

import { audit, InputError, refreshPublic, runAction, str, bool } from "@/lib/admin/action";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendIssue } from "@/lib/newsletter-send";
import { slugify } from "@/lib/format";
import { STAFF_ROLES } from "@/lib/auth/roles";

// ------------------------------------------------------------------------------------------ Submissions
export async function triageSubmission(form: FormData) {
  await runAction("researcher", form, "/admin/submissions", async ({ db, user }) => {
    const status = str(form, "status");
    if (!["new", "reviewing", "accepted", "rejected", "spam"].includes(status)) throw new InputError("Unknown status.");
    const { error } = await db.from("submissions").update({ status, reviewer_id: user.id, reviewer_notes: str(form, "reviewer_notes") || null }).eq("id", str(form, "submission_id"));
    if (error) throw new InputError(error.message);
    return "Submission updated.";
  });
}

/** Turns a reader submission into a case in "Discovered", with the submitted link stored as an unverified source. */
export async function submissionToCase(form: FormData) {
  await runAction("researcher", form, "/admin/submissions", async ({ db, user }) => {
    const id = str(form, "submission_id");
    const personId = str(form, "person_id");
    if (!personId) throw new InputError("Choose (or first add) the person this is about.");
    const { data: s } = await db.from("submissions").select("*").eq("id", id).single();
    if (!s) throw new InputError("Submission not found.");
    let sourceId: string | null = null;
    const { data: existing } = await db.from("evidence_sources").select("id").eq("canonical_url", s.source_url).maybeSingle();
    if (existing) sourceId = existing.id;
    else {
      const { data: src, error } = await db.from("evidence_sources").insert({ source_type: "other", title: `Reader-submitted source: ${s.source_url}`.slice(0, 400), canonical_url: s.source_url, verification_status: "unverified", reliability_notes: "Submitted by a reader; not yet verified.", created_by: user.id }).select("id").single();
      if (error) throw new InputError(error.message);
      sourceId = src.id;
    }
    const title = `Submitted: ${s.person_name} — ${s.statement_text}`.slice(0, 190);
    const { data: c, error } = await db.from("cases").insert({
      slug: `${slugify(title, 60)}-${crypto.randomUUID().slice(0, 6)}`, person_id: personId, title, case_type: "other", status: "discovered", origin: "submission", created_by: user.id,
      ai_notes: { submission: { statement: s.statement_text, date: s.statement_date, context: s.context, supporting_urls: s.supporting_urls } },
    }).select("id").single();
    if (error) throw new InputError(error.message);
    await db.from("case_evidence").insert({ case_id: c.id, evidence_source_id: sourceId, evidence_role: "original_statement", notes: "From reader submission" });
    await db.from("submissions").update({ status: "accepted", reviewer_id: user.id, case_id: c.id }).eq("id", id);
    return { notice: "Case opened from the submission.", to: `/admin/cases/${c.id}` };
  });
}

// ------------------------------------------------------------------------------------------- Newsletter
export async function createIssue(form: FormData) {
  await runAction("editor", form, "/admin/newsletter", async ({ db, user }) => {
    const caseIds = form.getAll("case_ids").map(String).filter(Boolean);
    if (!caseIds.length) throw new InputError("Choose at least one published case.");
    const { data, error } = await db.from("newsletter_issues").insert({ kind: str(form, "kind") === "alert" ? "alert" : "weekly", subject: str(form, "subject"), intro: str(form, "intro") || null, case_ids: caseIds, created_by: user.id }).select("id").single();
    if (error) throw new InputError(error.message);
    return { notice: "Draft issue saved. Review the preview, then send.", to: `/admin/newsletter?issue=${data.id}` };
  });
}

export async function sendNewsletterIssue(form: FormData) {
  await runAction("editor", form, "/admin/newsletter", async (staff) => {
    if (!bool(form, "confirm")) throw new InputError("Tick the confirmation to send.");
    const db = createAdminClient();
    if (!db) throw new InputError("Database not configured.");
    const issueId = str(form, "issue_id");
    const result = await sendIssue(db, issueId);
    await audit(staff, "send_newsletter", "newsletter_issues", issueId, result);
    if (result.notConfigured) throw new InputError("Resend isn't configured (RESEND_API_KEY and NEWSLETTER_FROM_EMAIL). Nothing was sent.");
    return `Sent to ${result.sent} subscriber(s)${result.failed ? `; ${result.failed} failed` : ""}.`;
  });
}

export async function updateSubscriber(form: FormData) {
  await runAction("admin", form, "/admin/newsletter", async ({ db }) => {
    const status = str(form, "status");
    if (!["confirmed", "unsubscribed", "bounced", "complained"].includes(status)) throw new InputError("Unknown status.");
    if (status === "confirmed") throw new InputError("Subscribers can only be confirmed by clicking their own confirmation link.");
    const { error } = await db.from("newsletter_subscribers").update({ status, unsubscribed_at: new Date().toISOString() }).eq("id", str(form, "subscriber_id"));
    if (error) throw new InputError(error.message);
    return "Subscriber updated.";
  });
}

// --------------------------------------------------------------------------------------------- Settings
const BOOLEAN_SETTINGS = ["show_demo_content", "staff_mfa_required", "ai_research_enabled", "newsletter_enabled", "submissions_enabled"];

export async function saveSettings(form: FormData) {
  await runAction("admin", form, "/admin/settings", async ({ db, user }) => {
    for (const key of BOOLEAN_SETTINGS) {
      const { error } = await db.from("site_settings").update({ value: form.get(key) === "on", updated_by: user.id }).eq("key", key);
      if (error) throw new InputError(error.message);
    }
    const budget = Number(str(form, "ai_daily_budget_usd"));
    if (!Number.isFinite(budget) || budget < 0 || budget > 1000) throw new InputError("Daily AI budget must be between 0 and 1000.");
    await db.from("site_settings").update({ value: budget, updated_by: user.id }).eq("key", "ai_daily_budget_usd");
    const version = str(form, "methodology_version");
    if (version) await db.from("site_settings").update({ value: version, updated_by: user.id }).eq("key", "methodology_version");
    refreshPublic();
    return "Settings saved.";
  });
}

export async function addMethodologyVersion(form: FormData) {
  await runAction("admin", form, "/admin/settings", async ({ db, user }) => {
    const version = str(form, "version");
    const { error } = await db.from("methodology_versions").insert({ version, effective_at: str(form, "effective_at"), summary: str(form, "summary") });
    if (error) throw new InputError(error.message);
    await db.from("site_settings").update({ value: version, updated_by: user.id }).eq("key", "methodology_version");
    refreshPublic(["/methodology"]);
    return `Methodology ${version} recorded and made current.`;
  });
}

/** Grants or changes a staff role. The person must have signed in once (so they have an account). */
export async function setRole(form: FormData) {
  await runAction("admin", form, "/admin/settings", async ({ db }) => {
    const email = str(form, "email").toLowerCase();
    const role = str(form, "role");
    if (![...STAFF_ROLES, "reader"].includes(role)) throw new InputError("Unknown role.");
    const { data: profile } = await db.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (!profile) throw new InputError("No account with that email. Ask them to sign in once at /sign-in, then try again.");
    const { error } = await db.from("profiles").update({ role, status: str(form, "status") === "suspended" ? "suspended" : "active" }).eq("id", profile.id);
    if (error) throw new InputError(error.message);
    return `${email} is now ${role}.`;
  });
}

/** Permanently removes every DEMO ONLY record (people, sources, cases and everything attached). */
export async function deleteDemoData(form: FormData) {
  await runAction("admin", form, "/admin/settings", async (staff) => {
    if (str(form, "confirm") !== "DELETE DEMO DATA") throw new InputError('Type "DELETE DEMO DATA" to confirm.');
    const db = createAdminClient();
    if (!db) throw new InputError("Database not configured.");
    // The demo records were loaded as already-published fixtures; remove them with the owner-level cleanup function.
    const { error } = await db.rpc("delete_demo_data");
    if (error) throw new InputError(error.message);
    await audit(staff, "delete_demo_data", "site_settings", null, {});
    refreshPublic();
    return "All demo records were deleted.";
  });
}
