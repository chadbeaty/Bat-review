# Gapper brand kit

**GAPPER. OWN THE GAP.** Hitting analytics and player development on your phone. Canonical home: getgapper.com.

## The idea
A gapper is the hit that splits two outfielders and runs to the wall. The symbol is a G drawn as that outfield: an
arc with its opening up and to the right (the gap), and the ball sitting in it. The A in the wordmark has no
crossbar, so it is open too. The period in "OWN THE GAP." is the ball again.

## Files in this folder
All files are generated from `src/brand/geometry.ts` (letters drawn from circles and straight strokes, not a font).
Change the geometry, then run `UPDATE_BRAND=1 npx vitest run tests/unit/brand.test.ts`; the test fails if a file
here is out of date.

| File | Use |
| --- | --- |
| `gapper-wordmark.svg` | Primary logo on dark backgrounds (white letters, lime ball) |
| `gapper-wordmark-light.svg` | Primary logo on light backgrounds (navy letters, deep lime ball) |
| `gapper-wordmark-mono.svg` | One color (uses currentColor): embroidery, stamps, single-ink print |
| `gapper-lockup-tagline.svg` / `-light.svg` | Secondary logo: wordmark over OWN THE GAP. |
| `gapper-mark.svg` / `-light.svg` / `-mono.svg` | The G symbol alone (avatars, social profiles, small spaces) |
| `gapper-app-icon.svg` | App icon, rounded navy tile |
| `gapper-app-icon-square.svg` | Full-bleed square for maskable/PWA icons and stores (the platform rounds it) |

## Rules
- Clear space around any logo: at least the height of the ball's diameter times two.
- Minimum size: wordmark 72 px wide; symbol 16 px.
- Never recolor the letters lime, never put the lime ball on white (use the light version), never stretch, outline
  or add effects. On photos, use the mono version in white over a dark area.
- In sentences the name is "Gapper". All caps is for the logo only.

## Color
| Name | Hex | Use |
| --- | --- | --- |
| Midnight Navy | `#101827` | Main background |
| Deep Slate | `#202D40` | Panels, controls |
| Electric Lime | `#B7F34A` | Sparingly: key numbers, the main action, active nav, progress, improvements |
| White | `#FFFFFF` | Main text and numbers |
| Steel Gray | `#8995A6` | Secondary text |
| Deep Lime | `#6CA81B` | The ball on light backgrounds only |

Supporting UI tones (not brand colors): pale steel blue `#A9BCD6` for comparisons, red `#F25C5C` only for the one
thing to fix, amber `#F5B84A` for cautions.

## Type
Mona Sans (open source, Google Fonts) for everything: stretched wide (108–125%) and heavy for headings and numbers,
normal width for reading, tabular numerals for stats. The brief suggested Space Grotesk and Inter; both are on this
repo's list of overused "default AI" fonts, so Mona Sans fills the same role.

## Voice
Primary: **Own the gap.** Secondary lines: Know your swing. / Own your game. / Every swing has a story. / Turn data
into distance.
Be confident and plain. Never claim an accuracy that hasn't been checked; every estimate shows how sure it is.
