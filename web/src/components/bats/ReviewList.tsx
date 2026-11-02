import type { PublishedReview } from "@/lib/bats";
import { REVIEW_KIND_LABELS } from "@/lib/bat-display";

export function ReviewList({ title, note, reviews, testId }: { title: string; note?: string; reviews: PublishedReview[]; testId?: string }) {
  return (
    <div className="grid gap-3" data-testid={testId}>
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        {note && <p className="text-sm text-ink-soft">{note}</p>}
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {reviews.map((r) => (
          <li key={r.id} className="card grid content-start gap-2 p-4">
            <p className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
              <span className="rounded-sm border border-line-strong px-1.5 py-0.5 font-medium">{REVIEW_KIND_LABELS[r.kind] ?? r.kind}</span>
              <span>{r.source}</span>
              {r.publishedOn && <span>{r.publishedOn}</span>}
              {r.ratingText && <span className="font-semibold text-ink">Source rating: {r.ratingText}</span>}
            </p>
            <a href={r.url} rel="nofollow noopener" target="_blank" className="font-semibold underline">
              {r.title}
            </a>
            {r.summary && <p className="text-sm">{r.summary}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
