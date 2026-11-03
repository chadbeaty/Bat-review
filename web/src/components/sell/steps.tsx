"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  addPhoto,
  publishListing,
  removePhoto,
  saveDetails,
  saveDisclosures,
  savePrice,
  saveShipping,
  updatePhotos,
} from "@/app/sell/actions";
import { createClient } from "@/lib/supabase/client";
import { CONDITION_LABELS, conditionLabel, formatPrice } from "@/lib/format";
import { sellerProceedsBeforeProcessing } from "@/lib/fees";
import { listingPath } from "@/lib/paths";
import { optionLabel, type AttributeField } from "@/lib/sell/attributes";
import {
  DAMAGE_QUESTIONS,
  BAT_PHOTO_SLOTS,
  IMAGE_TYPES,
  IMAGE_TYPE_LABELS,
  MAX_PHOTOS,
  PHOTO_TYPES,
  STANDARD_BAT_BOX,
  STEPS,
  listingPhotoPath,
  missingForPublish,
  ozToLb,
  parseDollars,
  photoProblem,
  slotSummary,
  suggestTitle,
  type DamageKey,
} from "@/lib/sell/listing";
import { ListingPreview } from "./ListingPreview";
import { resizeImage } from "./resize-image";
import { ErrorBanner, FieldError, StepActions, StepHeader, YesNo, inputClass, useWizard } from "./ui";

function useSnapshot() {
  const w = useWizard();
  if (!w.snapshot) throw new Error("No listing yet");
  return { w, s: w.snapshot };
}

// ---------------------------------------------------------------------------
// Step 4: details
// ---------------------------------------------------------------------------

type RawValues = Record<string, string | string[]>;

function toRaw(fields: AttributeField[], attrs: Record<string, unknown>): RawValues {
  const out: RawValues = {};
  for (const f of fields) {
    const v = attrs[f.key];
    if (f.type === "multiselect") out[f.key] = Array.isArray(v) ? v.map(String) : [];
    else out[f.key] = v == null ? "" : String(v);
  }
  return out;
}

