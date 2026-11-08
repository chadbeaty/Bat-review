# Notes for Claude sessions

## Working with the owner
- The owner is not a developer. Explain things in plain, non-technical language, give click-by-click steps for anything they must do, and take initiative on technical decisions.
- **Standing instruction:** merge your own pull requests once all checks pass, without asking. (Never merge someone else's PR, and never merge while a check is red.)
- Never ask the owner to paste secrets into chat or GitHub.

## Aged Takes (`agedtakes/`)
- Live site: https://agedtakes.com (newsroom at `/admin`). Hosted on Vercel, team "AI Toolbox", project `aged-takes` (root directory `agedtakes`); pushes to `main` deploy to production.
- Database: Supabase project `civiapzdudjjdyrmogux` ("aged-takes"). Migrations live in `agedtakes/supabase/migrations/`; apply new ones to the live project as well as committing them.
- A nightly scheduled task, "Aged Takes daily research", researches people from `agent_research_brief()` and submits drafts through `agent_submit_research()`. Drafts always land in `needs_review`; only a signed-in human editor can approve or publish.
- Setup and operations docs: `agedtakes/README.md` and `agedtakes/docs/`.

## Product Radar (`productradar/`)
- Early-warning product research tool for organic dropshipping. Plan, verified API access and costs: `productradar/docs/PLAN.md`; setup: `productradar/README.md`; operations: `productradar/docs/OPERATIONS.md`.
- Needs its own Supabase project. As of 2026-11-08 the free Supabase org has no free project slot (aged-takes and slowpitch-marketplace are active); the owner must pause one or upgrade before go-live. Migrations: `productradar/supabase/migrations/` (apply to the live project too once it exists).
- Vercel Hobby allows each cron entry once a day, so `vercel.json` lists four daily ingestion entries.
- Never add a connector for an unverified endpoint, and never scrape platforms that forbid it (TikTok, Amazon, etc.). Missing data must stay NULL, never zero.
- Tests: `npm test` in `productradar/` (DB tests need `TEST_DATABASE_URL`; `tests/db/pipeline.test.ts` exercises the whole pipeline with fake YouTube/Claude/Resend).
