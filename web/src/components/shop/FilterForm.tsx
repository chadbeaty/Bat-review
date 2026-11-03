import Link from "next/link";
import type { BrandOption, CategoryField, Facets, ModelOption } from "@/lib/listings";
import { STAMPS, US_STATES, WEIGHTINGS, humanize, type SearchQuery } from "@/lib/search";
import { WEIGHTING_LABELS } from "@/lib/format";
import type { ViewMode } from "@/lib/view-mode-shared";

export type FilterVariant = "all" | "bats" | "category";

const CONDITIONS = [10, 9, 8, 7, 6, 5];
const RATINGS = [4.5, 4, 3];

function count(facets: Facets, facet: string, value: string): number | undefined {
  return facets[facet]?.find((f) => f.value === value)?.listings;
}

function Count({ n }: { n: number | undefined }) {
  return n ? <span className="text-ink-soft"> ({n})</span> : null;
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-2 border-t border-line pt-4">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Check({ name, value, checked, label, n }: { name: string; value: string; checked: boolean; label: string; n?: number }) {
  return (
    <label className="flex min-h-11 items-center gap-2.5 text-sm">
      <input type="checkbox" name={name} value={value} defaultChecked={checked} className="h-5 w-5 accent-ink" />
      <span>
        {label}
        <Count n={n} />
      </span>
    </label>
  );
}

/**
 * The filters form. It is a plain GET form, so every filter ends up in the URL and works without JavaScript.
 */
