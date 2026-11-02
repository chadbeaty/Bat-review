import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { readFlash } from "@/lib/admin/action";
import { isUuid } from "@/lib/listings";
import { listingPath } from "@/lib/paths";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { canConfirmReceipt } from "@/lib/payments/state";
import { formatAddressLines } from "@/lib/shipping/address";
import { TEST_DATA_NOTICE } from "@/lib/shipping/provider";
import { MoneyRows, StatusBadge, Timeline, TrackingEvents, when, type TrackingEventRow } from "@/components/orders/OrderParts";
import { confirmReceived } from "./actions";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };

export default async function PurchasePage({ params, searchParams }: PageProps<"/account/purchases/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  if (!supabase) notFound();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect(`/sign-in?next=/account/purchases/${id}`);

  const { data: o } = await supabase
    .from("orders")
    .select(
      "id, order_number, buyer_id, order_status, subtotal_cents, shipping_cost_cents, tax_amount_cents, tax_jurisdiction, total_amount_cents, refunded_amount_cents, created_at, paid_at, shipped_at, delivered_at, completed_at, buyer_confirmed_at, stripe_checkout_url, checkout_expires_at, shipping_rate_snapshot, shipping_address_id, payment_issue, order_items(listing_id, product_title_snapshot)"
    )
    .eq("id", id)
    .eq("buyer_id", auth.user.id)
    .maybeSingle();
  if (!o) notFound();

  const [{ data: shipments }, { data: address }, windowDays] = await Promise.all([
    supabase
      .from("shipping_shipments")
      .select("id, carrier, service_level, tracking_number, tracking_url, shipment_status, purchased_at, is_test, shipping_events(id, tracking_status, tracking_description, event_timestamp, location)")
      .eq("order_id", o.id)
      .eq("is_return", false)
      .neq("shipment_status", "cancelled"),
    o.shipping_address_id ? supabase.from("addresses").select("full_name, street_address, apartment, city, state, postal_code").eq("id", o.shipping_address_id).maybeSingle() : { data: null },
    getSetting<number>("inspection_window_days", 2),
  ]);
  const shipment = (shipments ?? [])[0];
  const events = ((shipment?.shipping_events ?? []) as TrackingEventRow[]).sort(
    (a, b) => new Date(b.event_timestamp ?? 0).getTime() - new Date(a.event_timestamp ?? 0).getTime()
  );
  const item = (o.order_items as { listing_id: string; product_title_snapshot: string }[])[0];
  const flash = readFlash(sp);
  const taxLabel = (o.tax_jurisdiction as { label?: string } | null)?.label ?? "Sales tax";

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-1">
        <p className="eyebrow">
          <Link href="/account/purchases">Your purchases</Link>
        </p>
        <h1 className="display text-4xl font-bold">{item?.product_title_snapshot}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          Order {o.order_number} · placed {when(o.created_at)} <StatusBadge status={o.order_status} />
        </p>
      </div>
      {flash && (
        <p role={flash.kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${flash.kind === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}>
          {flash.message}
        </p>
      )}

      {o.order_status === "awaiting_payment" && (
        <section className="card grid gap-2 p-5" data-testid="awaiting-payment">
          <h2 className="font-semibold">{sp.checkout === "success" ? "Confirming your payment…" : "Waiting for payment"}</h2>
          <p className="text-sm">
            {sp.checkout === "success"
              ? "Stripe is confirming the payment. This page updates once it does; refresh in a moment."
              : `The item is held for you until ${when(o.checkout_expires_at)}.`}
          </p>
          {o.stripe_checkout_url && sp.checkout !== "success" && (
            <a href={o.stripe_checkout_url} className="btn btn-primary justify-self-start">
              Continue to payment
            </a>
          )}
        </section>
      )}

      <section className="card grid gap-4 p-5">
        <h2 className="font-semibold">Progress</h2>
        <Timeline order={{ ...o, label_at: shipment?.purchased_at ?? null }} />
        {o.order_status === "delivered" && !o.buyer_confirmed_at && (
          <p className="text-sm">
            You have {windowDays} days after delivery to check the item and report a problem. After that, the seller is paid automatically.
          </p>
        )}
        {canConfirmReceipt(o.order_status, o.buyer_confirmed_at) && (
          <form action={confirmReceived} className="grid gap-2">
            <input type="hidden" name="orderId" value={o.id} />
            <button type="submit" className="btn btn-primary justify-self-start">
              Confirm I received it
            </button>
            <p className="text-xs text-ink-soft">Only confirm once you&apos;ve checked the item matches the listing. This releases payment to the seller.</p>
          </form>
        )}
      </section>

      {shipment && (
        <section className="card grid gap-3 p-5">
          <h2 className="font-semibold">Tracking</h2>
          {shipment.is_test && <p className="rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">{TEST_DATA_NOTICE}</p>}
          <p className="text-sm">
            {shipment.carrier} {shipment.service_level} · <span className="font-mono">{shipment.tracking_number}</span>
            {shipment.tracking_url && (
              <>
                {" "}
                ·{" "}
                <a href={shipment.tracking_url} className="underline" rel="noopener noreferrer" target="_blank">
                  Carrier tracking
                </a>
              </>
            )}
          </p>
          <TrackingEvents events={events} />
        </section>
      )}

      <section className="card grid gap-3 p-5">
        <h2 className="font-semibold">Payment</h2>
        <MoneyRows
          rows={[
            ["Item", o.subtotal_cents],
            ["Shipping", o.shipping_cost_cents],
            [o.tax_amount_cents > 0 ? taxLabel : "Sales tax not collected", o.tax_amount_cents],
            ["Total", o.total_amount_cents, "font-semibold"],
            ...(o.refunded_amount_cents > 0 ? ([["Refunded", o.refunded_amount_cents, "text-success"]] as [string, number, string][]) : []),
          ]}
        />
        {address && (
          <address className="text-sm not-italic text-ink-soft">
            Shipping to: {formatAddressLines(address).join(", ")}
          </address>
        )}
        {item && (
          <Link href={listingPath(item.listing_id)} className="text-sm underline">
            View the listing
          </Link>
        )}
      </section>

      <section id="problem" className="card grid gap-2 p-5">
        <h2 className="font-semibold">Problem with this order?</h2>
        <p className="text-sm">
          Reporting problems from this page (not received, not as described, damaged) is coming soon. Until then, contact us within {windowDays} days
          of delivery and don&apos;t confirm receipt; support can refund you before the seller is paid.
        </p>
        <Link href="/contact" className="text-sm underline">
          Contact support
        </Link>
      </section>
    </div>
  );
}
