import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { maybeBootstrapOwner, safeNextPath } from "@/lib/auth/member";

// Finishes a sign-in from the emailed link (Supabase sends either a one-time code or a token hash).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"), "/");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin));
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error_code") === "otp_expired" ? "link-expired" : "link-invalid");

  const supabase = await createClient();
  if (!supabase) return fail("not-configured");
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let user: User | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("link-expired");
    user = data.user;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail("link-expired");
    user = data.user;
  } else {
    return fail("link-invalid");
  }
  if (user) await maybeBootstrapOwner(user);
  return NextResponse.redirect(new URL(next, url.origin));
}
