import type { Metadata } from "next";
import Link from "next/link";
import { CaseCard, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { NotConfigured } from "@/components/site/states";
import { CASES_PAGE_SIZE, getFilters, listCases } from "@/lib/data/public";
import { CASE_TYPES, CASE_TYPE_LABELS, CONFIDENCE, CONFIDENCE_LEVELS } from "@/lib/editorial";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Investigations archive",
  description: "Every Aged Takes investigation: original statements, what happened next, the evidence and its confidence classification.",
  path: "/cases",
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function CasesPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const params = {
    q: one(sp.q)?.slice(0, 120),
    person: one(sp.person),
    category: one(sp.category),
    type: CASE_TYPES.includes(one(sp.type) as never) ? one(sp.type) : undefined,
    confidence: CONFIDENCE_LEVELS.includes(one(sp.confidence) as never) ? one(sp.confidence) : undefined,
    resolved: ["resolved", "unresolved"].includes(one(sp.resolved) ?? "") ? one(sp.resolved) : undefined,
    from: isDate(one(sp.from)),
    to: isDate(one(sp.to)),
  };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [result, filters] = await Promise.all([listCases({ ...params, page }), getFilters()]);
  if (!result || !filters) return <NotConfigured />;
  const filtered = Object.values(params).some(Boolean);

  return (
    <div className="wrap py-12">
      <PageHeader kicker="The archive" title="Investigations">
        Each case records what was said, when, in what context — and what the record shows happened next. Every claim links to its source.
      </PageHeader>

      <form className="mb-10 grid gap-3 border-b border-rule pb-6 sm:grid-cols-2 lg:grid-cols-4" role="search">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={params.q} className="field" placeholder="Person, asset, claim…" />
        </div>
        <Select name="person" label="Person" value={params.person} options={filters.people.map((p) => [p.slug, p.name])} />
        <Select name="category" label="Category" value={params.category} options={filters.categories.map((c) => [c.slug, c.name])} />
        <Select name="type" label="Case type" value={params.type} options={CASE_TYPES.map((t) => [t, CASE_TYPE_LABELS[t]])} />
        <Select name="confidence" label="Evidence confidence" value={params.confidence} options={CONFIDENCE_LEVELS.filter((l) => CONFIDENCE[l].publishable).map((l) => [l, CONFIDENCE[l].label])} />
        <Select name="resolved" label="Status" value={params.resolved} options={[["resolved", "Resolved"], ["unresolved", "Unresolved / disputed"]]} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="from">Published from</label>
            <input id="from" name="from" type="date" defaultValue={params.from} className="field" />
          </div>
          <div>
            <label className="label" htmlFor="to">to</label>
            <input id="to" name="to" type="date" defaultValue={params.to} className="field" />
          </div>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="btn" type="submit">Apply filters</button>
          {filtered && <Link href="/cases" className="btn btn-ghost">Clear</Link>}
        </div>
      </form>

      <p className="meta mb-4">{result.total} investigation{result.total === 1 ? "" : "s"}</p>
      {result.items.length === 0 ? (
        <EmptyState title={filtered ? "No investigations match." : "No investigations published yet."}>
          {filtered ? "Try removing a filter." : "Every case is checked by an editor before it appears here."}
        </EmptyState>
      ) : (
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {result.items.map((c) => <CaseCard key={c.id} item={c} />)}
        </div>
      )}
      <Pagination page={page} total={result.total} pageSize={CASES_PAGE_SIZE} basePath="/cases" params={params} />
    </div>
  );
}

function Select({ name, label, value, options }: { name: string; label: string; value?: string; options: (readonly [string, string])[] | string[][] }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={value ?? ""} className="field">
        <option value="">Any</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