export function DetailsStep() {
  const { w, s } = useSnapshot();
  const fields = s.category.fields;
  const [values, setValues] = useState<RawValues>(() => toRaw(fields, s.listing.attributes));
  const [condition, setCondition] = useState(s.listing.condition_score ? String(s.listing.condition_score) : "");
  const [description, setDescription] = useState(s.listing.description ?? "");
  const modelText = s.product?.name ?? s.submission?.modelName ?? null;
  const suggestion = (v: RawValues) =>
    suggestTitle({
      modelYear: v.model_year ? Number(v.model_year) : s.product?.modelYear,
      brand: s.manufacturer?.name,
      model: modelText,
      stamps: Array.isArray(v.certification) ? v.certification : null,
      weightOz: v.weight_oz ? Number(v.weight_oz) : null,
      fallback: s.category.name,
    });
  const [title, setTitle] = useState(s.listing.title);
  // Keep following the suggestion until the seller types their own title.
  const [auto, setAuto] = useState(() => s.listing.title === suggestion(toRaw(fields, s.listing.attributes)) || s.listing.title === suggestion({}));

  const update = (key: string, v: string | string[]) => {
    const next = { ...values, [key]: v };
    setValues(next);
    if (auto) setTitle(suggestion(next));
  };

  const fromCatalog = s.product ? Object.keys(s.product.prefill) : [];

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        w.run(
          () => saveDetails(s.listing.id, { title, description, conditionScore: condition ? Number(condition) : undefined, attributes: values }),
          w.published ? undefined : "photos"
        );
      }}
    >
      <StepHeader
        title="Item details"
        intro={
          s.product
            ? "We filled in what the catalog lists for this model. Check each value against your item and change anything that's different."
            : "Fill in what you can see on the item."
        }
      />
      <ErrorBanner />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <AttributeInput key={f.key} field={f} value={values[f.key]} onChange={(v) => update(f.key, v)} error={w.errors[`attributes.${f.key}`]} fromCatalog={fromCatalog.includes(f.key)} listedWeights={f.key === "weight_oz" ? s.product?.listedWeights : undefined} />
        ))}
      </div>

      <label className="field" htmlFor="condition">
        <span>Cosmetic condition</span>
        <select
          id="condition"
          className={inputClass(w.errors.conditionScore)}
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          aria-invalid={Boolean(w.errors.conditionScore)}
          aria-describedby="h-condition"
        >
          <option value="">Choose a score</option>
          {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}/10 · {CONDITION_LABELS[n] ?? conditionLabel(n)}
            </option>
          ))}
        </select>
        <span id="h-condition" className="text-sm font-normal text-ink-soft">
          Looks only: paint, scuffs and graphics. You&apos;ll answer questions about damage in step 8.
        </span>
        <FieldError id="e-condition" message={w.errors.conditionScore} />
      </label>

      <label className="field" htmlFor="title">
        <span>Title</span>
        <input
          id="title"
          className={inputClass(w.errors.title)}
          value={title}
          maxLength={120}
          onChange={(e) => {
            setTitle(e.target.value);
            setAuto(false);
          }}
          aria-invalid={Boolean(w.errors.title)}
          aria-describedby={w.errors.title ? "e-title" : "h-title"}
        />
        {!w.errors.title && (
          <span id="h-title" className="text-sm font-normal text-ink-soft">
            Suggested from the year, brand, model and weight. Edit it if you like.
            {!auto && title !== suggestion(values) && (
              <>
                {" "}
                <button
                  type="button"
                  className="font-semibold text-ink underline"
                  onClick={() => {
                    setTitle(suggestion(values));
                    setAuto(true);
                  }}
                >
                  Use “{suggestion(values)}”
                </button>
              </>
            )}
          </span>
        )}
        <FieldError id="e-title" message={w.errors.title} />
      </label>

      <label className="field" htmlFor="description">
        <span>
          Description <span className="font-normal text-ink-soft">(optional)</span>
        </span>
        <textarea
          id="description"
          rows={4}
          className={inputClass(w.errors.description)}
          value={description}
          maxLength={5000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="How much it's been used, grip, anything a buyer should know"
        />
        <FieldError id="e-description" message={w.errors.description} />
      </label>
      <StepActions back={w.published ? undefined : "model"} />
    </form>
  );
}

