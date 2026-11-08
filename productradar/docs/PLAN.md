# Product Radar: plan, data access and costs

Checked on 2026-11-08. This is the pre-build review the brief asked for: what exists, which credentials are
needed, the database design, what each data source really allows, what it costs, and the phase plan. Rules
applied throughout: no connector is built around an endpoint that wasn't verified, nothing scrapes a platform that
forbids it, and anything unknown is stored and shown as unknown (never as zero).

## 1. Existing project

The repository already holds three projects: the static Barrel Talk bat site (root), the slow-pitch marketplace
(`web/`) and Aged Takes (`agedtakes/`). Aged Takes uses the same stack the brief asks for (Next.js 16 on Vercel,
Supabase, Claude API, Resend), so Product Radar reuses its proven patterns: the Claude wrapper with budget guard
and usage log, cron endpoints protected by `CRON_SECRET`, Postgres-backed rate limiting, structured logs, security
headers, and database tests that build a throwaway Postgres from the real migrations.

Product Radar is a new, self-contained app in `productradar/`, with its own CI and its own Supabase project.

**Hosting facts found:**
- Vercel team "AI Toolbox". On the Hobby (free) plan, each cron entry can run at most once a day. Product Radar
  therefore declares four daily ingestion entries (about 01:00, 07:00, 13:00, 19:00 UTC), which works on Hobby and
  gives the 4–6 hour cadence the brief asks for. No paid scheduler is needed.
- Supabase organisation "Master Beaty" is on the free plan, which allows **two active projects**. Both slots are in
  use (aged-takes and slowpitch-marketplace), so Supabase refused to create a third. See "Go-live decision" in the
  README.

## 2. Credentials needed

| Variable | What for | Where to get it | Cost |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database and sign-in | Supabase → project → Settings → API | Free plan |
| `NEXT_PUBLIC_SITE_URL` | Links in emails and sign-in | The Vercel address | $0 |
| `ADMIN_EMAIL` | Becomes the owner on first sign-in; receives alerts | Your email | $0 |
| `CRON_SECRET` | Protects the scheduled endpoints | Random 32+ characters | $0 |
| `ANTHROPIC_API_KEY` | Product extraction, matching, scoring, video ideas | console.anthropic.com | Usage-based, capped in Settings |
| `YOUTUBE_API_KEY` | Channel verification, uploads, view counts | Google Cloud console → YouTube Data API v3 | Free |
| `RESEND_API_KEY`, `ALERT_FROM_EMAIL` | Digest and alerts | resend.com (sending domain must be verified) | Free plan |

All keys stay on the server; nothing secret is sent to the browser.

## 3. Data sources: what is actually available

| Source | Access verified | What it gives | Restrictions | Status |
|---|---|---|---|---|
| **YouTube Data API v3** | Yes (Google docs) | Channel lookup by handle/id, uploads playlist, title, description, tags, thumbnail, duration, public view/like/comment counts | 10,000 units/day free; `channels.list`, `playlistItems.list`, `videos.list` cost 1 unit each (50 items per call). `search.list` has its own 100 calls/day. **`captions.download` needs edit rights on the video**, so other creators' transcripts are not legitimately available. | **Built (Phase 1)** |
| YouTube channel upload feed (RSS) | Yes (tested) | Latest ~15 uploads with title, description, thumbnail, views | Public feed; was intermittently returning 404/500 when tested | Built as a no-key fallback only |
| YouTube oEmbed | Yes (tested) | Title, channel, thumbnail for one video | No description or stats | Built (manual submissions without a key) |
| **TikTok oEmbed** | Yes (tested) | Video id and an embed player only (no caption, author or counts as of today); TikTok marks the endpoint "to be deprecated" | Embedding use | **Built** for manual TikTok links; the owner's notes provide the description |
| TikTok Research API | Yes (TikTok FAQ, secondary sources) | Video search and metrics | Academic, non-commercial researchers only. Not eligible. | Not used |
| TikTok Creative Center / Shop | Checked | Trend pages exist | No public API; scraping not permitted | Not used |
| Licensed TikTok data providers (e.g. EnsembleData and similar) | Exist; terms vary | Hashtag/product video counts | Paid; legality of their collection must be reviewed per vendor | Phase 2 candidate, needs your approval |
| **Instagram Graph API hashtag search** | Yes (Meta docs) | Top/recent media for a hashtag with like/comment counts | Business/Creator account, Meta app with "Instagram Public Content Access" approved in App Review, **30 unique hashtags per rolling 7 days** | Phase 2 |
| **Reddit Data API** | Secondary sources | Posts and comments | OAuth; commercial use needs a written agreement (reported ~$12k/yr minimum); reports that new public access requests closed 31 Oct 2026 (unconfirmed) | Phase 2 only with approval |
| **Amazon** | Amazon notice | PA-API 5 retired in 2026; replaced by the **Creators API**, which needs an approved Associates account with recent qualifying sales (reported 10 in 30 days) | Movers & Shakers / Best Sellers have no official API and Amazon's terms forbid scraping | Phase 3 via Creators API if eligible, or **Keepa API (from ~€49/month)** |
| AliExpress | Open Platform | Product/affiliate APIs | Approved developer/affiliate account | Phase 3 |
| Temu | Checked | No public product data API found | — | Not monitored |
| Google Shopping | Checked | No official public search API for this use | Licensed: **SerpApi** (free 250 searches/month; paid from $25/month) | Phase 3 |
| **Google Trends** | Google announcement | Official API is **invitation-only alpha** | Unofficial scraping (pytrends) is not authorised | Phase 2 via SerpApi's Google Trends engine (shares SerpApi quota) or the official API if accepted |
| Product pages (Shopify etc.) submitted by you | Built | Title, image, listed price from the page's own metadata | One fetch per submission, only if robots.txt allows; marketplaces whose terms forbid automated access are never fetched | **Built** |

