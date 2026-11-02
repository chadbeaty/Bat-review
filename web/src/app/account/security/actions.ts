"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

export type EnrollState = { error?: string; factorId?: string; qrCode?: string; secret?: string };
export type VerifyState = { error?: string };

const CODE_RE = /^\d{6}$/;

async function signedIn() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

/** Starts setting up an authenticator app: returns the QR code and setup key Supabase generates. */
export async function startEnrollment(): Promise<EnrollState> {
  const supabase = await signedIn();
  if (!supabase) return { error: "Sign in again to set up an authenticator." };
  // A setup that was started but never confirmed would block a new one, so clear it first.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  });
  if (error || !data) return { error: "We couldn't start the setup. Try again in a minute." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms the first code from the new authenticator. This also raises the session to two-step (aal2). */
export async function verifyEnrollment(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await signedIn();
  if (!supabase) return { error: "Sign in again to finish the setup." };
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_RE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code didn't match. Check the time on your phone is set automatically, then try the newest code." };
  const next = String(formData.get("next") ?? "");
  redirect(next ? safeNextPath(next) : "/account/security?notice=enrolled");
}

/** Enters a code from an authenticator that is already set up (for example before opening the admin area). */
export async function verifyChallenge(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await signedIn();
  if (!supabase) return { error: "Sign in again." };
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_RE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { error: "There's no authenticator on this account. Set one up first." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    if (error.status === 429) return { error: "Too many attempts. Wait a minute and try again." };
    return { error: "That code didn't match. Try the newest code from your app." };
  }
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/account/security"));
}

/** Removes an authenticator. Supabase only allows this from a session that already passed two-step sign-in. */
export async function removeFactor(formData: FormData): Promise<void> {
  const supabase = await signedIn();
  if (!supabase) redirect("/sign-in?next=/account/security");
  const factorId = String(formData.get("factorId") ?? "");
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") redirect("/account/security?error=verify-first");
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) redirect("/account/security?error=remove-failed");
  // Refresh so the session no longer claims a factor that is gone.
  await supabase.auth.refreshSession();
  redirect("/account/security?notice=removed");
}
