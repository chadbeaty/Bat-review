# SwingIQ design system: "the lights-out lab"

## Concept
Slow pitch is played after work, under banks of field lights, on a ball that drops in on a 6–12 ft arc. SwingIQ is the
scouting lab for that world. The screen is the field at night (blue-black, lit from above like a ballfield), chalk
lines do the structural work (hairline rules and batter's-box corner ticks instead of boxes around everything), and the
optic-yellow ball is the only thing that glows: it marks what's live and what's yours. Infield clay is the one
comparison colour ("before", "the other swing"). Stitch red is reserved for the one thing to fix.

## Tokens (`src/app/globals.css`)
- Surfaces: `night` #07090c (field), `night-2` #0d1116 (raised), `night-3` #141a21 (hover/inputs), `night-4` #1d252e (tracks).
- Lines: `line` #222b35 (hairline), `line-2` #33404d (stronger rule, borders on controls).
- Text: `chalk` #f3f4ef, `chalk-2` #b6bec6, `chalk-3` #7a8591. Sentence case labels; no small uppercase eyebrows.
- Accent: `optic` #e4f542 (yours / live / primary action), `optic-wash` for highlighted cells.
- Comparison: `clay` #d49b6b (previous period, swing B, your best on a scale, bat balance point).
- Fix: `stitch` #ef5243 (only the thing to fix, destructive actions). Caution: `amber`.
- Radii: tight, instrument-like (`lg` 7px, `xl` 9px, `2xl` 12px).
- Type: Archivo (wide axis) for numbers (`.num`), titles (`.display`) and section heads (`.head`); Atkinson Hyperlegible
  Next for everything else.

## Utilities
- `.surface`: raised panel (hairline, top light, soft drop).
- `.boxed`: batter's-box corner ticks. Only on modules that carry a headline number (score, speed, key panels).
- `.hatch`: "not measured". Never draw a fake zero.
- `.skel`: loading shimmer. `.press`: press/hover feedback. `.draw` / `.grow`: chart draw-in.
- Background: one fixed floodlight falloff from above catching a faint cage net (`body::before`).

## Components (`src/components/ui.tsx`)
`Button`/`ButtonLink` (primary, ghost, quiet, danger), `PageTitle`, `SectionTitle` (title + chalk line out to the edge),
`Panel` (`boxed` option), `Segmented`, `Toggle`, `Stat` (value + unit + ± + source dot), `Meter` (0–100, hatched when
unmeasured, optional clay compare tick), `InfoTip` (contextual explanation), `Sheet` (bottom sheet dialog), `Chip`,
`Skeleton`/`PageSkeleton`, `Empty` (chalk field drawing).

## Signature visuals (`src/components/viz/`, real data only)
- Pitch-arc score gauge (`ArcScore`): the ball rides a slow-pitch arc; clay ring = previous score.
- Field Print (`FieldPrint`): six score categories as wedges of a ballfield; fence = 100; clay = the block before.
- Swing timeline (`PhaseLine`): load → contact as a line score, slow-pitch foot-down window shaded.
- Speed range bar (`RangeBar`): reading ± band, the player's own average and best as ticks.
- Trend chart with session range bands, session spark bars, spray chart with tagged-hit dots, bat profile drawn to
  length with its balance point.

## Navigation
Phone: solid bottom bar, one center action (softball) that opens a sheet: Record or upload / Live cage session.
Desktop: left rail with wordmark, the action, Home / Swings / Progress / Bat DNA / Profile.