## 4. Paid services and monthly cost

| Item | Plan | Monthly |
|---|---|---|
| Vercel | Hobby | $0 |
| Supabase | Free (needs a free project slot; see README) | $0 |
| Resend | Free (3,000 emails/month, 100/day). Usage: ~1 digest + a few alerts per day | $0 |
| YouTube Data API | Free quota. Usage: ~2–3 units per creator per check → ~250 units/day for 20 creators | $0 |
| Claude API, default model Opus 5.5 ($4 / $20 per million tokens) | Pay per use | **Estimated $15–30**, hard-capped at **$1.50/day and $40/month** (Settings) |
| **Total** | | **≈ $15–30, never above ~$40** |

How the Claude estimate was built: video reading in batches of six (title, description, 480×360 thumbnail) at
low effort ≈ $0.01–0.02 per video; ~30 new videos/day from 20 creators ≈ $0.40/day. A full assessment with video
ideas ≈ $0.10 each, only for products whose preliminary score reaches 40 and at most every 3 days per product.
Real costs are recorded per call (Admin → Usage & costs). Switching the model to Sonnet 5.5 roughly halves the
cost; Haiku 5.5 is about 40× cheaper but less careful with look-alike products.

Optional later services (not used now): Keepa API (~€49/month) for Amazon, SerpApi ($25/month) for Google Shopping
and Trends. Either would need your go-ahead because it pushes the total toward or over $50.

## 5. Database design

All in `supabase/migrations/`. UUID keys, timestamps, foreign keys, indexes, Row Level Security on every table.
History is appended, never overwritten.

| Table | Purpose |
|---|---|
| `users` | Who can use the app (owner/member) and their alert preferences |
| `sources` | Connector registry with honest status (active / planned / unavailable) and saved source URLs |
| `creators` | Monitored channels with verification status; only verified + active ones are polled (enforced by a constraint) |
| `creator_videos` | Raw videos/posts (YouTube uploads and manual submissions), analysis status |
| `video_stat_snapshots` | View/like/comment counts each time a video is checked (for engagement growth) |
| `products` | Canonical product records, estimates (labelled), latest score summary |
| `product_aliases` | Every name the product is sold under (AI, mentions, manual corrections, search terms) |
| `product_mentions` | Each sighting: source URL, publish time, creator, evidence location and quote, mention type, match method and confidence |
| `match_suggestions` | Possible duplicates the AI wasn't sure about, for you to merge or dismiss |
| `trend_snapshots` | Mentions in 24h/72h/7d, growth, acceleration, unique creators, platforms, view growth; search and sellers stay NULL until connected |
| `competition_snapshots` | Competition estimates per source with confidence and evidence |
| `sellers`, `seller_products` | Seller registry for Phase 3 marketplace research |
| `product_images` | Images only where the product is actually visible (thumbnail/listing) |
| `opportunity_scores` | Score history with all six categories, weights used, confidence, missing data |
| `video_ideas` | Generated organic video concepts (current and past) |
| `watchlists` | Saved / following / testing / tested / launched / rejected, per person |
| `product_alerts` | Sent alerts with a unique fingerprint (no repeats unless something material changes) |
| `ingestion_jobs` | Every run, its result and errors; also the lock against duplicate runs |
| `user_feedback` | Test results, sales after launch, corrections (input for Phase 5 learning) |
| `manual_submissions` | URLs you submitted and what happened to them |
| `ai_runs`, `api_usage` | AI tokens and cost per call; YouTube units and emails, for the cost dashboard |
| `app_settings`, `audit_log`, `rate_limits` | Settings, change history, rate limiting |

