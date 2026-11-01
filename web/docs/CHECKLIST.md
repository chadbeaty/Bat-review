# Development checklist

✅ done and tested · 🟡 built, waiting on an outside account · ⬜ not started

## Phase 1: Foundation (complete, ready for review)

- ✅ Project assessment (`docs/ASSESSMENT.md`)
- ✅ Next.js 16, TypeScript and Tailwind app in `web/`
- ✅ Database schema: all 24 tables from the brief, plus offers, saved searches, watchlist, user roles, user blocks, reports, catalog submissions, webhook events, site settings and newsletter subscribers (5 migrations)
- ✅ Row Level Security on every table, with column privileges hiding emails, ZIP codes and the ship-from ZIP
- ✅ Database rules:
  - A listing can't be published without photos, every damage question answered, and the ownership and authenticity declarations
  - Sellers can't mark their own items sold or featured
  - A listing can't be sold twice
  - Reviews only come from completed orders
  - Messages are rate-limited and respect blocks
  - The audit log is append-only
  - Fee changes are audited
- ✅ Seed data: 9 categories (each with its own listing fields and required photos), 20 manufacturers, fees (7% commission, $3.99 featured, $9.99 premium), settings, and 121 bat models with 138 spec rows (all marked unverified, with sources)
- ✅ Photo storage buckets with per-user folders (tested on local Supabase)
- ✅ Email and password sign-up with required email confirmation, sign-in, sign-out, password reset, and expired-link handling
- 🟡 Google sign-in: built, turned off until a Google OAuth client is added in Supabase
- ✅ Session refresh and protected routes (proxy redirect, plus a server-side check on each page)
- ✅ Brand configuration in one file (`src/config/brand.ts`); 20 name options checked for .com availability (`docs/BRAND.md`)
- ✅ Homepage with every section in the brief:
  - Real catalog numbers and the live commission rate
  - Empty states instead of sample listings
  - The partners section appears only for paid sponsors
  - Working newsletter sign-up
- ✅ Header, footer, manufacturer directory, 404 page, robots.txt, sitemap and security headers
- ✅ Placeholder pages for everything linked but not yet built, so there are no broken links
- ✅ Preview mode: the site runs without a database, with a visible notice
- ✅ Tests: 58 unit and database tests, 21 browser tests (desktop, iPhone, Android, tablet)
- ✅ CI workflow (`.github/workflows/web-ci.yml`)
- 🟡 Hosted environment: needs your Supabase project (paused) and a Vercel project

## New-bat signals (database done, pages come with Phase 6)

- ✅ Release date and status; maturity labels new release / early reports / established / limited data
- ✅ First Swings owner check-ins (one per week, no edits or deletes), automatic verified-owner mark from completed orders, removed on refund
- ✅ Durability tracker (needs at least 3 owners, no user ids), lineage links, review alerts
- ✅ Lineage map for 2026–27 bats (`data/lineage.json`) and research notes (`docs/NEW-BAT-RESEARCH.md`)
- ⬜ Load `data/lineage.json` into `product_lineage` and add release dates for 2026–27 models
- ⬜ Model page sections: release badge, "What changed from last year", predecessor reviews (labeled), First Swings form and results, durability chart, reviewed alternatives, warranty line, alert button
- ⬜ Alert notifier (after Resend is set up)

## Phase 2: Catalog and listings (next)

- ⬜ Shop and category pages with search and filters (Postgres full-text plus trigram search for misspellings)
- ⬜ Bat filters: brand, model, year, weight, stamp, weighting, condition, price, seller rating
- ⬜ Listing flow: 10 steps, drafts, photo upload, category-specific fields, disclosures, preview
- ⬜ Listing detail page with condition and damage disclosures
- ⬜ Seller public profiles and stats
- ⬜ Catalog request flow for missing models
- ⬜ Profile editing

## Phase 3: Payments (needs Stripe test keys)

- ⬜ Funds-flow decision record: destination charges vs separate charges and transfers, refund and chargeback liability, payout timing
- ⬜ Connect onboarding (Stripe-hosted), checkout, commission from `fee_configuration`, signed and idempotent webhooks, refunds, payout status

## Phase 4: Shipping (needs a Shippo test token)

- ⬜ Provider abstraction, live rates at checkout, label purchase after payment, tracking webhooks, long-package handling

## Phase 5: Trust and communication

- ⬜ Messaging UI, offers and counteroffers, reviews UI, reporting, disputes, fraud flags

## Phase 6: Bat intelligence

- ⬜ Model pages (`/bats/manufacturer/model/year`), price guide (asking vs sold, sample-size thresholds from settings), comparison, watchlist and price-drop alerts, published reviews from `data/reviews.json`

## Phase 7: Admin and launch

- ⬜ Admin dashboard: role-checked, server-side, audited
- ⬜ Analytics, email templates (Resend), Sentry
- ⬜ Strict Content-Security-Policy with nonces
- ⬜ MFA for admins
- ⬜ Legal pages reviewed by an attorney
- ⬜ Tax strategy
- ⬜ Launch checklist

## Known limitations right now

- No listings, checkout, shipping or messaging screens yet. The database supports them; the pages come in Phases 2–5.
- Seeded bat specs and prices are unverified retailer data.
- Supabase's built-in email service is rate-limited and for testing only. Production email needs Resend (or SMTP) set up in Supabase.
- Content-Security-Policy is not yet strict (baseline security headers only).
