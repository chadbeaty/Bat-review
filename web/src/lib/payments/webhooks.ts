// Stripe webhooks: the only way an order becomes paid. Every event is signature-checked against the raw body,
// recorded once in webhook_events (unique provider + event id), and handled by idempotent database functions,
// so a repeated or replayed delivery changes nothing.

import type Stripe from "stripe";
import * as templates from "@/lib/email/templates";
import * as trustTemplates from "@/lib/email/trust-templates";
import { accountStatusFromStripe } from "./connect";
import { emailMember, must, notify, purchasePath, saleOrderPath, shortDate, type Db, type Deps } from "./deps";

export type WebhookResult = { status: number; body: { received: boolean; duplicate?: boolean; outcome?: string; error?: string } };

/** Verifies the signature with each configured secret (platform and Connect endpoints). Null if none match. */
export function verifyStripeEvent(stripe: Stripe, rawBody: string, signature: string | null, secrets: string[]): Stripe.Event | null {
  if (!signature || secrets.length === 0) return null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      // try the next secret
    }
  }
  return null;
}

export async function processStripeWebhook(deps: Deps, rawBody: string, signature: string | null, secrets: string[]): Promise<WebhookResult> {
  if (secrets.length === 0) return { status: 503, body: { received: false, error: "Webhook secret not configured" } };
  const event = verifyStripeEvent(deps.stripe, rawBody, signature, secrets);
  if (!event) return { status: 400, body: { received: false, error: "Invalid signature" } };

  const { db } = deps;
  const { data: inserted, error } = await db
    .from("webhook_events")
    .upsert(
      { provider: "stripe", event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown> },
      { onConflict: "provider,event_id", ignoreDuplicates: true }
    )
    .select("id");
  if (error) return { status: 500, body: { received: false, error: "Could not record the event" } };
  if (!inserted || inserted.length === 0) {
    const { data: existing } = await db.from("webhook_events").select("status").eq("provider", "stripe").eq("event_id", event.id).maybeSingle();
    if (existing && (existing.status === "processed" || existing.status === "ignored")) {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    // A previous attempt failed or is still running: handle it again (every handler is idempotent).
  }

  try {
    const outcome = await handleStripeEvent(deps, event);
    await db
      .from("webhook_events")
      .update({ status: outcome === "ignored" ? "ignored" : "processed", processed_at: new Date().toISOString(), error: null })
      .eq("provider", "stripe")
      .eq("event_id", event.id);
    return { status: 200, body: { received: true, outcome } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("webhook_events").update({ status: "failed", error: message.slice(0, 1000) }).eq("provider", "stripe").eq("event_id", event.id);
    // 500 makes Stripe retry later.
    return { status: 500, body: { received: false, error: "Processing failed" } };
  }
}

const idOf = (v: string | { id: string } | null | undefined): string | null => (typeof v === "string" ? v : (v?.id ?? null));

type OrderRef = { id: string; order_number: string; buyer_id: string; seller_id: string; total_amount_cents: number; stripe_transfer_id: string | null };

async function findOrder(db: Db, ref: { orderId?: string | null; paymentIntent?: string | null; charge?: string | null; transferGroup?: string | null }): Promise<OrderRef | null> {
  const cols = "id, order_number, buyer_id, seller_id, total_amount_cents, stripe_transfer_id";
  const uuid = /^[0-9a-f-]{36}$/i;
  for (const id of [ref.orderId, ref.transferGroup]) {
    if (id && uuid.test(id)) {
      const { data } = await db.from("orders").select(cols).eq("id", id).maybeSingle<OrderRef>();
      if (data) return data;
    }
  }
  if (ref.paymentIntent) {
    const { data } = await db.from("orders").select(cols).eq("stripe_payment_intent_id", ref.paymentIntent).maybeSingle<OrderRef>();
    if (data) return data;
  }
  if (ref.charge) {
    const { data } = await db.from("orders").select(cols).eq("stripe_charge_id", ref.charge).maybeSingle<OrderRef>();
    if (data) return data;
  }
  return null;
}

export async function handleStripeEvent(deps: Deps, event: Stripe.Event): Promise<string> {
  const { db } = deps;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid") return "ignored";
      const orderId = s.metadata?.order_id ?? s.client_reference_id;
      if (!orderId) return "ignored";
      return markOrderPaid(deps, orderId, { session: s.id, paymentIntent: idOf(s.payment_intent), amountCents: s.amount_total ?? null });
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const order = await findOrder(db, { orderId: pi.metadata?.order_id, paymentIntent: pi.id });
      if (!order) return "ignored";
      return markOrderPaid(deps, order.id, { paymentIntent: pi.id, charge: idOf(pi.latest_charge), amountCents: pi.amount_received });
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const order = await findOrder(db, { orderId: pi.metadata?.order_id, paymentIntent: pi.id });
      if (!order) return "ignored";
      const message = pi.last_payment_error?.message ?? "The payment didn't go through.";
      await db.from("orders").update({ payment_issue: message.slice(0, 300) }).eq("id", order.id).eq("order_status", "awaiting_payment");
      await notify(db, order.buyer_id, "payment_failed", "Your payment didn't go through", `Order ${order.order_number}: ${message}`, order.id, purchasePath(order.id));
      return "payment_failed";
    }
    case "checkout.session.expired": {
      const s = event.data.object;
      const orderId = s.metadata?.order_id ?? s.client_reference_id;
      if (!orderId) return "ignored";
      const { data } = await db.rpc("checkout_release_order", { p_order: orderId, p_reason: "Checkout expired" });
      return data ? "released" : "already_closed";
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const order = await findOrder(db, { orderId: charge.metadata?.order_id, paymentIntent: idOf(charge.payment_intent), charge: charge.id });
      if (!order) return "ignored";
      const { data: before } = await db.from("orders").select("refunded_amount_cents").eq("id", order.id).single();
      const outcome = must(await db.rpc("payments_apply_refund_total", { p_order: order.id, p_refunded_total: charge.amount_refunded })) as string;
      // Refunds issued from the Stripe dashboard (not through our admin screen) still get an email.
      const { data: recorded } = await db.from("payment_refunds").select("amount_cents").eq("order_id", order.id);
      const recordedTotal = (recorded ?? []).reduce((s, r) => s + r.amount_cents, 0);
      const increase = charge.amount_refunded - Math.max(before?.refunded_amount_cents ?? 0, recordedTotal);
      if (increase > 0) {
        await emailMember(deps, order.buyer_id, (m) =>
          templates.refundNotification({ name: m.name, orderNumber: order.order_number, amountCents: increase, reason: "Refund issued by support", orderPath: purchasePath(order.id) })
        );
      }
      return outcome;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      const d = event.data.object;
      const order = await findOrder(db, { paymentIntent: idOf(d.payment_intent), charge: idOf(d.charge) });
      if (!order) return "ignored";
      const { data: before } = await db.from("orders").select("order_status").eq("id", order.id).single();
      const outcome = must(
        await db.rpc("payments_record_chargeback", { p_order: order.id, p_stripe_dispute: d.id, p_reason: d.reason, p_stripe_status: d.status })
      ) as string;
      // Tell the seller once, when the order first goes on hold (Stripe sends several dispute events).
      if (outcome === "under_review" && before && before.order_status !== "disputed") {
        await emailMember(deps, order.seller_id, (m) =>
          trustTemplates.disputeUpdated({
            name: m.name,
            orderNumber: order.order_number,
            summary: "The buyer's bank opened a payment dispute (chargeback) on this order. Payment to you is on hold while we respond with the delivery evidence.",
            disputePath: saleOrderPath(order.id),
          })
        );
      }
      return `dispute_${outcome}`;
    }
    case "account.updated": {
      const account = event.data.object;
      const status = accountStatusFromStripe(account);
      const { data } = await db.from("seller_payment_accounts").update(status).eq("stripe_connected_account_id", account.id).select("seller_id");
      return data && data.length ? `account_${status.onboarding_status}` : "ignored";
    }
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled":
    case "payout.created":
    case "payout.updated": {
      const payout = event.data.object;
      if (!event.account) return "ignored"; // platform payouts aren't seller payouts
      const { data: acct } = await db.from("seller_payment_accounts").select("seller_id").eq("stripe_connected_account_id", event.account).maybeSingle();
      if (!acct) return "ignored";
      must(
        await db.from("seller_payouts").upsert(
          {
            seller_id: acct.seller_id,
            stripe_account_id: event.account,
            stripe_payout_id: payout.id,
            amount_cents: payout.amount,
            currency: payout.currency,
            status: payout.status,
            arrival_date: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10) : null,
            failure_code: payout.failure_code ?? null,
            failure_message: payout.failure_message ?? null,
          },
          { onConflict: "stripe_payout_id" }
        )
      );
      const amount = (payout.amount / 100).toFixed(2);
      if (event.type === "payout.paid") {
        await notify(db, acct.seller_id, "payout_paid", "Payout sent to your bank", `$${amount} was paid out to your bank account.`, null, "/seller/payouts");
      } else if (event.type === "payout.failed") {
        await notify(
          db,
          acct.seller_id,
          "payout_failed",
          "A payout to your bank failed",
          `$${amount} couldn't be paid out${payout.failure_message ? `: ${payout.failure_message}` : ""}. Update your bank details in Stripe.`,
          null,
          "/seller/payouts"
        );
      }
      return event.type.replace(".", "_");
    }
    case "transfer.created":
    case "transfer.updated":
    case "transfer.reversed": {
      const t = event.data.object;
      const order = await findOrder(db, { orderId: t.metadata?.order_id, transferGroup: t.transfer_group });
      if (!order) return "ignored";
      if (!order.stripe_transfer_id) {
        await db.from("orders").update({ stripe_transfer_id: t.id, transfer_amount_cents: t.amount }).eq("id", order.id).is("stripe_transfer_id", null);
      }
      if (order.stripe_transfer_id === t.id || !order.stripe_transfer_id) {
        const { data: o } = await db.from("orders").select("transfer_reversed_cents").eq("id", order.id).single();
        if (o && t.amount_reversed > o.transfer_reversed_cents) {
          await db.from("orders").update({ transfer_reversed_cents: t.amount_reversed }).eq("id", order.id);
        }
      }
      return "transfer_recorded";
    }
    case "charge.updated":
    case "charge.succeeded": {
      const charge = event.data.object;
      const order = await findOrder(db, { orderId: charge.metadata?.order_id, paymentIntent: idOf(charge.payment_intent), charge: charge.id });
      if (!order) return "ignored";
      await recordProcessingFee(deps, order.id, charge);
      return "fee_checked";
    }
    default:
      return "ignored";
  }
}

