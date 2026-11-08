import Link from "next/link";
import type { Metadata } from "next";
import { SubmitButton } from "@/components/SubmitButton";
import { Card, Empty, Flash, PageHeader, ScoreBadge, StatusBadge, btn, input, label } from "@/components/ui";
import { requireOwner } from "@/lib/auth/member";
import { readFlash } from "@/lib/flash";
import { ago } from "@/lib/format";
import { mergeBySlug, resolveSuggestion } from "../actions";

export const metadata: Metadata = { title: "Products & matching" };

type P = { slug: string; canonical_name: string; function_summary: string | null; latest_score: number | null };

export default async function ProductsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { db } = await requireOwner("/admin/products");
  const [{ data: suggestions }, { data: recent }] = await Promise.all([
    db
      .from("match_suggestions")
      .select("id, confidence, reason, created_at, a:products!match_suggestions_product_id_fkey(slug, canonical_name, function_summary, latest_score), b:products!match_suggestions_candidate_product_id_fkey(slug, canonical_name, function_summary, latest_score)")
      .eq("status", "open")
      .order("confidence", { ascending: false })
      .limit(50),
    db.from("products").select("slug, canonical_name, status, latest_score, created_at").order("created_at", { ascending: false }).limit(40),
  ]);
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as P | null;

  return (
    <>
      <Flash flash={readFlash(sp)} />
      <PageHeader title="Products & matching" subtitle="Review possible duplicates the AI wasn't sure about, merge products by hand, and correct names on each product's page." />

      <Card title="Possible duplicates" subtitle="Merge only when both do the same job. Look-alikes with a different function should stay separate." className="mb-4">
        {(suggestions ?? []).length ? (
          <ul className="divide-y divide-line">
            {(suggestions ?? []).map((s) => {
              const a = one(s.a);
              const b = one(s.b);
              if (!a || !b) return null;
              return (
                <li key={s.id as string} className="grid gap-2 py-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                  <Side p={a} />
                  <Side p={b} label="Merge into" />
                  <div className="flex gap-1 md:flex-col">
                    <p className="text-xs text-muted">{Math.round(Number(s.confidence) * 100)}% · {s.reason as string}</p>
                    <form action={resolveSuggestion}><input type="hidden" name="id" value={s.id as string} /><input type="hidden" name="op" value="merge" /><SubmitButton className={btn.primary}>Same product: merge</SubmitButton></form>
                    <form action={resolveSuggestion}><input type="hidden" name="id" value={s.id as string} /><input type="hidden" name="op" value="dismiss" /><SubmitButton className={btn.secondary}>Different products</SubmitButton></form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Nothing to review" />
        )}
      </Card>

      <Card title="Merge two products" className="mb-4">
        <form action={mergeBySlug} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className={label}>Duplicate (will be merged away)</label><input name="from" required className={input} placeholder="Paste product link" /></div>
          <div><label className={label}>Keep this one</label><input name="into" required className={input} placeholder="Paste product link" /></div>
          <SubmitButton className={btn.primary} confirm="Merge these two products?">Merge</SubmitButton>
        </form>
      </Card>

      <Card title="Recently created products">
        <ul className="divide-y divide-line text-sm">
          {(recent ?? []).map((p) => (
            <li key={p.slug as string} className="flex items-center justify-between gap-2 py-2">
              <Link href={`/products/${p.slug}`} className="hover:text-accent">{p.canonical_name as string}</Link>
              <span className="flex items-center gap-2 text-xs text-muted"><StatusBadge status={p.status as string} /> {ago(p.created_at as string)} <ScoreBadge score={p.latest_score as number | null} /></span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Side({ p, label: l }: { p: P; label?: string }) {
  return (
    <div className="rounded-lg border border-line p-2">
      {l && <p className="text-[11px] uppercase tracking-wide text-muted">{l}</p>}
      <Link href={`/products/${p.slug}`} className="font-medium hover:text-accent">{p.canonical_name}</Link> <ScoreBadge score={p.latest_score} />
      <p className="text-xs text-muted">{p.function_summary ?? "Function unknown"}</p>
    </div>
  );
}
