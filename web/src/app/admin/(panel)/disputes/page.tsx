import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { readFlash } from "@/lib/admin/action";
import { AdminTitle, Badge, Empty, Flash, Pager, Table, dateTime, pageNumber, param } from "@/components/admin/ui";
import { CLOSED_DISPUTE_STATUSES, DISPUTE_STATUS_LABELS, DISPUTE_TYPES } from "@/lib/trust/disputes";

export const metadata: Metadata = { title: "Disputes" };

const PAGE_SIZE = 30;
const FILTERS = ["active", "resolved_buyer", "resolved_seller", "closed", "all"] as const;

export default async function DisputesPage({ searchParams }: PageProps<"/admin/disputes">) {
  await requireStaff(["support"], "/admin/disputes");
  const sp = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(param(sp, "status")) ? param(sp, "status") : "active";
  const page = pageNumber(sp);
  let query = adminDb()
    .from("disputes")
    .select("id, order_id, opened_by, dispute_type, status, created_at, resolved_at")
    .order("created_at", { ascending: filter === "active" })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  if (filter === "active") query = query.not("status", "in", `(${CLOSED_DISPUTE_STATUSES.join(",")})`);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data, error } = await query;
  const rows = (data ?? []).slice(0, PAGE_SIZE);
  const orderIds = rows.map((r) => r.order_id);
  const { data: orders } = orderIds.length ? await adminDb().from("orders").select("id, order_number").in("id", orderIds) : { data: [] };
  const orderNumber = new Map((orders ?? []).map((o) => [o.id, o.order_number as string]));

  return (
    <>
      <AdminTitle
        title="Disputes"
        intro={
          <>
            Cases members open on their orders. Resolving a case records the decision and tells both members; it never moves money. To refund, use the{" "}
            <Link href="/admin/refunds" className="underline">
              Refunds
            </Link>{" "}
            page.
          </>
        }
      />
      <Flash flash={readFlash(sp)} />
      <nav aria-label="Case status" className="flex flex-wrap gap-2">
        {FILTERS.map((s) => (
          <Link key={s} href={`/admin/disputes?status=${s}`} className={`btn px-3 py-1.5 text-sm ${s === filter ? "btn-primary" : "btn-outline"}`} aria-current={s === filter ? "page" : undefined}>
            {s === "active" ? "Needs attention" : (DISPUTE_STATUS_LABELS[s] ?? "All")}
          </Link>
        ))}
      </nav>
      {error ? (
        <p className="text-danger">Couldn&apos;t load cases: {error.message}</p>
      ) : rows.length === 0 ? (
        <Empty>No cases here.</Empty>
      ) : (
        <Table label="Disputes">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Order</th>
              <th>Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td className="whitespace-nowrap">{dateTime(d.created_at)}</td>
                <td>{orderNumber.get(d.order_id) ?? d.order_id.slice(0, 8)}</td>
                <td>{DISPUTE_TYPES[d.dispute_type] ?? d.dispute_type}</td>
                <td>
                  <Badge tone={CLOSED_DISPUTE_STATUSES.includes(d.status) ? "good" : d.status === "open" ? "warn" : "neutral"}>{DISPUTE_STATUS_LABELS[d.status] ?? d.status}</Badge>
                </td>
                <td>
                  <Link href={`/admin/disputes/${d.id}`} className="font-semibold underline">
                    Open case
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Pager basePath="/admin/disputes" params={{ status: filter }} page={page} hasMore={(data ?? []).length > PAGE_SIZE} />
    </>
  );
}
