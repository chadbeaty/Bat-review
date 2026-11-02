import Link from "next/link";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { FilterForm, type FilterVariant } from "@/components/shop/FilterForm";
import { FiltersPanel } from "@/components/shop/FiltersPanel";
import { SaveSearchButton } from "@/components/shop/SaveSearchButton";
import { getCategories } from "@/lib/catalog";
import { getFacets, getFilterOptions, getSuggestions, searchListings, type CategoryDetail } from "@/lib/listings";
import { activeFilters, pageWindow, searchHref, SORTS, toQueryString, type SearchQuery, type Sort } from "@/lib/search";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * The browse page used by /shop, /shop/[category] and /bats: search box, category chips, filters, sort,
 * results and pagination. All state comes from the URL.
 */
export async function BrowsePage({
  path,
  query,
  variant,
  category,
  eyebrow,
  title,
  intro,
  extra,
}: {
  path: string;
  query: SearchQuery;
  variant: FilterVariant;
  category?: CategoryDetail;
  eyebrow: string;
  title: string;
  intro: string;
  extra?: React.ReactNode;
}) {
  const categorySlug = category?.slug ?? (variant === "bats" ? "bats" : undefined);
  const [result, facets, options, categories, user] = await Promise.all([
    searchListings(query, { category: categorySlug }),
    getFacets(categorySlug),
    getFilterOptions(variant === "bats" ? "bats" : undefined),
    getCategories(),
    getCurrentUser(),
  ]);

  const brandNames = Object.fromEntries(options.brands.map((b) => [b.slug, b.name]));
  const modelName = query.model ? options.models.find((m) => m.slug === query.model)?.name : undefined;
  const attrNames = Object.fromEntries((category?.fields ?? []).map((f) => [f.key, f.label]));
  const filters = activeFilters(query, { brands: brandNames, model: modelName, attrs: attrNames });
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstShown = result.total ? (query.page - 1) * result.pageSize + 1 : 0;
  const lastShown = Math.min(query.page * result.pageSize, result.total);
  const sorts = (Object.keys(SORTS) as Sort[]).filter((s) => s !== "best" || query.terms.length > 0);
  const suggestions = result.total === 0 && query.q ? await getSuggestions(query.q, query.terms) : null;
  const search = toQueryString({ ...query, page: 1 });
  const saveName = [title, ...filters.map((f) => f.label)].join(" · ").slice(0, 80);

  return (
    <div className="wrap grid gap-6 py-8">
      <header className="grid gap-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display text-5xl font-bold">{title}</h1>
        <p className="max-w-2xl text-ink-soft">{intro}</p>
        <form action={path} method="get" role="search" className="flex w-full max-w-2xl gap-2">
          <label htmlFor="shop-search" className="sr-only">
            Search {title.toLowerCase()}
          </label>
          <input
            id="shop-search"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder={variant === "bats" ? "Brand, model or year, e.g. Freak 26 oz" : "Search by brand, model or item"}
            autoComplete="off"
            className="input min-w-0 flex-1"
          />
          {query.sort !== "newest" && <input type="hidden" name="sort" value={query.sort} />}
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
      </header>

      {variant !== "bats" && (
        <nav aria-label="Categories" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <Chip href={query.q ? `/shop?q=${encodeURIComponent(query.q)}` : "/shop"} active={!categorySlug}>
            All equipment
          </Chip>
          {categories.map((c) => {
            const base = c.slug === "bats" ? "/bats" : `/shop/${c.slug}`;
            return (
              <Chip key={c.slug} href={query.q ? `${base}?q=${encodeURIComponent(query.q)}` : base} active={c.slug === categorySlug}>
                {c.name}
              </Chip>
            );
          })}
        </nav>
      )}

      {extra}

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Filter results">
          <FiltersPanel activeCount={filters.filter((f) => f.key !== "q").length}>
            <FilterForm
              path={path}
              query={query}
              variant={variant}
              facets={facets}
              brands={options.brands}
              models={options.models}
              fields={category?.fields ?? []}
            />
          </FiltersPanel>
        </aside>

        <section aria-labelledby="results-heading" className="grid min-w-0 content-start gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="results-heading" className="font-semibold" aria-live="polite" data-testid="result-count">
              {result.total === 0
                ? "No listings"
                : result.total <= result.pageSize
                  ? `${result.total} ${result.total === 1 ? "listing" : "listings"}`
                  : `${firstShown}–${lastShown} of ${result.total} listings`}
            </h2>
            <nav aria-label="Sort" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-ink-soft">Sort:</span>
              {sorts.map((s) => (
                <Link
                  key={s}
                  href={searchHref(path, query, { sort: s })}
                  aria-current={query.sort === s ? "true" : undefined}
                  className={query.sort === s ? "font-semibold text-ink underline underline-offset-4" : "text-ink-soft hover:text-ink"}
                >
                  {SORTS[s]}
                </Link>
              ))}
            </nav>
          </div>

          {filters.length > 0 && (
            <ul aria-label="Active filters" className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <li key={f.key}>
                  <Link
                    href={searchHref(path, query, f.remove)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-sm hover:border-ink"
                    aria-label={`Remove filter: ${f.label}`}
                  >
                    {f.label} <span aria-hidden="true">×</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={path} className="inline-flex px-2 py-1 text-sm underline">
                  Clear all
                </Link>
              </li>
            </ul>
          )}

          {result.failed ? (
            <EmptyState title="Search isn't available right now" body="Something went wrong on our side. Try again in a minute." />
          ) : result.listings.length > 0 ? (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3" data-testid="results">
                {result.listings.map((l) => (
                  <li key={l.id} className="grid">
                    <ListingCard listing={l} />
                  </li>
                ))}
              </ul>
              {totalPages > 1 && <Pagination path={path} query={query} totalPages={totalPages} />}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm text-ink-soft">
                <span>Want to hear about new listings like these?</span>
                <SaveSearchButton path={path} search={search} name={saveName} signedIn={Boolean(user)} />
              </div>
            </>
          ) : result.total > 0 ? (
            <EmptyState
              title={`There's no page ${query.page}`}
              body={`These results fit on ${totalPages} ${totalPages === 1 ? "page" : "pages"}.`}
              action={{ href: searchHref(path, query, { page: 1 }), label: "Back to the first page" }}
            />
          ) : filters.length === 0 ? (
            <EmptyState
              title={`Nothing listed in ${title.toLowerCase()} yet`}
              body="Listings appear here as soon as sellers publish them. Have something to sell? Listing is free."
              action={{ href: "/sell", label: "Sell your gear" }}
            />
          ) : (
            <NoResults path={path} query={query} filters={filters} suggestions={suggestions} saveName={saveName} signedIn={Boolean(user)} search={search} />
          )}
        </section>
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap ${
        active ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink hover:border-ink"
      }`}
    >
      {children}
    </Link>
  );
}

function Pagination({ path, query, totalPages }: { path: string; query: SearchQuery; totalPages: number }) {
  const pages = pageWindow(query.page, totalPages);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-1 pt-2">
      {query.page > 1 && (
        <Link href={searchHref(path, query, { page: query.page - 1 })} rel="prev" className="btn btn-outline px-3 py-1.5 text-sm">
          Previous
        </Link>
      )}
      {pages.map((p, i) =>
        p == null ? (
          <span key={`gap-${i}`} className="px-2 text-ink-soft">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={searchHref(path, query, { page: p })}
            aria-current={p === query.page ? "page" : undefined}
            aria-label={`Page ${p}`}
            className={`min-w-9 rounded-md border px-3 py-1.5 text-center text-sm ${p === query.page ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface"}`}
          >
            {p}
          </Link>
        )
      )}
      {query.page < totalPages && (
        <Link href={searchHref(path, query, { page: query.page + 1 })} rel="next" className="btn btn-outline px-3 py-1.5 text-sm">
          Next
        </Link>
      )}
    </nav>
  );
}