/**
 * Records a payment for an order and, the first time, emails both parties. The database function decides:
 * a payment can only move an order forward once, must match the order total, and if it raced an expired hold
 * whose item has gone to someone else, it is refunded automatically.
 */
export async function markOrderPaid(
  deps: Deps,
  orderId: string,
  p: { session?: string | null; paymentIntent?: string | null; charge?: string | null; amountCents: number | null }
): Promise<string> {
  const { db, stripe } = deps;
  const outcome = must(
    await db.rpc("payments_mark_paid", {
      p_order: orderId,
      p_session: p.session ?? null,
      p_payment_intent: p.paymentIntent ?? null,
      p_charge: p.charge ?? null,
      p_amount_cents: p.amountCents,
    })
  ) as string;

  if (outcome === "paid" || outcome === "already_paid") {
    if (p.paymentIntent) await recordChargeAndFee(deps, orderId, p.paymentIntent);
  }
  if (outcome === "paid") await sendPaidEmails(deps, orderId);
  if (outcome === "needs_refund" && p.paymentIntent) {
    const refund = await stripe.refunds.create(
      { payment_intent: p.paymentIntent, reason: "requested_by_customer", metadata: { order_id: orderId, why: "item_no_longer_available" } },
      { idempotencyKey: `auto-refund-${orderId}` }
    );
    await db.rpc("payments_apply_refund_total", { p_order: orderId, p_refunded_total: refund.amount });
    const { data: o } = await db.from("orders").select("buyer_id, order_number").eq("id", orderId).single();
    if (o) {
      await notify(db, o.buyer_id, "refund_issued", "Your payment was refunded", `Order ${o.order_number}: the item was no longer available, so we refunded you in full.`, orderId, purchasePath(orderId));
      await emailMember(deps, o.buyer_id, (m) =>
        templates.refundNotification({ name: m.name, orderNumber: o.order_number, amountCents: refund.amount, reason: "The item was no longer available", orderPath: purchasePath(orderId) })
      );
    }
  }
  return outcome;
}

