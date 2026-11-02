import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { formatPrice } from "@/lib/format";
import { AdminTitle, Badge, Empty, Table, dateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Shipping exceptions" };

const DAY = 24 * 60 * 60 * 1000;

export default async function ShippingExceptionsPage() {
  await requireStaff(["support"], "/admin/shipping");
  const db = adminDb();
  const now = Date.now();
  const stuckBefore = new Date(now - 5 * DAY).toISOString();
  const lateBefore = new Date(now - 4 * DAY).toISOString();
  const [{ data: problems }, { data: stuck }, { data: unshipped }, { data: labelErrors }] = await Promise.all([
    db.from("shipping_shipments").select("id, order_id, carrier, tracking_number, shipment_status, updated_at, is_test, orders(order_number)").in("shipment_status", ["failure", "returned"]).order("updated_at", { ascending: false }).limit(50),
    db
      .from("shipping_shipments")
      .select("id, order_id, carrier, tracking_number, shipment_status, purchased_at, is_test, orders(order_number)")
      .in("shipment_status", ["label_purchased", "pre_transit"])
      .lt("purchased_at", stuckBefore)
      .limit(50),
    db.from("orders").select("id, order_number, paid_at, order_status").eq("order_status", "paid").lt("paid_at", lateBefore).limit(50),
    db.from("shipping_shipments").select("id, order_id, label_error, updated_at, orders(order_number)").eq("shipment_status", "pending").not("label_error", "is", null).limit(50),
  ]);
  const { data: costs } = await db
    .from("shipping_shipments")
    .select("id, shipping_cost_cents, orders(order_number, shipping_cost_cents)")
    .eq("shipment_status", "label_purchased")
    .order("purchased_at", { ascending: false })
    .limit(200);
  const overspent = (costs ?? []).filter((c) => {
    const o = c.orders as unknown as { shipping_cost_cents: number } | null;
    return o && (c.shipping_cost_cents ?? 0) > o.shipping_cost_cents;
  });
  const num = (o: unknown) => (o as { order_number?: string } | null)?.order_number ?? "—";

  const section = (title: string, empty: string, rows: React.ReactNode[] | null) => (
    <section className="grid gap-2">
      <h2 className="font-semibold">{title}</h2>
      {!rows || rows.length === 0 ? <Empty>{empty}</Empty> : <ul className="card grid gap-1 p-4 text-sm">{rows}</ul>}
    </section>
  );

  return (
    <>
      <AdminTitle title="Shipping exceptions" intro="Packages and orders that need a look. Contact the buyer or seller from their member page." />
      {section(
        "Delivery failures and returns",
        "No failed or returned packages.",
        (problems ?? []).map((s) => (
          <li key={s.id}>
            <Link href={`/admin/refunds?order=${s.order_id}`} className="font-mono underline">
              {num(s.orders)}
            </Link>{" "}
            <Badge tone="bad">{s.shipment_status}</Badge> {s.carrier} <span className="font-mono">{s.tracking_number}</span> · {dateTime(s.updated_at)}
            {s.is_test && " · test data"}
          </li>
        ))
      )}
      {section(
        "Labels with no carrier scan after 5 days",
        "No stuck labels.",
        (stuck ?? []).map((s) => (
          <li key={s.id}>
            <span className="font-mono">{num(s.orders)}</span> <Badge tone="warn">{s.shipment_status}</Badge> label bought {dateTime(s.purchased_at)} ·{" "}
            <span className="font-mono">{s.tracking_number}</span>
            {s.is_test && " · test data"}
          </li>
        ))
      )}
      {section(
        "Paid more than 4 days ago with no label",
        "Every paid order has a label within 4 days.",
        (unshipped ?? []).map((o) => (
          <li key={o.id}>
            <Link href={`/admin/refunds?order=${o.id}`} className="font-mono underline">
              {o.order_number}
            </Link>{" "}
            paid {dateTime(o.paid_at)}
          </li>
        ))
      )}
      {section(
        "Label purchases that failed",
        "No failed label purchases.",
        (labelErrors ?? []).map((s) => (
          <li key={s.id}>
            <span className="font-mono">{num(s.orders)}</span>: {s.label_error} ({dateTime(s.updated_at)})
          </li>
        ))
      )}
      {overspent.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-semibold">Labels that cost more than the buyer paid</h2>
          <Table label="Label overspend">
            <thead>
              <tr>
                <th>Order</th>
                <th className="text-right">Buyer paid</th>
                <th className="text-right">Label cost</th>
              </tr>
            </thead>
            <tbody>
              {overspent.map((c) => {
                const o = c.orders as unknown as { order_number: string; shipping_cost_cents: number };
                return (
                  <tr key={c.id}>
                    <td className="font-mono">{o.order_number}</td>
                    <td className="text-right font-mono">{formatPrice(o.shipping_cost_cents)}</td>
                    <td className="text-right font-mono">{formatPrice(c.shipping_cost_cents ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </section>
      )}
    </>
  );
}