function AttributeInput({
  field,
  value,
  onChange,
  error,
  fromCatalog,
  listedWeights,
}: {
  field: AttributeField;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  error?: string;
  fromCatalog: boolean;
  listedWeights?: number[];
}) {
  const id = `attr-${field.key}`;
  const optional = !field.required && <span className="font-normal text-ink-soft"> (optional)</span>;
  const hint = [field.help ?? null, fromCatalog ? "From the catalog. Confirm it matches." : null, listedWeights?.length ? `Listed weights: ${listedWeights.join(", ")} oz.` : null]
    .filter(Boolean)
    .join(" ");
  const describedBy = error ? `e-${id}` : hint ? `h-${id}` : undefined;
  const help = (
    <>
      {hint && !error && (
        <span id={`h-${id}`} className="text-sm font-normal text-ink-soft">
          {hint}
        </span>
      )}
      <FieldError id={`e-${id}`} message={error} />
    </>
  );

  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid gap-2 sm:col-span-2" aria-describedby={describedBy}>
        <legend className="font-medium">
          {field.label}
          {optional}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const v = String(o);
            const on = selected.includes(v);
            return (
              <label key={v} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${on ? "border-ink bg-paper" : "border-line-strong"}`}>
                <input type="checkbox" checked={on} onChange={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])} />
                {optionLabel(o)}
              </label>
            );
          })}
        </div>
        {help}
      </fieldset>
    );
  }
  const str = typeof value === "string" ? value : "";
  return (
    <label className="field" htmlFor={id}>
      <span>
        {field.label}
        {optional}
      </span>
      {field.options?.length ? (
        <select id={id} className={inputClass(error)} value={str} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy}>
          <option value="">Choose</option>
          {field.options.map((o) => (
            <option key={String(o)} value={String(o)}>
              {optionLabel(o)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={inputClass(error)}
          value={str}
          inputMode={field.type === "number" ? "decimal" : undefined}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      )}
      {help}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Step 5: photos
// ---------------------------------------------------------------------------

type Upload = { key: string; name: string; status: "uploading" | "failed"; message?: string };

export function PhotosStep() {
  const { w, s } = useSnapshot();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const checklist = s.category.photos;
  const isBat = s.category.slug === "bats";
  const slotTypes = new Set(BAT_PHOTO_SLOTS.map((x) => x.type));
  const summary = slotSummary(s.photos);
  const extraPhotos = isBat ? s.photos.filter((p) => !slotTypes.has(p.imageType)) : s.photos;
  const have = new Set(s.photos.map((p) => p.imageType));

  const nextType = (taken: Set<string>) => checklist.find((c) => !taken.has(c.type) && !c.optional)?.type ?? "other";

  async function handleFiles(files: FileList | null, slot?: { type: string; replaceIds?: string[] }) {
    if (!files?.length) return;
    const supabase = createClient();
    if (!supabase) return w.setError("Photo uploads aren't available: the database isn't connected.");
    const list = [...files];
    const errs: string[] = [];
    const room = MAX_PHOTOS - s.photos.length + (slot?.replaceIds?.length ?? 0);
    if (list.length > room) errs.push(`A listing can have up to ${MAX_PHOTOS} photos, so only the first ${Math.max(room, 0)} will be added.`);
    const accepted = list.slice(0, Math.max(room, 0)).filter((f) => {
      const p = photoProblem(f);
      if (p) errs.push(p);
      return !p;
    });
    setProblems(errs);
    if (!accepted.length) return;
    setBusy(true);
    const taken = new Set(have);
    for (const file of accepted) {
      const key = crypto.randomUUID();
      setUploads((u) => [...u, { key, name: file.name, status: "uploading" }]);
      try {
        const { blob, type, ext } = await resizeImage(file);
        const path = listingPhotoPath(w.userId, s.listing.id, crypto.randomUUID().replace(/-/g, ""), ext);
        const { error } = await supabase.storage.from("listing-images").upload(path, blob, { contentType: type, upsert: false, cacheControl: "31536000" });
        if (error) throw new Error("upload");
        const imageType = slot?.type ?? nextType(taken);
        taken.add(imageType);
        // Replacing a slot's photo: drop the old one first so a 12-photo listing can still swap.
        for (const oldId of slot?.replaceIds ?? []) await w.run(() => removePhoto(s.listing.id, oldId));
        const r = await w.run(() => addPhoto(s.listing.id, { path, imageType }));
        if (!r.ok) throw new Error(r.error ?? "save");
        setUploads((u) => u.filter((x) => x.key !== key));
      } catch (err) {
        const message = err instanceof Error && err.message !== "upload" && err.message !== "save" ? err.message : "Upload failed. Try again.";
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "failed", message } : x)));
      }
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  const save = (order: { id: string; imageType: string }[]) => w.run(() => updatePhotos(s.listing.id, order));
  const ordered = s.photos.map((p) => ({ id: p.id, imageType: p.imageType }));
  const move = (i: number, d: -1 | 1) => {
    const next = [...ordered];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    save(next);
  };

  return (
    <div className="grid gap-5">
      <StepHeader
        title="Photos"
        intro={`Clear, well-lit photos sell faster. Add up to ${MAX_PHOTOS}; the first one is the cover. At least one is needed to publish.`}
      />
      <ErrorBanner />
      {isBat && (
        <div className="grid gap-3" data-testid="photo-slots">
          <p className="text-sm text-ink-soft" role="status">
            {summary.missingEncouraged.length === 0
              ? "Every main photo is in. Buyers will thank you."
              : `Still missing: ${summary.missingEncouraged.map((t) => IMAGE_TYPE_LABELS[t]).join(", ")}.`}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {BAT_PHOTO_SLOTS.map((slot) => {
              const mine = s.photos.filter((p) => p.imageType === slot.type);
              const tag = slot.need === "required" ? "Required" : slot.need === "encouraged" ? (slot.type === "markings" ? "Strongly encouraged" : "Encouraged") : "Optional";
              const full = s.photos.length >= MAX_PHOTOS && !(mine.length && !slot.multiple);
              return (
                <li key={slot.type} className="card grid content-start gap-2 p-3" data-slot={slot.type} data-filled={mine.length > 0}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{slot.label}</p>
                    <span className={`label !text-[0.5625rem] border-[1.5px] px-1.5 py-0.5 leading-none ${slot.need === "required" ? "border-ink bg-ink text-surface" : "border-steel text-ink-soft"}`}>{tag}</span>
                  </div>
                  <p className="text-xs text-ink-soft">{slot.hint}</p>
                  {mine.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {mine.map((p) => (
                        <li key={p.id} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.url} alt={`${slot.label} photo`} className="h-20 w-20 border-2 border-ink object-cover" />
                          <button type="button" className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center border-2 border-ink bg-surface text-danger" disabled={w.pending || busy} onClick={() => w.run(() => removePhoto(s.listing.id, p.id))} aria-label={`Remove ${slot.label} photo`}>
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <label className={`btn btn-outline min-h-11 cursor-pointer justify-self-start ${busy || full ? "opacity-50" : ""}`}>
                    {busy ? "Uploading…" : mine.length ? (slot.multiple ? "Add another" : "Replace") : "Add photo"}
                    <input
                      type="file"
                      accept={[...PHOTO_TYPES, ".heic", ".heif"].join(",")}
                      multiple={Boolean(slot.multiple)}
                      className="sr-only"
                      data-testid={`slot-input-${slot.type}`}
                      disabled={busy || full}
                      aria-label={`${slot.label} photo`}
                      onChange={(e) => handleFiles(e.target.files, { type: slot.type, replaceIds: slot.multiple ? [] : mine.map((m) => m.id) })}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isBat && checklist.length > 0 && (
        <div className="rounded-md border border-line bg-paper p-3">
          <p className="font-semibold">Photos buyers look for</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {checklist.map((c) => (
              <li key={c.type} className="flex items-center gap-2">
                <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${have.has(c.type) ? "border-success bg-success text-surface" : "border-line-strong"}`}>
                  {have.has(c.type) ? "✓" : ""}
                </span>
                <span>
                  {c.label}
                  {c.optional && <span className="text-ink-soft"> (if any)</span>}
                  <span className="sr-only">{have.has(c.type) ? ": added" : ": not added yet"}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2">
        <label htmlFor="photo-input" className={`btn btn-outline cursor-pointer justify-self-start ${isBat ? "hidden" : ""}`}>
          {busy ? "Uploading…" : "Add photos"}
        </label>
        <input
          ref={fileInput}
          id="photo-input"
          type="file"
          accept={[...PHOTO_TYPES, ".heic", ".heif"].join(",")}
          multiple
          className="sr-only"
          disabled={busy || s.photos.length >= MAX_PHOTOS}
          onChange={(e) => handleFiles(e.target.files)}
          aria-describedby="h-photos"
        />
        <span id="h-photos" className={`text-sm text-ink-soft ${isBat ? "hidden" : ""}`}>
          JPG, PNG, WEBP or HEIC, up to 10 MB each. Large photos are resized in your browser before upload.
        </span>
        {problems.map((p) => (
          <p key={p} role="alert" className="text-sm text-danger">
            {p}
          </p>
        ))}
        {uploads.map((u) => (
          <p key={u.key} role="status" className={`text-sm ${u.status === "failed" ? "text-danger" : "text-ink-soft"}`}>
            {u.name}: {u.status === "uploading" ? "uploading…" : u.message}
          </p>
        ))}
      </div>

      {(isBat ? extraPhotos : s.photos).length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2" aria-label={isBat ? "Other photos" : "Your photos"}>
          {(isBat ? extraPhotos : s.photos).map((p, i) => (
            <li key={p.id} className="grid grid-cols-[96px_1fr] gap-3 rounded-md border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.alt ?? `Photo ${i + 1}`} className="h-24 w-24 rounded object-cover" />
              <div className="grid min-w-0 content-start gap-2">
                <label className="field text-sm" htmlFor={`type-${p.id}`}>
                  <span>
                    Photo {i + 1}
                    {i === 0 ? " (cover)" : ""}: shows
                  </span>
                  <select
                    id={`type-${p.id}`}
                    className="input py-1.5"
                    value={p.imageType}
                    disabled={w.pending}
                    onChange={(e) => save(ordered.map((o) => (o.id === p.id ? { ...o, imageType: e.target.value } : o)))}
                  >
                    {IMAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {IMAGE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-1 text-sm">
                  <button type="button" className="btn btn-outline px-2 py-1" disabled={isBat || i === 0 || w.pending} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline px-2 py-1"
                    disabled={isBat || i === s.photos.length - 1 || w.pending}
                    onClick={() => move(i, 1)}
                    aria-label={`Move photo ${i + 1} later`}
                  >
                    ↓
                  </button>
                  <button type="button" className="btn btn-outline px-2 py-1 text-danger" disabled={w.pending} onClick={() => w.run(() => removePhoto(s.listing.id, p.id))} aria-label={`Remove photo ${i + 1}`}>
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        {!w.published && (
          <>
            <button type="button" className="btn btn-primary" disabled={busy || w.pending} onClick={() => w.goTo("price")}>
              Continue
            </button>
            <button type="button" className="btn btn-outline" onClick={() => w.goTo("details")}>
              Back
            </button>
          </>
        )}
        {s.photos.length === 0 && <p className="text-sm text-ink-soft">You can continue and add photos later, but you&apos;ll need one to publish.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6: price
// ---------------------------------------------------------------------------

export function PriceStep() {
  const { w, s } = useSnapshot();
  const [price, setPrice] = useState(s.listing.asking_price_cents != null ? String(s.listing.asking_price_cents / 100) : "");
  const [offers, setOffers] = useState(s.listing.accepts_offers);
  const cents = parseDollars(price);
  const preview = cents != null && cents >= 100 && w.fee ? sellerProceedsBeforeProcessing(cents, w.fee) : null;
  const sales = s.priceHint?.sales ?? [];

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        w.run(() => savePrice(s.listing.id, { price, acceptsOffers: offers }), w.published ? undefined : "shipping");
      }}
    >
      <StepHeader title="Asking price" />
      <ErrorBanner />
      <label className="field max-w-xs" htmlFor="price">
        <span>Price (USD)</span>
        <span className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft">$</span>
          <input
            id="price"
            inputMode="decimal"
            className={`${inputClass(w.errors.price)} pl-7 font-mono`}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={Boolean(w.errors.price)}
            aria-describedby={w.errors.price ? "e-price" : undefined}
          />
        </span>
        <FieldError id="e-price" message={w.errors.price} />
      </label>

      <div className="rounded-md border border-line p-3" aria-live="polite">
        {w.fee == null ? (
          <p className="text-sm text-ink-soft">The commission rate couldn&apos;t be loaded. It&apos;s shown at checkout.</p>
        ) : preview ? (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
            <dt>Sale price</dt>
            <dd className="text-right font-mono">{formatPrice(preview.itemPriceCents)}</dd>
            <dt>Marketplace commission{w.fee.fee_type === "percentage" ? ` (${w.fee.fee_value}%)` : ""}</dt>
            <dd className="text-right font-mono">−{formatPrice(preview.commissionCents)}</dd>
            <dt className="font-semibold">You receive before payment processing</dt>
            <dd className="text-right font-mono font-semibold">{formatPrice(preview.beforeProcessingCents)}</dd>
            <dd className="col-span-2 text-xs text-ink-soft">
              Payment processing fees are calculated when the buyer pays. Commission is on the item price only, never shipping.
            </dd>
          </dl>
        ) : (
          <p className="text-sm text-ink-soft">Enter a price to see what you&apos;ll receive.</p>
        )}
      </div>

      <div className="rounded-md border border-line bg-paper p-3 text-sm">
        <p className="font-semibold">Recent verified sales</p>
        {sales.length === 0 ? (
          <p className="mt-1 text-ink-soft">
            {s.product ? "No verified sales for this model yet." : "No verified sales to compare: this model isn't in the catalog yet."} Compare with
            similar live listings and price for your item&apos;s condition.
          </p>
        ) : (
          <ul className="mt-1 grid gap-0.5">
            {sales.map((x, i) => (
              <li key={i}>
                <span className="font-mono">{formatPrice(x.priceCents)}</span> on {new Date(x.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {x.condition != null ? ` · condition ${x.condition}/10` : ""}
              </li>
            ))}
            <li className="text-xs text-ink-soft">Completed sales on this marketplace only.</li>
          </ul>
        )}
      </div>

      <label className="flex items-center gap-2">
        <input type="checkbox" checked={offers} onChange={(e) => setOffers(e.target.checked)} />
        Accept offers from buyers
      </label>
      <StepActions back={w.published ? undefined : "photos"} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 7: shipping
// ---------------------------------------------------------------------------

export function ShippingStep() {
  const { w, s } = useSnapshot();
  const l = s.listing;
  const isBat = s.category.slug === "bats";
  const [v, setV] = useState({
    weightLb: ozToLb(l.shipping_weight_oz)?.toString() ?? "",
    lengthIn: l.package_length_inches?.toString() ?? "",
    widthIn: l.package_width_inches?.toString() ?? "",
    heightIn: l.package_height_inches?.toString() ?? "",
    postalCode: s.shipFrom ?? "",
  });
  const num = (x: string) => (x.trim() === "" ? undefined : Number(x));
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const box = (k: "lengthIn" | "widthIn" | "heightIn" | "weightLb", label: string, unit: string) => (
    <label className="field" htmlFor={`ship-${k}`}>
      <span>
        {label} ({unit})
      </span>
      <input
        id={`ship-${k}`}
        inputMode="decimal"
        className={inputClass(w.errors[k])}
        value={v[k]}
        onChange={set(k)}
        aria-invalid={Boolean(w.errors[k])}
        aria-describedby={w.errors[k] ? `e-ship-${k}` : undefined}
      />
      <FieldError id={`e-ship-${k}`} message={w.errors[k]} />
    </label>
  );

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        w.run(
          () =>
            saveShipping(s.listing.id, {
              weightLb: num(v.weightLb),
              lengthIn: num(v.lengthIn),
              widthIn: num(v.widthIn),
              heightIn: num(v.heightIn),
              postalCode: v.postalCode,
            }),
          w.published ? undefined : "disclosures"
        );
      }}
    >
      <StepHeader title="Package and shipping" intro="Shipping rates are calculated from the packed size and weight, so measure the box you'll use." />
      <ErrorBanner />
      {isBat && (
        <div className="grid gap-2 rounded-md border border-line bg-paper p-3 text-sm">
          <p>
            Most single bats ship in a box about {STANDARD_BAT_BOX.lengthIn} × {STANDARD_BAT_BOX.widthIn} × {STANDARD_BAT_BOX.heightIn} in, around{" "}
            {STANDARD_BAT_BOX.weightLb} lb packed. Use it as a starting point and change it to match your box.
          </p>
          <button
            type="button"
            className="btn btn-outline justify-self-start"
            onClick={() =>
              setV({
                ...v,
                weightLb: String(STANDARD_BAT_BOX.weightLb),
                lengthIn: String(STANDARD_BAT_BOX.lengthIn),
                widthIn: String(STANDARD_BAT_BOX.widthIn),
                heightIn: String(STANDARD_BAT_BOX.heightIn),
              })
            }
          >
            Use standard bat box
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {box("lengthIn", "Length", "in")}
        {box("widthIn", "Width", "in")}
        {box("heightIn", "Height", "in")}
        {box("weightLb", "Packed weight", "lb")}
      </div>
      <label className="field max-w-xs" htmlFor="ship-zip">
        <span>Ship-from ZIP code</span>
        <input
          id="ship-zip"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          className={inputClass(w.errors.postalCode)}
          value={v.postalCode}
          onChange={(e) => setV({ ...v, postalCode: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          aria-invalid={Boolean(w.errors.postalCode)}
          aria-describedby={w.errors.postalCode ? "e-ship-zip" : "h-ship-zip"}
        />
        {!w.errors.postalCode && (
          <span id="h-ship-zip" className="text-sm font-normal text-ink-soft">
            Private: used only to calculate shipping. Buyers see your city and state from your profile.
          </span>
        )}
        <FieldError id="e-ship-zip" message={w.errors.postalCode} />
      </label>
      <StepActions back={w.published ? undefined : "price"} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 8: disclosures
// ---------------------------------------------------------------------------

export function DisclosuresStep() {
  const { w, s } = useSnapshot();
  const l = s.listing;
  const [answers, setAnswers] = useState<Record<DamageKey, boolean | null>>(
    () => Object.fromEntries(DAMAGE_QUESTIONS.map((q) => [q.key, l[q.column]])) as Record<DamageKey, boolean | null>
  );
  const [structural, setStructural] = useState(l.listing_status === "draft" && l.has_cracks == null ? "" : l.structural_disclosure);
  const [wear, setWear] = useState(l.cosmetic_wear ?? "");
  const [damage, setDamage] = useState(l.damage_disclosure ?? "");
  const [ownership, setOwnership] = useState(l.ownership_declaration);
  const [authenticity, setAuthenticity] = useState(l.authenticity_declaration);

  return (
    <form
      className="grid gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        w.run(
          () =>
            saveDisclosures(s.listing.id, {
              structuralDisclosure: structural || undefined,
              ...Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v ?? undefined])),
              cosmeticWear: wear,
              damageDisclosure: damage,
              ownership,
              authenticity,
            }),
          w.published ? undefined : "preview"
        );
      }}
    >
      <StepHeader title="Condition and damage disclosure" intro="Honest answers protect you if a buyer opens a dispute. Every question needs a yes or no." />
      <ErrorBanner />
      <div className="grid gap-4">
        {DAMAGE_QUESTIONS.map((q) => (
          <YesNo key={q.key} name={q.key} legend={q.label} value={answers[q.key]} onChange={(v) => setAnswers({ ...answers, [q.key]: v })} error={w.errors[q.key]} />
        ))}
      </div>

      <fieldset className="grid gap-2" aria-describedby={w.errors.structuralDisclosure ? "e-structural" : undefined}>
        <legend className="font-medium">Structural condition</legend>
        {[
          { v: "no_known_damage", label: "No known structural damage" },
          { v: "damage_disclosed", label: "Yes, there is damage, described below" },
          { v: "unknown", label: "I'm not sure" },
        ].map((o) => (
          <label key={o.v} className="flex items-center gap-2">
            <input type="radio" name="structural" checked={structural === o.v} onChange={() => setStructural(o.v)} />
            {o.label}
          </label>
        ))}
        <FieldError id="e-structural" message={w.errors.structuralDisclosure} />
      </fieldset>

      <label className="field" htmlFor="damage">
        <span>
          Damage details <span className="font-normal text-ink-soft">(required if you reported damage)</span>
        </span>
        <textarea
          id="damage"
          rows={3}
          maxLength={2000}
          className={inputClass(w.errors.damageDisclosure)}
          value={damage}
          onChange={(e) => setDamage(e.target.value)}
          aria-invalid={Boolean(w.errors.damageDisclosure)}
          aria-describedby={w.errors.damageDisclosure ? "e-damage" : undefined}
          placeholder="Where it is, how big, and when it happened. Add a photo tagged Damage."
        />
        <FieldError id="e-damage" message={w.errors.damageDisclosure} />
      </label>

      <label className="field" htmlFor="wear">
        <span>
          Cosmetic wear <span className="font-normal text-ink-soft">(optional)</span>
        </span>
        <textarea id="wear" rows={2} maxLength={1000} className={inputClass(w.errors.cosmeticWear)} value={wear} onChange={(e) => setWear(e.target.value)} placeholder="Scuffs, paint chips, worn grip" />
        <FieldError id="e-wear" message={w.errors.cosmeticWear} />
      </label>

      <div className="grid gap-3 rounded-md border border-line p-3">
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={ownership} onChange={(e) => setOwnership(e.target.checked)} aria-describedby={w.errors.ownership ? "e-ownership" : undefined} />
          <span>I own this item and have the right to sell it.</span>
        </label>
        <FieldError id="e-ownership" message={w.errors.ownership} />
        <label className="flex items-start gap-2">
          <input type="checkbox" className="mt-1" checked={authenticity} onChange={(e) => setAuthenticity(e.target.checked)} aria-describedby={w.errors.authenticity ? "e-authenticity" : undefined} />
          <span>This item is authentic, and my description and answers are accurate.</span>
        </label>
        <FieldError id="e-authenticity" message={w.errors.authenticity} />
      </div>

      <p className="text-sm text-ink-soft">
        The marketplace doesn&apos;t inspect used equipment or certify that it&apos;s safe or legal for play. Buyers rely on your answers, and
        league eligibility depends on the stamps and each league&apos;s rules.
      </p>
      <StepActions back={w.published ? undefined : "shipping"} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Step 9: preview, step 10: publish
// ---------------------------------------------------------------------------

export function PreviewStep() {
  const { w, s } = useSnapshot();
  return (
    <div className="grid gap-5">
      <StepHeader title="Preview" intro="This is what buyers will see. Go back to any step to change something." />
      <ListingPreview listing={s.listing} photos={s.photos} fields={s.category.fields} categoryName={s.category.name} catalogModel={s.product?.name ?? null} />
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <button type="button" className="btn btn-primary" onClick={() => w.goTo("publish")}>
          {w.published ? "Continue" : "Looks good, continue"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => w.goTo("disclosures")}>
          Back
        </button>
      </div>
    </div>
  );
}

export function PublishStep() {
  const { w, s } = useSnapshot();
  const [justPublished, setJustPublished] = useState(false);
  const missing = useMemo(
    () => missingForPublish(s.listing, { photoCount: s.photos.length, hasShipFrom: Boolean(s.shipFrom), attributesValid: s.attributesValid }),
    [s]
  );
  const status = s.listing.listing_status;
  const stepLabel = (key: string) => STEPS.find((x) => x.key === key)?.label ?? key;

  if (status === "active") {
    return (
      <div className="grid gap-4" role={justPublished ? "status" : undefined}>
        <StepHeader
          title={justPublished ? "Your listing is live" : "This listing is live"}
          intro={
            s.listing.expires_at
              ? `It stays up until ${new Date(s.listing.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}, unless it sells first.`
              : undefined
          }
        />
        {s.submission && s.submission.status === "pending" && (
          <p className="text-sm text-ink-soft">Your catalog request for {s.submission.modelName} is waiting for review. Your listing is live in the meantime.</p>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href={listingPath(s.listing.id)} className="btn btn-primary">
            View listing
          </Link>
          <Link href="/seller/listings" className="btn btn-outline">
            Your listings
          </Link>
          {/* A full page load, so the flow starts fresh instead of keeping this listing's state. */}
          <a href="/sell/new" className="btn btn-outline">
            List another item
          </a>
        </div>
      </div>
    );
  }

  const relist = status === "removed" || status === "expired";
  return (
    <div className="grid gap-5">
      <StepHeader title={relist ? "Relist" : "Publish"} intro={relist ? "Put this listing back up for sale." : "Listing is free. You pay the commission only if it sells."} />
      {w.error && (
        <div role="alert" className="grid gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          <p>{w.error}</p>
          {w.errorStep && (
            <button type="button" className="justify-self-start font-semibold underline" onClick={() => w.goTo(w.errorStep!)}>
              Go to {stepLabel(w.errorStep)}
            </button>
          )}
        </div>
      )}
      {missing.length > 0 ? (
        <div className="grid gap-2">
          <p className="font-semibold">Still needed before you can publish:</p>
          <ul className="grid gap-1">
            {missing.map((m) => (
              <li key={m.step}>
                <button type="button" className="underline" onClick={() => w.goTo(m.step)}>
                  {m.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p>Everything&apos;s in place.</p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-line pt-4">
        <button
          type="button"
          className="btn btn-primary"
          disabled={w.pending}
          onClick={async () => {
            const r = await w.run(() => publishListing(s.listing.id));
            if (r.ok) setJustPublished(true);
          }}
        >
          {w.pending ? "Publishing…" : relist ? "Relist" : "Publish listing"}
        </button>
        <button type="button" className="btn btn-outline" onClick={() => w.goTo("preview")}>
          Back
        </button>
        <Link href="/seller/listings" className="self-center text-sm underline">
          Save and finish later
        </Link>
      </div>
    </div>
  );
}
