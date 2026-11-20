# Gapper design system

Brand kit (logo files, print files, colors, rules): `public/brand/BRAND.md`. Logo geometry: `src/brand/emblem.ts`
(Gap Mark, bag tag, patch, lockups) and `src/brand/geometry.ts` (the drawn GAPPER letters, plus Chivo Black Italic
baked into shapes by `scripts/bake-brand-type.py` → `src/brand/type.ts`). Name, domain and lines: `src/brand/site.ts`
(use these instead of typing the name or taglines in copy).

## Brand
- **GAPPER.** Primary tagline **OWN THE GAPS.** Secondary **BUILT FOR SLOWPITCH.**
- The three words: **RECORD. ANALYZE. IMPROVE.** They are the product loop and the navigation (Record is the lime
  button; Analyze is your swings; Improve is progress, Bat DNA and your Hitting Profile).
- For adult slow-pitch softball only: USSSA, USA Softball, independent and rec leagues, tournament teams. Never
  baseball, never fastpitch, no youth styling.
- Personality: competitive, modern, confident, athletic, premium, technology-driven, community-minded. A sports
  performance company, not an AI startup.

## Concept: four outfielders, three gaps, carbon and alloy
Slow pitch plays ten fielders, four in the outfield, so there are three gaps, not two. That's the whole idea: the
Gap Mark is the outfield seen from home, four heavy blocks with three gaps, and the 12-inch ball breaking out
through the left-center gap with the wall splintering behind it. The world around it is the composite slow-pitch
bat: near-black carbon with a fine twill, graphite panels, a brushed-alloy hairline (like the taper ring on a
barrel), crisp white numbers, and one electric lime for the ball. Headlines are black italic capitals; reading text is
plain.

