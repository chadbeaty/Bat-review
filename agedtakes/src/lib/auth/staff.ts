import "server-only";
import { notFound, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atLeast, isStaffRole, type StaffRole } from "@/lib/auth/roles";

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type Staff = { user: User; role: StaffRole; db: Db };

export type StaffCheck =
  | { ok: true; staff: Staff }
  | { ok: false; reason: "not_configured" | "signed_out" | "not_staff" | "insufficient_role" | "needs_enrollment" | "needs_challenge" };

/**
 * Verifies on the server that the visitor is signed in (token checked with Supabase, not just the cookie), has an
 * active staff role of at least `min` (read from the database with the service role so a forged cookie can't
 * grant it), and has passed two-step verification this session unless an admin turned that requirement off.
 * Returns the staff member's OWN database client: all newsroom writes go through it, so Row Level Security and
 * the editorial triggers see the real person and attribute every change in the audit log.
 */
export async function checkStaff(min: StaffRole = "researcher"): Promise<StaffCheck> {
  const db = await createClient();
  const service = createAdminClient();
  if (!db || !service) return { ok: false, reason: "not_configured" };
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "signed_out" };

  const [{ data: profile }, { data: mfaSetting }] = await Promise.all([
    service.from("profiles").select("role, status").eq("id", data.user.id).maybeSingle(),
    service.from("site_settings").select("value").eq("key", "staff_mfa_required").maybeSingle(),
  ]);
  if (!profile || profile.status !== "active" || !isStaffRole(profile.role)) return { ok: false, reason: "not_staff" };
  if (!atLeast(profile.role, min)) return { ok: false, reason: "insufficient_role" };

  if (mfaSetting?.value !== false) {
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") return { ok: false, reason: aal?.nextLevel === "aal2" ? "needs_challenge" : "needs_enrollment" };
  }
  return { ok: true, staff: { user: data.user, role: profile.role, db } };
}

/** For newsroom pages: returns the staff member or ends the request (non-staff get a 404; the area isn't revealed). */
export async function requireStaff(min: StaffRole = "researcher", next = "/admin"): Promise<Staff> {
  const check = await checkStaff(min);
  if (check.ok) return check.staff;
  switch (check.reason) {
    case "signed_out":
      redirect(`/sign-in?next=${encodeURIComponent(next)}`);
    case "needs_enrollment":
      redirect(`/account/security?required=1&next=${encodeURIComponent(next)}`);
    case "needs_challenge":
      redirect(`/admin/mfa?next=${encodeURIComponent(next)}`);
    case "insufficient_role":
      redirect("/admin?error=role");
    default:
      notFound();
  }
}

export class StaffAuthError extends Error {
  constructor(public reason: string) {
    super("Not allowed");
  }
}

/** For server actions and route handlers: the same checks, but throws instead of redirecting. */
export async function assertStaff(min: StaffRole = "researcher"): Promise<Staff> {
  const check = await checkStaff(min);
  if (!check.ok) throw new StaffAuthError(check.reason);
  return check.staff;
}
