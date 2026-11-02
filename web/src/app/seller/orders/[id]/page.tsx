import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readFlash } from "@/lib/admin/action";
import { isUuid } from "@/lib/listings";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { canBuyLabel } from "@/lib/payments/state";
import { formatAddressLines, US_STATES } from "@/lib/shipping/address";
import { TEST_DATA_NOTICE } from "@/lib/shipping/provider";
import { MoneyRows, StatusBadge, Timeline, TrackingEvents, when, type TrackingEventRow } from "@/components/orders/OrderParts";
import { buyLabelAction, saveReturnAddress } from "./actions";

export const metadata: Metadata = { title: "Order", robots: { index: false } };

export default async function SellerOrderPage({ params, searchParams }: PageProps<"/seller/orders/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=/seller/orders/${id}`);

  const { data: o } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_status, subtotal_cents, shipping_cost_cents, platform_fee_cents, seller_payout_cents, fee_snapshot, refunded_amount_cents, created_at, paid_at, shipped_at, delivered_at, completed_at, shipping_address_id, shipping_rate_snapshot, stripe_transfer_id, transfer_amount_cents, order_items(listing_id, product_title_snapshot)"
    )
    .eq("id", id)
    .eq("seller_id", auth.user.id)
    .maybeSingle();
  if (!o || o.order_status === "awaiting_payment" || o.order_status === "cancelled") notFound();

  const item = (o.order_items as { listing_id: string; product_title_snapshot: string }[])[0];
  const [{ data: shipTo }, { data: shipments }, { data: returnAddress }, { data: listing }] = await Promise.all([
    // RLS shows the ship-to address only once the order is paid.
    o.shipping_address_id
      ? supabase.from("addresses").select("full_name, street_address, apartment, city, state, postal_code, phone").eq("id", o.shipping_address_id).maybeSingle()
      : { data: null },
    supabase
      .from("shipping_shipments")
      .select("id, carrier, service_level, tracking_number, tracking_url, label_url, shipping_cost_cents, shipment_status, purchased_at, is_test, label_error, shipping_events(id, tracking_status, tracking_description, event_timestamp, location)")
      .eq("order_id", o.id)
      .eq("is_return", false)
      .neq("shipment_status", "cancelled"),
    supabase
      .from("addresses")
      .select("full_name, street_address, apartment, city, state, postal_code")
      .eq("user_id", auth.user.id)
      .eq("address_type", "return")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("equipment_listings").select("shipping_weight_oz, package_length_inches, package_width_inches, package_height_inches").eq("id", item.listing_id).maybeSingle(),
  ]);
  const shipment = (shipments ?? [])[0];
  const hasLabel = Boolean(shipment && shipment.shipment_status !== "pending");
  const events = ((shipment?.shipping_events ?? []) as TrackingEventRow[]).sort(
    (a, b) => new Date(b.event_timestamp ?? 0).getTime() - new Date(a.event_timestamp ?? 0).getTime()
  );
  const rate = (o.shipping_rate_snapshot ?? {}) as { carrier?: string; service?: string; is_test?: boolean };
  const passthrough = Number((o.fee_snapshot as { passthrough_cents?: number } | null)?.passthrough_cents ?? 0);
  const flash = readFlash(sp);

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-1">
        <p className="eyebrow">
          <Link href="/seller/orders">Orders</Link>
        </p>
        <h1 className="display text-4xl font-bold">{item.product_title_snapshot}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Order {o.order_number} · paid {when(o.paid_at)} <StatusBadge status={o.order_status} />
        </p>
      </div>
      {flash && (
        <p role={flash.kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${flash.kind === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}>
          {flash.message}
        </p>
      )}

      <section className="card grid gap-4 p-5" data-testid="ship-section">
        <h2 className="font-semibold">Ship it</h2>
        {shipTo ? (
          <div className="grid gap-1 text-sm">
            <p className="font-medium">Ship to</p>
            <address className="not-italic" data-testid="ship-to">
              {formatAddressLines(shipTo).map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </address>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">The buyer&apos;s address isn&apos;t available for this order.</p>
        )}

        {hasLabel && shipment ? (
          <div className="grid gap-2 text-sm" data-testid="label">
            {shipment.is_test && <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2">{TEST_DATA_NOTICE}</p>}
            <p>
              {shipment.carrier} {shipment.service_level} · tracking <span className="font-mono">{shipment.tracking_number}</span>
            </p>
            <p className="text-ink-soft">
              Label cost {formatPrice(shipment.shipping_cost_cents ?? 0)}, paid by the marketplace from the {formatPrice(o.shipping_cost_cents)} the buyer paid for shipping.
              You aren&apos;t charged for it.
            </p>
            {shipment.label_url && (
              <a href={shipment.label_url} className="btn btn-primary justify-self-start" target="_blank" rel="noopener noreferrer">
                Download label (PDF)
              </a>
            )}
          </div>
        ) : canBuyLabel(o.order_status) ? (
          returnAddress ? (
            <form action={buyLabelAction} className="grid gap-3 text-sm">
              <input type="hidden" name="orderId" value={o.id} />
              <p>
                Ships from: {formatAddressLines(returnAddress).join(", ")}. Package: {listing?.package_length_inches}&Prime; × {listing?.package_width_inches}&Prime; ×{" "}
                {listing?.package_height_inches}&Prime;, {listing?.shipping_weight_oz} oz. Service: {rate.carrier} {rate.service} (what the buyer chose).
              </p>
              {rate.is_test && <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2">{TEST_DATA_NOTICE}</p>}
              {shipment?.label_error && <p className="text-danger">The last attempt failed: {shipment.label_error}</p>}
              <label className="flex items-start gap-2">
                <input type="checkbox" name="confirm" value="yes" required className="mt-1" />
                <span>The package size and weight above are right, and the bat is packed.</span>
              </label>
              <button type="submit" className="btn btn-primary justify-self-start">
                Buy shipping label
              </button>
              <p className="text-xs text-ink-soft">The label is paid for by the marketplace from the shipping the buyer paid. You can buy it once per order.</p>
            </form>
          ) : (
            <form action={saveReturnAddress} className="grid gap-3">
              <input type="hidden" name="orderId" value={o.id} />
              <p className="text-sm">Add your return address. Carriers print it on the label and return undeliverable packages there.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="field sm:col-span-2">
                  Full name
                  <input name="full_name" className="input" autoComplete="name" />
                </label>
                <label className="field sm:col-span-2">
                  Street address
                  <input name="street_address" className="input" autoComplete="address-line1" />
                </label>
                <label className="field sm:col-span-2">
                  Apartment, suite (optional)
                  <input name="apartment" className="input" autoComplete="address-line2" />
                </label>
                <label className="field">
                  City
                  <input name="city" className="input" autoComplete="address-level2" />
                </label>
                <label className="field">
                  State
                  <select name="state" className="input" defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    {US_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  ZIP code
                  <input name="postal_code" className="input" inputMode="numeric" />
                </label>
                <label className="field">
                  Phone (optional)
                  <input name="phone" className="input" type="tel" />
                </label>
              </div>
              <button type="submit" className="btn btn-outline justify-self-start">
                Save return address
              </button>
            </form>
          )
        ) : (
          <p className="text-sm text-ink-soft">No label is needed for this order now.</p>
        )}
      </section>

      {shipment && hasLabel && (
        <section className="card grid gap-3 p-5">
          <h2 className="font-semibold">Tracking</h2>
          <TrackingEvents events={events} />
        </section>
      )}

      <section className="card grid gap-4 p-5">
        <h2 className="font-semibold">Progress</h2>
        <Timeline order={{ ...o, label_at: shipment?.purchased_at ?? null }} />
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold">Your payout</h2>
        <MoneyRows
          rows={[
            ["Sale price", o.subtotal_cents],
            ["Marketplace commission", -o.platform_fee_cents],
            ...(passthrough > 0 ? ([["Payment processing", -passthrough]] as [string, number][]) : []),
            ...(o.refunded_amount_cents > 0 ? ([["Refunded to the buyer", -o.refunded_amount_cents]] as [string, number][]) : []),
            ["You receive", o.stripe_transfer_id ? (o.transfer_amount_cents ?? 0) : Math.max(0, (o.seller_payout_cents ?? 0) - o.refunded_amount_cents), "font-semibold"],
          ]}
        />
        <p className="text-xs text-ink-soft">
          {o.stripe_transfer_id
            ? "Paid to your Stripe account. Stripe sends it to your bank on your payout schedule."
            : "You're paid after the carrier shows delivery and the buyer's inspection window passes with no problem reported. Shipping money pays for the label and isn't part of your payout."}
        </p>
      </section>
    </div>
  );
}