Retired looks (don't bring back): v1 "lights-out lab" (Archivo, Atkinson, optic yellow), v2 "championship night"
(Instrument Sans, Michroma, onyx and gold), v3 "night game, fresh-cut outfield" (Mona Sans, midnight navy, turf
mowing stripes, the corner "gap cut", the home-plate crest, the fan-shaped field mark).

## Tokens (`src/app/globals.css`)
Token names are kept from earlier versions so every screen follows: `night` = carbon/graphite, `chalk` = white text,
`optic` = lime accent, `clay` = alloy (comparison), `stitch` = the one fix.
- Surfaces: `night` #0B0C0E (Carbon), `night-2` #141619 (Graphite panels), `night-3` #1B1E22 (inputs, controls),
  `night-4` #262A2F (tracks).
- Lines: `line` #212429, `line-2` #30353B.
- Text: `chalk` #FFFFFF, `chalk-2` #C6CACE, `chalk-3` #8D939A (Steel).
- Lime: `optic` #C4F135, `optic-2` #D3F76A (hover), `optic-ink` #0B0C0E (text on lime), `optic-wash`. Key numbers,
  primary buttons, active nav, progress, improvements, the ball. Never body text.
- Alloy: `clay` #B9BFC5 (comparison marks, sensor readings) plus the `.alloy` / `.alloy-text` / `.alloy-rule`
  gradients for metallic accents. Sparingly.
- Fix: `stitch` #EF4B47. Caution: `amber` #F2B544.
- Radii are tight, like hardware: `lg` 8px, `xl` 10px, `2xl` 12px.

## Type
Chivo only (variable weight, upright and italic; `next/font` in the app, self-hosted woff2 on the landing page):
- `.display`: 900 italic capitals, tight tracking. Page titles, player names, hero lines.
- `.brandline`: the same voice for taglines and big button-like labels.
- `.btn-label`: 800 italic capitals, tracked a touch. Primary buttons.
- `.head`: 700 upright, sentence case. Section and card heads.
- `.num` (800, tabular) and `.jumbo` (900 italic, tabular): every metric.
- `.label`: 11px bold tracked capitals for dense readouts. Chivo, never a monospace.
- Body: 400–500.

## Signatures
- **Carbon** (`.carbon`): twill weave with light from the top. Hero moments only (landing, player card, the score,
  the desktop rail).
- **Alloy edge** (`.boxed`): key panels get a brushed-metal hairline across the top.
- **Outfield gauge** (`ArcScore`): the Gapper Score is the logo's outfield, four blocks lighting up lime to the
  score, the ball at the leading edge, an alloy tick for the previous score.
- **Gap rule** (`GapRule`, used by `SectionTitle`): four hairlines with three gaps, the ball in the first one.
- **Pillar strip** (`PillarStrip`): RECORD — ANALYZE — IMPROVE over page titles, with the current step lit.
- **Measured vs estimated** (`SourceLegend`, `SourceTag`, metric badges): solid dot = measured, ring = estimated from
  body tracking, lime dot = slo-mo video (± range), alloy dot = your own sensor or radar, dashed = not measured.
  Shown wherever numbers are.

## Components
Logos: `GapMark`, `LockupH`, `Crest` (the bag tag), `Patch`, `Wordmark`, `Lockup` in `src/components/Logo.tsx`. UI kit
in `src/components/ui.tsx`: `Button` (primary = lime italic capitals, ghost, quiet, danger), `PageTitle` (with
`pillar`), `PillarStrip`, `SectionTitle`, `GapRule`, `Panel` (`boxed`), `Segmented`, `Toggle`, `Stat`, `Meter`,
`InfoTip`, `Sheet`, `Chip`, `SourceLegend`, `SourceTag`, `Skeleton`, `Empty` (the mark in graphite).
Icons are drawn for Gapper in `AppShell.tsx` (plate, analyze frame, rising outfield blocks, batting helmet, composite
bat, record dot). No stock icon sets, no emoji.

## Screens
- **Navigation.** Phone: a carbon bar with Home, Analyze, the lime **Record** button, Improve, Profile. Desktop: a
  carbon rail with the lockup, "Built for slowpitch", a lime Record button and the sections.
- **Home.** Player card (name in black italic, bats/height/level, outfield gauge, front foot on time, repeatability,
  recent form), Hit live / Upload a video, Power (slo-mo speeds with their labels), the one thing to work on with a
  link to your drills, Field Print, recent swings, personal records. A new hitter gets a rookie card.
- **Swing report** (`/swings/[id]`): Analyze step, the clip, the outfield gauge with the cue, speeds, load-to-contact
  timing, score breakdown, the coach (one fix, drill, 10-swing challenge), every number with its source label, and
  hit tagging (line drive, grounder…; pull, middle, oppo) that feeds tendencies.
- **My Hitting Profile** (`/profile`, `src/components/HittingProfile.tsx`, data in `src/lib/profile.ts`): the player
  card, the season line (swings, sessions, average, best, front foot on time, repeatability, line-drive rate, top exit
  velo), score history by session, strengths and what to work on, tendencies (pull side, middle, opposite field),
  personal drills from the faults that keep showing up, and **Share player report**: a 1080 x 1350 image drawn on a
  canvas (`src/lib/report.ts`) with the Web Share sheet or a download. Settings sit below.
- **Live scoreboard**: unchanged layout (see `src/components/live/Scoreboard.tsx`), now on carbon.

## The landing page (`public/site/`)
What a new visitor sees at getgapper.com: static `index.html`, `site.css`, `site.js`, Chivo in `fonts/`, the
softball icon, and `assets/pose.json` (Gapper's tracked body points for a sample swing). Brief: `docs/site/BRIEF.md`.
- Hero: **STOP GUESSING. START HITTING.** / **BUILT FOR SLOWPITCH.** / the supporting copy / **ANALYZE YOUR SWING**
  and **SEE HOW IT WORKS**. Beside it, Gapper's tracked view of a real swing playing over the four-block outfield, the
  pitch dropping in on a high arc and the ball leaving through the left-center gap (arc and flight labelled as
  illustration). Under it, who it's for: USSSA, USA Softball, independent leagues, rec leagues, tournament teams.
- "Slow pitch is its own swing": 6–12 ft arc, 0.2 s heel-to-contact, four outfielders and three gaps.
- Record. Analyze. Improve.: setup, the real sample read (score 72 and its categories, 6 frames heel to contact), the
  one fix and its drill, the Hitting Profile and the report.
- "What Gapper measures, and how sure it is": a table with a measured / estimated / slo-mo label on every row.
- Close: the bag tag and OWN THE GAPS.
- No baseball footage or stock photography. The old site used a stock clip of a baseball player; only the tracked
  skeleton from it remains.
