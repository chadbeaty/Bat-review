"use server";

import { AdminInputError, must, runAdminAction } from "@/lib/admin/action";
import { optional, text, uuid } from "@/lib/admin/validation";

function userId(form: FormData) {
  const id = text(form, "userId");
  if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown member.");
  return id;
}

/** Suspend or reactivate (moderators and admins). Bans go through confirmBan. */
export async function setAccountStatus(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/users", async (staff, db) => {
    const status = text(form, "status");
    if (status !== "active" && status !== "suspended") throw new AdminInputError("Choose suspend or reactivate.");
    must(await db.rpc("admin_set_account_status", { p_actor: staff.user.id, p_user: userId(form), p_status: status, p_reason: optional(form, "reason", 500) }));
    return status === "suspended" ? "Member suspended. They can sign in but can't publish listings." : "Member reactivated.";
  });
}

/** A ban needs the username typed exactly, as the confirmation step. */
export async function confirmBan(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/users", async (staff, db) => {
    const id = userId(form);
    const { data: profile } = await db.from("profiles").select("username").eq("id", id).single();
    if (!profile || text(form, "confirmUsername").toLowerCase() !== String(profile.username).toLowerCase()) {
      throw new AdminInputError("Type the member's username exactly to confirm the ban.");
    }
    const reason = optional(form, "reason", 500);
    if (!reason || reason.length < 5) throw new AdminInputError("Give a reason for the ban (at least 5 characters).");
    must(await db.rpc("admin_set_account_status", { p_actor: staff.user.id, p_user: id, p_status: "banned", p_reason: reason }));
    return { notice: "Member banned.", to: `/admin/users/${id}` };
  });
}

/** Grant or revoke a staff role (admins only). */
export async function setRole(form: FormData) {
  return runAdminAction(["admin"], form, "/admin/users", async (staff, db) => {
    const role = text(form, "role");
    if (!["admin", "moderator", "support"].includes(role)) throw new AdminInputError("Unknown role.");
    const grant = text(form, "grant") === "true";
    must(await db.rpc("admin_set_role", { p_actor: staff.user.id, p_user: userId(form), p_role: role, p_grant: grant }));
    return grant ? `Granted the ${role} role.` : `Removed the ${role} role.`;
  });
}