/** Stores the charge id and Stripe's actual processing fee (from the balance transaction) when available. */
async function recordChargeAndFee(deps: Deps, orderId: string, paymentIntentId: string) {
  try {
    const pi = await deps.stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge.balance_transaction"] });
    const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    if (charge) await recordProcessingFee(deps, orderId, charge);
    else if (typeof pi.latest_charge === "string") {
      await deps.db.from("orders").update({ stripe_charge_id: pi.latest_charge }).eq("id", orderId).is("stripe_charge_id", null);
    }
  } catch (err) {
    console.error("could not read the processing fee", err instanceof Error ? err.message : err);
  }
}

async function recordProcessingFee(deps: Deps, orderId: string, charge: Stripe.Charge) {
  const { db } = deps;
  await db.from("orders").update({ stripe_charge_id: charge.id }).eq("id", orderId).is("stripe_charge_id", null);
  let bt = charge.balance_transaction;
  if (typeof bt === "string") {
    try {
      bt = await deps.stripe.balanceTransactions.retrieve(bt);
    } catch {
      return;
    }
  }
  if (bt && typeof bt === "object" && Number.isInteger(bt.fee) && bt.fee >= 0) {
    await db.from("orders").update({ payment_processing_cents: bt.fee }).eq("id", orderId);
  }
}

async function sendPaidEmails(deps: Deps, orderId: string) {
  const { db } = deps;
  const { data: o } = await db
    .from("orders")
    .select("id, order_number, buyer_id, seller_id, subtotal_cents, shipping_cost_cents, tax_amount_cents, total_amount_cents, platform_fee_cents, order_items(product_title_snapshot)")
    .eq("id", orderId)
    .single();
  if (!o) return;
  const title = (o.order_items as { product_title_snapshot: string }[])[0]?.product_title_snapshot ?? "Your item";
  await emailMember(deps, o.buyer_id, (m) =>
    templates.purchaseConfirmation({
      name: m.name,
      orderNumber: o.order_number,
      title,
      itemCents: o.subtotal_cents,
      shippingCents: o.shipping_cost_cents,
      taxCents: o.tax_amount_cents,
      totalCents: o.total_amount_cents,
      orderPath: purchasePath(o.id),
    })
  );
  const shipBy = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  await emailMember(deps, o.seller_id, (m) =>
    templates.sellerOrderNotification({
      name: m.name,
      orderNumber: o.order_number,
      title,
      itemCents: o.subtotal_cents,
      commissionCents: o.platform_fee_cents,
      orderPath: saleOrderPath(o.id),
      shipBy: shortDate(shipBy),
    })
  );
}

