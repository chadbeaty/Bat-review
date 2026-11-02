import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { formatPrice } from "@/lib/format";
import { AdminTitle, Badge, Empty, Stat, Table, dateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Payouts" };

export default async function PayoutsPage() {
  await requireStaff(["admin"], "/admin/payouts");
  const db = adminDb();
  const [{ data: failed }, { data: accounts }, { data: transferErrors }, { data: transfers }, { data: issues }] = await Promise.all([
    db.from("seller_payouts").select("id, seller_id, stripe_payout_id, amount_cents, failure_code, failure_message, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(50),
    db
      .from("seller_payment_accounts")
      .select("seller_id, stripe_connected_account_id, onboarding_status, payouts_enabled, requirements_due, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
    db.from("orders").select("id, order_number, transfer_error, transfer_attempted_at").not("transfer_error", "is", null).is("stripe_transfer_id", null).limit(50),
    db.from("orders").select("id, order_number, transfer_amount_cents, transfer_reversed_cents, stripe_transfer_id, completed_at").not("stripe_transfer_id", "is", null).order("completed_at", { ascending: false }).limit(30),
    db.from("orders").select("id, order_number, order_status, payment_issue").not("payment_issue", "is", null).neq("order_status", "cancelled").limit(50),
  ]);
  const needsAttention = (accounts ?? []).filter((a) => a.onboarding_status === "restricted" || a.onboarding_status === "rejected" || (a.requirements_due as string[]).length > 0);
  const ids = [...new Set([...(failed ?? []).map((p) => p.seller_id), ...needsAttention.map((a) => a.seller_id)])];
  const { data: names } = ids.length ? await db.from("profiles").select("id, username").in("id", ids) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.username as string]));
  const username = (id: string) => nameOf.get(id) ?? "—";

  return (
    <>
      <AdminTitle
        title="Payouts"
        intro="Sellers are paid by a Stripe transfer when an order completes. Stripe then pays out to their bank. This screen shows what needs attention; it is read-only."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Failed bank payouts" value={(failed ?? []).length} />
        <Stat label="Accounts needing info" value={needsAttention.length} />
        <Stat label="Transfers that failed" value={(transferErrors ?? []).length} hint="Retried by the scheduled job" />
        <Stat label="Payment issues" value={(issues ?? []).length} hint="Amount mismatches, late payments" />
      </div>

      <section className="grid gap-2">
        <h2 className="font-semibold">Failed bank payouts</h2>
        {(failed ?? []).length === 0 ? (
          <Empty>No failed payouts.</Empty>
        ) : (
          <Table label="Failed payouts">
            <thead>
              <tr>
                <th>Seller</th>
                <th className="text-right">Amount</th>
                <th>Reason</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {(failed ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/users/${p.seller_id}`} className="underline">
                      @{username(p.seller_id)}
                    </Link>
                  </td>
                  <td className="text-right font-mono">{formatPrice(p.amount_cents)}</td>
                  <td>{p.failure_message ?? p.failure_code ?? "—"}</td>
                  <td>{dateTime(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="font-semibold">Seller accounts with requirements due</h2>
        {needsAttention.length === 0 ? (
          <Empty>No seller accounts need more information.</Empty>
        ) : (
          <Table label="Accounts needing information">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Status</th>
                <th>Stripe needs</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {needsAttention.map((a) => (
                <tr key={a.seller_id}>
                  <td>
                    <Link href={`/admin/users/${a.seller_id}`} className="underline">
                      @{username(a.seller_id)}
                    </Link>
                    <span className="block font-mono text-xs text-ink-soft">{a.stripe_connected_account_id}</span>
                  </td>
                  <td>
                    <Badge tone="warn">{a.onboarding_status}</Badge>
                  </td>
                  <td className="text-xs">{(a.requirements_due as string[]).join(", ") || "—"}</td>
                  <td>{dateTime(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {((transferErrors ?? []).length > 0 || (issues ?? []).length > 0) && (
        <section className="grid gap-2">
          <h2 className="font-semibold">Orders needing attention</h2>
          <ul className="grid gap-1 text-sm">
            {(transferErrors ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/refunds?order=${o.id}`} className="font-mono underline">
                  {o.order_number}
                </Link>{" "}
                transfer failed ({dateTime(o.transfer_attempted_at)}): {o.transfer_error}
              </li>
            ))}
            {(issues ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/admin/refunds?order=${o.id}`} className="font-mono underline">
                  {o.order_number}
                </Link>{" "}
                ({o.order_status}): {o.payment_issue}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-2">
        <h2 className="font-semibold">Recent transfers to sellers</h2>
        {(transfers ?? []).length === 0 ? (
          <Empty>No transfers yet.</Empty>
        ) : (
          <Table label="Transfers">
            <thead>
              <tr>
                <th>Order</th>
                <th>Transfer</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Reversed</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {(transfers ?? []).map((t) => (
                <tr key={t.id}>
                  <td className="font-mono">{t.order_number}</td>
                  <td className="font-mono text-xs">{t.stripe_transfer_id}</td>
                  <td className="text-right font-mono">{formatPrice(t.transfer_amount_cents ?? 0)}</td>
                  <td className="text-right font-mono">{t.transfer_reversed_cents ? formatPrice(t.transfer_reversed_cents) : "—"}</td>
                  <td>{dateTime(t.completed_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
