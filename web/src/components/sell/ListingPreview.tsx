import { conditionLabel, formatPrice } from "@/lib/format";
import { formatAttribute, type AttributeField } from "@/lib/sell/attributes";
import { DAMAGE_QUESTIONS, IMAGE_TYPE_LABELS, type ListingRecord } from "@/lib/sell/listing";
import type { ListingPhoto } from "@/lib/sell/server";

/** What buyers will see on the listing page, built from the seller's saved draft. */
export function ListingPreview({
  listing,
  photos,
  fields,
  categoryName,
  catalogModel,
}: {
  listing: ListingRecord;
  photos: ListingPhoto[];
  fields: AttributeField[];
  categoryName: string;
  catalogModel: string | null;
}) {
  const cover = photos[0];
  const condition = conditionLabel(listing.condition_score);
  const attrs = fields
    .map((f) => ({ label: f.label, value: formatAttribute(f, (listing.attributes as Record<string, never>)[f.key]) }))
    .filter((a): a is { label: string; value: string } => a.value != null);
  const location = [listing.location_city, listing.location_state].filter(Boolean).join(", ");
  const yes = DAMAGE_QUESTIONS.filter((q) => listing[q.column] === true);
  const unanswered = DAMAGE_QUESTIONS.some((q) => listing[q.column] == null);

  return (
    <article className="grid gap-6 md:grid-cols-[1.2fr_1fr]" aria-label="Listing preview">
      <div className="grid content-start gap-2">
        <div className="aspect-[4/3] overflow-hidden rounded-lg border border-line bg-paper">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={cover.alt ?? listing.title} className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-ink-soft">No photos yet</div>
          )}
        </div>
        {photos.length > 1 && (
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.slice(1).map((p) => (
              <li key={p.id} className="aspect-square overflow-hidden rounded border border-line bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.alt ?? IMAGE_TYPE_LABELS[p.imageType]} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid content-start gap-4">
        <div className="grid gap-1">
          <p className="eyebrow">{categoryName}</p>
          <h2 className="text-2xl font-bold">{listing.title}</h2>
          <p className="font-mono text-3xl">{listing.asking_price_cents != null ? formatPrice(listing.asking_price_cents) : "No price yet"}</p>
          <p className="text-sm text-ink-soft">
            {[listing.accepts_offers ? "Accepts offers" : "Price is firm", location ? `Ships from ${location}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="rounded-md border border-line p-3">
          <p className="font-semibold">
            Cosmetic condition: {listing.condition_score != null ? `${listing.condition_score}/10 · ${condition}` : "not set"}
          </p>
          {listing.cosmetic_wear && <p className="mt-1 text-sm text-ink-soft">{listing.cosmetic_wear}</p>}
        </div>

        <div className="rounded-md border border-line p-3">
          <p className="font-semibold">Damage disclosure</p>
          {yes.length > 0 && <p className="mt-1 text-sm">The seller reports:</p>}
          {unanswered ? (
            <p className="mt-1 text-sm text-danger">Not every damage question is answered yet.</p>
          ) : yes.length === 0 ? (
            <p className="mt-1 text-sm">
              {listing.structural_disclosure === "unknown"
                ? "The seller answered no to every damage question but isn't sure about hidden structural damage."
                : "The seller reports no cracks, rattles, loose end caps, repairs, alterations or significant damage."}
            </p>
          ) : (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {yes.map((q) => (
                <li key={q.key}>{q.short}</li>
              ))}
            </ul>
          )}
          {listing.damage_disclosure && <p className="mt-2 text-sm">{listing.damage_disclosure}</p>}
        </div>

        {(attrs.length > 0 || catalogModel) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {catalogModel && (
              <>
                <dt className="text-ink-soft">Catalog model</dt>
                <dd>{catalogModel}</dd>
              </>
            )}
            {attrs.map((a) => (
              <div key={a.label} className="contents">
                <dt className="text-ink-soft">{a.label.replace(/ \((oz|in)\)$/, "")}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {listing.description && <p className="whitespace-pre-line text-sm">{listing.description}</p>}

        <p className="text-xs text-ink-soft">
          Condition, specs and damage answers come from the seller. The marketplace doesn&apos;t inspect or certify the safety of used
          equipment.
        </p>
      </div>
    </article>
  );
}