## 6. How it works (Phase 1)

1. **Monitoring** (4× daily): each verified creator's uploads playlist is read (new videos within 14 days) and
   view counts are refreshed for recent videos. One creator failing never stops the others.
2. **AI extraction**: Claude reads title, description, tags and thumbnail, and reports only physical products with
   real evidence (exact quote, or a literal description of what the thumbnail shows). Software, courses, cars,
   cash and vague "winning product" teasers are ignored.
3. **Product identification**: names are normalised; existing products with similar names are found with
   trigram search over every known alias. Identical informative words → same product. Otherwise Claude compares
   function and appearance; it merges only when the job is the same and it is confident (≥0.75). Unsure cases
   become separate products plus a review suggestion. You can merge, rename and add/remove names by hand.
4. **Trend metrics**: counts in 24h / 72h / 7 days vs the previous week, unique creators, platforms, view growth
   between checks, and **acceleration** (pace of the last 3 days vs the 11 days before, smoothed so a single
   mention isn't "infinite growth").
5. **Scoring**: the six categories with the brief's weights (editable). Momentum, acceleration and competition are
   computed from evidence; organic-video potential and problem-solving appeal are AI judgements; profit potential
   comes from estimated price, cost, shipping, payment fees and a refund reserve. A missing category counts as
   25/100 and lowers confidence, so missing data can only hurt a score. Competition from monitored creators alone is
   held near a cautious 40–55. Confidence is "high" only with all six categories, 3+ creators on 2+ platforms and
   marketplace research.
6. **Alerts**: score ≥ 80, unusual momentum, multiple independent sources, low competition with strong demand,
   and newly saturated (for products that once scored 60+). One email per product per change; a daily digest of
   the top 10.

## 7. Phase plan

| Phase | Scope | Status |
|---|---|---|
| 1. MVP | Auth, schema + RLS, dashboard, YouTube monitoring, manual URLs, AI extraction, product matching, scoring, product pages, watchlist + results, alerts, daily digest, admin (creators, sources, merging, settings, jobs, usage) | **Built and tested** |
| 2. Trend intelligence | Google Trends (SerpApi or official alpha), Instagram hashtag search (needs Meta App Review), Reddit (needs agreement), a licensed TikTok provider (needs your approval), trend charts per source | Needs accounts/approvals |
| 3. Competition intelligence | Marketplace seller discovery (Keepa/Creators API, SerpApi Shopping), seller dedupe into `sellers`/`seller_products`, saturation from marketplace counts | Needs paid keys |
| 4. Creative intelligence | Video-format classification from collected videos, hook library, test feedback loop | Partly in Phase 1 (ideas per product, result recording) |
| 5. Autonomous optimisation | Weight tuning from your recorded test results, source discovery, alert tuning | Needs a few weeks of results |

## 8. Seed creators (verified 2026-11-08)

Each channel page and upload feed was checked. Same-name channels are common, so only clear matches were
activated. Seven are verified and monitored, two are likely matches waiting for your confirmation, and eleven
need the correct channel link (Admin → Creators → paste link → Confirm).

| Creator | Result |
|---|---|
| Smith Rees Business | Verified (@SmithReesBusiness; AI organic dropshipping videos) |
| Jordan Welch | Verified (@JordanWelch, ~2.0M subscribers) |
| Success With Sam | Verified (@SuccessWithSam); recent videos are mostly AI tools |
| Sharif Mohsin | Verified (channel UC_KL_-8-6bnhQUOKoC6kADw; AI dropshipping videos) |
| Paul J Lipsky | Verified (@PaulJLipsky); recent videos are AI news |
| Esteban Hype | Verified (@EstebanHype; Spanish-language AI ecommerce) |
| Mani / Notmanii2x | Verified (@notmanii2x) |
| AC Hampton | Likely (@ACHampton → same channel id third-party stats list); confirm |
| Omar / Lighttrok | Likely (@lighttrok, channel titled "Omar"); confirm |
| Esteban Poudrier, TTPAnt, Duff, Chris GPC, Kevin Martins, Tim Ebert, Amin, Raúl Romero, Michael Bernstein, Grant Zuco, Paul Lee | Not found or same-name channel belongs to someone else (e.g. @duff posts fractal art). Need the correct link. |
