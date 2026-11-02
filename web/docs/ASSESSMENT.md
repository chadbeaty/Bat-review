# Project assessment (start of Phase 1)

Written 1 November 2026, before building the marketplace.

## 1. What existed

The repository held **Barrel Talk**, a static bat research site with no build step:

| Part | What it is | Kept? |
| --- | --- | --- |
| `data/bats.json` | 121 researched slow-pitch bats (2025–2027) from 13 brands, with stamps, construction, weighting, barrel length, listed prices and a source link for each | **Reused** as the seed for the master product catalog |
| `data/families.json` | Bat lines (Freak, Tantrum, Bedlam…) with search aliases | **Reused** for product-line names and search aliases |
| `data/reviews.json` | 62 linked published reviews (videos, Bat Digest, customer ratings) | Kept for the bat database phase (Phase 6) |
| `scripts/aggregate.mjs` | Collector for Reddit, forum RSS, YouTube and imported Facebook posts | Kept; it can feed bat model pages later |
| `index.html`, `assets/` | The static Barrel Talk site, deployed by GitHub Pages | Left running; the marketplace is a separate app in `web/` |

There was no database, no accounts, no payments and no server code, so the marketplace stack was chosen from the brief's recommendation.

## 2. Architecture chosen

- **Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4** in `web/`.
- **Supabase**: Postgres 17, Auth and Storage. The schema is in `web/supabase/migrations`, with Row Level Security on every table.
- **Stripe Connect** (Phase 3) and **Shippo** (Phase 4). Their tables and webhook idempotency are already in the schema.
- **Vercel** for hosting, with the project root set to `web/`.
- Business logic lives in `src/lib`, and pages and components in `src/app` and `src/components`.

## 3. What had to be created

Everything in the brief beyond the catalog data: the application, database, authentication, brand configuration, marketplace pages, payments, shipping, messaging, reviews, admin and email.

## 4. External accounts needed

| Account | Needed for | When | Status |
| --- | --- | --- | --- |
| Supabase | Database, sign-in, photos | Phase 1 | A project exists on your account but is **paused**. Not touched. |
| Vercel | Hosting | Phase 1–2 | Connected to this session. No project created. |
| Domain registrar | Custom domain | Before launch | Name not chosen (see `BRAND.md`). Nothing purchased. |
| Stripe | Payments and payouts | Phase 3 | Needs test-mode keys |
| Shippo | Rates, labels, tracking | Phase 4 | Needs a test API token |
| Resend | Email | Phase 7 (Supabase sends auth emails until then) | Needs an API key and a verified domain |
| Google Cloud | Google sign-in | Optional | OAuth client to add in Supabase |
| Sentry, GA4, Search Console | Monitoring and analytics | Phase 7 | Not started |
| OpenAI | Listing assistant | After launch | Deliberately deferred |

## 5. Phases

As in the brief: 1 Foundation → 2 Catalog and listings → 3 Payments → 4 Shipping → 5 Trust and communication → 6 Bat intelligence → 7 Admin and launch. Each phase ends with tests and a review before the next one starts.

## 6. Blockers and risks

- **Stripe funds flow.** Destination charges versus separate charges and transfers, who carries refunds and chargebacks, and whether payouts can wait until delivery all need a decision before Phase 3. The decision should come from current Stripe documentation and the business's legal setup.
- **Tax.** The marketplace-facilitator obligation by state needs a professional answer before checkout goes live.
- **Bat shipping.** Bat boxes are around 36 × 5 × 5 in, which some carrier services rate as oversized. This needs testing against live Shippo rates.
- **Catalog accuracy.** The seeded specs come from retailer listings and are marked unverified. They need review before the price guide relies on them.
- **Legal.** The terms, privacy policy, seller agreement and buyer protection policy all need an attorney's review.
