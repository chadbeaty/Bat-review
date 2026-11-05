# Local development

## With a Supabase project (recommended)
1. Create a development Supabase project and apply the migrations and seed (README step 2, or `supabase db push --include-seed` from this folder after `supabase link`).
2. `cp .env.example .env.local` and fill in the development values.
3. `npm ci && npm run dev` → http://localhost:3000. Sign in at `/sign-in` with your `ADMIN_EMAIL`.

Or run Supabase locally with the CLI and Docker: `supabase start` (uses `supabase/config.toml`, applies migrations and `seed.sql`).

## Tests
```sh
npm run lint
npm run typecheck
npm test            # unit tests, plus database tests when Postgres is reachable
npm run build
```
Database tests need a Postgres 15+ server (no Supabase required): they create a throwaway database, load
`supabase/tests/supabase_stub.sql` (a stand-in for Supabase's auth schema and roles), every migration and the seed, then
run queries as anonymous visitors, readers, staff and the service role. Set `TEST_DATABASE_URL` if your server isn't at
`postgres://postgres@localhost:54329/postgres`. Without a reachable server those tests are skipped.

## Previewing the public site without Supabase
`scripts/dev/local-rest.mjs` answers the public read API from a local Postgres database as the anonymous role, which is
enough to browse every public page with the demo data:

```sh
createdb agedtakes_preview
for f in supabase/tests/supabase_stub.sql supabase/migrations/*.sql supabase/seed.sql; do psql -v ON_ERROR_STOP=1 -d agedtakes_preview -f "$f"; done
LOCAL_DATABASE_URL=postgres://localhost/agedtakes_preview node scripts/dev/local-rest.mjs &
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=local-preview-anon-key-000000 npm run dev
```
Sign-in, the newsroom, signups and submissions need a real Supabase project. Never deploy the preview script.
