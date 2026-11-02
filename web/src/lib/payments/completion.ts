// Completion: after delivery plus the inspection window (or the buyer confirming receipt), with no open
// dispute, the seller is paid by a Stripe Transfer from the order's charge (source_transaction), the listing is
// marked sold and the sale is added to the price history. Safe to run again: the transfer uses an idempotency
// key per order, an existing transfer id is reused, and the database step only completes an order once.

import * as templates from "@/lib/email/templates";
import { releaseExpiredHolds } from "./checkout";
import { PaymentsError, emailMember, must, purchasePath, saleOrderPath, type Deps } from "./deps";
import { transferAmountCents } from "./money";

type OrderForTransfer = {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  order_status: string;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  seller_payout_cents: number | null;
  refunded_amount_cents: number;
  total_amount_cents: number;
};

export type CompletionResult = { orderId: string; outcome: string; transferId?: string | null; error?: string };

export async function completeOrder(deps: Deps, orderId: string): Promise<CompletionResult> {
  const { db, stripe } = deps;
  const o = must(
    await db
      .from("orders")
      .select(
        "id, order_number, buyer_id, seller_id, order_status, stripe_charge_id, stripe_payment_intent_id, stripe_transfer_id, seller_payout_cents, refunded_amount_cents, total_amount_cents"
      )
      .eq("id", orderId)
      .maybeSingle<OrderForTransfer>()
  );
  if (!o) throw new PaymentsError("Order not found", "not_found");
  if (o.order_status === "completed") return { orderId, outcome: "already_completed", transferId: o.stripe_transfer_id };

  // Only orders the database says are ready (delivered + window passed, or buyer confirmed; no open dispute).
  const ready = must(await db.rpc("orders_ready_to_complete", { p_limit: 1, p_order: o.id })) as { id: string }[];
  if (!o.stripe_transfer_id && ready.length === 0) return { orderId, outcome: "not_ready" };

  let transferId = o.stripe_transfer_id;
  const amount = transferAmountCents(o);
  try {
    if (!transferId && amount > 0) {
      const account = must(
        await db.from("seller_payment_accounts").select("stripe_connected_account_id, payouts_enabled").eq("seller_id", o.seller_id).maybeSingle()
      );
      if (!account) throw new PaymentsError("The seller has no Stripe account to pay into", "no_account");
      let chargeId = o.stripe_charge_id;
      if (!chargeId && o.stripe_payment_intent_id) {
        const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id);
        chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : (pi.latest_charge?.id ?? null);
        if (chargeId) await db.from("orders").update({ stripe_charge_id: chargeId }).eq("id", o.id);
      }
      if (!chargeId) throw new PaymentsError("The order has no charge to pay the seller from", "no_charge");
      await db.from("orders").update({ transfer_attempted_at: new Date().toISOString() }).eq("id", o.id);
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: "usd",
          destination: account.stripe_connected_account_id,
          // Never runs ahead of the buyer's funds: the transfer waits for the charge to settle.
          source_transaction: chargeId,
          transfer_group: o.id,
          description: `Order ${o.order_number}`,
          metadata: { order_id: o.id, order_number: o.order_number },
        },
        { idempotencyKey: `order-transfer-${o.id}` }
      );
      transferId = transfer.id;
    }
    const outcome = must(await db.rpc("payments_complete_order", { p_order: o.id, p_transfer_id: transferId, p_transfer_cents: amount })) as string;
    if (outcome === "completed") await sendCompletionEmails(deps, o);
    return { orderId, outcome, transferId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("orders").update({ transfer_error: message.slice(0, 500) }).eq("id", o.id);
    return { orderId, outcome: "error", transferId, error: message };
  }
}

async function sendCompletionEmails(deps: Deps, o: OrderForTransfer) {
  const [{ data: buyer }, { data: seller }] = await Promise.all([
    deps.db.from("profiles").select("username").eq("id", o.buyer_id).maybeSingle(),
    deps.db.from("profiles").select("username").eq("id", o.seller_id).maybeSingle(),
  ]);
  await emailMember(deps, o.buyer_id, (m) =>
    templates.reviewRequest({ name: m.name, orderNumber: o.order_number, otherUsername: seller?.username ?? "seller", role: "buyer", reviewPath: purchasePath(o.id) })
  );
  await emailMember(deps, o.seller_id, (m) =>
    templates.reviewRequest({ name: m.name, orderNumber: o.order_number, otherUsername: buyer?.username ?? "buyer", role: "seller", reviewPath: saleOrderPath(o.id) })
  );
}

export type CronSummary = { holds: { released: number; paid: number; kept: number }; completed: CompletionResult[] };

/** The scheduled job: release expired checkout holds, then complete every order that is ready. */
export async function runOrdersCron(deps: Deps): Promise<CronSummary> {
  const holds = await releaseExpiredHolds(deps);
  const ready = must(await deps.db.rpc("orders_ready_to_complete", { p_limit: 50 })) as { id: string }[];
  const completed: CompletionResult[] = [];
  for (const r of ready) completed.push(await completeOrder(deps, r.id));
  return { holds, completed };
}
