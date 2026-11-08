import Link from "next/link";
import { ConfidenceBadge, Empty, ScoreBadge, Thumb } from "@/components/ui";
import { ago } from "@/lib/format";

export type ProductListItem = {
  id: string;
  slug: string;
  canonical_name: string;
  primary_image_url: string | null;
  latest_score: number | null;
  latest_confidence: string | null;
  first_observed_at: string | null;
  meta?: string;
};

export function ProductList({ items, empty }: { items: ProductListItem[]; empty: string }) {
  if (!items.length) return <Empty title={empty} />;
  return (
    <ul className="divide-y divide-line">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/products/${p.slug}`} className="flex items-center gap-3 py-2 hover:bg-canvas">
            <Thumb src={p.primary_image_url} alt="" size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.canonical_name}</p>
              <p className="truncate text-xs text-muted">{p.meta ?? (p.first_observed_at ? `First seen ${ago(p.first_observed_at)}` : "First appearance unknown")}</p>
            </div>
            <ConfidenceBadge value={p.latest_confidence} />
            <ScoreBadge score={p.latest_score} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
