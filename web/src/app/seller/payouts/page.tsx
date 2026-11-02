import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { readFlash } from "@/lib/admin/action";
import { createClient } from "@/lib/supabase/server";
import { getSetting } from "@/lib/settings";
import { formatPrice } from "@/lib/format";
import { statusLabel } from "@/lib/payments/state";
import { stripeConfigured } from "@/lib/payments/stripe-client";
import { when } from "@/components/orders/OrderParts";
import { openDashboard, refreshStatus, startOnboarding } from "./actions";

export const metadata: Metadata = { title: "Payouts", robots: { index: false } };

const STATUS_TEXT: Record<string, string> = {
  not_started: "Not set up",
  in_progress: "Setup not finished",
  complete: "Ready: you can sell and get paid",
  restricted: "Stripe needs more information",
  rejected: "Stripe couldn't verify this account",
};

export default async function PayoutsPage({ searchParams }: PageProps<"/seller/payouts">) {
  const supabase = await createClient();
  if (!supabase) redirect("/sell");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/seller/payouts");
  const sp = await searchParams;
  const flash = readFlash(sp);

  const [{ data: account }, { data: orders }, { data: payouts }, windowDays] = await Promise.all([
    supabase.from("seller_payment_accounts").select("onboarding_status, charges_enabled, payouts_enabled, requirements_due, updated_at").eq("seller_id", auth.user.id).maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_number, order_status, seller_payout_cents, refunded_amount_cents, transfer_amount_cents, stripe_transfer_id, completed_at, delivered_at, order_items(product_title_snapshot)")
      .eq("seller_id", auth.user.id)
      .in("order_status", ["paid", "processing", "shipped", "delivered", "completed", "disputed"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("seller_payouts").select("id, amount_cents, status, arrival_date, failure_message, created_at").eq("seller_id", auth.user.id).order("created_at", { ascending: false }).limit(20),
    getSetting<number>("inspection_window_days", 2),
  ]);
  const status = account?.onboarding_status ?? "not_started";
  const due = (account?.requirements_due ?? []) as string[];

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-1">
        <p className="eyebrow">
          <Link href="/seller">Selling</Link>
        </p>
        <h1 className="display text-5xl font-bold">Payouts</h1>
      </div>
      {flash && (
        <p role={flash.kind === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${flash.kind === "error" ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success"}`}>
          {flash.message}
        </p>
      )}

      <section className="card grid gap-3 p-5" data-testid="payout-account">
        <h2 className="font-semibold">Payout account</h2>
        <p className="text-sm">
          Status: <strong>{STATUS_TEXT[status] ?? status}</strong>
        </p>
        {account && (
          <ul className="grid gap-1 text-sm">
            <li>Payouts to your bank: {account.payouts_enabled ? "on" : "off"}</li>
            {due.length > 0 && <li className="text-danger">Stripe still needs: {due.map((d) => d.replace(/[._]/g, " ")).join(", ")}</li>}
          </ul>
        )}
        <p className="text-sm text-ink-soft">
          We use Stripe to verify sellers and pay them. Stripe collects your identity and bank details; we never see your bank account number.
        </p>
        {!stripeConfigured() ? (
          <p className="text-sm text-ink-soft">Payout setup opens when payments are connected.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {status !== "complete" && (
              <form action={startOnboarding}>
                <button type="submit" className="btn btn-primary">
                  {account ? "Continue setup with Stripe" : "Set up payouts with Stripe"}
                </button>
              </form>
            )}
            {account && (
              <form action={refreshStatus}>
                <button type="submit" className="btn btn-outline">
                  Refresh status
                </button>
              </form>
            )}
            {status === "complete" && (
              <form action={openDashboard}>
                <button type="submit" className="btn btn-outline">
                  Open your Stripe dashboard
                </button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="card grid gap-2 p-5">
        <h2 className="font-semibold">When you get paid</h2>
        <p className="text-sm">
          You&apos;re paid after delivery plus a {windowDays}-day inspection window: once the carrier shows the item delivered and the buyer has had{" "}
          {windowDays} days to report a problem (or confirms they received it sooner), we send your share to your Stripe account. Stripe then pays it
          into your bank on its normal schedule, usually within a few business days. Payouts aren&apos;t instant.
        </p>
        <p className="text-sm text-ink-soft">Your share is the sale price minus the marketplace commission. Shipping money pays for the label and isn&apos;t part of it.</p>
      </section>

      <section className="grid gap-3">
        <h2 className="text-xl font-semibold">Order payouts</h2>
        {(orders ?? []).length === 0 ? (
          <p className="card p-4 text-sm text-ink-soft">No paid orders yet.</p>
        ) : (
          <ul className="grid gap-2">
            {(orders ?? []).map((o) => (
              <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <span className="grid gap-0.5">
                  <Link href={`/seller/orders/${o.id}`} className="font-semibold underline">
                    {(o.order_items as { product_title_snapshot: string }[])[0]?.product_title_snapshot}
                  </Link>
                  <span className="text-xs text-ink-soft">
                    {o.order_number} · {o.stripe_transfer_id ? `paid to Stripe ${when(o.completed_at)}` : statusLabel(o.order_status)}
                  </span>
                </span>
                <span className="font-mono" data-testid="order-payout">
                  {formatPrice(o.stripe_transfer_id ? (o.transfer_amount_cents ?? 0) : Math.max(0, (o.seller_payout_cents ?? 0) - o.refunded_amount_cents))}
                  {!o.stripe_transfer_id && <span className="ml-1 text-xs text-ink-soft">pending</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(payouts ?? []).length > 0 && (
        <section className="grid gap-3">
          <h2 className="text-xl font-semibold">Bank payouts from Stripe</h2>
          <ul className="grid gap-2">
            {(payouts ?? []).map((p) => (
              <li key={p.id} className="card flex flex-wrap justify-between gap-3 p-4 text-sm">
                <span>
                  {p.status === "failed" ? <strong className="text-danger">Failed</strong> : p.status} · arrives {p.arrival_date ?? "—"}
                  {p.failure_message && <span className="block text-danger">{p.failure_message}</span>}
                </span>
                <span className="font-mono">{formatPrice(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
