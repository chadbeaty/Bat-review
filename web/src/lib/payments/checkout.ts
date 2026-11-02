// Checkout: shipping quotes, creating the order (which holds the listing) and the Stripe Checkout Session, and
// releasing holds when a checkout expires or is cancelled.
//
// The order becomes paid only from a verified Stripe webhook (./webhooks.ts), never from the browser redirect.

import type Stripe from "stripe";
import { parcelFromListing } from "@/lib/shipping/package";
import { sortRates } from "@/lib/shipping/rates";
import { toProviderAddress } from "@/lib/shipping/address";
import type { Rate } from "@/lib/shipping/types";
import { PaymentsError, must, type Db, type Deps } from "./deps";
import { quoteTax, taxProviderFromEnv, type TaxQuote } from "./tax";
import { markOrderPaid } from "./webhooks";

/** Minutes the listing is held for a buyer who is paying. Stripe's session expires first (30 min + 1). */
export const HOLD_MINUTES = 35;
export const SESSION_MINUTES = 31;

export type QuoteRow = {
  id: string;
  buyer_id: string;
  listing_id: string;
  address_id: string;
  provider: string;
  is_test: boolean;
  package: Record<string, number>;
  rates: Rate[];
  expires_at: string;
};

type ListingForCheckout = {
  id: string;
  seller_id: string;
  title: string;
  asking_price_cents: number | null;
  listing_status: string;
  shipping_weight_oz: number | null;
  package_length_inches: number | null;
  package_width_inches: number | null;
  package_height_inches: number | null;
  shipping_origin_postal_code: string | null;
  location_city: string | null;
  location_state: string | null;
};

async function loadListing(db: Db, listingId: string): Promise<ListingForCheckout> {
  const l = must(
    await db
      .from("equipment_listings")
      .select(
        "id, seller_id, title, asking_price_cents, listing_status, shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches, shipping_origin_postal_code, location_city, location_state"
      )
      .eq("id", listingId)
      .maybeSingle<ListingForCheckout>()
  );
  if (!l) throw new PaymentsError("Listing not found", "not_found");
  return l;
}

/** Fetches live rates for the listing's package to the buyer's address and stores them as a quote. */
export async function createShippingQuote(deps: Pick<Deps, "db" | "shipping">, input: { buyerId: string; listingId: string; addressId: string }): Promise<QuoteRow> {
  const { db, shipping } = deps;
  const listing = await loadListing(db, input.listingId);
  if (listing.seller_id === input.buyerId) throw new PaymentsError("You can't buy your own listing", "own_listing");
  if (listing.listing_status !== "active") throw new PaymentsError("This listing isn't for sale right now", "inactive");
  const parcel = parcelFromListing(listing);
  if (!parcel.ok) throw new PaymentsError(parcel.error, "no_package");
  if (!listing.shipping_origin_postal_code) throw new PaymentsError("The seller hasn't set a ship-from ZIP code", "no_origin");

  const address = must(
    await db.from("addresses").select("*").eq("id", input.addressId).eq("user_id", input.buyerId).eq("address_type", "shipping").maybeSingle()
  );
  if (!address) throw new PaymentsError("Choose a shipping address", "no_address");

  const quote = await shipping.getRates(
    { zip: listing.shipping_origin_postal_code, city: listing.location_city, state: listing.location_state, country: "US" },
    toProviderAddress(address),
    parcel.parcel
  );
  const rates = sortRates(quote.rates);
  const row = must(
    await db
      .from("shipping_quotes")
      .insert({
        buyer_id: input.buyerId,
        listing_id: listing.id,
        address_id: address.id,
        provider: shipping.name,
        is_test: shipping.isTest,
        package: parcel.parcel,
        rates,
      })
      .select("*")
      .single<QuoteRow>()
  );
  if (!row) throw new PaymentsError("The shipping quote couldn't be saved", "quote_failed");
  return row;
}

export type CheckoutStart = { orderId: string; url: string };

/**
 * Creates the order (holding the listing) and its Stripe Checkout Session. If Stripe fails, the hold is
 * released straight away so the listing doesn't stay blocked.
 */
