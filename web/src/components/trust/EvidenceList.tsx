import type { EvidenceLink } from "@/lib/trust/disputes-server";

/** Links (and image previews) for evidence files; the URLs are short-lived signed links. */
export function EvidenceList({ items }: { items: EvidenceLink[] }) {
  if (!items.length) return <p className="text-sm text-ink-soft">No photos attached.</p>;
  return (
    <ul className="flex flex-wrap gap-3" data-testid="evidence">
      {items.map((e, i) => (
        <li key={e.path}>
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="grid gap-1 text-sm font-semibold underline">
            {!e.isPdf && (
              // Signed storage URL; next/image would need the storage host configured.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.url} alt={`Evidence ${i + 1}`} className="h-28 w-28 rounded-md border border-line object-cover" />
            )}
            {e.isPdf ? `Evidence ${i + 1} (PDF)` : `Evidence ${i + 1}`}
          </a>
        </li>
      ))}
    </ul>
  );
}
