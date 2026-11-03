# AGED TAKES

**The internet has a long memory.** Some predictions age better than others.

Aged Takes is an evidence-backed public accountability archive. It records what influential people said — word for
word, dated, with the original source — and what the record shows happened next: did the prediction come true, did
they sell, did they keep the promise. Every public claim links to its source; every correction is published.

This folder is the complete application: the public website, the newsroom (admin dashboard), the database, the AI
research engine, the newsletter, and the scheduled jobs. It runs on **GitHub → Vercel → Supabase**, with **Resend** for
email and the **Anthropic Claude API** for research. No server or computer of yours needs to stay on.

> This repository also holds two older, unrelated projects (`web/` and the root Barrel Talk site). Aged Takes lives
> entirely in `agedtakes/` and does not touch them. When you create the Vercel project, set its **Root Directory**
> to `agedtakes` (step 3 below).

---

## Contents

1. [What's included and what works](#whats-included)
2. [Set it up — step by step](#setup) (about an hour, no coding)
3. [Run the newsroom](#newsroom)
4. [Costs](#costs)
5. [What still needs your credentials](#credentials)
6. [Risks and limitations](#risks)
7. [For developers](#developers)

More detail: [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) · [`docs/OPERATIONS.md`](docs/OPERATIONS.md) ·
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md)

---

<a id="whats-included"></a>
## 1. What's included and what works

**Fully working and tested** (90 automated tests, including the database's security rules on a real Postgres database):

| Area | What it does |
| --- | --- |
| Public site | Homepage (latest investigations, trending people, aged poorly/well, Did They Sell?, Never Sell Index, resolved predictions, newsletter), People directory and profiles, Investigations archive and case pages, Prediction scoreboard, Never Sell Index, Search, Methodology, Corrections, About, Submit a receipt, Privacy and Terms templates. Mobile-first, server-rendered, cached. |
| Track records | Separate, transparent measures with denominators ("7 correct out of 12 resolved predictions"). Open predictions are never counted as wrong. No single reputation score. |
| Newsroom (`/admin`) | All 17 sections: Overview, People, Statements, Predictions, Cases, Evidence, Research queue, AI-generated drafts, Submissions, Editorial approvals, Corrections, Sources, Ingestion jobs, AI usage and cost, Newsletter, Audit log, Settings. |
| Editorial workflow | Discovered → Researching → Evidence gathering → Draft ready → Needs review → Approved → Published (plus Rejected, Needs more evidence, Disputed, Archived). Review screen with original source links, evidence assessments, conflicting sources side by side, AI reasoning and flags, legal checklist, right-of-reply record, typed publish confirmation, corrections. |
| Safeguards (enforced by the database itself) | Only a signed-in human editor can approve or publish; **AI and scheduled jobs cannot**. Approval needs evidence, a classification other than Unconfirmed, and a completed legal checklist. Editing an approved case sends it back to review. Published text changes only through a recorded correction. A public prediction's original wording, date, target and deadline can never be edited in place. Every change is written to an append-only audit log. |
| Security | Supabase sign-in by emailed link, required two-step verification (authenticator app) for staff, roles (researcher / editor / admin), Row Level Security on every table, server-side checks on every action, rate limiting, security headers, input validation, no secrets in the browser. |
| AI research engine | Seven agents (Source Monitor, Statement Extraction, Historical Matching, Evidence Assessment, Investigation Draft, Prediction Resolution, Editorial Distribution) on Claude Opus 5.5 with structured, validated JSON. Quotes are kept only if they appear **word for word** in the stored source text. Daily spending cap, cost tracking, retries, de-duplication. |
| Source connectors | RSS/Atom feeds, YouTube Data API, SEC EDGAR, U.S. House disclosures, public web pages, CoinGecko and Financial Modeling Prep prices. Senate disclosures are deliberately manual (see risks). |
| Newsletter | Double opt-in signup, confirmation and welcome emails, one-click unsubscribe, weekly digest and investigation alerts — published cases only. |
| Uploads | Person photos (public, credit required) and evidence files — screenshots or filing PDFs — kept private with a fingerprint (SHA-256) proving they haven't changed. File types are checked from the file's contents; 3 MB photo / 4 MB evidence limits. |
| Audience | RSS feed of new investigations (`/feed.xml`) and Vercel Web Analytics (page views, no cookies) — switch it on under Vercel → your project → Analytics. |
| SEO and sharing | Unique titles and descriptions, canonical URLs, Open Graph and X cards, sitemap, robots.txt, breadcrumbs, structured data (NewsMediaOrganization, NewsArticle, ProfilePage, BreadcrumbList), generated share images in three sizes (for each case and for the weekly roundup), copy-ready posts for X, Facebook, Instagram, TikTok/Shorts. |
| Demo content | Five fictional people and cases clearly marked **DEMO ONLY — fictional**, linking only to `example.com`, never indexed. One switch hides them; one button deletes them. |
| Research candidates | Michael Saylor, Cathie Wood, Jim Cramer, Warren Buffett, Robert Kiyosaki, Anthony Pompliano, Raoul Pal and Nancy Pelosi are listed **internally only**, with no statements or claims, for your editors to research. |

**Built but only verifiable once you add credentials:** sign-in emails and two-step verification (Supabase), AI
research (Anthropic key), sending email (Resend), and the optional YouTube/FMP connectors. See [section 5](#credentials).

---

<a id="setup"></a>
## 2. Set it up — step by step

You'll create accounts on Supabase (database), Vercel (hosting) and, optionally, Resend (email) and Anthropic (AI).
Keep a private note open to paste values into as you go. **Never paste secret keys into GitHub, a chat, or an email.**

### Step 1 — Create the database (Supabase)

1. Go to **supabase.com** → sign in → **New project**. Name it `aged-takes`, choose a strong database password
   (save it in your password manager), pick the region closest to your readers, click **Create**.
2. When it's ready, open **Project Settings → API** and copy into your note:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (click Reveal) → `SUPABASE_SERVICE_ROLE_KEY` — this one is secret.
3. Note the **project ref** (the part before `.supabase.co` in the URL).

### Step 2 — Load the database tables (one click in GitHub)

1. In Supabase, go to your **Account → Access Tokens** (supabase.com/dashboard/account/tokens) → **Generate new token**. Copy it.
2. In GitHub, open this repository → **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `SUPABASE_ACCESS_TOKEN` = the token from step 1
   - `SUPABASE_DB_PASSWORD` = the database password from Step 1.1
   (If these secrets already exist for the other project in this repository, add `AGEDTAKES_SUPABASE_ACCESS_TOKEN`
   and `AGEDTAKES_SUPABASE_DB_PASSWORD` instead — the workflow uses those first.)
3. Go to **Actions → "Aged Takes: deploy database" → Run workflow**. Paste your **project ref**, leave
   "Also load the demo data" ticked for the first run, click **Run workflow**. Wait for the green tick.

<details><summary>Alternative without GitHub Actions</summary>

In Supabase, open **SQL Editor** and run each file in `agedtakes/supabase/migrations/` **in name order**, then
`agedtakes/supabase/seed.sql`. Each must succeed before the next.
</details>

### Step 3 — Put the site online (Vercel)

1. Go to **vercel.com** → sign in with GitHub → **Add New… → Project** → import this repository.
2. **Root Directory: click Edit and choose `agedtakes`.** (Important — otherwise Vercel builds the wrong project.)
   Framework preset: Next.js (detected automatically).
3. Open **Environment Variables** and add, one by one (values from your note):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key |
   | `SITE_URL` and `NEXT_PUBLIC_SITE_URL` | `https://<your-project>.vercel.app` for now (you'll see it after the first deploy; update and redeploy) |
   | `ADMIN_EMAIL` | your email address |
   | `CRON_SECRET`, `NEWSLETTER_SECRET`, `RATE_LIMIT_SALT` | three different long random strings (e.g. from a password generator, 40+ characters) |

4. Click **Deploy**. When it finishes, open the address Vercel shows. You should see the homepage with the demo records.
5. If the address differs from what you put in `SITE_URL`, fix both `SITE_URL` variables under **Settings → Environment
   Variables**, then **Deployments → ⋯ → Redeploy**.

> **Vercel plan:** the free Hobby plan is for non-commercial use. Because the site will carry advertising, plan to
> move to **Pro** before launch. Scheduled jobs run once a day on any plan.

### Step 4 — Connect sign-in (Supabase Auth)

1. Supabase → **Authentication → URL Configuration**:
   - **Site URL**: your site address (e.g. `https://aged-takes.vercel.app`)
   - **Redirect URLs**: add `https://aged-takes.vercel.app/auth/confirm` (and later the same with your own domain).
2. Supabase → **Authentication → Emails → Magic Link** template. Replace the link in the template with:
   ```
   {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email
   ```
   (This lets a sign-in link work even if opened on a different device or browser.)
3. Supabase → **Authentication → Sign In / Providers → Email**: keep Email enabled. **Multi-Factor**: make sure
   **TOTP (authenticator app)** is enabled.
4. For reliable delivery of sign-in emails, set Supabase **Authentication → SMTP** to use Resend (Resend's dashboard
   shows the SMTP settings). Supabase's built-in email is rate-limited and meant only for testing.

### Step 5 — Become the first admin

1. Open `https://<your-site>/sign-in`, enter the same address as `ADMIN_EMAIL`, click the link in the email.
2. You'll be asked to set up two-step verification: scan the QR code with an authenticator app
   (1Password, Google Authenticator, Microsoft Authenticator…) and type the 6-digit code.
3. You're in the newsroom at `/admin`. To add colleagues: they sign in once at `/sign-in`; then go to
   **Admin → Settings → Staff and roles**, enter their email and choose **Researcher**, **Editor** or **Admin**.

### Step 6 — Turn on email (Resend) — recommended

1. **resend.com** → sign up → **Domains → Add domain** → add the DNS records it shows at your domain registrar
   (you need a domain for this; use a subdomain like `mail.yourdomain.com`).
2. **API Keys → Create** → add to Vercel as `RESEND_API_KEY`.
3. Add `NEWSLETTER_FROM_EMAIL`, e.g. `The Weekly Aged Takes <news@yourdomain.com>` (must be on the verified domain).
4. Redeploy. Test: subscribe on the homepage with your own address, confirm, check the welcome email.

### Step 7 — Turn on AI research (Anthropic) — recommended

1. **console.anthropic.com** → **Billing** → add a payment method and some credit (API usage is billed separately from
   any Claude subscription).
2. **API Keys → Create key** → add to Vercel as `ANTHROPIC_API_KEY`. Redeploy.
3. In **Admin → Settings**, set the **AI daily budget** (default $5/day). Jobs stop for the day once it's reached.
4. Optional connectors: `SEC_USER_AGENT` (e.g. `Aged Takes research@yourdomain.com`), `YOUTUBE_API_KEY`,
   `COINGECKO_API_KEY`, `FMP_API_KEY` — see `.env.example` for where to get each.

### Step 8 — Your domain (only after you've bought it)

Don't point AgedTakes.com anywhere until you own it. When you do:
1. Vercel → Project → **Settings → Domains → Add** `agedtakes.com` (and `www.agedtakes.com`). Vercel shows the DNS
   records (usually an `A` record to `76.76.21.21` and a `CNAME` for `www` to `cname.vercel-dns.com`); add them at your registrar.
2. Change `SITE_URL` and `NEXT_PUBLIC_SITE_URL` to `https://agedtakes.com` and redeploy.
3. Supabase → Authentication → URL Configuration: update **Site URL** and add `https://agedtakes.com/auth/confirm`.
4. Resend: verify the domain for sending (Step 6).

### Before you launch

Work through [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md). The essentials: have an attorney review the
Privacy and Terms pages and your first cases, **delete the demo data** (Admin → Settings), and publish only
investigations you have verified against the original sources.

---

<a id="newsroom"></a>
## 3. Run the newsroom

**A typical case, by hand**
1. **Evidence → Add a source**: the original video, post, filing or transaction. Paste the transcript/text so quotes can be checked.
2. **Statements → Record a statement**: the exact words, date and context. Click **Check quote against source**.
3. **Cases → New case**: pick the person and type. On the case screen: link the statement, attach evidence and say
   what each piece proves and doesn't prove, add the timeline, record outreach to the subject, write the article.
4. Move it along the workflow to **Needs review**. An **editor** completes the **legal checklist**, approves, then
   publishes by typing the case's address to confirm.
5. Found a mistake after publishing? **Publish a correction** on the case — it's shown on the case and in `/corrections`.

**With AI**
- **Sources** (Pipeline): add RSS feeds, YouTube channels, SEC filers or House members to monitor. Daily, the monitor
  collects new items; the AI triages them, extracts verbatim statements, compares them with each person's history and,
  for promising leads, assesses evidence and writes a draft. Drafts stop at **Needs review** in **AI-generated drafts**.
- On any case: **Assess evidence** or **Write / rewrite draft**. On approved cases: **Generate distribution copy**.
- **Predictions**: price predictions with a provider and identifier are checked daily; proposals wait for an editor to
  **Confirm outcome**.
- Watch spending in **AI usage and cost**.

**Newsletter**: **Newsletter → New issue**, tick published cases, review the preview, tick confirm, **Send**.

**Sharing**: on an approved or published case, the **Distribution** panel has share graphics (link, square, vertical)
and copy-ready text for each platform. Social accounts aren't connected automatically — copy, download, post.

---

<a id="costs"></a>
## 4. Estimated monthly costs

Prices change; check each provider before you commit. Approximate as of late 2026:

| Service | Starting out | At launch / growing |
| --- | --- | --- |
| Vercel | $0 (Hobby, non-commercial) | ~$20/month (Pro — required for an ad-supported site) |
| Supabase | $0 (Free: pauses after a week without visits, 500 MB) | ~$25/month (Pro: no pausing, daily backups) |
| Resend | $0 (3,000 emails/month, 100/day) | ~$20/month (Pro, 50,000 emails) |
| Anthropic API | Pay per use, capped by your daily budget. Rough guide on Claude Opus 5.5: a statement extraction costs a few cents; a full draft roughly $0.10–$0.40. The default $5/day cap means at most ~$150/month. | Same; raise or lower the cap in Settings |
| Domain | ~$10–20/year | same |
| YouTube Data API, CoinGecko demo, SEC, House disclosures | $0 | $0 |
| Financial Modeling Prep (stock prices) | $0 free tier (limited) | paid plans if you resolve many stock predictions |

A realistic launch budget is **about $65–100/month plus AI usage**.

---

<a id="credentials"></a>
## 5. Integrations that still need your credentials

| Integration | Variables | Without it |
| --- | --- | --- |
| Supabase (required) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Site shows "setup needed" |
| Site address (required) | `SITE_URL`, `NEXT_PUBLIC_SITE_URL` | Links and emails point to the wrong place |
| First admin (required) | `ADMIN_EMAIL` | Nobody can open the newsroom (an admin can also be set in SQL, see OPERATIONS) |
| Scheduled jobs (required) | `CRON_SECRET` | Daily jobs are refused |
| Signing secrets | `NEWSLETTER_SECRET`, `RATE_LIMIT_SALT` | Falls back to the service key; set before launch |
| Anthropic | `ANTHROPIC_API_KEY` | AI jobs skipped; everything else works |
| Resend | `RESEND_API_KEY`, `NEWSLETTER_FROM_EMAIL` | No emails; the signup form tells visitors signups open soon |
| SEC EDGAR | `SEC_USER_AGENT` | SEC monitoring skipped |
| YouTube | `YOUTUBE_API_KEY` | YouTube monitoring skipped |
| CoinGecko | `COINGECKO_API_KEY` | Works at low volume without a key |
| Financial Modeling Prep | `FMP_API_KEY` | Stock predictions resolved manually |
| Error tracking | `SENTRY_DSN` | Errors are in Vercel's logs only (integration point: `src/lib/log.ts`) |

Admin → Settings → **Integrations** shows which are configured.

---

<a id="risks"></a>
## 6. Remaining risks and limitations

- **Legal.** This is accountability journalism about real people. The legal checklist and safeguards reduce risk but
  are not legal advice. Have a media lawyer review the Privacy/Terms templates, your correction policy and early cases.
- **AI.** The AI proposes; it can misread context or miss nuance. The code rejects quotes that aren't verbatim and flags
  accusatory language, and the database stops AI from publishing, but editors must still open every source.
- **Sources.** YouTube's public API doesn't provide transcripts; editors paste verified transcripts. House PTRs are PDFs:
  the monitor finds them, editors transcribe the transactions. Senate eFD requires accepting its terms in a browser, so
  Senate reports are added manually — we don't automate around that. Paywalled and login-only content is never fetched.
- **Serverless limits.** Each scheduled run works for up to ~5 minutes and leaves the rest queued for the next run (or
  "Run now"). Daily schedules suit an MVP; see OPERATIONS for moving to a dedicated worker.
- **Not tested here against live services.** Supabase Auth email, MFA enrollment, Resend delivery and Claude calls are
  implemented against their documented APIs and covered by tests with stand-ins, but need your accounts to verify end to end.
  The database rules, public pages and API were tested against a real Postgres database.
- **Search** uses PostgreSQL full-text search — fine for thousands of cases; consider a search service at much larger scale.
- **Images**: add person photos only when you have the right to use them; a credit is required.
- **Free tiers**: Supabase Free pauses inactive projects; Vercel Hobby forbids commercial use.

---

<a id="developers"></a>
## 7. For developers

```sh
cd agedtakes
npm ci
npm run lint && npm run typecheck && npm test && npm run build
```

`npm test` runs unit tests and, when a Postgres server is reachable at `TEST_DATABASE_URL`
(default `postgres://postgres@localhost:54329/postgres`), the database tests that apply every migration and check Row
Level Security, the publishing rules and the audit log. CI runs all of it on every push (`.github/workflows/agedtakes-ci.yml`).

Stack: Next.js 16 (App Router, server components, server actions), TypeScript, Tailwind CSS 4, Supabase (Postgres, Auth,
Storage, RLS), Anthropic TypeScript SDK, Resend HTTP API, Zod, Vitest. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
