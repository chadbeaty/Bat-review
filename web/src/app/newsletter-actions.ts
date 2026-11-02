"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { requestNewsletterSignup } from "@/lib/newsletter-signup";

export type NewsletterState = { ok?: boolean; error?: string };

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), company: z.string().max(0).optional() });

/**
 * Double opt-in: stores a pending subscriber and emails a confirmation link. The reply is the same whether or not
 * the address was already known, so the form can't be used to find out who subscribes.
 */
export async function joinNewsletter(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  // "company" is a hidden honeypot field: people never fill it in, simple bots do.
  const parsed = schema.safeParse({ email: formData.get("email"), company: formData.get("company") ?? "" });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const admin = createAdminClient();
  if (!admin) return { error: "The newsletter isn't open yet." };
  const outcome = await requestNewsletterSignup(parsed.data.email, "homepage", { db: admin, send: (to, email) => sendEmail(to, email) });
  if (outcome === "error") return { error: "That didn't go through. Try again in a minute." };
  return { ok: true };
}
