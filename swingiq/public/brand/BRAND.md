# Gapper brand kit

**GAPPER. OWN THE GAPS. BUILT FOR SLOWPITCH.** Swing analytics for adult slow-pitch softball. Record. Analyze.
Improve. Canonical home: getgapper.com.

Print shop? Start with `print/gapper-brand-sheet.pdf`, then use the PDFs in `print/` (vector, sized in inches) or
the 3000 px PNGs (transparent).

## The idea
Slow pitch plays ten fielders, four of them in the outfield, so there are **three gaps**, not two. The **Gap Mark**
is the outfield seen from home plate: four heavy blocks (left, left-center, right-center, right) with three gaps
between them, and a 12-inch softball that has just broken out through the left-center gap, two splinters of the wall
flying behind it. The **bag tag** is the badge a tournament player clips to a bat bag: grommet hole, the mark, GAPPER,
the gap rule (four bars, three gaps, the ball in one), OWN THE GAPS and BUILT FOR SLOWPITCH. The **patch** wraps
GAPPER and BUILT FOR SLOWPITCH around the mark.

The **wordmark** is drawn, not typed: heavy squared capitals with chamfered corners (like the cut edges of a carbon
bat graphic), leaning forward 10 degrees. The G is left open at the top right. That opening is the gap.

## Files
SVGs in this folder are generated from `src/brand/emblem.ts` and `src/brand/geometry.ts`. Taglines are Chivo Black
Italic outlines baked into shapes by `scripts/bake-brand-type.py` (`src/brand/type.ts`), so the files need no fonts.
After changing the geometry, run `UPDATE_BRAND=1 npx vitest run tests/unit/brand.test.ts` (the test fails if a file
is stale) and then `node scripts/export-brand-print.mjs` for the PDFs and PNGs.

| Piece | Files | Use |
| --- | --- | --- |
| Bag tag (primary printable badge) | `gapper-crest`, `-black`, `-white` | Shirts, hats, bag tags, banners, stickers, team gear |
| Round patch | `gapper-patch`, `-black`, `-white` | Patches, stickers, social avatars |
| Gap Mark | `gapper-mark`, `-light`, `-black`, `-white` | App icon, favicon, small spaces, hat side, watermark |
| Horizontal lockup | `gapper-lockup`, `-light`, `-black`, `-white` | Website and app headers, letterhead, signage |
| Wordmark | `gapper-wordmark`, `-light`, `-black` | Where the mark already appears nearby |
| Wordmark + tagline | `gapper-wordmark-tagline`, `-light`, `-black` | Secondary logo (GAPPER over OWN THE GAPS) |
| The three words | `gapper-pillars`, `-light` | RECORD. ANALYZE. IMPROVE. for banners and slides |
| App icon | `gapper-app-icon` (rounded), `-square` (full bleed) | Stores, home screens |

Colorways: no suffix = full color for dark backgrounds; `-light` = for white/light backgrounds; `-black` = one
color (badges print solid with the art knocked out); `-white` = white ink only, for dark garments (the shirt becomes
the badge).

## Rules
- Clear space: at least the ball's diameter on every side.
- Minimum sizes: mark 16 px / 0.25 in; bag tag 0.75 in wide; patch 1 in; horizontal lockup 1.25 in wide.
- The ball (and its streak) is the only lime in a logo. Never recolor the outfield or letters lime.
- Don't stretch, outline, add shadows or rearrange the parts. Don't put the full-color badge on busy photos; use
  `-white` over a dark area.
- Embroidery: use the one-color bag tag or patch; keep the smallest letters at least 0.25 in tall.
- In sentences the name is "Gapper". All caps is for the logo, taglines and headlines.
- **"Built for slowpitch" is always set in lime** wherever it appears as text (site, app, link preview), so it stands
  out. Inside the logo art (bag tag, patch) it stays white like the other letters.

## Color
| Name | Hex | Use |
| --- | --- | --- |
| Carbon | `#0B0C0E` | Backgrounds, badges |
| Graphite | `#1A1D21` | Panels, controls |
| Electric Lime | `#C4F135` | The ball. In the app: key numbers, main action, active nav, progress, improvements |
| White | `#FFFFFF` | Outfield, letters, main text |
| Alloy | `#B9BFC5` | Metallic accents, comparison marks (brushed-metal gradients in the app) |
| Steel | `#8D939A` | Secondary text |
| Deep Lime | `#5E9A0E` | The ball on light backgrounds only |

## Type
Chivo (open source, SIL OFL; static instances and the license live in `src/brand/fonts/` for the link-preview card,
and woff2 files in `public/site/fonts/` for the landing page). Black Italic capitals for headlines, numbers and
taglines; Regular for reading. Not Mona Sans (the retired look), and none of the overused "default AI" faces.

## Brand graphics (in the app and on the site)
- **Carbon**: a fine twill weave with light from the top, behind hero moments only.
- **Alloy edge**: key panels carry a brushed-metal hairline across the top.
- **Outfield gauge**: the Gapper Score drawn as the mark's four blocks, lit lime up to the score.
- **Gap rule**: four hairlines, three gaps, the ball in one. Section dividers.
- **Record. Analyze. Improve.**: the three words over page titles with the current step lit.
- **Measured vs estimated**: solid dot = measured, ring = estimated, lime = slo-mo video, alloy = your own sensor.
- **Strobe**: the hitter's own tracked swing as a multi-exposure, the hands' path as a lime light trail. Gapper's
  stand-in for photography (real tracking, never a stock photo or a generated picture of a player).

## Imagery
Real adult slow-pitch only: composite bats, 12-inch optic-yellow softballs with red stitches, slow-pitch stances,
league and tournament fields. No baseball uniforms or white baseballs, no cartoon baseballs, no youth baseball, no
fastpitch pitching, no generic stock baseball photos. The best source is the players themselves: photos from Gapper
users' own leagues and tournaments (with permission). Until there are some, the site uses Gapper's tracked skeleton
and drawn graphics instead of photos.

## Position
Broad swing-analysis products already compete for general hitters. Gapper's job is to be the name slow-pitch players
associate with understanding and improving their swing: **the performance analytics platform for the slow-pitch
softball community** (`SITE.platform` in `src/brand/site.ts`). Lead with the sport and the community, not with
generic AI or "every hitter" claims. Don't claim users, rankings or league endorsements that don't exist.

## Who it's for
Adult slow-pitch softball, and only slow pitch: USSSA, USA Softball and independent league players, rec league
hitters who want to improve, and tournament players who care about mechanics, consistency and power. The selling
point: there's no app built just for slow-pitch hitters; it's always baseball apps that bolt on softball, and their
softball usually means fastpitch. Say it plainly: **Built for slowpitch. Not baseball. Not fastpitch.** Never say
baseball is coming, never frame Gapper as "baseball and softball", and back the claim with what's actually different
(timed to the arc, front heel down about 0.2 s before contact, four outfielders and three gaps, slow-pitch faults,
softball speeds, slow-pitch bats, positions and levels). `src/brand/site.ts` holds the lines.

## Voice
Primary: **Own the gaps.** Secondary: **Built for slowpitch.** Hero: **Stop guessing. Start hitting.** The loop:
**Record. Analyze. Improve.** Confident, competitive and plain; short sentences. Use the hitter's words: load to
contact, front-foot landing, barrel, bat path, rotation, launch angle, exit velo, pull side, opposite field, line
drives, repeatability. Never claim an accuracy that hasn't been checked; every number says whether it was measured or
estimated, and Gapper never invents a bat speed or exit velo.
