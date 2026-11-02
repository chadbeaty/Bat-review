import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAccess, type Access, type StaffRole } from "@/lib/admin/roles";

export type Staff = { user: User; roles: StaffRole[] };

type Check =
  | { ok: true; staff: Staff }
  | { ok: false; reason: "signed_out" | "not_staff" | "needs_enrollment" | "needs_challenge" | "not_configured" };

/**
 * Checks, on the server, that the visitor is a signed-in staff member with the required role and has
 * passed MFA in this session (assurance level aal2). Roles are read from the database with the service
 * role so a stale or forged cookie can't grant them; the user itself is verified with Supabase (getUser).
 */
export async function checkStaff(access: Access, opts: { requireMfa?: boolean } = {}): Promise<Check> {
  const supabase = await createClient();
  const db = createAdminClient();
  if (!supabase || !db) return { ok: false, reason: "not_configured" };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };
  const user = data.user;

  const [{ data: roleRows }, { data: profile }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", user.id),
    db.from("profiles").select("account_status").eq("id", user.id).maybeSingle(),
  ]);
  const roles = (roleRows ?? []).map((r) => r.role as StaffRole);
  if (profile?.account_status !== "active" || roles.length === 0 || !hasAccess(roles, access)) return { ok: false, reason: "not_staff" };

  if (opts.requireMfa !== false) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      return { ok: false, reason: aal?.nextLevel === "aal2" ? "needs_challenge" : "needs_enrollment" };
    }
  }
  return { ok: true, staff: { user, roles } };
}

/**
 * For admin pages. Returns the staff member, or ends the request: signed-out visitors go to sign-in,
 * non-staff get a 404 (the admin area isn't revealed), staff without an authenticator go to set one up,
 * and staff who haven't entered a code this session go to the MFA challenge.
 */
export async function requireStaff(access: Access = "any", next = "/admin"): Promise<Staff> {
  const check = await checkStaff(access);
  if (check.ok) return check.staff;
  switch (check.reason) {
    case "signed_out":
      redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    case "needs_enrollment":
      redirect("/account/security?required=admin");
    case "needs_challenge":
      redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
    default:
      notFound();
  }
}

/** For server actions and route handlers: the same checks, but throws instead of redirecting. */
export async function assertStaff(access: Access = "any"): Promise<Staff> {
  const check = await checkStaff(access);
  if (!check.ok) throw new AdminAuthError(check.reason);
  return check.staff;
}

export class AdminAuthError extends Error {
  constructor(public reason: string) {
    super("Not allowed");
  }
}

/** The service-role client for admin writes. Only call after requireStaff/assertStaff. */
export function adminDb() {
  const db = createAdminClient();
  if (!db) throw new Error("The database isn't configured");
  return db;
}
