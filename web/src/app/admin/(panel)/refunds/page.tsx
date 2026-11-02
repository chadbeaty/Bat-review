import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminInputError, readFlash, runAdminAction } from "@/lib/admin/action";
import { searchTerm, text, uuid } from "@/lib/admin/validation";
import { hasAccess } from "@/lib/admin/roles";
import { formatPrice } from "@/lib/format";
import { parseDollarsToCents } from "@/lib/payments/money";
import { refundOrder } from "@/lib/payments/refunds";
import { paymentsDeps } from "@/lib/payments/server";
import { PaymentsError } from "@/lib/payments/deps";
import { statusLabel } from "@/lib/payments/state";
import { AdminTitle, Badge, Empty, Flash, ReturnTo, SubmitButton, Table, dateTime, param } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Refunds" };

async function issueRefund(form: FormData) {
  "use server";
  const orderId = text(form, "orderId");
  return runAdminAction(["support"], form, `/admin/refunds?order=${orderId}`, async (staff) => {
    if (!uuid.safeParse(orderId).success) throw new AdminInputError("Choose an order.");
    const amount = parseDollarsToCents(text(form, "amount"));
    if (amount == null || amount <= 0) throw new AdminInputError("Enter the refund amount in dollars, like 25 or 25.50.");
    const deps = paymentsDeps();
    if (!deps) throw new AdminInputError("Stripe isn't configured.");
    try {
      const r = await refundOrder(deps, {
        actorId: staff.user.id,
        actorIsAdmin: staff.roles.includes("admin"),
        orderId,
        amountCents: amount,
        reason: text(form, "reason", 500),
        reverseTransfer: form.get("reverse") === "yes",
        confirmation: text(form, "confirmation", 64),
        nonce: text(form, "nonce", 64),
      });
      if (r.outcome === "already_recorded") return "That refund was already issued.";
      return `Refunded ${formatPrice(amount)}${r.reversalId ? ` and reversed ${formatPrice(r.reversalCents)} from the seller's transfer` : ""}.`;
    } catch (err) {
      if (err instanceof PaymentsError) throw new AdminInputError(err.message);
      throw new AdminInputError(`Stripe refused the refund: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  });
}

type OrderRow = {
  id: string;
  order_number: string;
  order_status: string;
  subtotal_cents: number;
  shipping_cost_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  refunded_amount_cents: number;
  platform_fee_cents: number;
  seller_payout_cents: number | null;
  payment_processing_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null;
  transfer_amount_cents: number | null;
  transfer_reversed_cents: number;
  payment_issue: string | null;
  paid_at: string | null;
};

const COLS =
  "id, order_number, order_status, subtotal_cents, shipping_cost_cents, tax_amount_cents, total_amount_cents, refunded_amount_cents, platform_fee_cents, seller_payout_cents, payment_processing_cents, stripe_payment_intent_id, stripe_transfer_id, transfer_amount_cents, transfer_reversed_cents, payment_issue, paid_at";

export default async function RefundsPage({ searchParams }: PageProps<"/admin/refunds">) {
  const staff = await requireStaff(["support"], "/admin/refunds");
  const sp = await searchParams;
  const db = adminDb();
  const q = searchTerm(param(sp, "q"));
  const selectedId = param(sp, "order");

  let listQuery = db.from("orders").select(COLS).not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(30);
  if (q) listQuery = listQuery.ilike("order_number", `%${q}%`);
  const [{ data: orders }, { data: selected }, { data: refunds }] = await Promise.all([
    listQuery.returns<OrderRow[]>(),
    uuid.safeParse(selectedId).success ? db.from("orders").select(COLS).eq("id", selectedId).maybeSingle<OrderRow>() : { data: null },
    uuid.safeParse(selectedId).success
      ? db.from("payment_refunds").select("id, amount_cents, reason, transfer_reversal_cents, created_at").eq("order_id", selectedId).order("created_at")
      : { data: null },
  ]);
  const isAdmin = hasAccess(staff.roles, ["admin"]);
  const path = selected ? `/admin/refunds?order=${selected.id}` : "/admin/refunds";

  return (
    <>
      <AdminTitle
        title="Refunds"
        intro="Refund a paid order through Stripe. Before the seller is paid, a refund just returns the buyer's money. After the seller's transfer, the refund comes from the platform's Stripe balance; reversing the seller's transfer to recover it is a separate admin choice."
      />
      <Flash flash={readFlash(sp)} />
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="field text-sm">
          Order number
          <input name="q" defaultValue={q} className="input w-48 font-mono" placeholder="ORD-100001" />
        </label>
        <SubmitButton tone="outline">Find</SubmitButton>
      </form>

      {selected && (
        <section className="card grid gap-4 p-5" data-testid="refund-order">
          <h2 className="font-semibold">
            Order <span className="font-mono">{selected.order_number}</span> · {statusLabel(selected.order_status)}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <dt className="text-ink-soft">Paid by buyer</dt>
            <dd className="font-mono">{formatPrice(selected.total_amount_cents)}</dd>
            <dt className="text-ink-soft">Already refunded</dt>
            <dd className="font-mono">{formatPrice(selected.refunded_amount_cents)}</dd>
            <dt className="text-ink-soft">Commission</dt>
            <dd className="font-mono">{formatPrice(selected.platform_fee_cents)}</dd>
            <dt className="text-ink-soft">Stripe processing</dt>
            <dd className="font-mono">{selected.payment_processing_cents == null ? "not recorded" : formatPrice(selected.payment_processing_cents)}</dd>
            <dt className="text-ink-soft">Seller payout</dt>
            <dd className="font-mono">{formatPrice(selected.seller_payout_cents ?? 0)}</dd>
            <dt className="text-ink-soft">Transfer to seller</dt>
            <dd className="font-mono">
              {selected.stripe_transfer_id ? `${formatPrice(selected.transfer_amount_cents ?? 0)} (${selected.stripe_transfer_id})` : "not paid yet"}
            </dd>
            {selected.transfer_reversed_cents > 0 && (
              <>
                <dt className="text-ink-soft">Reversed from seller</dt>
                <dd className="font-mono">{formatPrice(selected.transfer_reversed_cents)}</dd>
              </>
            )}
          </dl>
          {selected.payment_issue && <p className="text-sm text-danger">Payment issue: {selected.payment_issue}</p>}
          {(refunds ?? []).length > 0 && (
            <ul className="grid gap-1 text-sm">
              {(refunds ?? []).map((r) => (
                <li key={r.id}>
                  {dateTime(r.created_at)}: {formatPrice(r.amount_cents)} · {r.reason}
                  {r.transfer_reversal_cents ? ` · reversed ${formatPrice(r.transfer_reversal_cents)}` : ""}
                </li>
              ))}
            </ul>
          )}
          {!selected.stripe_payment_intent_id || selected.refunded_amount_cents >= selected.total_amount_cents ? (
            <p className="text-sm text-ink-soft">Nothing left to refund on this order.</p>
          ) : (
            <form action={issueRefund} className="grid gap-3" aria-label="Issue a refund">
              <ReturnTo path={path} />
              <input type="hidden" name="orderId" value={selected.id} />
              <input type="hidden" name="nonce" value={randomUUID()} />
              <div className="flex flex-wrap gap-3">
                <label className="field text-sm">
                  Amount (USD)
                  <input
                    name="amount"
                    className="input w-36 font-mono"
                    inputMode="decimal"
                    defaultValue={((selected.total_amount_cents - selected.refunded_amount_cents) / 100).toFixed(2)}
                  />
                </label>
                <label className="field min-w-64 flex-1 text-sm">
                  Reason (the buyer sees this)
                  <input name="reason" className="input" maxLength={500} required />
                </label>
              </div>
              {selected.stripe_transfer_id && (
                <div className="grid gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                  <p>
                    <strong>The seller has already been paid.</strong> This refund comes out of the platform&apos;s Stripe balance unless you also reverse
                    the seller&apos;s transfer.
                  </p>
                  {isAdmin ? (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="reverse" value="yes" className="mt-1" />
                      <span>Also reverse the same amount from the seller&apos;s transfer (admins only)</span>
                    </label>
                  ) : (
                    <p>Only an admin can reverse the seller&apos;s transfer.</p>
                  )}
                  <label className="field">
                    Type the order number to confirm
                    <input name="confirmation" className="input w-48 font-mono" autoComplete="off" />
                  </label>
                </div>
              )}
              <SubmitButton tone="danger" className="justify-self-start">
                Refund through Stripe
              </SubmitButton>
            </form>
          )}
        </section>
      )}

      {(orders ?? []).length === 0 ? (
        <Empty>{q ? "No paid orders match that number." : "No paid orders yet."}</Empty>
      ) : (
        <Table label="Paid orders">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th className="text-right">Paid</th>
              <th className="text-right">Refunded</th>
              <th>Seller paid</th>
              <th>Paid at</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => (
              <tr key={o.id}>
                <td>
                  <Link href={`/admin/refunds?order=${o.id}`} className="font-mono underline">
                    {o.order_number}
                  </Link>
                </td>
                <td>
                  <Badge tone={o.order_status === "refunded" || o.order_status === "disputed" ? "bad" : "neutral"}>{statusLabel(o.order_status)}</Badge>
                </td>
                <td className="text-right font-mono">{formatPrice(o.total_amount_cents)}</td>
                <td className="text-right font-mono">{o.refunded_amount_cents ? formatPrice(o.refunded_amount_cents) : "—"}</td>
                <td>{o.stripe_transfer_id ? <Badge tone="warn">Yes</Badge> : "No"}</td>
                <td>{dateTime(o.paid_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