export async function startCheckout(
  deps: Deps,
  input: { buyer: { id: string; email: string | null }; listingId: string; addressId: string; quoteId: string; rateId: string; taxEnabled: boolean }
): Promise<CheckoutStart> {
  const { db, stripe } = deps;
  const listing = await loadListing(db, input.listingId);
  const quote: QuoteRow | null = must(await db.from("shipping_quotes").select("*").eq("id", input.quoteId).eq("buyer_id", input.buyer.id).maybeSingle<QuoteRow>());
  if (!quote) throw new PaymentsError("Those shipping rates have expired. Get new rates and try again.", "quote_expired");
  const rate = quote.rates.find((r) => r.id === input.rateId);
  const address = must(await db.from("addresses").select("*").eq("id", input.addressId).eq("user_id", input.buyer.id).maybeSingle());
  if (!address) throw new PaymentsError("Choose a shipping address", "no_address");

  const tax: TaxQuote = await quoteTax(
    input.taxEnabled,
    {
      itemCents: listing.asking_price_cents ?? 0,
      shippingCents: rate?.amountCents ?? 0,
      shipTo: { state: address.state, postalCode: address.postal_code, city: address.city, line1: address.street_address, country: "US" },
      shipFromPostalCode: listing.shipping_origin_postal_code,
    },
    taxProviderFromEnv()
  );

  const { data: order, error } = await db
    .rpc("checkout_create_order", {
      p_buyer: input.buyer.id,
      p_listing: input.listingId,
      p_address: input.addressId,
      p_quote: input.quoteId,
      p_rate_id: input.rateId,
      p_tax_cents: tax.amountCents,
      p_tax_jurisdiction: tax.jurisdiction ? { ...tax.jurisdiction, label: tax.label } : { collected: false, label: tax.label },
      p_hold_minutes: HOLD_MINUTES,
    })
    .single<{ id: string; order_number: string; subtotal_cents: number; shipping_cost_cents: number; tax_amount_cents: number; total_amount_cents: number; shipping_rate_snapshot: Rate }>();
  if (error || !order) throw new PaymentsError(error?.message ?? "The order couldn't be created", error?.code ?? "create_failed");

  try {
    const session = await createCheckoutSession(stripe, deps.siteUrl, {
      orderId: order.id,
      orderNumber: order.order_number,
      listingId: listing.id,
      title: listing.title,
      itemCents: order.subtotal_cents,
      shippingCents: order.shipping_cost_cents,
      shippingLabel: `${order.shipping_rate_snapshot.carrier} ${order.shipping_rate_snapshot.service}`,
      taxCents: order.tax_amount_cents,
      totalCents: order.total_amount_cents,
      buyerEmail: input.buyer.email,
    });
    if (!session.url) throw new PaymentsError("Stripe didn't return a checkout link", "no_url");
    must(
      await db
        .from("orders")
        .update({ stripe_checkout_session_id: session.id, stripe_checkout_url: session.url })
        .eq("id", order.id)
    );
    return { orderId: order.id, url: session.url };
  } catch (err) {
    await db.rpc("checkout_release_order", { p_order: order.id, p_reason: "Payment page could not be created" });
    throw err instanceof PaymentsError ? err : new PaymentsError("The payment page couldn't be opened. Nothing was charged; please try again.", "stripe_error");
  }
}

export type SessionInput = {
  orderId: string;
  orderNumber: string;
  listingId: string;
  title: string;
  itemCents: number;
  shippingCents: number;
  shippingLabel: string;
  taxCents: number;
  totalCents: number;
  buyerEmail: string | null;
};