export function FilterForm({
  path,
  query,
  variant,
  facets,
  brands,
  models = [],
  fields = [],
  view = null,
}: {
  path: string;
  query: SearchQuery;
  variant: FilterVariant;
  facets: Facets;
  brands: BrandOption[];
  models?: ModelOption[];
  fields?: CategoryField[];
  view?: ViewMode | null;
}) {
  const weightOptions = [
    ...new Set([
      ...((fields.find((f) => f.key === "weight_oz")?.options as number[] | undefined) ?? []),
      ...(facets.weight ?? []).map((f) => Number(f.value)),
      ...query.weights,
    ]),
  ]
    .filter((w) => Number.isFinite(w))
    .sort((a, b) => a - b);
  const yearOptions = [
    ...new Set([...(facets.year ?? []).map((f) => Number(f.value)), ...models.map((m) => m.modelYear ?? 0), ...query.years].filter((y) => y > 1900)),
  ].sort((a, b) => b - a);
  const modelsByBrand = new Map<string, ModelOption[]>();
  for (const m of models) {
    if (query.brands.length && !query.brands.includes(m.manufacturerSlug)) continue;
    modelsByBrand.set(m.manufacturerSlug, [...(modelsByBrand.get(m.manufacturerSlug) ?? []), m]);
  }
  const brandName = new Map(brands.map((b) => [b.slug, b.name]));
  const attributeFields = variant === "category" ? fields.filter((f) => (f.type === "select" || f.type === "multiselect") && f.options?.length) : [];

  return (
    <form action={path} method="get" className="grid gap-4" aria-label="Filters">
      {query.q && <input type="hidden" name="q" value={query.q} />}
      {query.sort !== "newest" && <input type="hidden" name="sort" value={query.sort} />}
      {view && <input type="hidden" name="view" value={view} />}

      <Group legend="Brand">
        <label className="sr-only" htmlFor="f-brand">
          Brand
        </label>
        <select id="f-brand" name="brand" defaultValue={query.brands[0] ?? ""} className="input">
          <option value="">Any brand</option>
          {brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
              {count(facets, "manufacturer", b.slug) ? ` (${count(facets, "manufacturer", b.slug)})` : ""}
            </option>
          ))}
        </select>
      </Group>

      {variant === "bats" && models.length > 0 && (
        <Group legend="Model">
          <label className="sr-only" htmlFor="f-model">
            Model
          </label>
          <select id="f-model" name="model" defaultValue={query.model ?? ""} className="input">
            <option value="">Any model</option>
            {[...modelsByBrand.entries()].map(([slug, list]) => (
              <optgroup key={slug} label={brandName.get(slug) ?? slug}>
                {list.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Group>
      )}

      {variant === "bats" && (
        <>
          <Group legend="Weight">
            <div className="grid grid-cols-2 gap-2">
              {weightOptions.map((w) => (
                <Check key={w} name="weight" value={String(w)} checked={query.weights.includes(w)} label={`${w} oz`} n={count(facets, "weight", String(w))} />
              ))}
            </div>
          </Group>
          <Group legend="Stamp (certification)">
            <div className="grid grid-cols-2 gap-2">
              {STAMPS.map((s) => (
                <Check key={s} name="stamp" value={s} checked={query.stamps.includes(s)} label={s === "USA" ? "USA (ASA)" : s} n={count(facets, "certification", s)} />
              ))}
            </div>
          </Group>
          <Group legend="Stamps on the bat">
            <Check name="dual" value="1" checked={Boolean(query.dual)} label="Dual-stamp only (two or more)" />
          </Group>
          <Group legend="Weighting">
            {WEIGHTINGS.map((w) => (
              <Check key={w} name="load" value={w} checked={query.loads.includes(w)} label={WEIGHTING_LABELS[w]} n={count(facets, "weighting", w)} />
            ))}
          </Group>
          {yearOptions.length > 0 && (
            <Group legend="Model year">
              <div className="grid grid-cols-2 gap-2">
                {yearOptions.slice(0, 8).map((y) => (
                  <Check key={y} name="year" value={String(y)} checked={query.years.includes(y)} label={String(y)} n={count(facets, "year", String(y))} />
                ))}
              </div>
            </Group>
          )}
        </>
      )}

      {attributeFields.map((f) => (
        <Group key={f.key} legend={f.label}>
          {(f.options ?? []).map((o) => (
            <Check key={String(o)} name={`a.${f.key}`} value={String(o)} checked={(query.attrs[f.key] ?? []).includes(String(o))} label={humanize(String(o))} />
          ))}
        </Group>
      ))}

      {variant === "bats" && (
        <Group legend="Length (in)">
          <div className="grid grid-cols-2 gap-2">
            <label className="field text-sm" htmlFor="f-minlen">
              <span>Min</span>
              <input id="f-minlen" name="minlen" type="number" inputMode="decimal" min={20} max={40} step={0.5} defaultValue={query.minLength ?? ""} className="input" />
            </label>
            <label className="field text-sm" htmlFor="f-maxlen">
              <span>Max</span>
              <input id="f-maxlen" name="maxlen" type="number" inputMode="decimal" min={20} max={40} step={0.5} defaultValue={query.maxLength ?? ""} className="input" />
            </label>
          </div>
        </Group>
      )}

      <Group legend="Price">
        <div className="grid grid-cols-2 gap-2">
          <label className="field text-sm" htmlFor="f-min">
            <span>Min ($)</span>
            <input id="f-min" name="min" type="number" inputMode="numeric" min={0} step={1} defaultValue={query.minPriceCents != null ? query.minPriceCents / 100 : ""} className="input" />
          </label>
          <label className="field text-sm" htmlFor="f-max">
            <span>Max ($)</span>
            <input id="f-max" name="max" type="number" inputMode="numeric" min={0} step={1} defaultValue={query.maxPriceCents != null ? query.maxPriceCents / 100 : ""} className="input" />
          </label>
        </div>
      </Group>

      <Group legend="Condition">
        <label className="sr-only" htmlFor="f-condition">
          Minimum condition
        </label>
        <select id="f-condition" name="condition" defaultValue={query.condition ?? ""} className="input">
          <option value="">Any condition</option>
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c === 10 ? "10/10 only" : `${c}/10 or better`}
            </option>
          ))}
        </select>
      </Group>

      <Group legend="Listing">
        <Check name="new" value="1" checked={Boolean(query.fresh)} label="Listed in the last 7 days" />
        <Check name="offers" value="1" checked={Boolean(query.offers)} label="Seller accepts offers" />
      </Group>

      <Group legend="Seller">
        <label className="field text-sm" htmlFor="f-rating">
          <span>Minimum seller rating</span>
          <select id="f-rating" name="rating" defaultValue={query.rating ?? ""} className="input">
            <option value="">Any rating</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {r}+ stars
              </option>
            ))}
          </select>
        </label>
        <label className="field text-sm" htmlFor="f-state">
          <span>Seller&apos;s state</span>
          <select id="f-state" name="state" defaultValue={query.state ?? ""} className="input">
            <option value="">Anywhere in the US</option>
            {Object.entries(US_STATES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
                {count(facets, "state", code) ? ` (${count(facets, "state", code)})` : ""}
              </option>
            ))}
          </select>
        </label>
      </Group>

      <div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper py-3 lg:static">
        <button type="submit" className="btn btn-primary min-h-11 flex-1" data-testid="apply-filters">
          Apply
        </button>
        <Link href={query.q ? `${path}?q=${encodeURIComponent(query.q)}` : path} className="btn btn-outline min-h-11">
          Clear
        </Link>
      </div>
    </form>
  );
}