function NoResults({
  path,
  query,
  filters,
  suggestions,
  saveName,
  signedIn,
  search,
}: {
  path: string;
  query: SearchQuery;
  filters: ReturnType<typeof activeFilters>;
  suggestions: Awaited<ReturnType<typeof getSuggestions>> | null;
  saveName: string;
  signedIn: boolean;
  search: string;
}) {
  return (
    <div className="grid gap-5 rounded-lg border border-dashed border-line-strong bg-surface p-6" data-testid="no-results">
      <div className="grid gap-1">
        <p className="text-lg font-semibold">No listings match this search right now</p>
        <p className="text-ink-soft">Try removing a filter, or check the spelling.</p>
      </div>

      {suggestions?.correctedQuery && suggestions.correctedQuery !== query.terms.join(" ") && (
        <p>
          Did you mean{" "}
          <Link href={searchHref(path, query, { q: suggestions.correctedQuery })} className="font-semibold underline">
            {suggestions.correctedQuery}
          </Link>
          ?
        </p>
      )}

      {filters.length > 1 && (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Remove one filter</p>
          <ul className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <li key={f.key}>
                <Link href={searchHref(path, query, f.remove)} className="inline-flex rounded-full border border-line-strong px-3 py-1 text-sm hover:border-ink">
                  Without {f.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {suggestions && suggestions.models.length > 0 && (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Catalog models with similar names</p>
          <ul className="grid gap-1 text-sm">
            {suggestions.models.map((m) => (
              <li key={m.slug}>
                <Link href={`/shop${toQueryString({ q: m.name })}`} className="underline">
                  {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-2 border-t border-line pt-4">
        <p className="text-sm text-ink-soft">Save this search and we&apos;ll be able to tell you when a match is listed.</p>
        <SaveSearchButton path={path} search={search} name={saveName} signedIn={signedIn} />
      </div>
    </div>
  );
}
