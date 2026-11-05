"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clientIpHash, rateLimit } from "@/lib/security";
import { safeNextPath } from "@/lib/auth/links";
import { absoluteUrl } from "@/lib/seo";
import { log } from "@/lib/log";

export type SignInState = { status: "idle" | "sent" | "error"; message: string };

const email = z.string().trim().toLowerCase().email().max(254);

/** Sends a one-time sign-in link (no passwords to leak or reuse). */
export async function sendSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const ip = await clientIpHash();
  if (!(await rateLimit(`signin:${ip}`, 8, 3600)) || !(await rateLimit(`signin-email:${parsed.data}`, 5, 3600))) {
    return { status: "error", message: "Too many sign-in attempts. Please wait a while and try again." };
  }
  const supabase = await createClient();
  if (!supabase) return { status: "error", message: "Sign-in isn't available yet." };
  const next = safeNextPath(String(form.get("next") ?? ""), "/account");
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: absoluteUrl(`/auth/confirm?next=${encodeURIComponent(next)}`), shouldCreateUser: true },
  });
  if (error) {
    log.warn("signin_link_failed", { status: error.status, message: error.message });
    if (error.status === 429) return { status: "error", message: "Too many emails sent. Please wait a minute." };
  }
  // The same answer either way, so the form can't be used to discover who has an account.
  return { status: "sent", message: "If that address can sign in, a link is on its way. It expires in one hour." };
}
