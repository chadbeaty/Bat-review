import Link from "next/link";
import type { Metadata } from "next";
import { Badge, Card, ConfidenceBadge, Empty, PageHeader, ScoreBadge, StatusBadge, Thumb } from "@/components/ui";
import { requireMember } from "@/lib/auth/member";
import { ago, money } from "@/lib/format";

export const metadata: Metadata = { title: "Watchlist" };

const ORDER = ["testing", "launched", "following", "saved", "tested", "rejected"];

export default async function WatchlistPage() {
  const member = await requireMember("/watchlist");
  const { db } = member;
  const [{ data: items }, { data: results }] = await Promise.all([
    db.from("watchlists").select("status, notes, updated_at, products(id, slug, canonical_name, primary_image_url, latest_score, latest_confidence, status, scored_at)").eq("user_id", member.user.id).order("updated_at", { ascending: false }),
    db.from("user_feedback").select("product_id, kind, revenue, orders, ad_spend, units_cost, verdict, created_at").eq("user_id", member.user.id).in("kind", ["test_result", "sales"]),
  ]);
  const totals = new Map<string, { revenue: number; orders: number; costs: number; verdict: string | null }>();
  for (const r of results ?? []) {
    const k = r.product_id as string;
    const t = totals.get(k) ?? { revenue: 0, orders: 0, costs: 0, verdict: null };
    t.revenue += Number(r.revenue ?? 0);
    t.orders += Number(r.orders ?? 0);
    t.costs += Number(r.ad_spend ?? 0) + Number(r.units_cost ?? 0);
    t.verdict = (r.verdict as string | null) ?? t.verdict;
    totals.set(k, t);
  }
  type P = { id: string; slug: string; canonical_name: string; primary_image_url: string | null; latest_score: number | null; latest_confidence: string | null; status: string; scored_at: string | null };
  const rows = (items ?? [])
    .map((i) => ({ ...i, product: (Array.isArray(i.products) ? i.products[0] : i.products) as P | null }))
    .filter((i) => i.product)
    .sort((a, b) => ORDER.indexOf(a.status as string) - ORDER.indexOf(b.status as string));

  return (
    <>
      <PageHeader title="Watchlist" subtitle="Products you saved, are testing or launched. Watchlisted products are refreshed every day. Record results on each product's page." />
      {!rows.length ? (
        <Empty title="Your watchlist is empty">Open any product and choose “Add to watchlist”.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const p = r.product!;
              const t = totals.get(p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Thumb src={p.primary_image_url} alt="" size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${p.slug}`} className="font-medium hover:text-accent">{p.canonical_name}</Link>
                    <p className="text-xs text-muted">
                      <Badge tone={r.status === "rejected" ? "neutral" : "accent"}>{r.status as string}</Badge> updated {ago(r.updated_at as string)}
                      {p.status === "saturated" && <> · <StatusBadge status="saturated" /></>}
                      {r.notes && <> · {String(r.notes).slice(0, 120)}</>}
                    </p>
                  </div>
                  {t && (
                    <div className="text-right text-xs">
                      <p className="tabular">{money(t.revenue)} revenue · {t.orders} orders</p>
                      <p className="tabular text-muted">{money(t.costs)} spend+costs{t.verdict ? ` · ${t.verdict}` : ""}</p>
                    </div>
                  )}
                  <ConfidenceBadge value={p.latest_confidence} />
                  <ScoreBadge score={p.latest_score} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
