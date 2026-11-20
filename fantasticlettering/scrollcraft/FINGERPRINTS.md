# Fingerprints

Every site you build with **scroll-craft** gets one row here, appended after it
ships. The registry exists so your next build can prove it is a different page
rather than a re-skin of one you already made.

This file is **yours**. It starts empty on purpose: the gate is about not
repeating *yourself*, so it has nothing to say until you have built something.

The rules and the gate live in the skill's
`references/uniqueness.md`. Short version:

**A new build must differ from EVERY row below on at least 4 of the 6
dimensions.** Four against each row individually, not four on average across the
table. If a planned build fails, change the plan. Never edit a row to make room
for it.

The six dimensions are: **grammar**, **nav treatment**, **hero device**,
**act-sequence shape**, **close pattern**, **signature move**.

Dimension 6 is free, because a signature move is unique by definition. So the
gate really asks for three more out of the remaining five, and a build that
changes only grammar and world will fail it.

---

## The registry

| Build | Grammar | Nav treatment | Hero device | Act-sequence shape | Close pattern | Signature move | World | Port |
|---|---|---|---|---|---|---|---|---|
| Fantastic Lettering "Press run" (option-6) | Chaptered editorial | Fixed margin folio (wordmark, live chapter title, one CTA), no bar | Title page: name set huge in three ink planes that slide into register on scroll | pin(title) > flow+reveal(quiet) > pin(peak, 4.4vh) > pan(objects) > flow+in(type list) > flow+parallax > colophon; 7 sections, ~12.3vh | Colophon: a fill-in-the-sentence work order, CTA as the form itself | Scroll prints a shirt plate by plate (art, screen, ink, 3 pulls, cure) with a live step ledger naming each real step | Graphite and bone, one ink orange; code-drawn garment, reused placeholder photos | fantasticlettering/option-6 |
| Gapper "What you see / What Gapper sees" (retired 2026-11-20; getgapper.com is now the static "Stop guessing. Start hitting." page, not a scroll-craft build) | Split stage | Chalk-line divider as the only chrome: Gap Mark roundel and both side labels at the top, chalk laid as you scroll, live phase ticks, one CTA at the foot | 50/50 split: graded photo plate, headline set in the ground plane, batter cutout in front (shared feet pivot, different scale rates) against his tracked 33-point twin on navy | pin+parallax(hero, 2 beats) > scrub(peak, 4.2vh) > pin+count > pin+kinetic > pin+reveal > pin collapse; 6 acts, all pinned, ~11.75vh | Divider collapse: the chalk line runs to the left edge carrying the stamped gap, Gapper's side takes the screen with crest, line and button | The heel catch: the scrubbed swing holds on the front heel strike, a lime ring hits the heel on both sides, your scroll steps the clip frame by frame to contact while a jumbotron counts frames and the divider fills the gap, which stays stamped for the rest of the page | Real daylight stock footage graded toward navy on the left; navy vector skeleton, mowing stripes and lime on the right; Mona Sans in two widths | swingiq/public/site |


---

## What is taken

Add a bullet here whenever a build claims something a later build should avoid
reusing: a grammar, a nav treatment, a close pattern, a signature move, an
act-count-and-length band. The shared columns are what the next build inherits
as a constraint, so writing them down is the whole point.

- Chaptered editorial with a margin folio and a sentence-form colophon close.
- Ink-plane registration as a hero device.
- Process-as-print signature (scroll drives a garment print with a step ledger).
- 7 sections at about 12.3 viewport-heights.
- Split stage with a chalk-line divider as chrome and a divider-collapse close.
- Photo cutout in front of ground-plane type, twinned with a vector tracking of the same subject.
- Heel-catch signature: a scrub clip with the hold baked in, frame counter driven by the visitor's scroll, a progress segment stamped on the chrome.
- 6 all-pinned acts at about 11.75 viewport-heights.

---

## Appending a row

After shipping, add one line to the table and one bullet to **What is taken** if
the build claimed something new. Fill every column. Say what the build shares
with existing rows.

Rows are append-only. A build that has been superseded stays in the table,
because the space it occupies is still occupied.

---

## Worked example

The skill's author kept a registry of twelve builds across eight page grammars.
If you want to see what a filled-in table looks like, and which shapes tend to
collide, read `EXAMPLES.md` in the scroll-craft repository. Treat it as
illustration only: those rows are somebody else's builds and they do **not**
constrain yours.
