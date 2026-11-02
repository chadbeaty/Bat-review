"use server";

import { AdminInputError, must, runAdminAction } from "@/lib/admin/action";
import { text, uuid } from "@/lib/admin/validation";

function listingId(form: FormData) {
  const id = text(form, "listingId");
  if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown listing.");
  return id;
}

/** Removes a listing (after the confirmation step). The seller gets a notification with the reason. */
export async function removeListing(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/listings", async (staff, db) => {
    const reason = text(form, "reason", 1000);
    if (reason.length < 5) throw new AdminInputError("Give the seller a reason (at least 5 characters).");
    must(await db.rpc("admin_remove_listing", { p_actor: staff.user.id, p_listing: listingId(form), p_reason: reason }));
    return "Listing removed. The seller has been notified.";
  });
}

/** Features a listing until a date, or stops featuring it. */
export async function setFeatured(form: FormData) {
  return runAdminAction(["moderator"], form, "/admin/listings", async (staff, db) => {
    const until = text(form, "until");
    let untilIso: string | null = null;
    if (until) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new AdminInputError("Choose an end date.");
      untilIso = new Date(`${until}T23:59:59Z`).toISOString();
    }
    must(await db.rpc("admin_set_featured", { p_actor: staff.user.id, p_listing: listingId(form), p_until: untilIso }));
    return untilIso ? `Featured until ${until}.` : "No longer featured.";
  });
}
