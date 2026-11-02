import type { Metadata } from "next";
import Link from "next/link";
import { adminDb, requireStaff } from "@/lib/admin/auth";
import { formatPrice } from "@/lib/format";
import { AdminTitle, Stat, Table } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Overview" };

type Overview = {
  registered_users: number;
  suspended_users: number;
  active_sellers: number;
  active_listings: number;
  listings_by_category: { name: string; count: number }[];
  listings_by_manufacturer: { name: string; count: number }[];
  orders_total: number;
  completed_orders: number;
  paid_orders: number;
  gmv_cents: number;
  commission_cents: number;
  refunded_orders: number;
  refunded_cents: number;
  open_disputes: number;
  open_reports: number;
  pending_submissions: number;
};

const n = (v: number) => Number(v).toLocaleString("en-US");

export default async function AdminOverviewPage() {
  await requireStaff("any", "/admin");
  const { data, error } = await adminDb().rpc("admin_overview");
  if (error || !data) {
    return (
      <>
        <AdminTitle title="Overview" />
        <p className="text-danger">The dashboard numbers couldn&apos;t be loaded: {error?.message ?? "no data"}.</p>
      </>
    );
  }
  const o = data as Overview;

  return (
    <>
      <AdminTitle title="Overview" intro="Live numbers from the database. Nothing here is estimated: a zero means there are none yet." />

      {Number(o.orders_total) === 0 && (
        <p className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink-soft">
          Orders and payouts start when checkout launches. Until then, order, revenue and refund figures stay at zero.
        </p>
      )}

      <section aria-labelledby="h-people" className="grid gap-3">
        <h2 id="h-people" className="font-semibold">
          Members and listings
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Registered members" value={n(o.registered_users)} hint={`${n(o.suspended_users)} suspended or banned`} />
          <Stat label="Active sellers" value={n(o.active_sellers)} hint="With at least one live listing" />
          <Stat label="Active listings" value={n(o.active_listings)} />
          <Stat label="Catalog requests waiting" value={<Link href="/admin/catalog/submissions">{n(o.pending_submissions)}</Link>} />
        </div>
      </section>

      <section aria-labelledby="h-money" className="grid gap-3">
        <h2 id="h-money" className="font-semibold">
          Orders and money
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Completed orders" value={n(o.completed_orders)} hint={`${n(o.paid_orders)} paid orders in total`} />
          <Stat
            label="Gross merchandise value"
            value={formatPrice(Number(o.gmv_cents))}
            hint="Item prices of paid orders. Not revenue: it excludes shipping and tax and most of it belongs to sellers."
          />
          <Stat label="Marketplace commission" value={formatPrice(Number(o.commission_cents))} hint="Commission on paid orders, before refunds and processing costs." />
          <Stat label="Refunds" value={formatPrice(Number(o.refunded_cents))} hint={`${n(o.refunded_orders)} orders with a refund`} />
        </div>
      </section>

      <section aria-labelledby="h-trust" className="grid gap-3">
        <h2 id="h-trust" className="font-semibold">
          Trust and safety
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Open disputes" value={n(o.open_disputes)} />
          <Stat label="Open reports" value={<Link href="/admin/reports">{n(o.open_reports)}</Link>} hint="Open or being reviewed" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Breakdown title="Active listings by category" rows={o.listings_by_category} />
        <Breakdown title="Active listings by manufacturer" rows={o.listings_by_manufacturer} />
      </div>
    </>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="card p-4 text-sm text-ink-soft">No active listings yet.</p>
      ) : (
        <Table label={title}>
          <thead>
            <tr>
              <th>Name</th>
              <th className="text-right">Listings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="text-right font-mono">{n(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}
