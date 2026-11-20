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
- Fantastic Lettering premium concept (Base44 app `6afca7efb2c5fbb1bf9bc289`, https://fantastic-lettering-bf9bc289.base44.app): Hedvig Letters Serif, Hanken Grotesk; ivory, ink black and terracotta (#A64433); gallery-minimal layout with close-up product photography.
- Fantastic Lettering "Press run" scroll concept (`fantasticlettering/option-6/`, built with the scroll-craft skill): Funnel Display, Host Grotesk; graphite and bone with one ink orange; chaptered editorial with a margin folio, scroll-driven shirt print with a step ledger, sentence-form quote close. Scroll-craft registry: `fantasticlettering/scrollcraft/FINGERPRINTS.md`.
- Gapper (`swingiq/`, formerly SwingIQ; brand kit `swingiq/public/brand/BRAND.md` with print files in `public/brand/print/`, design notes `swingiq/docs/DESIGN.md`), "night game, fresh-cut outfield": owner-specified palette Midnight Navy #101827, Deep Slate #202D40, Electric Lime #B7F34A (sparingly), White, Steel Gray #8995A6; Mona Sans only (wide widths for headlines and numbers; owner suggested Space Grotesk + Inter, swapped because both are banned above). Logo system drawn as vector geometry (`src/brand/emblem.ts`, `geometry.ts`): Gap Mark = ballfield from above (infield with diamond cut out, outfield band split by the gap, comet streak and ball out past the wall); home-plate shield crest with the ball breaking through the rim; round patch with arc text; custom GAPPER letters (crossbar-less A). UI signatures: turf mowing-stripe texture on hero moments, top-right "gap cut" on key panels and main buttons, slanted jersey headlines, jumbotron count-up numbers, section headings ending in the lime ball, broadcast crawl, tracked-skeleton and ball-flight illustrations, player-card dashboard hero. Earlier SwingIQ looks, now retired: v1 "lights-out lab" (Archivo, Atkinson Hyperlegible Next, optic yellow) and v2 "championship night" (Instrument Sans, Michroma, onyx and gold). Gapper scroll site (`swingiq/public/site/`, built with the scroll-craft skill, brief `swingiq/docs/site/BRIEF.md`): split stage "What you see / What Gapper sees" with a chalk-line divider, real footage on the left, tracked skeleton on the right, heel-catch signature; same brand palette and Mona Sans (self-hosted in `public/site/fonts/`).
- Add each new site here when it's built.

## Aged Takes (`agedtakes/`)
- Live site: https://agedtakes.com (newsroom at `/admin`). Hosted on Vercel, team "AI Toolbox", project `aged-takes` (root directory `agedtakes`); pushes to `main` deploy to production.
- Database: Supabase project `civiapzdudjjdyrmogux` ("aged-takes"). Migrations live in `agedtakes/supabase/migrations/`; apply new ones to the live project as well as committing them.
- A nightly scheduled task, "Aged Takes daily research", researches people from `agent_research_brief()` and submits drafts through `agent_submit_research()`. Drafts always land in `needs_review`; only a signed-in human editor can approve or publish.
- Setup and operations docs: `agedtakes/README.md` and `agedtakes/docs/`.

## Product Radar skill (`.claude/skills/product-radar/`)
- Early-warning dropshipping product research, run as a Claude skill (web search/fetch only, no app, no paid services). The owner chose this over a hosted app to avoid any costs.
- Tracked creators: `references/creators.md` (only "verified" ones are checked). Run history is kept in `product-radar-data/` when a workspace exists.

## Gapper (`swingiq/`, formerly SwingIQ Live)
- Positioning (owner's selling point): Gapper is strictly for slow-pitch softball. There's no app built just for slow-pitch hitters (it's always baseball apps that add softball, usually fastpitch). Say it throughout: "Built for slow pitch. Not baseball. Not fastpitch." Never say baseball is coming or frame it as baseball-and-softball. Lines live in `src/brand/site.ts` (`sport`, `what`, `positioning`); the ball icon is an optic-yellow softball with red stitches. See `swingiq/public/brand/BRAND.md` › Who it's for.
- Brand: GAPPER, tagline "OWN THE GAP.", home at https://getgapper.com. The owner registered getgapper.com at Namecheap on 2026-11-19 (DNS stays on Namecheap BasicDNS: apex A records to Vercel, `www` CNAME to Vercel). It's attached to the `swingiq-live` Vercel project, with `www.getgapper.com` 308-redirecting to the apex; swingiq-live.vercel.app keeps working. Name, domain and taglines live in `src/brand/site.ts`; link previews and canonical tags follow Vercel's production domain automatically (no code change when domains change, but a new production build is needed to pick it up). The folder, Vercel project and IndexedDB name stay `swingiq` (renaming the database would lose users' saved swings).
- Real-time slow-pitch swing analysis. Everything runs on the phone (MediaPipe Pose in the browser); data is stored on the device (IndexedDB) and works with no account.
- Hosted on Vercel, team "AI Toolbox", project `swingiq-live` (root directory `swingiq`); pushes to `main` deploy to production at https://getgapper.com (also https://swingiq-live.vercel.app).
- Legs and feet come first (owner's priority): see `swingiq/docs/reports/Slow pitch lower body mechanics.md` and `src/engine/lowerbody.ts`. Slow pitch differs from baseball: skilled hitters land the front heel ~0.2 s before contact; don't apply baseball "foot down early" norms. The owner's reference guide: https://www.playisps.com/news_article/show/1351103.
- Plan, honest measurement limits, costs and roadmap: `swingiq/docs/ARCHITECTURE.md`. Every metric carries a source tag and confidence.
- Exit velo, launch angle, pitch speed and bat speed come only from slo-mo uploads (120–240 fps), never from live mode or normal-speed video, and always with a ± range (owner chose no extra hardware). Method: `swingiq/docs/ARCHITECTURE.md` section 6; code in `src/engine/{motion,ballflight,speeds}.ts`. Bat speed is derived from exit velo + pitch speed and is labeled as assuming a sweet-spot hit. Real-world accuracy hasn't been checked against a radar yet: don't advertise a specific accuracy until it has.
- Supabase schema + RLS is in `swingiq/supabase/migrations/` but no project is connected yet (the free org already has two active projects). Accounts switch on when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- The live-camera, upload and slo-mo speed browser tests need `swingiq/scripts/fetch-test-video.sh` (stock clip plus a generated 240 fps clip with a known-speed ball, not committed).
- MVP directive status (what's built, what's honestly unavailable until Phase 2): `swingiq/docs/MVP-STATUS.md`.
- getgapper.com "/" is the scroll site (`public/site/index.html`, static, scroll-craft engine copied unedited) for anyone without the `gapper_hitter` cookie; with it, "/" is the app. The rewrite is in `next.config.ts`; `PlayerProvider` keeps the cookie in step with whether a hitter exists (`src/lib/hitterCookie.ts`). The site's "Start swinging" goes to `/start` (setup). A hitter saved before the site existed is detected from IndexedDB by `public/site/site.js` and sent to `/start`, which sets the cookie and opens the app. The site's numbers are Gapper's real output on the test clip (labelled as a stock-clip sample); regenerate assets from `tests/fixtures/video/source.mp4` if the analyzer changes (steps in `docs/site/BRIEF.md`).
