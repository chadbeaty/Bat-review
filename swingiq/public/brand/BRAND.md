# Gapper brand kit

**GAPPER. OWN THE GAP.** Hitting analytics and player development on your phone. Canonical home: getgapper.com.

Print shop? Start with `print/gapper-brand-sheet.pdf`, then use the PDFs in `print/` (vector, sized in inches) or
the 3000 px PNGs (transparent).

## The idea
A gapper is the hit that splits two outfielders and runs to the wall. The **Gap Mark** is a ballfield from above:
the infield with the grass diamond cut out, the outfield as one bold band split by the gap in left-center, and a
line drive streaking through that gap with the ball out past the wall. The **crest** puts the field on home plate
turned into a shield, with the ball bursting through its rim. The **patch** wraps GAPPER and OWN THE GAP around it.

## Files
SVGs in this folder are generated from `src/brand/emblem.ts` and `src/brand/geometry.ts` (the letters are drawn,
not typed). After changing the geometry, run `UPDATE_BRAND=1 npx vitest run tests/unit/brand.test.ts` (the test
fails if a file is stale) and then `node scripts/export-brand-print.mjs` for the PDFs and PNGs.

| Piece | Files | Use |
| --- | --- | --- |
| Crest (primary printable logo) | `gapper-crest`, `-black`, `-white` | Shirts, hats, banners, stickers, team gear |
| Round patch | `gapper-patch`, `-black`, `-white` | Patches, stickers, social avatars, coasters |
| Gap Mark | `gapper-mark`, `-light`, `-black`, `-white` | App icon, favicon, small spaces, hat side, watermark |
| Horizontal lockup | `gapper-lockup`, `-light`, `-black`, `-white` | Website and app headers, letterhead, signage |
| Wordmark | `gapper-wordmark`, `-light`, `-black` | Where the mark already appears nearby |
| Wordmark + tagline | `gapper-wordmark-tagline`, `-light`, `-black` | Secondary logo |
| App icon | `gapper-app-icon` (rounded), `-square` (full bleed) | Stores, home screens |

Colorways: no suffix = full color for dark backgrounds; `-light` = for white/light backgrounds; `-black` = one
color (badges print solid with the art knocked out); `-white` = white ink only, for dark garments (the shirt becomes
the badge).

## Rules
- Clear space: at least the ball's diameter on every side.
- Minimum sizes: mark 16 px / 0.25 in; crest 0.75 in wide; patch 1 in; horizontal lockup 1.25 in wide.
- The ball (and its streak) is the only lime in a logo. Never recolor the field or letters lime.
- Don't stretch, outline, add shadows or rearrange the parts. Don't put the full-color badge on busy photos; use
  `-white` over a dark area.
- Embroidery: use the one-color crest or patch; keep the smallest letters at least 0.25 in tall.
- In sentences the name is "Gapper". All caps is for the logo and the tagline.

## Color
| Name | Hex | Use |
| --- | --- | --- |
| Midnight Navy | `#101827` | Backgrounds, badge |
| Deep Slate | `#202D40` | Panels, controls |
| Electric Lime | `#B7F34A` | The ball. In the app: key numbers, main action, active nav, progress, improvements |
| White | `#FFFFFF` | Field, letters, main text |
| Steel Gray | `#8995A6` | Secondary text |
| Deep Lime | `#6CA81B` | The ball on light backgrounds only |

## Type
Mona Sans (open source, SIL OFL; a copy and license live in `src/brand/fonts/` for the link-preview card). Stretched
wide and heavy for headlines, numbers and taglines; normal width for reading. The brief suggested Space Grotesk and
Inter; both are on this repo's list of overused "default AI" fonts, so Mona Sans fills that role.

## Brand graphics (in the app)
- **Turf**: diagonal mowing stripes with light from the top, behind hero moments only.
- **The gap cut**: key panels and the main buttons lose their top-right corner.
- **Gap streak**: a lime line drive ending in the ball; section headings end in the ball.
- **Jumbotron numbers**: the score and big stats, wide and heavy, counting up on load.
- **Broadcast crawl**: the things Gapper measures, scrolling like a ticker on the landing page.

## Voice
Primary: **Own the gap.** Secondary: Know your swing. / Own your game. / Every swing has a story. / Turn data into
distance. Confident and plain. Never claim an accuracy that hasn't been checked; every estimate shows how sure it is.
