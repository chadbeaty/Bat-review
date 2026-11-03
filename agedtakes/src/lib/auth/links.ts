import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/**
 * One-time bootstrap: the first time the owner signs in with the address in ADMIN_EMAIL (and Supabase has
 * verified that address), they become the first admin. Once any admin exists this does nothing; further staff
 * are added in Admin → Settings.
 */
export async function maybeBootstrapAdmin(user: User): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !user.email || user.email.toLowerCase() !== adminEmail || !user.email_confirmed_at) return false;
  const db = createAdminClient();
  if (!db) return false;
  const { data, error } = await db.rpc("bootstrap_admin", { p_user: user.id });
  if (error) {
    log.error("bootstrap_admin_failed", { message: error.message });
    return false;
  }
  if (data === true) log.info("bootstrap_admin_granted", { user: user.id });
  return data === true;
}

/** Finishes a sign-in from an emailed link: Supabase returns a one-time code or a token hash. */
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
  if (user && (await maybeBootstrapAdmin(user))) {
    return NextResponse.redirect(new URL("/account/security?required=1&next=/admin&welcome=1", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
