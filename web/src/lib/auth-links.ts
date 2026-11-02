import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

/**
 * Finishes a sign-in that started outside the site: email confirmation, password reset, or Google.
 * Supabase sends the visitor back with either a one-time code or a token hash.
 */
export async function completeAuthRedirect(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"), "/account");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin));

  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_code") === "otp_expired" ? "link-expired" : "link-invalid");

  const supabase = await createClient();
  if (!supabase) return fail("not-configured");

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    // The confirmation itself already happened at Supabase. If this browser didn't start the sign-up,
    // there is no session to finish here, so the member simply signs in.
    if (error) return NextResponse.redirect(new URL("/sign-in?notice=confirmed", url.origin));
    return NextResponse.redirect(new URL(next, url.origin));
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail("link-expired");
    return NextResponse.redirect(new URL(type === "recovery" ? "/reset-password" : next, url.origin));
  }
  return fail("link-invalid");
}
