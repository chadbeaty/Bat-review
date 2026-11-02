"use server";

import { AdminInputError, must, runAdminAction } from "@/lib/admin/action";
import { text, uuid } from "@/lib/admin/validation";
import * as trustTemplates from "@/lib/email/trust-templates";
import { notify } from "@/lib/trust/notify";
import { DISPUTE_STATUS_LABELS } from "@/lib/trust/disputes";

function disputeId(form: FormData) {
  const id = text(form, "disputeId");
  if (!uuid.safeParse(id).success) throw new AdminInputError("Unknown case.");
  return id;
}

type Parties = { buyer_id: string; seller_id: string; order_number: string };

async function tellParties(p: Parties, id: string, title: string, summary: string) {
  for (const userId of [p.buyer_id, p.seller_id]) {
    await notify({
      userId,
      type: "dispute_updated",
      title,
      message: summary.slice(0, 200),
      link: `/disputes/${id}`,
      entityId: id,
      email: (name) => trustTemplates.disputeUpdated({ name, orderNumber: p.order_number, summary, disputePath: `/disputes/${id}` }),
    });
  }
}

/** Changes a case's status, notes and resolution. Closing a case needs a resolution. Nothing is refunded automatically. */
export async function updateDispute(form: FormData) {
  const id = disputeId(form);
  return runAdminAction(["support"], form, `/admin/disputes/${id}`, async (staff, db) => {
    const status = text(form, "status");
    const resolution = text(form, "resolution", 3000);
    const notes = text(form, "adminNotes", 3000);
    const parties = must(
      await db.rpc("admin_update_dispute", { p_actor: staff.user.id, p_dispute: id, p_status: status, p_admin_notes: notes || null, p_resolution: resolution || null })
    ) as Parties;
    const label = DISPUTE_STATUS_LABELS[status] ?? status;
    await tellParties(parties, id, `Your case on order ${parties.order_number} is now: ${label}`, resolution ? `${label}. ${resolution}` : `Status: ${label}.`);
    return `Case updated to “${label}”. Both members were notified.`;
  });
}

export async function addDisputeMessage(form: FormData) {
  const id = disputeId(form);
  return runAdminAction(["support"], form, `/admin/disputes/${id}`, async (staff, db) => {
    const body = text(form, "body", 4000);
    const parties = must(await db.rpc("admin_add_dispute_message", { p_actor: staff.user.id, p_dispute: id, p_body: body })) as Parties;
    await tellParties(parties, id, `Support replied on the case for order ${parties.order_number}`, body.slice(0, 200));
    return "Message sent to both members.";
  });
}
