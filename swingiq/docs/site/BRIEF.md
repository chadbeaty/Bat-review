# Gapper landing page: brief

Built page: `swingiq/public/site/index.html` (+ `site.css`, `site.js`), served at `/` for visitors who haven't set up a
hitter on this device (rewrite in `next.config.ts`). A plain static page: no framework, no scroll engine, Chivo
self-hosted, logos from `public/brand/`.

## What Chad asked for (2026-11-20)
Reposition Gapper as a premium sports-technology brand for adult slow-pitch softball (USSSA, USA Softball,
independent leagues, rec hitters who want to improve, tournament players). Not a baseball analyzer, not fastpitch.
Primary tagline OWN THE GAPS., secondary BUILT FOR SLOWPITCH., the brand built around RECORD. ANALYZE. IMPROVE.
Homepage: hero **STOP GUESSING. START HITTING.**, supporting headline **BUILT FOR SLOWPITCH.**, the copy "The next
generation of slow-pitch softball swing analytics. Understand your mechanics, measure your progress and build a more
consistent swing.", CTAs **ANALYZE YOUR SWING** and **SEE HOW IT WORKS**. Slow pitch obvious within three seconds.
Charcoal and near-black, electric lime, crisp white, graphite, subtle metallic. No traditional baseball imagery, no
cartoon baseballs, no stock baseball photos, no youth or fastpitch, no AI gradients or template SaaS layout.
Technically honest: measured vs estimated always clear; never invent bat speed or exit velo.

Follow-up the same day: position Gapper as the performance analytics platform for the slow-pitch softball
community (broad swing apps already compete for general hitters), and keep "Built for slowpitch" in lime so it
stands out.

## Page, top to bottom
1. **Hero** (carbon): the sport chip with the softball, the headline in black italic capitals, BUILT FOR SLOWPITCH.
   in lime, the copy, the two CTAs, "Not baseball. Not fastpitch. No account needed." Beside it (below on a
   phone): Gapper's tracked view of a real swing (33 body points per frame from the analyzer, `assets/pose.json`),
   front leg in lime, the heel ring at foot-down, over the four-block outfield; the pitch drops in on a high arc and
   the ball leaves through the left-center gap. The arc and flight are illustration and the caption says so.
2. **Who it's for** strip: USSSA, USA Softball, independent leagues, rec leagues, tournament teams (names only, no
   logos, no implied endorsement).
3. **Built for one game**: general swing apps are built for every hitter; Gapper is the performance analytics
   platform for the slow-pitch community. Then a ledger of three slow-pitch facts: the 6–12 ft arc, the front heel down about
   0.2 s before contact (Wu et al., in `docs/reports/Slow pitch lower body mechanics.md`), four outfielders and three
   gaps.
4. **Record. Analyze. Improve.** (`#how`, the SEE HOW IT WORKS target): Record (phone setup, live/upload/slo-mo, the
   cage diagram); Analyze (the real sample read: Gapper Score 72, Balance 100, Follow-through 97, Rotation 89, Timing
   46, Bat path 30, Contact n/a with the reason, and 6 frames from heel down to contact, labelled "A stock clip of a
   real hitter, run through Gapper"); Improve (the real one fix and drill for that swing, then Hitting Profile,
   personal drills, the shareable report).
5. **What Gapper measures, and how sure it is** (`#measures`): a table, one label per row (Measured / Estimated /
   Slo-mo ± range / Your tags). Bat path is said to be read from the hand path; barrel tracking isn't claimed.
6. **Close**: the bag tag, OWN THE GAPS., one CTA.

## Evidence versus assumption
- Real: every number on the page is Gapper's output on the sample clip (the same clip the browser tests use). The
  clip is slow motion of unknown speed, so heel-to-contact is counted in frames, not seconds.
- Not shown: the clip itself. It's a baseball player in a baseball uniform, which the brief rules out; only the
  tracked skeleton remains. Photography slots are deliberately absent until there are real adult slow-pitch photos
  (ideally from Gapper players' own leagues, with permission).
- Assumption: most visitors are on phones.

## Keeping it honest
If the analyzer changes, rerun it on `tests/fixtures/video/source.mp4` and update the numbers in section 4 and
`assets/pose.json` together. The browser test `tests/e2e/pages.spec.ts` checks the sample label, the frame count,
that the skeleton draws, and the measured/estimated labels.
