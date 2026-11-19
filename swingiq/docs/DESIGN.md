# SwingIQ design system: "championship night"

## Concept
Slow pitch is played for rings and plaques, under field lights, on a ball that drops in on a 6–12 ft arc. SwingIQ is
the instrument a serious hitter keeps for that: a dark onyx case, a gold-cased gauge, numbers engraved like a
chronograph. Gold is the one precious thing on the screen and it marks what's yours (your score, your speeds, the
primary action). Silver is the comparison metal (before, the other swing, your best on a scale). Crimson, the colour
of a ball's stitching, is reserved for the one thing to fix.

v1 ("lights-out lab": blue-black, optic yellow, Archivo/Atkinson) was replaced because it didn't read as premium.

## Brand
- Mark (`src/components/Logo.tsx`): a gold ball whose seam runs as one "S" for swing, laced along its length. The
  lacing is placed by arc length and skipped where the seam bends too tight, so it stays clean at every size.
  `LogoMark` (React), `Wordmark` (mark + "SWINGIQ" in Michroma, "IQ" in gold), `LOGO_SVG()` (string, for icons).
- Icons: `src/app/icon.svg` (favicon), `apple-icon.tsx` (180), `icon-192.png` and `icon-512.png` routes (PWA,
  maskable), all drawn from `LOGO_SVG`. Link preview: `opengraph-image.tsx` / `twitter-image.tsx` (1200×630).

## Tokens (`src/app/globals.css`)
The token names are kept from v1 so every screen picked up the new palette: `optic` now means gold, `clay` silver,
`stitch` crimson.
- Surfaces: `night` #060607 (onyx), `night-2` #0f0f11, `night-3` #17171a, `night-4` #222226.
- Lines: `line` #232327, `line-2` #36363d.
- Text: `chalk` #f5f2ea (warm white), `chalk-2` #bfbab0, `chalk-3` #87837b. Sentence case; no small uppercase eyebrows.
- Gold: `optic` #d7b46a, `optic-2` #e6c887, `optic-ink` #1a1306 (text on gold), `optic-wash`. `--gold` is the
  metallic gradient used on primary buttons, the score sweep and `.gold-text`.
- Silver: `clay` #b4bcc5. Crimson: `stitch` #e5484d. Caution: `amber` #e8a33d.
- Radii: `lg` 10px, `xl` 14px, `2xl` 20px.
- Type: Instrument Sans for UI and headings (`.display` 650 weight, tight tracking; `.head` 600). Michroma for numbers
  and the wordmark (`.num`, size-adjusted so it sits with the sans).

## Utilities
- `.surface`: raised panel with a gradient hairline edge (lighter on top, like a lit case).
- `.boxed`: gold corner on the edge. Only on modules that carry a headline number.
- `.hatch`: "not measured". Never draw a fake zero.
- `.skel`, `.press`, `.draw` / `.grow`: loading, press feedback, chart draw-in.
- Background: warm light from above, vignette below (`body::before`).

## Components (`src/components/ui.tsx`)
`Button`/`ButtonLink` (primary = gold metal, ghost, quiet, danger), `PageTitle`, `SectionTitle`, `Panel` (`boxed`),
`Segmented`, `Toggle`, `Stat` (value + unit + ± + source dot), `Meter`, `InfoTip`, `Sheet`, `Chip`, `Skeleton`,
`Empty`.

## Signature visuals (real data only)
- Score dial (`ArcScore`): a chronograph bezel, 270°, ticks every 2 points lit gold up to the score, gold sweep with a
  glowing tip, silver marker for the previous score.
- Field Print, swing timeline (`PhaseLine`), speed range bars, trend chart with session bands, spark bars, spray chart,
  bat profile drawn to length.

## Navigation
Phone: a floating pill bar under the thumb; the logo in the middle is the one action and opens a sheet (Record or
upload / Live cage session). Active tab = gold icon + dot.
Desktop: onyx left rail with the wordmark, a gold "New swing" button, Home / Swings / Progress / Bat DNA / Profile.
