import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { searchArchive } from "@/lib/data/public";
import { formatShortDate } from "@/lib/format";
import { PREDICTION_STATUS_LABELS, type PredictionStatus } from "@/lib/editorial";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Search the archive",
  description: "Search people, statements, predictions and investigations.",
  path: "/search",
  noindex: true,
});

type Search = Promise<Record<string, string | string[] | undefined>>;
const KINDS = [["person", "People"], ["case", "Investigations"], ["statement", "Statements"], ["prediction", "Predictions"]] as const;

export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 200);
  const kind = KINDS.some(([k]) => k === sp.kind) ? (sp.kind as string) : undefined;
  const results = q ? await searchArchive(q, kind ? [kind] : undefined).catch(() => null) : [];

  return (
    <div className="wrap max-w-4xl py-12">
      <PageHeader kicker="The archive" title="Search" />
      <form role="search" className="mb-8 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="search-q" className="sr-only">Search</label>
        <input id="search-q" name="q" type="search" defaultValue={q} autoFocus placeholder="A name, an asset, a phrase…" className="field !text-lg" />
        <select name="kind" defaultValue={kind ?? ""} className="field sm:max-w-[12rem]" aria-label="Type">
          <option value="">Everything</option>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn" type="submit">Search</button>
      </form>

      {results === null && <EmptyState title="Search is unavailable right now." />}
      {q && results && results.length === 0 && <EmptyState title={`Nothing found for “${q}”.`}>Try a shorter phrase or a person&apos;s surname.</EmptyState>}
      {results && results.length > 0 && (
        <ol>
          {results.map((r) => {
            const href = r.kind === "case" ? `/cases/${r.slug}` : `/people/${r.person_slug}`;
            return (
              <li key={`${r.kind}-${r.id}`} className="border-t border-rule py-4">
                <p className="kicker">{KINDS.find(([k]) => k === r.kind)?.[1]}{r.kind !== "person" ? ` · ${r.person_name}` : ""}{r.occurred_at ? ` · ${formatShortDate(r.occurred_at)}` : ""}</p>
                <Link href={href} className="headline mt-1 block text-xl hover:text-red-ink">{r.kind === "statement" || r.kind === "prediction" ? `“${r.title}”` : r.title}</Link>
                {r.snippet && <p className="mt-1 text-ink-2">{r.kind === "prediction" ? PREDICTION_STATUS_LABELS[r.snippet as PredictionStatus] ?? r.snippet : r.snippet}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
