"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/links";

export type EnrollState = { error?: string; factorId?: string; qrCode?: string; secret?: string; uri?: string };
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
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16).replace("T", " ")}` });
  if (error || !data) return { error: "We couldn't start the setup. Try again in a minute." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri };
}

/** Confirms the first code from the new authenticator; this also raises the session to two-step (aal2). */
export async function verifyEnrollment(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await signedIn();
  if (!supabase) return { error: "Sign in again to finish the setup." };
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_RE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code didn't match. Make sure your phone's clock is set automatically, then try the newest code." };
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/account/security?notice=enrolled"));
}

/** Enters a code from an authenticator that is already set up (before opening the newsroom). */
export async function verifyChallenge(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const supabase = await signedIn();
  if (!supabase) return { error: "Sign in again." };
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!CODE_RE.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp?.[0];
  if (!factor) return { error: "There's no authenticator on this account. Set one up first." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: error.status === 429 ? "Too many attempts. Wait a minute and try again." : "That code didn't match. Try the newest code from your app." };
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/admin"));
}
