# Notes for Claude sessions

## Working with the owner
- The owner is not a developer. Explain things in plain, non-technical language, give click-by-click steps for anything they must do, and take initiative on technical decisions.
- **Standing instruction:** merge your own pull requests once all checks pass, without asking. (Never merge someone else's PR, and never merge while a check is red.)
- Never ask the owner to paste secrets into chat or GitHub.

## Designing websites (standing rule from the owner)
Every site must look one-of-a-kind. Nobody should be able to tell an AI built it, and it must not resemble any earlier site in this repo or the typical "AI-built" site a competitor would also get.

**Before designing**
- Research the actual business, place and trade first. Build the concept from something specific to them (their craft, tools, neighborhood, history, materials, customers), not from a layout template.
- Write a one-paragraph design concept and pick type, color and layout that serve it. If the concept could fit a different business just by swapping the name, it isn't specific enough.
- Compare it to the "already used" list below and to the default look. If it overlaps, change it.

**Never use the default AI look**
- Fonts: no Inter, Inter Tight, Roboto, Open Sans, Poppins, Montserrat, Space Grotesk, DM Sans, or system-font stacks as the main typeface.
- Layout: no centered hero with a "small red eyebrow, big heading, gray paragraph, two pill buttons, three check-mark bullets" stack; no rows of three or four rounded cards with an icon in a tinted square; no 4-box stat grid; no "Step 1-2-3-4" columns; no FAQ accordion with plus icons as the default treatment.
- Style: no soft drop shadows on white rounded cards everywhere, no purple/indigo or blue gradients, no gradient blobs, no glassmorphism, no emoji used as icons, no generic stock-icon sets.
- Copy: avoid stock phrases such as "Elevate", "Unlock", "Seamless", "Your partner in…", "We've got you covered", "Look no further".
- Do not fall into my own recurring habits either: condensed all-caps display type with small uppercase monospace labels, numbered "01 / 02" section labels, and IBM Plex Mono have now been used on several sites here. Don't reuse them.

**Already used here (don't repeat these fonts or palettes)**
- Barrel Talk (root): Barlow Condensed, Public Sans, IBM Plex Mono.
- Marketplace (`web/`): Anybody, Schibsted Grotesk, Martian Mono.
- Aged Takes (`agedtakes/`): Fraunces, Source Serif 4, IBM Plex Mono.
- Fantastic Lettering concept (`fantasticlettering/`): Alfa Slab One, Libre Franklin; paper/ink with Chicago-flag red and light blue; print-shop motifs (registration marks, squeegee animation, quote worksheet and receipt, work-order ticket). Live preview: https://fantastic-lettering-concept.vercel.app (Vercel project `fantastic-lettering-concept`, root directory `fantasticlettering`).
- Add each new site here when it's built.

## Aged Takes (`agedtakes/`)
- Live site: https://agedtakes.com (newsroom at `/admin`). Hosted on Vercel, team "AI Toolbox", project `aged-takes` (root directory `agedtakes`); pushes to `main` deploy to production.
- Database: Supabase project `civiapzdudjjdyrmogux` ("aged-takes"). Migrations live in `agedtakes/supabase/migrations/`; apply new ones to the live project as well as committing them.
- A nightly scheduled task, "Aged Takes daily research", researches people from `agent_research_brief()` and submits drafts through `agent_submit_research()`. Drafts always land in `needs_review`; only a signed-in human editor can approve or publish.
- Setup and operations docs: `agedtakes/README.md` and `agedtakes/docs/`.

## Product Radar skill (`.claude/skills/product-radar/`)
- Early-warning dropshipping product research, run as a Claude skill (web search/fetch only, no app, no paid services). The owner chose this over a hosted app to avoid any costs.
- Tracked creators: `references/creators.md` (only "verified" ones are checked). Run history is kept in `product-radar-data/` when a workspace exists.
