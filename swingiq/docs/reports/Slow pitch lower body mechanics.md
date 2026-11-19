# Slow pitch lower body mechanics

What the legs and feet do in a good slow-pitch swing, how that differs from baseball, and what one phone camera can honestly measure. This is what SwingIQ's legs-and-feet engine (`src/engine/lowerbody.ts`) is built on.

Detailed notes with every source: `docs/research_notes/Slow pitch lower body mechanics/`.

## The short version

1. **Slow pitch is a timing game on a falling ball.** The pitch takes about 1.0–1.6 s to arrive (baseball ≈ 0.5 s) and drops through the zone at roughly 18° (6 ft arc) to 41° (12 ft arc), versus about 6° for a baseball fastball. ([Wu et al. 2011](https://ojs.ub.uni-konstanz.de/cpa/article/view/4793/4433); descent angles are our own drag model checked against Wu's measured pitch.)
2. **Skilled slow-pitch hitters land the front heel about 0.2 s before contact.** In the only adult slow-pitch biomechanics study we found (10 skilled men, Class A/B), the stride started about 0.59 s before contact and the front heel came down about 0.21 s before contact ([Wu et al.](https://ojs.ub.uni-konstanz.de/cpa/article/view/5606/5100)). In practice that means: **load as the ball is released, start the step near the top of the arc, foot down as it comes down.** Baseball's "get the foot down early" norm doesn't transfer.
3. **The ISPS guide says the same thing in coaching terms** ([ISPS, "The Science of Slow Pitch Hitting", Oct 2026](https://www.playisps.com/news_article/show/1351103)): begin the weight shift when the ball peaks, trigger as it drops, plant the front foot early and rotate around a fixed axis ("happy feet" is the fault), keep the hands tight until the hips turn ("bar cast" is the fault), hips drive the swing and hands come last, and aim for line drives around 15–20° rather than lifting everything.
4. **Front side: firm, but coaches disagree on straight vs. slightly bent.** In baseball motion-capture data the front knee straightens roughly 30° from foot touch to contact, and more straightening goes with a little more bat speed. Slow-pitch coaches split between "front leg straight and firm at contact" and "keep a little bend". The one thing both camps call a fault is a front knee that **keeps bending after the foot lands** (a soft front side).
5. **Stride length on its own doesn't predict bat speed** in baseball data. What matters more is landing on time, staying planted, and not drifting forward after landing. Slow-pitch coaches also split on big vs. short strides, so SwingIQ only flags a stride that ends up much wider than the stance (about 1.6× or more), which tends to drop the head and cause lunging.
6. **Stride direction is a tool, not a fault, in slow pitch.** Wu found open, straight and closed strides had the same timing, and hitters use them on purpose to place the ball. SwingIQ shows it as information.

## Timing against the arc

| Arc (apex) | Flight time | Apex → contact | Descent at belt height |
| --- | --- | --- | --- |
| Flat (USSSA, +3 ft rise) | ~0.97 s | n/a | ~14° |
| 6 ft | ~1.03 s | ~0.46 s | ~18° |
| 8 ft | ~1.25 s | ~0.59 s | ~27° |
| 10 ft | ~1.44 s | ~0.69 s | ~35° |
| 12 ft (Senior max) | ~1.60 s | ~0.77 s | ~41° |

Our own trajectory model with drag, checked against Wu's measured release (≈13.5 m/s, 2.7 m apex). Arc rules: USA Softball adult 6–10 ft (12 ft for Seniors), NSA 6–10 ft at 53 ft, USSSA at least 3 ft rise and at most 10 ft, SSUSA 6–12 ft with a strike mat ([USA Softball 2023](https://www.usasoftball.com/wp-content/uploads/sites/120/2023/06/2023-Rule-Differences_SPvsFP_Final-4.pdf), [NSA 2018](https://www.paducahky.gov/files/6/2018_NSA_Slow_Pitch_Rulebook.pdf), [SSUSA 2026](https://seniorsoftball.com/wc/wc2026/SSUSA%202026%20Rules%20Summary.pdf)).

## Lower-body faults and how SwingIQ reads them

| Fault | What it looks like | How SwingIQ measures it | Cue |
| --- | --- | --- | --- |
| Late foot | Front foot still landing as the hands go | Foot down under ~0.1 s before contact | "Start your step at the top of the arc so it's down as the ball comes in." |
| Stride, wait, swing | Lands early and stalls | Foot down more than ~0.45 s before contact | "Foot down, go." |
| Happy feet | Front heel keeps moving after landing | Heel/ankle moves more than ~4 in between plant and contact (toe pivot not counted) | "Plant it early and turn around it." |
| Soft front side | Front knee keeps bending after plant | Front-knee angle drops more than ~8° from plant to contact | "Plant and firm up the front leg." |
| Lunging / drifting | Hips and head slide past the front foot | Hips past ~95% of the way to the front foot at contact, or head ~5 in forward (side view) | "Let it come down to you. Stay back on your legs." |
| Overstriding | Feet end up far wider than the stance | Ankle gap at plant ≥ ~1.6× stance width (side view) | "Shorter step, same timing." |
| Collapsing back leg | Sitting down on the back side | Back knee under ~100° at contact (behind/front view, rough) | "Stay tall on the back side." |
| Bar cast | Hands push away from the body before the hips turn | Grip moves >40% farther from the back shoulder by mid-swing (side view, rough) | "Hands tight. Hips first." |
| Stepping in the bucket | Front foot lands away from the plate | Shown as stride direction, not flagged | (information only) |

Thresholds are starting points from the coaching sources and the research above. They'll be tuned on real slow-pitch swings.

## What one phone can and can't measure

From the measurement-accuracy research (validation studies of MediaPipe/BlazePose and commercial systems):

| Measurement | Trust from one phone | How SwingIQ shows it |
| --- | --- | --- |
| Front-foot plant, stride start, leg lift / toe tap | **Good**: about 1–2 frames of timing error | Times (ms before contact) and timing-move type |
| Stride length | Moderate | Inches plus "× your stance", side view only |
| Front-knee bend | Moderate, about 8–15° error in fast moves | **Change** from plant to contact, not the absolute angle |
| Back knee | Low (often the far leg) | Words only ("Tall", "Bent and athletic", "Sitting down") |
| Back heel release | Moderate–low | Time vs. contact, side view only |
| Head and hips sway along the pitch line | Moderate | Inches / % toward the front foot |
| Hip or shoulder turn in degrees, any rotation speed | **Not trustworthy** (a two-iPhone 240 fps system still missed pelvis speed by ~150°/s: [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)) | Not shown |
| Hips-before-hands start order | Low at 30 fps | Only shown at 60 fps or faster, as a hint |

Camera setup that follows from this: whole body **including both shoes** in frame, phone still on a tripod at about hip height, 10–15 ft away. **Side view** (facing the chest) is best for foot-down timing, stride, weight shift and back heel. **Behind or front view** (along the pitch line) is best for knee bend and front-leg block. Setup now refuses to start on its own until the feet are in view, and the batting screen warns if they slip out.

## Tested on real footage

- A real batter filmed head to toe (Pexels stock clip, slowed footage sped back up 4×): SwingIQ caught the one swing, ignored his toe tap and leg lift as non-swings, recognized the timing move as "toe tap + leg lift", found foot down, and read the front-leg block and back knee. This clip is now the end-to-end camera test.
- A synthetic swing with a known 9 in stride, known plant time and known knee angles: the analyzer reads them back (plant within 40 ms, stride within ~1.5 in, front-leg block direction correct).

## Gaps and open questions

- **No slow-pitch measurements exist** for knee angles, ground force or weight at contact. The thresholds above lean on baseball data and coaching advice. The best next step is filming 20–30 real slow-pitch swings (ideally with a 120–240 fps camera and a few with a bat sensor) to tune them.
- **No study validates a single phone for batting.** Accuracy figures are extrapolated from gait, squats, lunges, pitching and a two-phone hitting comparison.
- **License flag:** the most detailed baseball numbers (Driveline OpenBiomechanics data) carry a non-commercial license. SwingIQ's thresholds are set from published studies and slow-pitch coaching sources, not from that dataset. If the business wants to use those numbers directly, it needs a license from Driveline.
- Women's, coed and senior slow-pitch lower-body differences are undocumented.
