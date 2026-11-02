// Buying the shipping label. The label is bought on the platform's shipping account and paid from the shipping
// money the buyer paid; the seller is never charged. Only one outbound label can exist per order (a unique
// index), so a double click or a retry can't buy a second one.

import * as templates from "@/lib/email/templates";
import { PaymentsError, emailMember, must, purchasePath, saleOrderPath, type Deps } from "@/lib/payments/deps";
import { canBuyLabel } from "@/lib/payments/state";
import { toProviderAddress } from "./address";
import { parcelFromListing } from "./package";
import { matchLabelRate } from "./rates";
import type { Address, Rate } from "./types";

type LabelDeps = Pick<Deps, "db" | "shipping" | "mail">;

export type LabelResult = {
  shipmentId: string;
  trackingNumber: string;
  labelUrl: string;
  costCents: number;
  buyerPaidCents: number;
  isTest: boolean;
};

/** A pending claim older than this, or one that failed, can be retried. */
const STALE_CLAIM_MS = 5 * 60 * 1000;

export async function buyLabel(deps: LabelDeps, input: { sellerId: string; orderId: string; from: Address }): Promise<LabelResult> {
  const { db, shipping } = deps;
  const order = must(
    await db
      .from("orders")
      .select("id, order_number, buyer_id, seller_id, order_status, shipping_cost_cents, shipping_address_id, shipping_rate_snapshot, order_items(listing_id)")
      .eq("id", input.orderId)
      .eq("seller_id", input.sellerId)
      .maybeSingle()
  );
  if (!order) throw new PaymentsError("Order not found", "not_found");
  if (!canBuyLabel(order.order_status)) {
    throw new PaymentsError("A label can only be bought for a paid order that hasn't shipped.", "bad_status");
  }
  const address = must(await db.from("addresses").select("*").eq("id", order.shipping_address_id).maybeSingle());
  if (!address) throw new PaymentsError("The order has no ship-to address", "no_address");
  const listingId = (order.order_items as { listing_id: string }[])[0]?.listing_id;
  const listing = must(
    await db
      .from("equipment_listings")
      .select("shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches")
      .eq("id", listingId)
      .maybeSingle()
  );
  const parcel = listing ? parcelFromListing(listing) : null;
  if (!parcel || !parcel.ok) throw new PaymentsError("The listing has no package size and weight.", "no_package");

  // Claim the order's one label slot before spending any money.
  const shipmentId = await claimShipment(deps, order, parcel.parcel);
  try {
    const paid = (order.shipping_rate_snapshot ?? {}) as Partial<Rate>;
    const quote = await shipping.getRates(
      { zip: input.from.zip, city: input.from.city, state: input.from.state, country: "US" },
      toProviderAddress(address),
      parcel.parcel
    );
    const rate = matchLabelRate(quote.rates, { carrier: paid.carrier ?? "", serviceToken: paid.serviceToken ?? "" });
    if (!rate) throw new PaymentsError("No carrier can take this package right now. Contact support.", "no_rate");
    const label = await shipping.buyLabel({ rate, from: input.from, to: toProviderAddress(address), parcel: parcel.parcel, metadata: `Order ${order.order_number}` });
    const now = new Date().toISOString();
    must(
      await db
        .from("shipping_shipments")
        .update({
          shipping_provider: shipping.name,
          provider_transaction_id: label.providerTransactionId,
          provider_shipment_id: label.providerShipmentId ?? quote.providerShipmentId,
          carrier: label.carrier,
          service_level: label.service,
          tracking_number: label.trackingNumber,
          tracking_url: label.trackingUrl,
          label_url: label.labelUrl,
          shipping_cost_cents: label.costCents,
          shipment_status: "label_purchased",
          purchased_at: now,
          label_error: null,
          rate_snapshot: { ...rate, buyer_paid_cents: order.shipping_cost_cents },
        })
        .eq("id", shipmentId)
    );
    await db.from("orders").update({ order_status: "processing" }).eq("id", order.id).eq("order_status", "paid");
    if (shipping.registerTracking) {
      await shipping.registerTracking(label.carrier, label.trackingNumber, `order:${order.id}`).catch(() => undefined);
    }
    await emailMember(deps, order.seller_id, (m) =>
      templates.shippingLabelAvailable({ name: m.name, orderNumber: order.order_number, carrier: label.carrier, service: label.service, orderPath: saleOrderPath(order.id) })
    );
    await emailMember(deps, order.buyer_id, (m) =>
      templates.trackingUpdate({
        name: m.name,
        orderNumber: order.order_number,
        status: "Label created",
        detail: `The seller created a ${label.carrier} ${label.service} label. Tracking number: ${label.trackingNumber}.`,
        trackingUrl: label.trackingUrl,
        orderPath: purchasePath(order.id),
      })
    );
    await db.from("notifications").insert({
      user_id: order.buyer_id,
      notification_type: "label_created",
      title: "Shipping label created",
      message: `Order ${order.order_number}: ${label.carrier} tracking ${label.trackingNumber}`,
      related_entity_id: order.id,
      link_path: purchasePath(order.id),
    });
    return {
      shipmentId,
      trackingNumber: label.trackingNumber,
      labelUrl: label.labelUrl,
      costCents: label.costCents,
      buyerPaidCents: order.shipping_cost_cents,
      isTest: shipping.isTest,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from("shipping_shipments").update({ label_error: message.slice(0, 500) }).eq("id", shipmentId).eq("shipment_status", "pending");
    throw err instanceof PaymentsError ? err : new PaymentsError(`The label couldn't be bought: ${message}`, "label_failed");
  }
}

async function claimShipment(
  deps: LabelDeps,
  order: { id: string; seller_id: string; buyer_id: string },
  parcel: { weightOz: number; lengthIn: number; widthIn: number; heightIn: number }
): Promise<string> {
  const { db, shipping } = deps;
  const { data, error } = await db
    .from("shipping_shipments")
    .insert({
      order_id: order.id,
      seller_id: order.seller_id,
      buyer_id: order.buyer_id,
      shipping_provider: shipping.name,
      shipment_status: "pending",
      is_test: shipping.isTest,
      package_weight_oz: parcel.weightOz,
      package_dimensions: { length_in: parcel.lengthIn, width_in: parcel.widthIn, height_in: parcel.heightIn },
    })
    .select("id")
    .single();
  if (!error && data) return data.id;
  if (error?.code !== "23505") throw new PaymentsError(error?.message ?? "Could not start the label", "claim_failed");

  const { data: existing } = await db
    .from("shipping_shipments")
    .select("id, shipment_status, label_error, updated_at")
    .eq("order_id", order.id)
    .eq("is_return", false)
    .neq("shipment_status", "cancelled")
    .maybeSingle();
  if (existing && existing.shipment_status === "pending" && (existing.label_error || Date.now() - new Date(existing.updated_at).getTime() > STALE_CLAIM_MS)) {
    // A previous attempt failed before any label was issued: take it over.
    const { data: retaken } = await db
      .from("shipping_shipments")
      .update({ label_error: null })
      .eq("id", existing.id)
      .eq("shipment_status", "pending")
      .eq("updated_at", existing.updated_at)
      .select("id");
    if (retaken && retaken.length) return existing.id;
  }
  throw new PaymentsError("A label has already been bought for this order.", "label_exists");
}
