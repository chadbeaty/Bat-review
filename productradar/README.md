# Product Radar

An early-warning system for organic dropshipping products. It watches YouTube creators (and links you submit),
uses Claude to work out which physical products they feature, groups the different names sellers use for the same
product, measures how fast attention is growing, scores each product's opportunity from 0 to 100, writes organic
video ideas, and emails you when something looks early and promising.

Everything shown is backed by evidence: each mention links to its source and time. Prices and costs are AI
estimates and are labelled that way. Anything the system hasn't measured (search interest, marketplace sellers…)
is shown as unknown, never as zero, and missing data can only lower a score.

- **Plan, data-source research and costs:** [docs/PLAN.md](docs/PLAN.md)
- **Running it day to day:** [docs/OPERATIONS.md](docs/OPERATIONS.md)

## What's in Phase 1

| Area | What you get |
|---|---|
| Overview | New today, first seen in the last 72 h, high-opportunity, fastest-accelerating, rising competition, recently saturated, totals |
| Early opportunities | Sortable table: image, name, score, acceleration, competition, first detected, creators, estimated price, confidence |
| Product page | Names it's sold under, images, description, discovery timeline chart, every mention with its source, creators, video stats, competition (with what isn't researched yet), cost/price/margin estimates, video ideas, score breakdown and history, AI recommendation |
| Watchlist | Save, follow, testing, tested, launched, rejected; record test results and sales |
| Submit a URL | YouTube, TikTok, Instagram, Reddit, store and marketplace links, analysed on the spot |
| Alerts | Instant email for score 80+, unusual momentum, multiple independent sources, low competition + strong demand, newly saturated; daily top-10 digest |
| Admin | Creators (verify, activate, check now), data sources, duplicate review and merging, scoring weights, alert thresholds, AI model and budget, jobs and failures, API usage and monthly cost |

## Go-live steps

The code is finished and tested. Going live needs a database slot, three API keys and a Vercel project.

### 1. Free up a Supabase project slot (your decision)

Your Supabase account is on the free plan, which allows two active projects, and both are in use (Aged Takes and
the slow-pitch marketplace). Pick one:

- **Pause the marketplace database** (free, can be restored later): supabase.com → open project
  "slowpitch-marketplace" → Project Settings → General → "Pause project". Only do this if the marketplace isn't live.
- **Upgrade Supabase to Pro**: supabase.com → Organization "Master Beaty" → Billing → Upgrade (about $25/month,
  plus roughly $10/month for each extra project). This uses most of the $50 budget.

Then tell Claude "the Supabase slot is free" and it will create the `product-radar` project, apply the database
migrations, create the Vercel project and connect them.

### 2. Get the three API keys (about 15 minutes)

Never paste keys into chat or GitHub. You'll add them in Vercel (step 3).

1. **Claude API key**: console.anthropic.com → Settings → API keys → Create key. Add a payment method under Billing.
   The app enforces its own budget ($1.50/day, $40/month by default).
2. **YouTube API key**: console.cloud.google.com → create a project (any name) → "APIs & Services" → "Enable APIs
   and services" → search "YouTube Data API v3" → Enable → "Credentials" → "Create credentials" → "API key".
   Click the new key → under "API restrictions" choose "Restrict key" → tick YouTube Data API v3 → Save. Free.
3. **Resend**: resend.com → Domains → add a domain you own and add the DNS records it shows → API keys → Create.
   The "from" address must use that domain, e.g. `Product Radar <radar@yourdomain.com>`. Free for this volume.

### 3. Add the keys in Vercel

vercel.com → team "AI Toolbox" → project "product-radar" → Settings → Environment Variables. Add each name from
[.env.example](.env.example) with its value, for "Production". Then Deployments → the latest → "Redeploy".

### 4. First sign-in

Open the site, enter the email you set as `ADMIN_EMAIL`, and click the link in the email. That address becomes
the owner. Then:

1. **Admin → Creators**: check the two "candidate" channels and click **Confirm & activate** if they're right;
   paste the correct channel link for the eleven creators that couldn't be found.
2. **Admin → Jobs → Run ingestion now** to do the first scan instead of waiting for the schedule.
3. **Admin → Jobs → Send test email** to confirm email works.

## How it runs

- Ingestion four times a day (about 01:00, 07:00, 13:00, 19:00 UTC), the daily rescore + digest at about 11:30 UTC.
  These are Vercel Cron entries (`vercel.json`), allowed on the free Hobby plan because each runs once a day.
- Every run is recorded on Admin → Jobs. If YouTube, Claude or email fails, the other steps still run and the job
  is marked "partial" with the reason. Failed video analyses are retried automatically up to three times.
- Duplicate runs can't happen: a database lock allows one ingestion cycle at a time.

## For developers

```sh
cd productradar
npm install
npm run lint && npm run typecheck
npm test            # unit tests + database tests (needs Postgres; skipped if unavailable)
npm run build
```

Database tests build a throwaway database from `supabase/migrations` plus a small Supabase stand-in
(`supabase/tests/supabase_stub.sql`). Set `TEST_DATABASE_URL` to any Postgres 15+ server you can create databases
on. `tests/db/pipeline.test.ts` runs the whole pipeline (YouTube → Claude → grouping → scoring → alerts →
digest, plus a TikTok submission) against that database, with YouTube, Claude and Resend replaced by fakes.

Layout: `src/lib/connectors` (YouTube, manual URLs, polite HTTP), `src/lib/engine` (pure logic: names, trends,
scoring, alerts), `src/lib/jobs` (ingestion, AI extraction, matching, assessment, scoring, notifications,
runner), `src/lib/ai` (Claude client, prompts, schemas), `src/app` (pages, server actions, cron endpoints). New
data sources plug in as a connector that writes `creator_videos` (or mentions) and reuses the rest of the pipeline.
