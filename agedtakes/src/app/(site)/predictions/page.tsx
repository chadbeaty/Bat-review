import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Pagination } from "@/components/ui";
import { PredictionCard } from "@/components/predictions";
import { NotConfigured } from "@/components/site/states";
import { getFilters, listPredictions, PREDICTIONS_PAGE_SIZE } from "@/lib/data/public";
import { PREDICTION_STATUSES, PREDICTION_STATUS_LABELS } from "@/lib/editorial";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Prediction scoreboard",
  description: "Public predictions recorded word for word, with targets, deadlines, resolution criteria and outcomes. Open predictions are never counted as wrong.",
  path: "/predictions",
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function PredictionsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const status = PREDICTION_STATUSES.includes(one(sp.status) as never) ? one(sp.status) : undefined;
  const person = one(sp.person);
  const q = one(sp.q)?.slice(0, 120);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [result, filters] = await Promise.all([listPredictions({ status, person, q, page }), getFilters()]);
  if (!result || !filters) return <NotConfigured />;
  const counts = result.counts ?? {};
  const resolvedTotal = (counts.resolved_correct ?? 0) + (counts.resolved_incorrect ?? 0) + (counts.partially_correct ?? 0);

  const href = (s?: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (person) p.set("person", person);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/predictions?${qs}` : "/predictions";
  };

  return (
    <div className="wrap py-12">
      <PageHeader kicker="The scoreboard" title="Predictions">
        Recorded word for word on the day they were made. Scored only when the stated deadline and resolution criteria are met. The original wording is never edited — any correction is logged publicly.
      </PageHeader>

      <div className="mb-8 grid gap-4 border border-ink p-5 sm:grid-cols-3">
        <div>
          <p className="kicker">Resolved</p>
          <p className="headline text-4xl">{resolvedTotal}</p>
          <p className="meta">{counts.resolved_correct ?? 0} correct · {counts.resolved_incorrect ?? 0} incorrect · {counts.partially_correct ?? 0} partial</p>
        </div>
        <div>
          <p className="kicker">Open</p>
          <p className="headline text-4xl">{counts.open ?? 0}</p>
          <p className="meta">Not counted as right or wrong</p>
        </div>
        <div>
          <p className="kicker">Excluded</p>
          <p className="headline text-4xl">{(counts.unscorable ?? 0) + (counts.disputed ?? 0)}</p>
          <p className="meta">{counts.unscorable ?? 0} unscorable · {counts.disputed ?? 0} disputed</p>
        </div>
      </div>

      <nav aria-label="Filter by status" className="mb-6 flex flex-wrap gap-2">
        <Link href={href()} className={`btn btn-sm ${status ? "btn-ghost" : ""}`}>All</Link>
        {PREDICTION_STATUSES.map((s) => (
          <Link key={s} href={href(s)} className={`btn btn-sm ${status === s ? "" : "btn-ghost"}`}>
            {PREDICTION_STATUS_LABELS[s]} ({counts[s] ?? 0})
          </Link>
        ))}
      </nav>

      <form className="mb-8 flex flex-col gap-3 sm:flex-row" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" type="search" defaultValue={q} placeholder="Asset or wording…" className="field sm:max-w-sm" aria-label="Search predictions" />
        <select name="person" defaultValue={person ?? ""} className="field sm:max-w-xs" aria-label="Person">
          <option value="">Anyone</option>
          {filters.people.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>

      {result.items.length === 0 ? <EmptyState title="No predictions match." /> : result.items.map((p) => <PredictionCard key={p.id} p={p} />)}
      <Pagination page={page} total={result.total} pageSize={PREDICTIONS_PAGE_SIZE} basePath="/predictions" params={{ status, person, q }} />
    </div>
  );
}
