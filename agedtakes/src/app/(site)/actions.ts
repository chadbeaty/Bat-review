"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { startSignup } from "@/lib/newsletter";
import { clientIpHash, rateLimit } from "@/lib/security";
import { firstError, formToObject, submissionSchema } from "@/lib/validation/public";
import { log } from "@/lib/log";

export type FormState = { status: "idle" | "ok" | "error"; message: string; devLink?: string; values?: Record<string, string> };

/** Echoes what the visitor typed back with an error, because React resets forms after every submission. */
function keep(form: FormData, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, String(form.get(f) ?? "").slice(0, 6000)]));
}
const SUBMISSION_FIELDS = ["person_name", "statement_text", "statement_date", "source_url", "supporting_urls", "context", "submitter_name", "submitter_email"];

export async function subscribeAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (String(form.get("website") ?? "")) return { status: "ok", message: "Check your inbox to confirm your subscription." };
  if (form.get("consent") !== "on") return { status: "error", message: "Please tick the box to confirm you want the newsletter.", values: keep(form, ["email"]) };
  const ip = await clientIpHash();
  if (!(await rateLimit(`newsletter:${ip}`, 5, 3600))) {
    return { status: "error", message: "Too many attempts. Please try again in an hour.", values: keep(form, ["email"]) };
  }
  const result = await startSignup(String(form.get("email") ?? ""), String(form.get("source") ?? "website").slice(0, 40));
  return result.ok
    ? { status: "ok", message: result.message, devLink: result.devConfirmUrl }
    : { status: "error", message: result.message, values: keep(form, ["email"]) };
}

export async function submitReceiptAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = submissionSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    // A filled honeypot looks like success to bots.
    if (parsed.error.issues.some((i) => i.path[0] === "website")) return { status: "ok", message: "Thanks — your submission is in the moderation queue." };
    return { status: "error", message: firstError(parsed.error), values: keep(form, SUBMISSION_FIELDS) };
  }
  const ip = await clientIpHash();
  if (!(await rateLimit(`submit:${ip}`, 5, 3600))) {
    return { status: "error", message: "You've sent several submissions recently. Please try again in an hour.", values: keep(form, SUBMISSION_FIELDS) };
  }
  const db = createAdminClient();
  if (!db) return { status: "error", message: "Submissions aren't available yet. Please try again later.", values: keep(form, SUBMISSION_FIELDS) };

  const { data: setting } = await db.from("site_settings").select("value").eq("key", "submissions_enabled").maybeSingle();
  if (setting && setting.value === false) return { status: "error", message: "Submissions are paused right now.", values: keep(form, SUBMISSION_FIELDS) };

  const { website: _honeypot, ...row } = parsed.data;
  void _honeypot;
  const { error } = await db.from("submissions").insert({ ...row, ip_hash: ip, status: "new" });
  if (error) {
    log.error("submission_insert_failed", { message: error.message });
    return { status: "error", message: "Something went wrong saving your submission. Please try again.", values: keep(form, SUBMISSION_FIELDS) };
  }
  log.info("submission_received", {});
  return { status: "ok", message: "Thanks — your submission is in the moderation queue. An editor reviews every one; nothing is published automatically." };
}
