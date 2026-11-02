import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { StatusBadge, when } from "@/components/orders/OrderParts";

export const metadata: Metadata = { title: "Your purchases", robots: { index: false } };

export default async function PurchasesPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/purchases");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, order_status, total_amount_cents, created_at, order_items(product_title_snapshot)")
    .eq("buyer_id", auth.user.id)
    .neq("order_status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="wrap grid gap-6 py-10">
      <div className="grid gap-1">
        <p className="eyebrow">Buying</p>
        <h1 className="display text-5xl font-bold">Your purchases</h1>
      </div>
      {(orders ?? []).length === 0 ? (
        <p className="card p-5 text-sm text-ink-soft">
          You haven&apos;t bought anything yet.{" "}
          <Link href="/shop" className="underline">
            Browse bats
          </Link>
        </p>
      ) : (
        <ul className="grid gap-3">
          {(orders ?? []).map((o) => (
            <li key={o.id}>
              <Link href={`/account/purchases/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 no-underline hover:border-ink">
                <span className="grid gap-0.5">
                  <span className="font-semibold">{(o.order_items as { product_title_snapshot: string }[])[0]?.product_title_snapshot}</span>
                  <span className="text-xs text-ink-soft">
                    {o.order_number} · {when(o.created_at)}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge status={o.order_status} />
                  <span className="font-mono">{formatPrice(o.total_amount_cents)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
