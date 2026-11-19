# Gapper scroll site: brief

**Self-authored under explicit creative delegation.** Chad asked for "a cool website" built with the scroll-craft skill. When I asked the eight interview questions he answered: "You decide on all of those and I'll tweak from there. Just make it a really exceptional UI experience and design." Everything below is my call, made from the brand kit (`public/brand/BRAND.md`, `docs/DESIGN.md`), the research in `docs/reports/Slow pitch lower body mechanics.md`, and what the app actually does. Nothing here is a quote from Chad except the two lines above.

Built page: `public/site/index.html` (served at `/` for visitors who have not set up a hitter yet).

## The eight topics

1. **Vibe.** Night game under the lights, seen next to a sunny Saturday. Evidence over opinion. References: a broadcast split screen with the telestrator on one side; a coach's clipboard of chalk lines; the Statcast tracking overlay on a replay.
2. **The journey, in order.** You see a normal swing. Then you see what Gapper sees in the same swing. The page catches the one moment that matters (the front heel landing) and makes you feel the gap to contact. Gapper reads the swing, gives one fix instead of ten, does speed from slo-mo, and hands you the button.
3. **Energy.** Calm open, a near-silent push to the front foot, the loudest moment at the heel strike, quieter and denser in the middle (numbers, one fix), confident close.
4. **Feeling, stage by stage, and the one moment.** See the feeling curve below. The moment: the page stops dead when the front heel lands.
5. **What no other site does.** It uses your own scroll as the stopwatch for the most important fraction of a second in a slow-pitch swing.
6. **Distance from premium-minimal.** Sport-broadcast technical, not minimal. Dense where the data is, empty where the moment is.
7. **One world or scenes?** Distinct scenes on two fixed stages: the left is always the real world in daylight photographs, the right is always Gapper's view at night.
8. **Assets on hand.** A real stock clip of a hitter (Pexels 5182770, already used by the app's tests), Gapper's own pose tracker and analyzer, and the vector brand kit. No generated imagery, no spend.

## Evidence versus assumption

- Real: the footage, the 33 tracked points per frame (MediaPipe heavy model, run on every frame of the clip), the phase times, scores, cue and drill (Gapper's analyzer run on the app's fixture of the same clip), and the 0.2 s heel-to-contact finding (Wu et al., cited in the research doc).
- Real but caveated on the page: the clip is a stock clip, so the read is labelled "Sample: a stock clip of a real hitter, run through Gapper." The clip is slow motion of unknown speed, so the page counts **frames** between heel down and contact, never seconds.
- Assumption: visitors are slow-pitch players and their friends, on phones about two thirds of the time.

## Journey

1. Recognition: a swing, the way you'd see it from the dugout.
2. Focus: the front foot, nothing else.
3. Revelation: the heel lands, the page holds, the gap opens.
4. Clarity: what Gapper actually concluded about that swing.
5. Relief: one fix and one drill instead of ten tips.
6. Capability: speed numbers from your phone's slo-mo.
7. Commitment: Start swinging.

## Grammar: split stage

Two columns for the whole page: **What you see** (left, photographs, daylight, upright narrow Mona Sans) and **What Gapper sees** (right, navy, vector, wide slanted Mona Sans). Neither side is decoration: each act gives both a real line. The divider is the only chrome: a chalk line with the two labels and the Gap Mark at the top, the phase ticks and the stamped gap in the middle, and one "Start swinging" at the foot. The chalk is laid as you scroll, like a field liner. The close is the collapse: the chalk line runs to the left edge and Gapper's side takes the screen.

Why not the others: filmic was used by the first four builds the skill knows about; chaptered editorial is taken by Press run; the product literally is a comparison (your eye versus a tracker), so the comparison is the page.

## Signature move: the heel catch

During the scrubbed swing, the instant the front heel lands the page holds the frame while you keep scrolling. A lime ring hits the heel on both sides, the divider stamps FOOT DOWN, and from there your scroll advances the clip frame by frame to contact while a jumbotron counter on Gapper's side counts the frames and the divider fills the space between the two ticks in lime. That lime segment, "the gap," stays stamped on the divider for the rest of the page and travels with it in the close. It is baked into the clip (held and stepped frames in `assets/swing.mp4`) so the engine stays untouched, and page JS reads the clip's real playhead to keep the skeleton, ring, counter and ticks in sync.

**Tell-someone:** "It's the site where you scrub a real hitter's swing, the page stops you dead the instant his front heel lands, and then your own scroll counts the frames to contact."

## Feeling curve

```
1  Recognition  a hitter in his stance, photo on one side, his 33 points on the other
2  Focus        everything recedes except the front foot, one quiet line per side
3  Suspense, then awe   the swing runs under your hand and stops dead at the heel strike; your scroll counts the gap
4  Clarity      the dugout's shrug next to Gapper's scores counting in, with the reason for each
5  Relief       ten tips crowd the left; the right holds one fix and one drill
6  Confidence   a blurred ball on the left; on the right the flight path draws itself with honest ± ranges
7  Resolve      the chalk line runs to the edge, Gapper's side takes the screen, one button
```

## The peak

Act 3. "The video stopped right when his front foot hit the ground, and then scrolling counted the frames until the bat hit the ball." It gets the only footage, the largest span (4.2), and the quiet push-in to the foot in front of it.

## Authored silence

Act 2 (the second beat of the hero) is deliberately near-empty: the frame pushes in to the front foot and only one short line sits on each side. The hold on the foot-down frame inside act 3 is also deliberate (about a viewport of scroll where the picture does not move); the ring, tick and copy change during it, so it is not dead scroll.

## Fingerprint gate

Against Fantastic Lettering "Press run" (the only row):

| Dimension | Press run | Gapper | Differs |
|---|---|---|---|
| Grammar | Chaptered editorial | Split stage | yes |
| Nav | Margin folio | Chalk-line divider as the only chrome | yes |
| Hero device | Ink-plane title page | 50/50 split: photo plate + batter cutout with the headline between, against his tracked twin | yes |
| Act sequence | pin > flow+reveal > pin(peak) > pan > flow+in > flow+parallax > colophon; 7 sections, ~12.3vh | pin+parallax > scrub(peak) > pin+count > pin+kinetic > pin+reveal > pin collapse; 6 acts, ~11.75vh | yes |
| Close | Sentence work order | Divider collapse | yes |
| Signature | Shirt print plates with a step ledger | Heel catch and the stamped gap | yes |

6 of 6.

## Score

| Act | Beat | Device | Span | Why this one |
|---|---|---|---|---|
| 1 Stance (2 beats) | Recognition, then focus | `pin` + layered parallax driven from `--sc-p` | 2.0 | The hero has to establish 50/50 with both headlines; the second beat pushes in to the foot, which is the quiet before the peak |
| 2 The gap | Revelation | `scrub` (the only clip) | 4.2 | The visitor's hand is the playhead; the hold is in the clip |
| 3 The read | Clarity | `pin` + `count` | 1.4 | Real numbers from the analyzer land as you hold |
| 4 One fix | Relief | `pin` + `kinetic` | 1.3 | Type assembling is the change from noise to one sentence |
| 5 Speed | Confidence | `pin` + `reveal` | 1.25 | A wipe is a change of state: blur to measurement |
| 6 Own the gap | Resolve | `pin` + collapse driven from `--sc-p` | 1.6 | The split stage ending, given room so the collapse lands |

Families: parallax, scrub, count, kinetic, reveal, collapse. Every act is pinned so the two stages always slide under the fixed chalk line together; the device inside each pin changes every time. One scrub. Peak span 4.2 against a next-largest of 2.0. Total about 11.75 viewport-heights.

## Type, colour, layout

- Mona Sans only (brand rule), two voices from one family: left side wdth 87, weight 500, upright, sentence case; right side wdth 125, weight 800, slanted like a jersey. Numbers tabular. No monospace labels, no all-caps condensed display, no numbered section labels.
- Navy #101827, Slate #202D40, Steel #8995A6, White; Lime #B7F34A only for the heel ring, the gap, the bead, the ball at the end of headings and the button.
- Photographs graded slightly cool with shadows lifted toward navy so the daylight side still belongs to the system.

## How the assets were made

All from `tests/fixtures/video/source.mp4` (Pexels 5182770, 1280x720, 25 fps slow motion; the swing is the first 7.2 s) and the app's own code. Nothing generated.

- **Crop.** Every photo and the clip use the same 4:5 window of the source, x 450 to 930 and y 120 to 720, scaled to 720x900. The page fits that window to each pane with one "cover" box (`site.js`), so the photo side and the skeleton side line up exactly.
- **Grade.** Saturation 0.86, shadows lifted toward navy #101827 by `(1 - luminance)^2 * 0.32`, a touch cool, contrast 1.05.
- **The clip (`assets/swing.mp4`, `swing-m.mp4`).** A remapped timeline, 30 fps: source 0 to 4.28 s at 1.6x, a 1.1 s hold on frame 108 (foot down), frames 108 to 114 stepped at a quarter speed (each source frame held, so the visitor's scroll steps through them), a 0.5 s hold on frame 114 (contact), then 4.52 to 7.2 s at 1.3x. Encoded for scrubbing: x264 CRF 22, keyframe every 8 frames (mobile 576x720, CRF 26, every 4). The segment table is in `assets/pose.json` (`segs`) and `site.js` reads it to map the clip's playhead back to source time.
- **Phase times.** Gapper's analyzer (`analyzeSwing` after `SwingDetector`) run on `tests/fixtures/pose-fullbody-front-30fps.json`, converted to source time with `source = (t - 2500) * 4 / 1000`: load 0.13 s, stride 3.07 s, hands go 4.0 s, foot down 4.30 s (frame 108), contact 4.53 s (frame 114). Same run gave the score (72), categories, the hand-drop cue and its drill.
- **Pose (`assets/pose.json`).** MediaPipe Pose Landmarker heavy model run in headless Chromium on all 181 source frames, smoothed with a 1-2-1 filter outside frames 100 to 121 (the swing itself is left raw), stored in crop coordinates.
- **Hero planes.** Frame 13. The cutout is the pose model's segmentation mask (eroded 1 px) plus a drawn bat; the plate has the batter painted out by copying the stands 185 px to the right, then a 1.6 px blur for depth of field. Both share the feet as their scale pivot.
- **Left-column photos.** Frame 150 (stands, blurred), 112 (mid-swing, heavily blurred), 106 (ball in flight), 176 (finish).
- **Chalk.** A 16x512 alpha mask with ragged edges and speckle, used as a CSS mask on the divider.

## Feel check (after the harness)

Done from the harness contact sheets and a top-to-bottom pass, writing one word per act before rereading this file.

| Act | Intended | Felt on the first pass | What changed |
|---|---|---|---|
| 1 Stance | Recognition, then focus | Curiosity (the twin skeleton), then focus | Headline moved down into the ground plane so the hitter stands in front of it; a shade added behind it |
| 2 The gap | Suspense, then awe | Held breath at the heel catch; the strongest moment on the page | Left-hand copy narrowed so it never sits on the heel ring |
| 3 The read | Clarity | Clarity | None |
| 4 One fix | Relief | Relief, but the ten tips were hard to read over the blurred white trousers | Photo darkened under the tips |
| 5 Speed | Confidence | Mild interest; the quietest act | Diagram labels enlarged. Still the weakest act; a candidate for Chad's tweaks |
| 6 Own the gap | Resolve | Abrupt: the first version collapsed in about 135 px of scroll | Span 1.3 to 1.6, the line and button now land after the collapse finishes |

Harness results on the final build: no dead scroll, the clip keeps moving whenever it is on screen, no console errors through the production server (with the app's content security policy). Contrast flags that remain are understood: "You see a swing." measures 2.6:1 at its worst pixel because the hitter's white trousers pass in front of the letters by design (mean 11:1); on phones a few lines dip while their stage slides past the fixed chalk line.
