# Gapper design system

Brand kit (logo files, colors, rules): `public/brand/BRAND.md`. Logo geometry: `src/brand/geometry.ts`. Name, domain
and taglines: `src/brand/site.ts` (use these instead of typing the name in copy).

## Concept
A gapper splits two outfielders and runs to the wall. Gapper is the instrument a hitter uses to find that swing:
midnight navy like a night game, deep slate panels, white numbers that read at arm's length, and one electric lime
that marks only what matters. The G symbol (an outfield arc with the ball in the gap) recurs in the score dial (a
270° arc open at the bottom with the ball at the tip) and the landing illustration (three fielders, a line drive
splitting left-center).

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
`.surface` (slate panel, hairline edge), `.boxed` (key panels: lime catches the top-left edge), `.hatch` ("not
measured", never a fake zero), `.skel` (loading shimmer), `.press`, `.draw` / `.grow` (chart draw-in).

## Components
Logos: `LogoMark`, `Wordmark`, `Lockup` in `src/components/Logo.tsx`. UI kit in `src/components/ui.tsx`: `Button`
(primary = lime, ghost, quiet, danger), `PageTitle`, `SectionTitle`, `Panel` (`boxed`), `Segmented`, `Toggle`,
`Stat`, `Meter`, `InfoTip`, `Sheet`, `Chip`, `Skeleton`, `Empty`.

## Signature visuals (real data only)
Gapper Score dial (`ArcScore`), Field Print, swing timeline (`PhaseLine`), speed range bars, trend chart with
session bands, spark bars, spray chart, bat profile drawn to length.

## Navigation
Phone: floating bar; the lime button in the middle carries the G and opens New swing (Record or upload / Live cage
session). Active tab = lime icon and dot. Desktop: navy rail with the wordmark, a lime New swing button and the
sections.

## Icons and sharing
`src/app/icon.svg`, `apple-icon.tsx`, `icon-192.png` / `icon-512.png` routes (maskable) and the link preview
(`opengraph-image.tsx` / `twitter-image.tsx` via `src/brand/og.tsx`) are all drawn from the brand geometry.
