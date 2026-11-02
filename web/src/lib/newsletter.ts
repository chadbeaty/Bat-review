import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewsletterOutcome = "confirmed" | "unsubscribed" | "already" | "invalid" | "unavailable";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Confirms or unsubscribes the subscriber who owns this token. The token is the random confirm_token
 * from newsletter_subscribers, which is only ever sent to that subscriber's email address.
 */
export async function applyNewsletterToken(token: string | null, action: "confirm" | "unsubscribe"): Promise<NewsletterOutcome> {
  if (!token || !UUID_RE.test(token)) return "invalid";
  const db = createAdminClient();
  if (!db) return "unavailable";
  const { data: sub } = await db.from("newsletter_subscribers").select("id, status").eq("confirm_token", token).maybeSingle();
  if (!sub) return "invalid";

  if (action === "confirm") {
    if (sub.status === "subscribed") return "already";
    // Someone who unsubscribed (or bounced) has to sign up again; an old confirmation link doesn't re-subscribe them.
    if (sub.status !== "pending") return "invalid";
    const { error } = await db
      .from("newsletter_subscribers")
      .update({ status: "subscribed", confirmed_at: new Date().toISOString() })
      .eq("id", sub.id)
      .eq("status", "pending");
    return error ? "unavailable" : "confirmed";
  }

  if (sub.status === "unsubscribed") return "already";
  const { error } = await db
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", sub.id);
  return error ? "unavailable" : "unsubscribed";
}
