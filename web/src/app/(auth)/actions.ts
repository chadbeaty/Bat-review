"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { googleAuthEnabled, siteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import {
  emailOnlySchema,
  fieldErrors,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  type FormState,
} from "@/lib/validation/auth";

const NOT_CONFIGURED: FormState = {
  error: "Accounts aren't available yet: the database isn't connected. See README, “Connect Supabase”.",
};

async function origin() {
  // Prefer the configured site URL so links in emails always point at the real domain.
  if (process.env.NEXT_PUBLIC_SITE_URL) return siteUrl;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = signUpSchema.safeParse(raw);
  const values = { email: raw.email ?? "", username: raw.username ?? "", displayName: raw.displayName ?? "" };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;

  const { email, password, username, displayName } = parsed.data;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await origin()}/auth/confirm?next=/account`,
      data: { username, display_name: displayName || undefined },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { fieldErrors: { password: error.message }, values };
    if (error.code === "over_email_send_rate_limit" || error.status === 429)
      return { error: "Too many sign-up attempts. Wait a few minutes and try again.", values };
    return { error: "We couldn't create your account. Check your details and try again.", values };
  }
  // Same response whether or not the email was already registered, so accounts can't be discovered this way.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = signInSchema.safeParse(raw);
  const values = { email: raw.email ?? "" };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (error.code === "email_not_confirmed")
      return { error: "Confirm your email first. Check your inbox for the link we sent when you signed up.", values };
    if (error.status === 429) return { error: "Too many attempts. Wait a few minutes and try again.", values };
    return { error: "That email and password don't match an account.", values };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await origin()}/auth/confirm?next=/reset-password`,
  });
  // Always the same message, whether or not the email has an account.
  return { message: "If that email has an account, we've sent a link to reset the password. It expires in one hour." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  if (!supabase) return NOT_CONFIGURED;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: "Choose a password you haven't used here before." } };
    if (error.code === "weak_password") return { fieldErrors: { password: error.message } };
    return { error: "We couldn't update your password. Try again." };
  }
  redirect("/account?notice=password-updated");
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  if (!googleAuthEnabled) redirect("/sign-in");
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/sign-in?error=google");
  redirect(data.url);
}
