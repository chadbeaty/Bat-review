import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac } from "node:crypto";
import { randomToken, sha256, safeEqual } from "@/lib/security";
import { sendEmail } from "@/lib/email/send";
import { confirmationEmail, welcomeEmail } from "@/lib/email/templates";
import { absoluteUrl } from "@/lib/seo";
import { log } from "@/lib/log";

// Double opt-in newsletter. Only hashes of the emailed tokens are stored. Responses never reveal whether an
// address is already subscribed.

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");

export const CONSENT_TEXT = "I agree to receive The Weekly Aged Takes and occasional alerts when new investigations publish. I can unsubscribe at any time.";

const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Stable per-subscriber unsubscribe token, derived from a server secret so every email ever sent keeps a working
 * unsubscribe link. Keep NEWSLETTER_SECRET unchanged once you launch (changing it invalidates old links).
 */
export function unsubscribeToken(id: string): string {
  const secret = process.env.NEWSLETTER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-only-newsletter-secret";
  return createHmac("sha256", secret).update(`unsubscribe:${id}`).digest("base64url");
}

export type SignupResult = { ok: true; message: string; devConfirmUrl?: string } | { ok: false; message: string };

export async function startSignup(rawEmail: string, source = "website"): Promise<SignupResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  const email = parsed.data;
  const db = createAdminClient();
  if (!db) return { ok: false, message: "Signups aren't available yet. Please try again later." };

  const confirmToken = randomToken();
  const { data: existing } = await db.from("newsletter_subscribers").select("id, status").ilike("email", email).maybeSingle();

  const done: SignupResult = { ok: true, message: "Check your inbox to confirm your subscription." };
  if (existing?.status === "confirmed") return done;

  let id = existing?.id as string | undefined;
  if (existing) {
    const { error } = await db.from("newsletter_subscribers").update({
      status: "pending", confirm_token_hash: sha256(confirmToken), confirm_sent_at: new Date().toISOString(),
      consent_source: source, consent_text: CONSENT_TEXT, consent_at: new Date().toISOString(),
    }).eq("id", existing.id);
    if (error) return failure(error.message);
  } else {
    const newId = crypto.randomUUID();
    const { error } = await db.from("newsletter_subscribers").insert({
      id: newId, email, status: "pending", confirm_token_hash: sha256(confirmToken), confirm_sent_at: new Date().toISOString(),
      unsubscribe_token_hash: sha256(unsubscribeToken(newId)), consent_source: source, consent_text: CONSENT_TEXT,
    });
    if (error) return failure(error.message);
    id = newId;
  }

  const confirmUrl = absoluteUrl(`/newsletter/confirm?id=${id}&token=${confirmToken}`);
  const sent = await sendEmail({ to: email, ...confirmationEmail({ confirmUrl }), tags: [{ name: "type", value: "confirm" }] });
  if (!sent.ok && sent.reason === "not_configured") {
    if (process.env.NODE_ENV !== "production") {
      log.info("newsletter_dev_confirm_link", { confirmUrl });
      return { ...done, devConfirmUrl: confirmUrl };
    }
    // Never tell a visitor to check their inbox when no email can be sent.
    return { ok: false, message: "Newsletter signups open soon. Please check back shortly." };
  }
  if (!sent.ok && sent.reason === "failed") return { ok: false, message: "We couldn't send the confirmation email. Please try again shortly." };
  return done;
}

function failure(message: string): SignupResult {
  log.error("newsletter_signup_failed", { message });
  return { ok: false, message: "Something went wrong. Please try again." };
}

export async function confirmSubscription(id: string, token: string): Promise<"confirmed" | "invalid" | "expired"> {
  const db = createAdminClient();
  if (!db || !z.string().uuid().safeParse(id).success || !token) return "invalid";
  const { data } = await db.from("newsletter_subscribers").select("id, status, confirm_token_hash, confirm_sent_at").eq("id", id).maybeSingle();
  if (!data) return "invalid";
  if (data.status === "confirmed") return "confirmed";
  if (!data.confirm_token_hash || !safeEqual(data.confirm_token_hash, sha256(token))) return "invalid";
  if (data.confirm_sent_at && Date.now() - new Date(data.confirm_sent_at).getTime() > CONFIRM_TTL_MS) return "expired";

  const { data: updated, error } = await db.from("newsletter_subscribers").update({
    status: "confirmed", confirmed_at: new Date().toISOString(), confirm_token_hash: null,
  }).eq("id", id).select("email").single();
  if (error || !updated) return "invalid";

  const links = unsubscribeLinks(id);
  await sendEmail({ to: updated.email, ...welcomeEmail({ siteUrl: absoluteUrl("/").replace(/\/$/, ""), ...links }), tags: [{ name: "type", value: "welcome" }] });
  return "confirmed";
}

export function unsubscribeLinks(id: string) {
  const token = unsubscribeToken(id);
  return {
    unsubscribeUrl: absoluteUrl(`/newsletter/unsubscribe?id=${id}&token=${token}`),
    oneClickUrl: absoluteUrl(`/api/newsletter/unsubscribe?id=${id}&token=${token}`),
  };
}

export async function unsubscribe(id: string, token: string): Promise<boolean> {
  const db = createAdminClient();
  if (!db || !z.string().uuid().safeParse(id).success || !token) return false;
  if (!safeEqual(unsubscribeToken(id), token)) return false;
  const { data } = await db.from("newsletter_subscribers").select("status").eq("id", id).maybeSingle();
  if (!data) return false;
  if (data.status === "unsubscribed") return true;
  const { error } = await db.from("newsletter_subscribers").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() }).eq("id", id);
  return !error;
}
