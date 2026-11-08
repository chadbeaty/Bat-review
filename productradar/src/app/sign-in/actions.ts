"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIpHash, rateLimit } from "@/lib/security";
import { safeNextPath } from "@/lib/auth/member";
import { siteUrl } from "@/lib/env";
import { log } from "@/lib/log";

export type SignInState = { status: "idle" | "sent" | "error"; message: string };

const email = z.string().trim().toLowerCase().email().max(254);

/**
 * Emails a one-time sign-in link. Only the owner (ADMIN_EMAIL) and people the owner added can receive one;
 * the reply is identical either way so the form can't be used to find out who has access.
 */
export async function sendSignInLink(_prev: SignInState, form: FormData): Promise<SignInState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { status: "error", message: "Enter a valid email address." };
  const ip = await clientIpHash();
  if (!(await rateLimit(`signin:${ip}`, 8, 3600)) || !(await rateLimit(`signin-email:${parsed.data}`, 5, 3600))) {
    return { status: "error", message: "Too many attempts. Please wait a while and try again." };
  }
  const supabase = await createClient();
  const service = createAdminClient();
  if (!supabase || !service) return { status: "error", message: "Sign-in isn't set up yet (Supabase keys missing)." };

  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const isOwner = Boolean(owner && parsed.data === owner);
  const { data: member } = await service.from("users").select("id").eq("email", parsed.data).maybeSingle();
  if (isOwner || member) {
    const next = safeNextPath(String(form.get("next") ?? ""), "/");
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: `${siteUrl}/auth/confirm?next=${encodeURIComponent(next)}`, shouldCreateUser: isOwner },
    });
    if (error) {
      log.warn("signin_link_failed", { status: error.status, message: error.message });
      if (error.status === 429) return { status: "error", message: "Too many emails sent. Please wait a minute." };
    }
  }
  return { status: "sent", message: "If that address has access, a sign-in link is on its way. It expires in one hour." };
}
