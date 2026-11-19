# Gapper design system

Brand kit (logo files, print files, colors, rules): `public/brand/BRAND.md`. Logo geometry: `src/brand/emblem.ts`
(Gap Mark, crest, patch, lockup) and `src/brand/geometry.ts` (the drawn letters). Name, domain and taglines:
`src/brand/site.ts` (use these instead of typing the name in copy).

## Concept: night game, fresh-cut outfield
A gapper splits two outfielders and runs to the wall. Gapper looks like the outfield under the lights: midnight navy,
the diagonal mowing stripes of fresh-cut grass ("turf"), chalk lines, and one electric lime ball that marks what
matters. The Gap Mark (the field from above, split by the gap, the ball streaking out) is the logo, the app icon,
the center action and a watermark on player cards. Hero moments get the turf, jersey-style slanted headlines,
jumbotron numbers that count up, and the "gap cut" (top-right corner taken off key panels and main buttons). Section
headings end in the ball. The landing page is a full-width brand page with the crest, a broadcast crawl of what
Gapper measures, the tracked-skeleton illustration and the ball-flight diagram.

History: v1 "lights-out lab" (blue-black, optic yellow, Archivo/Atkinson) and v2 "championship night" (onyx and
gold, Instrument Sans/Michroma, SwingIQ name) were replaced by this rebrand.

## Tokens (`src/app/globals.css`)
Token names are kept from earlier versions so every screen follows: `optic` = lime accent, `clay` = comparison tone,
`stitch` = the one fix.
- Surfaces: `night` #101827 (Midnight Navy), `night-2` #1A2537 (panels), `night-3` #202D40 (Deep Slate: inputs,
  controls), `night-4` #2B3A52 (tracks).
- Lines: `line` #253247, `line-2` #34445D.
- Text: `chalk` #FFFFFF, `chalk-2` #C3CAD5, `chalk-3` #8995A6 (Steel Gray). Sentence case; no small uppercase eyebrows.
- Lime: `optic` #B7F34A, `optic-2` #CBF779 (hover), `optic-ink` #101827 (text on lime), `optic-wash`.
  Use it for key metrics, primary buttons, active nav, progress and improvements. Section links and labels stay
  white/steel.
- Comparison: `clay` #A9BCD6. Fix: `stitch` #F25C5C. Caution: `amber` #F5B84A.
- Radii: `lg` 10px, `xl` 14px, `2xl` 18px.

## Type
Mona Sans only (variable width and weight, loaded with `next/font`):
- `.display`: 118% width, 760 weight, tight tracking. Page titles and hero lines.
- `.head`: 108% width, 650 weight. Section and card heads.
- `.num`: 112% width, 680 weight, tabular numerals. Every metric.
- Body: normal width, 400–500.

## Utilities
`.surface` (slate panel, hairline edge), `.boxed` (key panels: lime catches the top-left edge), `.turf` (mowing
stripes + light, hero moments only), `.cut` / `.cut-sm` (the gap cut), `.jumbo` (jumbotron numerals), `.slant`
(forward lean for headlines), `.brandline` (wide uppercase tagline type), `.crawl` (ticker), `.streak` / `.land`
(the ball leaving the bat), `.grow-y`, `.hatch` ("not measured", never a fake zero), `.skel`, `.press`, `.draw` /
`.grow`.

## Components
Logos: `GapMark`, `LockupH`, `Crest`, `Patch`, `Wordmark`, `Lockup` in `src/components/Logo.tsx`. Brand pieces in
`src/components/brand.tsx`: `useCountUp` / `CountUp`, `Crawl`, `Streak`, `SwingFigure`, `FlightDiagram` (illustrations
only, no numbers). Landing page: `src/components/Landing.tsx` (shown at `/` until a hitter is set up; no app chrome). UI kit in `src/components/ui.tsx`: `Button`
(primary = lime, ghost, quiet, danger), `PageTitle`, `SectionTitle`, `Panel` (`boxed`), `Segmented`, `Toggle`,
`Stat`, `Meter`, `InfoTip`, `Sheet`, `Chip`, `Skeleton`, `Empty`.

## Live scoreboard
Scoreboard mode (`src/components/live/Scoreboard.tsx`) is the after-swing readout for a phone on a tripod 10–15 ft
away. One turf panel with the gap cut fills the space between the live top bar and the buttons. The gap timer is the
headline in `.jumbo` sized off the viewport (about 31vw in portrait, 16vw in landscape), then a plain verdict line, a
reference bar (the 0.14–0.38 s window in steel, a white tick at 0.20 s, this swing as the lime ball), then the score
in `.jumbo` and the spoken cue. White on navy for contrast; lime only on the heading ball, the marker and an
in-window verdict. Portrait stacks gap over score; landscape puts them side by side. The fine print (± one frame,
source, confidence) stays small: it's for reading up close, not from the plate. No ball or bat speeds here.

## Signature visuals (real data only)
Gapper Score dial (`ArcScore`), Field Print, swing timeline (`PhaseLine`), speed range bars, trend chart with
session bands, spark bars, spray chart, bat profile drawn to length.

## Navigation
Phone: floating bar; the lime button in the middle carries the Gap Mark and opens New swing (Record or upload / Live
cage session). Active tab = lime icon and dot. Desktop: navy rail with the horizontal lockup, a lime New swing button
and the sections. Dashboard hero = player card (name in slanted jersey type, bats/height/level, score dial, recent
form); a new hitter gets a "rookie card".

## Icons and sharing
`src/app/icon.svg`, `apple-icon.tsx`, `icon-192.png` / `icon-512.png` routes (maskable) and the link preview
(`opengraph-image.tsx` / `twitter-image.tsx` via `src/brand/og.tsx`) are all drawn from the brand geometry.

## The scroll site (`public/site/`)

What a new visitor sees at getgapper.com. A static page on the scroll-craft engine (`scrollcraft.js`/`.css`, copied unedited) plus `site.js`, which draws Gapper's side and runs the signature move. Brief, feeling curve and asset recipe: `docs/site/BRIEF.md`.

- Split stage: **What you see** (left, real footage graded toward navy, narrow upright Mona Sans) against **What Gapper sees** (right, navy, the tracked skeleton, wide italic Mona Sans). The chalk line between them is the only navigation: Gap Mark, both labels, the swing's phase ticks, one "Start swinging".
- Signature: the heel catch. The scrubbed swing holds on the front heel strike, a lime ring hits the heel on both sides, and your scroll steps frame by frame to contact while the counter counts frames and the divider fills "the gap". The gap stays stamped on the line to the end, where the line runs to the edge and Gapper's side takes the screen.
- Every number on it is Gapper's real output on the stock test clip and is labelled that way. Frames, not seconds, because the clip's slow-motion factor is unknown.
