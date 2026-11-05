import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, Pagination, PersonCard } from "@/components/ui";
import { NotConfigured } from "@/components/site/states";
import { getFilters, listPeople, PEOPLE_PAGE_SIZE } from "@/lib/data/public";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "People we track",
  description: "The public figures whose statements, predictions and commitments Aged Takes records — with transparent track records and original sources.",
  path: "/people",
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const SORTS = [
  ["recent", "Recently updated"],
  ["investigated", "Most investigated"],
  ["followed", "Most followed"],
  ["name", "Name A–Z"],
] as const;

export default async function PeoplePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = one(sp.q)?.slice(0, 100);
  const category = one(sp.category);
  const sort = SORTS.some(([k]) => k === one(sp.sort)) ? one(sp.sort)! : "recent";
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [result, filters] = await Promise.all([listPeople({ q, category, sort, page }), getFilters()]);
  if (!result || !filters) return <NotConfigured />;

  const groups = [
    { kind: "person", label: "Category" },
    { kind: "industry", label: "Industry" },
    { kind: "topic", label: "Topic" },
  ] as const;

  return (
    <div className="wrap py-12">
      <PageHeader kicker="The directory" title="People">
        Public figures whose statements we record. Being listed here is not an allegation: it means we track what they say publicly, and what happened next.
      </PageHeader>

      <form className="mb-8 grid gap-3 border-b border-rule pb-6 md:grid-cols-[2fr_repeat(4,1fr)_auto]" role="search">
        <div>
          <label className="label" htmlFor="q">Name or keyword</label>
          <input id="q" name="q" type="search" defaultValue={q} className="field" placeholder="e.g. Quint" />
        </div>
        <div className="md:col-span-3">
          <label className="label" htmlFor="category">Category, industry or topic</label>
          <select id="category" name="category" defaultValue={category ?? ""} className="field">
            <option value="">Any</option>
            {groups.map((g) => (
              <optgroup key={g.kind} label={g.label}>
                {filters.categories.filter((c) => c.kind === g.kind).map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="sort">Sort</label>
          <select id="sort" name="sort" defaultValue={sort} className="field">
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn" type="submit">Filter</button>
          {(q || category || sort !== "recent") && <Link href="/people" className="btn btn-ghost">Clear</Link>}
        </div>
      </form>

      <p className="meta mb-2">{result.total} {result.total === 1 ? "person" : "people"}</p>
      {result.items.length === 0 ? (
        <EmptyState title="No one matches those filters.">Try a broader search, or <Link className="link" href="/submit">submit someone we should track</Link>.</EmptyState>
      ) : (
        <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((p) => <PersonCard key={p.id} person={p} />)}
        </div>
      )}
      <Pagination page={page} total={result.total} pageSize={PEOPLE_PAGE_SIZE} basePath="/people" params={{ q, category, sort }} />
    </div>
  );
}
