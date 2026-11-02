// Newsletter sign-up with double opt-in: the form records a *pending* subscriber and emails a confirmation link
// (/newsletter/confirm?token=...). Nobody becomes "subscribed" until they click it. Dependencies are passed in
// so the rules can be tested without a server.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RenderedEmail } from "@/lib/email/layout";
import { newsletterConfirm } from "@/lib/email/templates";

/** Re-submitting the form for a pending address does not send another message inside this window. */
export const CONFIRM_RESEND_MINUTES = 10;

export type SignupDeps = {
  db: SupabaseClient;
  send: (to: string, email: RenderedEmail) => Promise<unknown>;
  now?: () => Date;
  newToken?: () => string;
};

export type SignupOutcome = "confirmation_sent" | "already_subscribed" | "throttled" | "error";

export async function requestNewsletterSignup(email: string, source: string, deps: SignupDeps): Promise<SignupOutcome> {
  const { db, send } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const newToken = deps.newToken ?? (() => crypto.randomUUID());

  const { error: insertError } = await db.from("newsletter_subscribers").upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });
  if (insertError) return "error";
  const { data: sub, error } = await db.from("newsletter_subscribers").select("id, status, confirm_token").eq("email", email).maybeSingle();
  if (error || !sub) return "error";

  if (sub.status === "subscribed") return "already_subscribed";

  let token = sub.confirm_token as string;
  if (sub.status !== "pending") {
    // Unsubscribed or bounced: signing up again starts over with a fresh token, so old links stay dead.
    token = newToken();
    const { error: resetError } = await db
      .from("newsletter_subscribers")
      .update({ status: "pending", confirm_token: token, confirmed_at: null, unsubscribed_at: null })
      .eq("id", sub.id);
    if (resetError) return "error";
  } else {
    const since = new Date(now.getTime() - CONFIRM_RESEND_MINUTES * 60_000).toISOString();
    const { data: recent } = await db
      .from("email_deliveries")
      .select("id")
      .eq("template", "newsletter_confirm")
      .eq("to_email", email)
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return "throttled";
  }

  await send(email, newsletterConfirm({ token }));
  return "confirmation_sent";
}
