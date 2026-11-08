import Link from "next/link";
import type { Metadata } from "next";
import { ConfidenceBadge, Empty, PageHeader, ScoreBadge, StatusBadge, Thumb, Unknown, input } from "@/components/ui";
import { requireMember } from "@/lib/auth/member";
import { ago, range } from "@/lib/format";

export const metadata: Metadata = { title: "Early opportunities" };

const SORTS = {
  score: { col: "latest_score", label: "Opportunity" },
  acceleration: { col: "latest_acceleration", label: "Acceleration" },
  competition: { col: "latest_competition", label: "Competition" },
  first: { col: "first_observed_at", label: "First detected" },
  creators: { col: "latest_creators", label: "Creators" },
  price: { col: "suggested_price_low", label: "Est. price" },
  confidence: { col: "latest_confidence", label: "Confidence" },
} as const;
type SortKey = keyof typeof SORTS;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireMember("/opportunities");
  const sort: SortKey = (Object.keys(SORTS) as SortKey[]).includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "score";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const view = ["active", "saturated", "all"].includes(sp.view ?? "") ? sp.view! : "active";
  const min = Math.max(0, Math.min(100, Number(sp.min ?? 0) || 0));
  const confidence = ["high", "medium", "low"].includes(sp.confidence ?? "") ? sp.confidence! : "";
  const q = (sp.q ?? "").trim().slice(0, 80);

  let query = db
    .from("products")
    .select("id, slug, canonical_name, primary_image_url, status, latest_score, latest_acceleration, latest_competition, latest_creators, latest_confidence, first_observed_at, first_observed_platform, suggested_price_low, suggested_price_high")
    .order(SORTS[sort].col, { ascending: dir === "asc", nullsFirst: false })
    .limit(200);
  if (view === "active") query = query.in("status", ["new", "tracking"]);
  else if (view === "saturated") query = query.eq("status", "saturated");
  else query = query.not("status", "in", "(merged,not_a_product)");
  if (min > 0) query = query.gte("latest_score", min);
  if (confidence) query = query.eq("latest_confidence", confidence);
  if (q) query = query.ilike("canonical_name", `%${q.replace(/[%_]/g, "")}%`);
  const { data, error } = await query;
  const rows = data ?? [];

  const href = (k: SortKey) => {
    const p = new URLSearchParams({ ...(sp as Record<string, string>), sort: k, dir: sort === k && dir === "desc" ? "asc" : "desc" });
    return `/opportunities?${p}`;
  };
  const th = (k: SortKey, align = "text-right") => (
    <th className={`px-3 py-2 ${align} font-medium`}>
      <Link href={href(k)} className="hover:text-accent">
        {SORTS[k].label}
        {sort === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
      </Link>
    </th>
  );

  return (
    <>
      <PageHeader
        title="Early opportunities"
        subtitle="Every tracked product, sortable. Competition: higher means fewer promoters seen (monitored sources only). Prices are AI estimates."
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/opportunities">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={q} className={`${input} w-56`} placeholder="Product name" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="view">Show</label>
          <select id="view" name="view" defaultValue={view} className={input}>
            <option value="active">Active (new & tracking)</option>
            <option value="saturated">Saturated</option>
            <option value="all">All</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="min">Min score</label>
          <input id="min" name="min" type="number" min={0} max={100} defaultValue={min || ""} className={`${input} w-24`} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted" htmlFor="confidence">Confidence</label>
          <select id="confidence" name="confidence" defaultValue={confidence} className={input}>
            <option value="">Any</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <button className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-accent/50">Apply</button>
      </form>

      {error && <p className="mb-4 rounded-lg bg-bad-wash p-3 text-sm text-bad">Couldn&apos;t load products: {error.message}</p>}
      {!rows.length ? (
        <Empty title="No products match">Products appear once monitoring finds them or you submit a URL. Try showing all products or lowering the minimum score.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-canvas text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                {th("score")}
                {th("acceleration")}
                {th("competition")}
                {th("first", "text-left")}
                {th("creators")}
                {th("price")}
                {th("confidence", "text-left")}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-canvas">
                  <td className="px-3 py-2">
                    <Link href={`/products/${p.slug}`} className="flex items-center gap-3">
                      <Thumb src={p.primary_image_url} alt="" size={40} />
                      <span className="font-medium hover:text-accent">{p.canonical_name}</span>
                      {p.status !== "tracking" && <StatusBadge status={p.status} />}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right"><ScoreBadge score={p.latest_score} /></td>
                  <td className="tabular px-3 py-2 text-right">{p.latest_acceleration !== null ? `×${Number(p.latest_acceleration).toFixed(1)}` : <Unknown label="—" />}</td>
                  <td className="tabular px-3 py-2 text-right">{p.latest_competition !== null ? Number(p.latest_competition).toFixed(0) : <Unknown label="—" />}</td>
                  <td className="px-3 py-2 text-left text-xs">
                    {p.first_observed_at ? <><span>{ago(p.first_observed_at)}</span><span className="block text-muted">{p.first_observed_platform}</span></> : <Unknown />}
                  </td>
                  <td className="tabular px-3 py-2 text-right">{p.latest_creators ?? <Unknown label="—" />}</td>
                  <td className="tabular px-3 py-2 text-right">{range(p.suggested_price_low, p.suggested_price_high) ?? <Unknown label="not estimated" />}</td>
                  <td className="px-3 py-2"><ConfidenceBadge value={p.latest_confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
