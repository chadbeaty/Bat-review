# Slow-pitch marketplace (Gamer Bat)

A nationwide marketplace for buying and selling used slow-pitch softball equipment, with bats as the main category and a bat database behind them.

**Status: Phase 1 (foundation) is complete and tested.** Accounts, the database with all its security rules, the bat catalog and the homepage work. Listings, checkout, shipping and messaging come in the next phases. See `docs/CHECKLIST.md` for exactly what is done.

## For the owner: how it works today

- **Visitors** can browse the homepage, see the bat catalog numbers and manufacturers, and join the newsletter.
- **Members** can create an account (email confirmation required), sign in and out, reset a password, and see their account page.
- **Every page** linked from the menus exists. Pages planned for later phases say which phase they arrive in.
- **The database** already enforces the marketplace rules. For example, a listing can't go live without photos and damage answers, an item can't sell twice, and only buyers and sellers of a completed order can review each other.

### Change the name, colors or contact emails

Edit `src/config/brand.ts` and redeploy. The brand is **Gamer Bat** (gamerbat.com, chosen 2026-11-03; trademark search pending by owner). The decision, visual direction and earlier name options are in `docs/BRAND.md`.

### Change marketplace fees

Fees are stored in the database, not in the code. Change them in the admin dashboard under **Admin → Fees**: you create a new fee version that starts now or on a future date, and past versions stay as history. Every change is recorded in the audit log.

### Change settings

The price guide thresholds (5 and 10 verified sales), the offer expiry (48 hours), the listing expiry (90 days) and the message rate limit are rows in `site_settings`.

### Make someone an admin

In the Supabase SQL editor, run:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'owner@example.com';
```

## Connect Supabase (needed before going online)

1. Open your Supabase project. The one on your account is currently paused, so restore it or create a new one.
2. Install the CLI and link the project: `npx supabase link --project-ref <your-project-ref>`.
3. Apply the database: `npx supabase db push`, then load the starting data. In the SQL editor, run `supabase/seed.sql`, then `supabase/seed/catalog.sql`.
4. Under **Authentication → URL Configuration**:
   - Set the Site URL to your domain.
   - Add `https://<domain>/auth/confirm` and `https://<domain>/auth/callback` as redirect URLs.
5. Under **Authentication → Providers → Email**:
   - Keep "Confirm email" on.
   - Set the minimum password length to 10.
6. Copy the project URL, the anon key and the service role key into Vercel's environment variables (see `.env.example`). The service role key must never be exposed in the browser or committed.
7. Optional: for Google sign-in, enable Google under **Providers**, then set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.
8. Before launch, set up custom SMTP with Resend under **Authentication → Emails**. Supabase's built-in email is for testing only.

## Deploy (Vercel)

1. Import the GitHub repository into Vercel and set **Root Directory** to `web`.
2. Add the environment variables from `.env.example` for Preview (test keys) and Production.
3. Each push deploys a preview; merging to `main` deploys production.

## For developers

```sh
cd web
npm install
npx supabase start            # local Supabase in Docker: database, auth, storage, Mailpit inbox
npx supabase status -o env    # copy the URL and keys into .env.local (see .env.example)
npm run dev                   # http://localhost:3000
```

Without Supabase the site runs in **preview mode**: the catalog uses built-in data and accounts are turned off.

### Running the tests

| Command | What it checks | Needs |
| --- | --- | --- |
| `npm test` | Unit tests (fees, validation, redirects, brand config, seed consistency) and database security tests | Postgres for the database tests (`TEST_DATABASE_URL`, default `localhost:54329`); they are skipped if none is running |
| `npm run test:e2e` | Browser tests: homepage, links, the full account flow with real confirmation emails, phone, tablet and desktop layouts | A production build and `npx supabase start` |
| `npm run lint`, `npm run typecheck` | Code style and types | none |

GitHub runs all of these on every push (`.github/workflows/web-ci.yml`).

### Where things are

| Path | What |
| --- | --- |
| `src/config/brand.ts` | Brand name, colors, emails, social links |
| `src/app` | Pages and server actions |
| `src/lib` | Business logic: fees, catalog queries, Supabase clients, validation |
| `supabase/migrations` | Database schema, security rules and storage (see `docs/DATABASE.md`) |
| `supabase/seed.sql`, `supabase/seed/catalog.sql` | Starting data. The catalog file is generated from `../data/bats.json` by `npm run catalog:seed` |
| `tests/` | Unit, database and browser tests |
| `docs/` | Assessment, checklist, database guide, brand options |

### Security notes

- Every table has Row Level Security. Browsers only ever hold the public anon key.
- The service role key is used only in server code (`src/lib/supabase/admin.ts`), and only for work the database keeps away from browsers.
- Redirects after sign-in are limited to this site.
- Sign-up and password-reset responses are identical whether or not an email exists, so accounts can't be discovered that way.
- Security headers are set in `next.config.ts`. A strict Content-Security-Policy is planned for Phase 7.
