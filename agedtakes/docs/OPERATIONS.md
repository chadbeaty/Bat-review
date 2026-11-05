# Aged Takes — operations

## Scheduled jobs

Defined in `vercel.json` (Vercel Cron; times are UTC, once daily so they work on every Vercel plan):

| Endpoint | When | Does |
| --- | --- | --- |
| `/api/cron/monitor` | 06:17 | Source Monitor: runs every due monitored source, stores new items, AI-triages them, queues extraction |
| `/api/cron/research` | 07:41 | Works through the research queue (extraction → matching → evidence → draft) for up to ~4 minutes |
| `/api/cron/resolve-predictions` | 08:23 | Proposes outcomes for due/price-tracked predictions (editors confirm) |

Each requires `Authorization: Bearer $CRON_SECRET` (Vercel adds it automatically). To run one by hand:

```sh
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-site>/api/cron/research
```

In the newsroom: **Research queue → Run next jobs now**, **Sources → Check now**, **Ingestion jobs → Run monitor now**.
On Vercel Pro you can schedule them more often by editing `vercel.json` (e.g. `"0 */4 * * *"`).

### How the queue behaves
- Jobs are claimed with row locks (`claim_research_jobs`), so overlapping runs never process the same job twice.
- Identical work is de-duplicated by `dedupe_key` (e.g. `extract:<item id>`).
- Failures retry with exponential backoff (4, 16, 64… minutes) up to `max_attempts`, then show as **failed** with the error; **Retry** re-queues.
- A job left "running" by a timed-out function is reclaimed after 15 minutes.
- AI jobs pause automatically when `ANTHROPIC_API_KEY` is missing, AI research is switched off in Settings, or the daily budget is reached.

### Scaling the worker
Serverless runs are capped (~5 minutes). When the queue grows beyond what daily runs clear:
1. Schedule `/api/cron/research` more often (Vercel Pro), or
2. Run a long-lived worker that calls the same code: `processJobs(db, { worker, budgetMs })` from `src/lib/jobs/runner.ts`
   in a loop on a small container (Fly.io, Railway, Render, a Supabase Edge Function on a schedule, etc.), with the
   service-role key. Because jobs are claimed with `FOR UPDATE SKIP LOCKED`, several workers can run in parallel safely.
3. For very large backfills, use the Anthropic Message Batches API (50% cheaper) — the agents' prompts and schemas in
   `src/lib/ai/` are reusable as batch requests.

## AI usage and cost
- Every Claude call is logged in `ai_runs` (agent, model, prompt version, tokens, estimated cost, duration, status, error).
  **Admin → AI usage and cost** summarises by day and agent.
- Default model: `claude-opus-5-5` (override with `ANTHROPIC_MODEL`). Prices used for estimates are in `src/lib/ai/pricing.ts`.
- Daily cap: **Admin → Settings → AI daily budget**. The cap is checked before each call.
- Requests use structured outputs (validated again in code with Zod) and the server-side refusal fallback.
- Prompts live in `src/lib/ai/prompts.ts`. When you change one, bump its version so `ai_runs` shows which wording produced which output.

## Monitoring
- **Logs**: structured JSON lines (`src/lib/log.ts`) in Vercel → Project → Logs. Secrets, tokens and emails are redacted.
- **Error tracking**: call `setErrorReporter()` from `src/lib/log.ts` in an `instrumentation.ts` file with your tracker
  (e.g. Sentry's Next.js SDK using `SENTRY_DSN`). Every `log.error` is then reported.
- **Job history**: Admin → Research queue, Ingestion jobs, AI usage.
- **Audit log**: Admin → Audit log (append-only; written by database triggers).

## Backups and recovery
- Supabase Pro takes daily backups (7 days retained); Point-in-Time Recovery is an add-on. Restore from Supabase → Database → Backups.
- Monthly manual export (keep a copy outside Supabase):
  ```sh
  supabase db dump --db-url "$DATABASE_URL" -f aged-takes-$(date +%F).sql          # schema
  supabase db dump --db-url "$DATABASE_URL" --data-only -f aged-takes-data-$(date +%F).sql
  ```
  `DATABASE_URL` is under Supabase → Connect → connection string (keep it secret).
- To rebuild from scratch: create a new project, run the migrations (GitHub Action), then restore the data dump.
- Source snapshots (`source_snapshots`) preserve the text of sources even if the original disappears; also save archive.org links on each source.

## Roles and access
- Researcher: research, draft, triage, queue AI. Editor: + approve, publish, correct, resolve predictions, newsletter. Admin: + settings, roles, subscribers, audit log.
- Grant roles in Admin → Settings. Emergency (no admin can sign in): in Supabase SQL Editor run
  `update public.profiles set role = 'admin' where email = 'you@example.com';`
- Two-step verification is required for staff. If an editor loses their authenticator, remove their factor in
  Supabase → Authentication → Users → (user) → MFA, then they enroll again.
- The database refuses to demote or suspend the last admin.

## Development and production configuration
- Use **two Supabase projects**: one for development/preview, one for production. Never put the production service key in Preview or Development environments in Vercel.
- `npm run dev` with `.env.local` pointing at the development project. See `docs/LOCAL_DEVELOPMENT.md` to preview without any Supabase project.
- Schema changes: add a new file in `supabase/migrations/` (never edit an applied one), run the tests, merge, then run the "Aged Takes: deploy database" workflow without demo data.

## Security notes
- All newsroom writes run through the staff member's own session, so Row Level Security, the editorial triggers and the audit log see the real person. The service role is used only for jobs, signups, submissions and bootstrap.
- The database itself enforces: human-only approval/publishing, typed publish confirmation, correction-only edits after publication, immutable public predictions, append-only audit log, corrections and review history.
- Rate limits (Postgres-backed): newsletter 5/hour/IP, submissions 5/hour/IP, sign-in 8/hour/IP and 5/hour/email.
- Security headers (CSP, HSTS, frame-ancestors none, nosniff, referrer policy) are set in `next.config.ts`. Tighten the CSP with nonces if you add analytics or ad scripts.
