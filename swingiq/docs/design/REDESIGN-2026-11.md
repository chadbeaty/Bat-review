# Gapper premium overhaul: audit, three directions, the pick (2026-11-25)

Chad's brief: make Gapper pop and feel premium, a serious sports-technology product for slow pitch, without breaking
anything (accounts, video processing, the analyzer, storage, APIs) and without inventing numbers. The brand kit from
2026-11-20 (GAPPER, the Gap Mark and bag tag, Chivo, carbon, electric lime, alloy) stays: it already matches the
brief's palette (near-black, crisp white, one electric accent) and the logos are printed. This overhaul changes how the
product is presented, not who it is.

Note on the tagline: the brief said "OWN THE GAP." The brand line stays **OWN THE GAPS.** because it's baked into the
logo art and the whole idea is four outfielders, three gaps. Easy to switch if Chad wants the singular.

## 1. Audit

Screens reviewed on an iPhone 13 (390 px) and a 1440 px desktop, with a real hitter and three analyzed swings (one of
them a 240 fps slo-mo clip with exit velo and bat speed).

### What's already good
- A real brand: drawn logo system, one typeface, one accent, honest source labels on every number.
- The product loop (Record, Analyze, Improve) is clear and runs the navigation.
- Real data everywhere. The landing page's numbers are the analyzer's own output.
- Solid accessibility basics: focus rings, reduced motion, labelled charts, 44 px tap targets on most controls.

### Weaknesses
**Everything is the same card.** Score, speed, timing, breakdown, coach, records, goal: each is the same graphite
rounded panel with the same 15 px bold head. Nothing leads. On the swing report six panels of equal weight compete,
and on desktop the swing video shrinks to a 260 px thumbnail beside them.

**The swing itself isn't the hero.** The clip player is a small video with a slider, seven phase chips that wrap onto
two rows, and separate frame buttons. There's no picture of what each phase looked like, and on desktop the video is
the smallest thing on the page.

**Balance, rotation and bat path have no pictures.** They're one bar each in the score breakdown. The tracking data to
draw them (head and hip path over the feet, hand path, barrel path on slo-mo, hips-vs-hands timing) is already saved
with every swing.

**The one fix is buried.** It sits below the score breakdown as a four-cell grid that reads like a form. It's the most
useful thing Gapper says.

**The numbers list is noisy and in one place inconsistent.** About 30 rows, each with a chip like "Camera estimate ·
High confidence". Exit velo and launch angle from slo-mo show a hollow "camera estimate" ring there while the speed card
and the landing page call them slo-mo measurements with a ± range (lime dot). Same number, two labels.

**Landing page rhythm.** Headline, paragraph, headline, paragraph. The hero figure is a white stick figure with no bat
on an empty field; the actual product (a swing read) doesn't appear until halfway down. Sections fade in only on
scroll, so a quick scroller sees big empty black areas.

**Type scale is flat.** Most heads are 15–17 px bold; labels jump between 11, 12 and 13 px with different tracking.
There's no middle voice between the huge italic display and body copy.

**States are thin.** No error screen for a crashed page (you'd get the framework's default). Loading is grey
shimmer blocks. Upload progress is a bare bar under the video. The 404 is a plain line.

**Small accessibility gaps.** The "?" info buttons are 20 px targets. Phase markers under the scrubber can't be
reached by keyboard except through the chip row. Some 11 px grey labels are the only carrier of meaning.

## 2. Three directions

All three keep the brand kit. They differ in the visual idea everything hangs on.

### A. Replay booth
The product as a slow-motion TV replay: a full-width video stage, telestrator lines drawn over the hitter, lower-third
data callouts, a scrub bar like a broadcast replay.
- For: the video is the center, instantly understood.
- Against: drifts into TV-graphics clutter, and it's close to the retired v3 "broadcast" look. Lower thirds over a
  phone-sized video hide the hitter.

### B. Spec sheet
Apple-style product presentation built like the engineering drawing of a premium bat: lots of dark space, hairline
dimension lines, leader-line callouts, angle arcs, very little color.
- For: calm, precise, very honest-looking data.
- Against: cold. Reads like a manual, not a sport. Weak on the "athletic" half of the brief.

### C. Strobe (picked)
The look of a stroboscopic sports photo: the hitter's own swing as a multi-exposure, ghosted frames from load to
finish, with the hands' path burned in as a lime light trail. That image comes straight from Gapper's tracking, so it's
real data, it's athletic, and nobody else has it. Around it: carbon stages for the moments that matter, crisp white
numbers in Chivo Black Italic, hairline rules instead of boxes for reading content, and motion that behaves like a
strobe (frames flash in, in order).
- For: strong athletic imagery without stock photos (there are no real slow-pitch photos yet, and the brand rules out
  baseball stock), makes the swing analysis the visual centerpiece, ownable, fits carbon and lime.
- Against: needs care so the ghost frames don't get busy; kept to 5–7 frames, fading toward the start.

Why C: it's the only one that answers "strong athletic imagery" honestly today, it makes the actual analysis the hero
on every screen, and it borrows B's precision (labelled callouts, hairlines) where data needs to be read.

## 3. What changes (implementation plan)

**Design system v5 "Strobe" on carbon and alloy** (`src/app/globals.css`, `src/components/ui.tsx`, `docs/DESIGN.md`):
- A fixed type scale: display XL/L/M (black italic), title (700), body, small, label (one size, one tracking).
- Surfaces with a job: `stage` (carbon, full-bleed, hero moments), `frame` (hairline box for viz), plain hairline
  rows for reading lists. Fewer cards; rounded corners stay tight.
- Motion: strobe-in (staggered frames), light-trail draw, count-up. All off with reduced motion.

**Visualizations** (all from data already saved with each swing; each says measured or estimated):
- Strobe: multi-exposure of the tracked swing with the hand path as a lime trail and the heel-strike ring.
- Phase strip: one strobe frame per phase (stance, load, stride, foot down, launch, contact, finish) under the video;
  tap to jump there.
- Gapper Score: the outfield gauge, larger, with the six categories as a ledger beside it.
- Timing: load-to-contact track with the slow-pitch foot-down window.
- Balance: head and hip-center path over the base of the feet, stance to finish.
- Rotation: hips-vs-hands start order and the rotation checks (one camera can't measure turn angles, so no fake
  degrees).
- Bat path: the hand path as a light trail, plus the tracked barrel on slo-mo clips.

**Screens**: swing report rebuilt around the replay stage; One Fix as its own hero block; home player card on a strobe
stage; record and upload with real progress, success and failure states; route error screen, 404, empty and loading
states; landing page rebuilt on the strobe hero with the slow-pitch difference stated in the first screen.

**Not changing**: the analyzer, scoring, storage, sync and account code, routes, the logo files, taglines, the tested
selectors on the landing page.
