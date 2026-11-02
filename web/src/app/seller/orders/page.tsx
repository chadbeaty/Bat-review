import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { StatusBadge, when } from "@/components/orders/OrderParts";

export const metadata: Metadata = { title: "Orders to fulfil", robots: { index: false } };

const TO_SHIP = ["paid", "processing"];

export default async function SellerOrdersPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/seller/orders");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, order_status, subtotal_cents, platform_fee_cents, seller_payout_cents, paid_at, created_at, order_items(product_title_snapshot)")
    .eq("seller_id", auth.user.id)
    .not("order_status", "in", "(awaiting_payment,cancelled)")
    .order("created_at", { ascending: false })
    .limit(200);
  const all = orders ?? [];
  const toShip = all.filter((o) => TO_SHIP.includes(o.order_status));
  const rest = all.filter((o) => !TO_SHIP.includes(o.order_status));

  const list = (rows: typeof all) => (
    <ul className="grid gap-3">
      {rows.map((o) => (
        <li key={o.id}>
          <Link href={`/seller/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 no-underline hover:border-ink">
            <span className="grid gap-0.5">
              <span className="font-semibold">{(o.order_items as { product_title_snapshot: string }[])[0]?.product_title_snapshot}</span>
              <span className="text-xs text-ink-soft">
                {o.order_number} · paid {when(o.paid_at)}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <StatusBadge status={o.order_status} />
              <span className="font-mono" title="Your payout after commission">
                {formatPrice(o.seller_payout_cents ?? 0)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="wrap grid gap-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="eyebrow">
            <Link href="/seller">Selling</Link>
          </p>
          <h1 className="display text-5xl font-bold">Orders</h1>
        </div>
        <Link href="/seller/payouts" className="btn btn-outline">
          Payouts
        </Link>
      </div>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">To ship ({toShip.length})</h2>
        {toShip.length ? list(toShip) : <p className="card p-4 text-sm text-ink-soft">Nothing to ship right now.</p>}
      </section>
      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">Other orders</h2>
        {rest.length ? list(rest) : <p className="card p-4 text-sm text-ink-soft">No other orders yet.</p>}
      </section>
    </div>
  );
}
