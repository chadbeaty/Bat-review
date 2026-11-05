import "server-only";
import { log } from "@/lib/log";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

export type SendResult = { ok: true; id: string | null } | { ok: false; reason: "not_configured" | "failed"; message?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NEWSLETTER_FROM_EMAIL);
}

/**
 * Sends one email through Resend's HTTP API. Without RESEND_API_KEY it does nothing and reports
 * "not_configured", so signups still work in development (confirmation links are logged instead).
 */
export async function sendEmail(email: Email, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM_EMAIL;
  if (!key || !from) {
    log.info("email_not_sent_not_configured", { subject: email.subject });
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text, headers: email.headers, tags: email.tags }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.error("email_send_failed", { status: res.status, body: body.slice(0, 300) });
      return { ok: false, reason: "failed", message: `Resend returned ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id ?? null };
  } catch (err) {
    log.error("email_send_error", { err });
    return { ok: false, reason: "failed", message: err instanceof Error ? err.message : "unknown" };
  }
}

/** Sends up to 100 emails per request through Resend's batch endpoint. Returns how many were accepted. */
export async function sendBatch(emails: Email[], fetchImpl: typeof fetch = fetch): Promise<{ sent: number; failed: number; notConfigured: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NEWSLETTER_FROM_EMAIL;
  if (!key || !from) return { sent: 0, failed: emails.length, notConfigured: true };
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    try {
      const res = await fetchImpl("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((e) => ({ from, to: [e.to], subject: e.subject, html: e.html, text: e.text, headers: e.headers, tags: e.tags }))),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        log.error("email_batch_failed", { status: res.status });
      }
    } catch (err) {
      failed += chunk.length;
      log.error("email_batch_error", { err });
    }
  }
  return { sent, failed, notConfigured: false };
}
