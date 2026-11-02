# Track A: shop, search, listing pages and seller profiles

Phase 2, buyer side. Covers browsing and searching live listings, the listing detail page, favorites, saved
searches, reports and public seller profiles.

## Pages

| Route | What it does |
| --- | --- |
| `/shop` | Every live listing: search box, category chips, filters, sort, 24 per page |
| `/shop/[category]` | One category, with extra filters from `product_categories.attribute_schema` (select fields). Unknown categories are 404. `/shop/bats` redirects to `/bats` |
| `/bats` | Bat filters (brand, model, weight, stamp, weighting, model year, condition, price, seller rating, state), "Browse by weight" chips, link to the price guide |
| `/listings/[id]` | Gallery, price, condition, structural disclosure and every damage answer near the top, declarations, specs, model page link, seller card, coarse location, report, save, actions |
| `/sellers/[username]` | Photo, name, @username, member since, completed sales and purchases, rating and review count, verified seller and identity verified badges, active listings, recent published reviews |
| `/account/favorites` | The member's saved listings (protected by the proxy and checked again on the server) |
| `POST /api/listings/[id]/view` | Counts a listing view (see below) |

All browse pages share `src/components/shop/BrowsePage.tsx`.

## How search works

- **One function for every page.** `public.search_listings(...)` in `supabase/migrations/20261102000100_shop_search.sql`.
  It is `security invoker`, so RLS and column privileges apply to the visitor. It returns only `active`, unexpired
  listings from sellers whose account is `active`; drafts are never returned, even to their seller. Every argument
  is a bound parameter; nothing is string-built.
- **Text.** Each listing's searchable text is its title, description, catalog product and model name, product
  aliases, manufacturer name and aliases, category name, weighting, construction, stamps and model year, passed
  through `search_normalize()`. Each search word must match, either as a substring (partial words: `fre` finds
  Freak) or, for words of four letters or more, by `pg_trgm` `word_similarity >= 0.5` (misspellings: `tantrm`,
  `mikn`). Manufacturer aliases (`demarni`) also match directly.
- **Softball terms.** `normalizeSearchText()` in `src/lib/search.ts` and `search_normalize()` in SQL rewrite the
  same spellings: `end load / end-loaded / endloaded → endload`, `mid-loaded → midload`, `ASA → usa`,
  `1 piece / one-piece / single piece / 1pc → 1pc`, `two-piece → 2pc`. A DB test checks the two agree.
- **Filters.** Category, brand (manufacturer slug), model (product slug), price range, minimum condition, seller
  state, weight (`attributes.weight_oz`), stamp (`attributes.certification`, falling back to the catalog model's
  stamps when the seller gave none), model year (`attributes.model_year` or the product's), weighting
  (`attributes.weighting_type`), minimum seller rating (`seller_public_stats.average_rating`) and category
  attributes (`a.<key>=value`). Bad values in stored attributes never break a search (`jsonb_numeric`,
  `jsonb_text_list`).
- **Sort.** Newest (default), lowest price, highest price, best condition, and best match when there is text.
- **Pagination.** 24 per page, total from `count(*) over ()`.
- **URLs.** Every filter is a query parameter (`q, brand, model, min, max` in dollars, `condition, state, weight,
  stamp, year, load, rating, a.<key>, sort, page`). `parseSearchParams` drops invalid values instead of erroring.
  Empty fields from the GET form redirect to the clean URL. The canonical URL is always the bare page.
- **Facets.** `search_listing_facets(category)` counts live listings per brand, weight, stamp, year, weighting and
  state, shown next to filter options. The weight chips on `/bats` always show 25–28 oz plus any other weight listed.
- **No results.** Shows each active filter with a "Without …" link, a did-you-mean from `search_spelling()` (closest
  catalog word per search word; aliases map to the brand), similar catalog models from `search_suggestions()`, and
  "Save this search".

## Listing page details

- Server Components read through `src/lib/listings.ts` with the visitor's Supabase client; RLS decides visibility.
  Unknown ids, non-UUIDs and other people's drafts are 404; a seller sees their own draft with a preview banner.
- Sold and reserved listings show their status; `ListingActions` shows no buy buttons for them.
- `src/components/listing/ListingActions.tsx` shows Buy now / Make offer / Message seller disabled with
  "Checkout opens soon". The checkout track replaces this component; its props are `listingId, status, priceCents,
  acceptsOffers, isOwner`.
- Metadata: unique title and description, canonical, Open Graph image from the first photo, `noindex` for
  non-public statuses. Product JSON-LD (escaped), with `offers` only for active listings.
- Views: a small client component POSTs to `/api/listings/[id]/view` after load. The route skips the seller's own
  views and listings this browser was counted for (a `viewed_listings` httpOnly cookie, about 12 hours, last 40
  listings), then calls `increment_listing_views()` with the service role. That function is executable only by
  `service_role`.
- Favorites: `toggleFavorite` server action (plain form, works without JavaScript). Signed-out visitors get a link to
  `/sign-in?next=/listings/<id>`. Only listings the member can see can be saved.
- Reports: `reportListing` server action, zod-validated, signed-in only, not on your own listing, one open report
  per member per listing.
- Saved searches: `saveSearch` stores the cleaned `{ path, params }` in `saved_searches` (no duplicates). Alerts are
  not sent yet; the UI says so.

## Tests

- `tests/unit/search.test.ts`: normalization, parsing, URL round-trips, filter chips, pagination window.
- `tests/db/search.test.ts`: drafts never returned, misspellings and aliases, softball terms, combined filters,
  category attributes, sort and pagination, banned sellers and sold listings hidden, suggestions, facets, view
  counter permissions, SQL/TS normalizer agreement.
- `tests/e2e/shop.spec.ts`: search by partial and misspelled words, did-you-mean, weight/stamp/price filters and
  sorting, category scoping and canonical, damage disclosures and specs, keyboard gallery, sold status, draft 404,
  view counting, reporting, favorites (signed in and out), saved search, seller profile, no sideways scroll at 390px.
  Tests delete the members (and so the listings) they create.

## Limitations

- Searchable text is computed per query (no stored document or trigram index across joined tables). Fine for
  thousands of listings; at larger scale add a maintained `search_document` column with a GIN trigram index.
- Trigram matching can produce occasional loose matches on short or common words; words under four letters only
  match as substrings.
- The brand filter in the form picks one brand; URLs accept several (`brand=a&brand=b`).
- The view counter's per-visitor limit is a cookie, so clients that drop cookies can inflate counts; the update
  also bumps `updated_at` through the shared trigger.
- On phones the filter panel opens with JavaScript; without it the filters stay hidden on small screens (search,
  sort and chips still work).
- Listing photos use plain `<img>`; switch to `next/image` once storage remote patterns are configured.
- Seller cards don't show response time or location history; `seller_public_stats` has no such data.
