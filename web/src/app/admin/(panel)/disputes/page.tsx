import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { AdminTitle, Badge, Empty, Table, dateTime } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Disputes" };

const OPEN = ["open", "awaiting_seller", "awaiting_buyer", "under_review"];

export default async function DisputesPage() {
  await requireStaff(["support"], "/admin/disputes");
  const { data: disputes } = await adminDb()
    .from("disputes")
    .select("id, order_id, dispute_type, status, description, stripe_dispute_id, created_at, resolved_at, orders(order_number)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <AdminTitle
        title="Disputes"
        intro="Problem reports and card chargebacks. Read-only for now: the case-handling screens arrive with the disputes feature. While a dispute is open, the seller isn't paid. Respond to chargebacks in the Stripe dashboard."
      />
      {(disputes ?? []).length === 0 ? (
        <Empty>No disputes yet.</Empty>
      ) : (
        <Table label="Disputes">
          <thead>
            <tr>
              <th>Order</th>
              <th>Type</th>
              <th>Status</th>
              <th>Details</th>
              <th>Opened</th>
            </tr>
          </thead>
          <tbody>
            {(disputes ?? []).map((d) => (
              <tr key={d.id}>
                <td>
                  <Link href={`/admin/refunds?order=${d.order_id}`} className="font-mono underline">
                    {(d.orders as unknown as { order_number: string } | null)?.order_number ?? "—"}
                  </Link>
                </td>
                <td>{d.dispute_type.replace(/_/g, " ")}</td>
                <td>
                  <Badge tone={OPEN.includes(d.status) ? "warn" : "neutral"}>{d.status.replace(/_/g, " ")}</Badge>
                </td>
                <td className="max-w-md text-xs">
                  {d.description}
                  {d.stripe_dispute_id && <span className="block font-mono text-ink-soft">{d.stripe_dispute_id}</span>}
                </td>
                <td>{dateTime(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
