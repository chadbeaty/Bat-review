"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export type NewsletterState = { ok?: boolean; error?: string };

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), company: z.string().max(0).optional() });

export async function joinNewsletter(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  // "company" is a hidden honeypot field: people never fill it in, simple bots do.
  const parsed = schema.safeParse({ email: formData.get("email"), company: formData.get("company") ?? "" });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const admin = createAdminClient();
  if (!admin) return { error: "The newsletter isn't open yet." };
  const { error } = await admin
    .from("newsletter_subscribers")
    .upsert({ email: parsed.data.email, source: "homepage" }, { onConflict: "email", ignoreDuplicates: true });
  if (error) return { error: "That didn't go through. Try again in a minute." };
  return { ok: true };
}
