import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { NotConfigured } from "@/components/site/states";
import { listCorrections } from "@/lib/data/public";
import { humanize } from "@/lib/editorial";
import { formatDateTime } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: "Corrections",
  description: "Every correction Aged Takes has made, with the date, what changed and why. Corrections are permanent.",
  path: "/corrections",
});

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CorrectionsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(typeof sp.page === "string" ? sp.page : 1) || 1);
  const data = await listCorrections(page);
  if (!data) return <NotConfigured />;

  return (
    <div className="wrap max-w-4xl py-12">
      <PageHeader kicker="Accountability applies to us too" title="Corrections">
        When we get something wrong, we fix it, date it and say what changed. Published text is never silently edited — the database refuses changes that don&apos;t go through this log.{" "}
        <Link href="/methodology#corrections" className="link">Our correction policy</Link>.
      </PageHeader>
      {data.items.length === 0 ? (
        <EmptyState title="No corrections yet." />
      ) : (
        <ol className="space-y-8">
          {data.items.map((k) => {
            const target = k.case
              ? { href: `/cases/${k.case.slug}`, label: k.case.title, demo: k.case.is_demo }
              : k.prediction
                ? { href: `/people/${k.prediction.person_slug}`, label: `Prediction by ${k.prediction.person_name}: “${k.prediction.text}”`, demo: false }
                : k.statement
                  ? { href: `/people/${k.statement.person_slug}`, label: `Statement by ${k.statement.person_name}`, demo: false }
                  : null;
            return (
              <li key={k.id} className="border-l-[3px] border-amber pl-5">
                <p className="meta">{formatDateTime(k.created_at)}{k.field ? ` · ${humanize(k.field)}` : ""}</p>
                {target && <Link href={target.href} className="headline mt-1 block text-xl hover:text-red-ink">{target.label}</Link>}
                {target?.demo && <DemoBadge className="mt-1" />}
                <p className="mt-2 text-ink-2"><strong>Why:</strong> {k.reason}</p>
                {k.previous_text && <p className="meta mt-2"><span className="kicker mr-1">Before</span> <span className="line-through decoration-red/60">{k.previous_text}</span></p>}
                {k.corrected_text && <p className="meta mt-1"><span className="kicker mr-1">After</span> {k.corrected_text}</p>}
              </li>
            );
          })}
        </ol>
      )}
      <Pagination page={page} total={data.total} pageSize={50} basePath="/corrections" params={{}} />
    </div>
  );
}
