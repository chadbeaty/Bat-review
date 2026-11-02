// Staff refunds. Before the seller is paid, a refund only refunds the buyer. After the transfer, the platform's
// balance pays the refund; recovering it from the seller (reversing the transfer) is a separate, explicit
// choice that needs the order number typed to confirm and an admin role (decision 0001, point 5).

import * as templates from "@/lib/email/templates";
import { PaymentsError, emailMember, must, purchasePath, type Deps } from "./deps";

export type RefundRequest = {
  actorId: string;
  actorIsAdmin: boolean;
  orderId: string;
  amountCents: number;
  reason: string;
  reverseTransfer: boolean;
  /** The order number, typed by staff. Required once the seller has been paid. */
  confirmation: string;
  /** A random value from the form, so a double-submitted form can't refund twice. */
  nonce: string;
};

export type RefundResult = { refundId: string; reversalId: string | null; reversalCents: number; outcome: string };

type OrderForRefund = {
  id: string;
  order_number: string;
  buyer_id: string;
  order_status: string;
  total_amount_cents: number;
  refunded_amount_cents: number;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  transfer_amount_cents: number | null;
  transfer_reversed_cents: number;
};

export async function refundOrder(deps: Deps, r: RefundRequest): Promise<RefundResult> {
  const { db, stripe } = deps;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(r.nonce)) throw new PaymentsError("The form expired. Reload the page and try again.", "bad_nonce");
  const reason = r.reason.trim();
  if (reason.length < 3 || reason.length > 500) throw new PaymentsError("Give a reason for the refund (3 to 500 characters).", "bad_reason");
  const o = must(
    await db
      .from("orders")
      .select(
        "id, order_number, buyer_id, order_status, total_amount_cents, refunded_amount_cents, stripe_payment_intent_id, stripe_transfer_id, transfer_amount_cents, transfer_reversed_cents"
      )
      .eq("id", r.orderId)
      .maybeSingle<OrderForRefund>()
  );
  if (!o) throw new PaymentsError("Order not found", "not_found");
  if (!o.stripe_payment_intent_id) throw new PaymentsError("This order has no payment to refund.", "unpaid");
  const refundable = o.total_amount_cents - o.refunded_amount_cents;
  if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) throw new PaymentsError("Enter a refund amount above zero.", "bad_amount");
  if (r.amountCents > refundable) throw new PaymentsError(`At most $${(refundable / 100).toFixed(2)} can still be refunded.`, "too_much");

  const paidOut = Boolean(o.stripe_transfer_id);
  if (paidOut && r.confirmation.trim() !== o.order_number) {
    throw new PaymentsError(`The seller has already been paid. Type the order number (${o.order_number}) to confirm this refund.`, "confirm");
  }
  if (r.reverseTransfer && !paidOut) throw new PaymentsError("There is no transfer to reverse yet.", "no_transfer");
  if (r.reverseTransfer && !r.actorIsAdmin) throw new PaymentsError("Only an admin can reverse a seller transfer.", "not_admin");

  const refund = await stripe.refunds.create(
    {
      payment_intent: o.stripe_payment_intent_id,
      amount: r.amountCents,
      reason: "requested_by_customer",
      metadata: { order_id: o.id, order_number: o.order_number, staff_id: r.actorId },
    },
    { idempotencyKey: `refund-${o.id}-${r.nonce}` }
  );

  let reversalId: string | null = null;
  let reversalCents = 0;
  if (r.reverseTransfer && o.stripe_transfer_id) {
    const remaining = (o.transfer_amount_cents ?? 0) - o.transfer_reversed_cents;
    reversalCents = Math.min(r.amountCents, Math.max(0, remaining));
    if (reversalCents > 0) {
      const reversal = await stripe.transfers.createReversal(
        o.stripe_transfer_id,
        { amount: reversalCents, metadata: { order_id: o.id, refund_id: refund.id, staff_id: r.actorId } },
        { idempotencyKey: `reversal-${o.id}-${r.nonce}` }
      );
      reversalId = reversal.id;
    }
  }

  const outcome = must(
    await db.rpc("admin_record_refund", {
      p_actor: r.actorId,
      p_order: o.id,
      p_amount_cents: r.amountCents,
      p_reason: reason,
      p_refund_id: refund.id,
      p_reversal_id: reversalId,
      p_reversal_cents: reversalId ? reversalCents : null,
    })
  ) as string;

  if (outcome !== "already_recorded") {
    await emailMember(deps, o.buyer_id, (m) =>
      templates.refundNotification({ name: m.name, orderNumber: o.order_number, amountCents: r.amountCents, reason, orderPath: purchasePath(o.id) })
    );
  }
  return { refundId: refund.id, reversalId, reversalCents, outcome };
}
