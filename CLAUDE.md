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
