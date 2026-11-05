import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendBatch, type Email } from "@/lib/email/send";
import { digestEmail, type DigestCase } from "@/lib/email/templates";
import { unsubscribeLinks } from "@/lib/newsletter";
import { CASE_TYPE_LABELS, type CaseType } from "@/lib/editorial";
import { absoluteUrl } from "@/lib/seo";

/** Loads the cases for an issue. Only published cases are ever returned (and the database refuses others). */
export async function digestCases(db: SupabaseClient, caseIds: string[]): Promise<DigestCase[]> {
  if (!caseIds.length) return [];
  const { data } = await db.from("cases").select("id, slug, title, summary, newsletter_summary, case_type, is_demo, status, person:people(name)").in("id", caseIds).eq("status", "published");
  const order = new Map(caseIds.map((id, i) => [id, i]));
  return (data ?? [])
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((c) => ({
      title: c.title,
      url: absoluteUrl(`/cases/${c.slug}`),
      summary: c.newsletter_summary || c.summary || "",
      personName: (c.person as unknown as { name: string } | null)?.name ?? "",
      label: CASE_TYPE_LABELS[c.case_type as CaseType],
      isDemo: c.is_demo,
    }));
}

/**
 * Sends an issue to confirmed subscribers (alerts go only to those who opted into alerts). Called from the
 * newsroom with the service role after the editor's role has been checked.
 */
export async function sendIssue(db: SupabaseClient, issueId: string): Promise<{ sent: number; failed: number; notConfigured: boolean }> {
  const { data: issue } = await db.from("newsletter_issues").select("*").eq("id", issueId).single();
  if (!issue || issue.status === "sent") throw new Error("Issue not found or already sent.");
  // The database trigger rejects this update if any case in the issue is not published.
  const { error: lockError } = await db.from("newsletter_issues").update({ status: "sending" }).eq("id", issueId).eq("status", issue.status);
  if (lockError) throw new Error(lockError.message);

  const cases = await digestCases(db, issue.case_ids ?? []);
  if (!cases.length) {
    await db.from("newsletter_issues").update({ status: "failed" }).eq("id", issueId);
    throw new Error("The issue has no published cases.");
  }
  let q = db.from("newsletter_subscribers").select("id, email").eq("status", "confirmed");
  if (issue.kind === "alert") q = q.eq("alerts_opt_in", true);
  const { data: subs } = await q.limit(50_000);
  const siteUrl = absoluteUrl("/").replace(/\/$/, "");
  const emails: Email[] = (subs ?? []).map((s) => {
    const links = unsubscribeLinks(s.id);
    return { to: s.email, ...digestEmail({ subject: issue.subject, intro: issue.intro, cases, siteUrl, ...links }), tags: [{ name: "issue", value: String(issueId).slice(0, 36) }] };
  });
  const result = await sendBatch(emails);
  await db.from("newsletter_issues").update({ status: result.notConfigured ? "failed" : "sent", sent_count: result.sent, sent_at: new Date().toISOString() }).eq("id", issueId);
  return result;
}
