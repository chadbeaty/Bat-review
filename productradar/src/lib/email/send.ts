import "server-only";
import { log } from "@/lib/log";

export type Email = { to: string[]; subject: string; html: string; text: string; tags?: { name: string; value: string }[] };
export type SendResult = { ok: true; id: string | null } | { ok: false; reason: "not_configured" | "failed"; message?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);
}

/** Sends one email through Resend's HTTP API. Without credentials it does nothing and reports "not_configured". */
export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL;
  if (!key || !from) {
    log.info("email_not_sent_not_configured", { subject: email.subject });
    return { ok: false, reason: "not_configured" };
  }
  if (!email.to.length) return { ok: false, reason: "failed", message: "No recipients" };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, html: email.html, text: email.text, tags: email.tags }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("email_send_failed", { status: res.status, body: body.slice(0, 300) });
      return { ok: false, reason: "failed", message: `Resend returned ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    log.error("email_send_error", { err });
    return { ok: false, reason: "failed", message: err instanceof Error ? err.message : "unknown" };
  }
}