/** Builds the hosted Checkout Session parameters: cards and wallets, funds kept on the platform until completion. */
export function checkoutSessionParams(
  siteUrl: string,
  s: SessionInput,
  nowMs = Date.now(),
  paymentMethodConfiguration = process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION || null
): Stripe.Checkout.SessionCreateParams {
  if (s.itemCents + s.shippingCents + s.taxCents !== s.totalCents) throw new PaymentsError("Order totals don't add up", "bad_totals");
  const base = siteUrl.replace(/\/$/, "");
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { quantity: 1, price_data: { currency: "usd", unit_amount: s.itemCents, product_data: { name: s.title.slice(0, 250), metadata: { listing_id: s.listingId } } } },
  ];
  if (s.taxCents > 0) {
    lineItems.push({ quantity: 1, price_data: { currency: "usd", unit_amount: s.taxCents, product_data: { name: "Sales tax" } } });
  }
  return {
    mode: "payment",
    // Cards and wallets (Apple Pay, Google Pay). This Stripe API version picks payment methods from the
    // Dashboard's payment method settings; turn on only Cards, Apple Pay and Google Pay there, or set
    // STRIPE_PAYMENT_METHOD_CONFIGURATION to a configuration that does. Delayed methods would still be handled
    // (checkout.session.async_payment_succeeded), but aren't wanted at launch.
    ...(paymentMethodConfiguration ? { payment_method_configuration: paymentMethodConfiguration } : {}),
    client_reference_id: s.orderId,
    ...(s.buyerEmail ? { customer_email: s.buyerEmail } : {}),
    line_items: lineItems,
    shipping_options: [
      { shipping_rate_data: { type: "fixed_amount", display_name: s.shippingLabel.slice(0, 100), fixed_amount: { amount: s.shippingCents, currency: "usd" } } },
    ],
    payment_intent_data: {
      // Separate charges and transfers: the charge stays on the platform; the seller's transfer is created at completion.
      transfer_group: s.orderId,
      description: `Order ${s.orderNumber}`,
      metadata: { order_id: s.orderId, order_number: s.orderNumber },
    },
    metadata: { order_id: s.orderId, order_number: s.orderNumber },
    expires_at: Math.floor(nowMs / 1000) + SESSION_MINUTES * 60,
    success_url: `${base}/account/purchases/${s.orderId}?checkout=success`,
    cancel_url: `${base}/checkout/${s.listingId}?cancelled=${s.orderId}`,
  };
}

export async function createCheckoutSession(stripe: Stripe, siteUrl: string, s: SessionInput): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create(checkoutSessionParams(siteUrl, s), { idempotencyKey: `checkout-session-${s.orderId}` });
}

type OpenOrder = { id: string; stripe_checkout_session_id: string | null; checkout_expires_at: string | null; created_at: string };

/**
 * Ends an unpaid checkout: expires the Stripe session first (so it can't be paid afterwards), then releases the
 * hold. If Stripe says the session was already paid, the payment is recorded instead (a missed webhook).
 * Returns what happened.
 */
export async function closeUnpaidCheckout(deps: Deps, order: OpenOrder, reason: string): Promise<"released" | "paid" | "kept"> {
  const { db, stripe } = deps;
  if (order.stripe_checkout_session_id) {
    let session: Stripe.Checkout.Session | null = null;
    let expired = false;
    try {
      // Stripe refuses to expire a session that was already completed, so success means it can't be paid now.
      await stripe.checkout.sessions.expire(order.stripe_checkout_session_id);
      expired = true;
    } catch {
      try {
        session = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id);
      } catch {
        return "kept"; // Stripe unreachable: keep the hold and try again on the next sweep.
      }
    }
    if (!expired && session && session.status === "complete" && session.payment_status === "paid") {
      await markOrderPaid(deps, order.id, {
        session: session.id,
        paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
        amountCents: session.amount_total ?? null,
      });
      return "paid";
    }
    if (!expired && session?.status !== "expired") return "kept";
  }
  const { data } = await db.rpc("checkout_release_order", { p_order: order.id, p_reason: reason });
  return data ? "released" : "kept";
}

/** Releases holds whose checkout time has run out. Safe to run repeatedly. */
export async function releaseExpiredHolds(deps: Deps, now = new Date()): Promise<{ released: number; paid: number; kept: number }> {
  const { data } = await deps.db
    .from("orders")
    .select("id, stripe_checkout_session_id, checkout_expires_at, created_at")
    .eq("order_status", "awaiting_payment")
    .lt("checkout_expires_at", now.toISOString())
    .limit(100);
  const counts = { released: 0, paid: 0, kept: 0 };
  for (const o of (data ?? []) as OpenOrder[]) {
    const result = await closeUnpaidCheckout(deps, o, "Checkout expired");
    counts[result] += 1;
  }
  return counts;
}
