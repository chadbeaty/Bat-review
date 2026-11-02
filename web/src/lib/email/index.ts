import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RenderedEmail } from "./layout";
import { providerFromEnv, type EmailProvider, type SendResult } from "./providers";

export * as templates from "./templates";
export type { RenderedEmail } from "./layout";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Sends one email and records the attempt in email_deliveries (sent, not sent, or failed).
 * Marketing email must have an unsubscribe link; the caller is responsible for only sending it to
 * newsletter subscribers whose status is "subscribed".
 */
export async function sendEmail(to: string, email: RenderedEmail, provider: EmailProvider = providerFromEnv()): Promise<SendResult> {
  if (!EMAIL_RE.test(to)) return { provider: provider.name, status: "failed", error: "Invalid recipient" };
  if (email.category === "marketing" && !email.unsubscribeUrl) {
    return { provider: provider.name, status: "failed", error: "Marketing email needs an unsubscribe link" };
  }
  const result = await provider.send(to, email);
  const db = createAdminClient();
  if (db) {
    await db.from("email_deliveries").insert({
      template: email.template,
      category: email.category,
      to_email: to,
      subject: email.subject,
      provider: result.provider,
      status: result.status,
      provider_message_id: result.id ?? null,
      error: result.error?.slice(0, 500) ?? null,
    });
  }
  return result;
}
