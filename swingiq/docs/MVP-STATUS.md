# MVP directive: what's built

Status of each item in the "Gapper MVP Product Enhancement Directive", checked against the code. "Not yet" items are
left out on purpose: the camera can't measure them reliably, and the directive says to show unavailable rather than
make numbers up.

## 1. Dashboard (`src/app/page.tsx`)
- Built: "Record my swing" as the main button, "Start live analysis" next to it.
- Built: overall Gapper Score (last 20 swings) with the trend against last week and the foot-down on-time rate.
- Built: recent swings, personal records (top score, personal best with a compare link), last session focus and
  category averages. A first-run card explains how to film.

## 2. Profiles and bats
- Built: handedness, height, playing level, positions and goals (`src/components/PlayerForm.tsx`).
- Built: multiple bats with brand, model, length, weight, balance and certification (`src/app/bats/page.tsx`).
- Built: every swing is tied to a bat. Live sessions use the session's bat. Uploads pick a bat on the Record screen.
  The bat can be changed later on the swing page.

## 3. Analysis engine
- Built: camera recording and video upload (`src/app/record/page.tsx`, `src/live/videoAnalyzer.ts`). The video plays
  slowed down so every frame gets tracked. A slow-mo setting (1×/4×/8×) keeps timing right for iPhone Slo-mo files.
- Built: automatic swing detection, pose on every frame, swing phases (load, stride, foot down, launch, contact,
  finish).
- Built: head stability, hips-before-shoulders, back-shoulder drop, balance at finish, front-leg block, back heel and
  stride.
- Built where the view allows: hand path at contact (a stand-in for swing plane) and contact spot vs the front hip.
  Both come from the side view only. Other views show them as unavailable.
- Built: every metric carries a source tag (measured, camera estimate, sensor, unavailable) and a confidence.
- Built (slo-mo uploads): exit velocity, launch angle, pitch speed and descent angle from ball tracking, and bat speed
  from exit velo + pitch speed. Every one shows a ± range. See `ARCHITECTURE.md` section 6.
- Not yet: rotation in degrees and attack angle. One camera can't see either reliably.

## 4. Score breakdown (`src/engine/scoring.ts`)
- Built: six categories: Balance, Timing, Rotation, Bat path, Contact and Follow-through. Each one shows the checks
  that went into it.
- Built: a category with nothing measured shows as unavailable, with the reason. The overall score needs at least two
  categories and three checks.

## 5. Coaching (`src/engine/coaching.ts`)
- Built: after every swing you get the biggest issue, why it matters in plain words, one fix, a drill and a
  10-swing challenge.
- Built: the challenge runs live and counts passes. The live result card compares the swing to the previous one.
- Note: coaching is rules-based, written from the slow-pitch research in `docs/reports/`. It isn't an AI chat model.
  That keeps it free to run and consistent.

## 6. Swing comparison (`src/app/compare/page.tsx`)
- Built: two swings side by side on one shared scrubber, played together at 1×, ¼× or ⅛×, with a skeleton overlay.
- Built: you can line the two swings up at launch, foot down or contact.
- Built: you can compare against your personal best or any swing in your history, with a table of differences.

## 7. Bat DNA (`src/lib/batdna.ts`)
- Built: swings, average score, score consistency, timing spread and category averages for each bat.
- Built: contact rate from the mic and line-drive rate from your tags.
- Built: bats are compared only after 15+ swings with each. Until then it shows how many more swings you need.
- Exit velo (average and best 3), bat speed and launch angle per bat, from slo-mo videos or typed-in sensor readings.

## Slo-mo speeds (added after the directive, owner's request: no extra hardware)
- Record or upload a Camera-app Slo-mo clip. Each swing gets a Speed card: exit velo ±, bat speed ±, launch angle,
  pitch speed and pitch drop. A wrong slow-motion setting is caught from the pitch's fall and re-analyzed.
- Tested on rendered hits (median 1.4% error) and through the browser on real batter footage with a known-speed ball.
  Still to do: one real-world check against a radar gun.

## Camera-only speed engine (2026-11-20, owner's brief)
- Built: Gapper's own 240 fps camera in the iOS app (`native-ios/`), with a setup assistant (frame rate, light and
  shutter, level, steadiness, framing, room for the ball). Records real speed with every frame's true time.
- Built: bat speed measured from the bat itself (barrel tracking), separate from exit velo (ball tracking). The old
  formula stays as a labeled fallback. Attack angle from barrel tracking on native recordings.
- Built: the replay draws the tracked bat and the sweet spot's path.
- Built: dataset schema and model pipeline (`ml/`), accuracy export + report (`docs/speed/VALIDATION.md`), CI accuracy
  regression gate on rendered clips.
- Not yet: first Xcode build on a Mac, a labeled slow-pitch dataset, a trained model, and a radar/sensor session. No
  accuracy claims until that session is done.

## 8. Real-time mode
- Built: the live session (`src/components/live/LiveSession.tsx`) is labeled "Live estimate". Swings from video are
  labeled "Processed from video · every frame". Both labels show on every swing page.
- Built: scoreboard mode (`src/components/live/Scoreboard.tsx`, on by default, toggle on the live screen and on the
  setup screen, remembered on the device). After each swing it fills the screen with numbers you can read from the
  plate, portrait or landscape: the gap timer as the headline, the swing score and the cue. It stays up until the
  next swing (tap to tuck it away).
- Built: the gap timer (`src/engine/gap.ts`): front foot down to contact, in seconds, from the swing's phases. Shown
  next to the slow-pitch reference (skilled hitters ≈ 0.20 s, window 0.14–0.38 s, Wu et al.), never baseball's "foot
  down early" norm. Rounded to hundredths with ± one tracking frame (about ± 0.02–0.04 s at 30–60 fps) and labeled an
  estimate with its source and confidence. Low confidence, feet out of view, no stride, or contact before foot down
  show a dash and a short reason instead of a number.
- Built: in scoreboard mode the voice reads the numbers ("72. Gap, point two one. Hands dropped."), following the
  existing voice, quiet-mode and how-often settings.
- Not in live mode, on purpose: exit velo, bat speed, launch angle and pitch speed (slo-mo uploads only).

## 9. UX
- Built: mobile-first, big touch targets, the camera opens straight from Record. Empty, loading, processing (with
  progress and Cancel) and error states on every new screen.

## 10. Quality
- Unit tests: engine, scoring, coaching, Bat DNA and the database rules (`tests/unit`, `tests/db`).
- Browser tests: every page on a phone and a desktop.
- Browser tests: the live camera with a real swing (`tests/e2e/live.spec.ts`).
- Browser tests: the full upload flow, from upload to analysis, coach, personal best, Bat DNA, a second upload,
  compare and the dashboard (`tests/e2e/flows.spec.ts`). Data persists across reloads in IndexedDB.
- Accounts and the Supabase schema are untouched. They switch on when the Supabase keys are set.
