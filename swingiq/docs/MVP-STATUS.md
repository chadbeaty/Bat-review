# MVP directive: what's built

Status of each item in the "SwingIQ MVP Product Enhancement Directive", checked against the code. "Not yet" items are
left out on purpose: the camera can't measure them reliably, and the directive says to show unavailable rather than
make numbers up.

## 1. Dashboard (`src/app/page.tsx`)
- Built: "Record my swing" as the main button, "Start live analysis" next to it.
- Built: overall SwingIQ score (last 20 swings) with the trend against last week and the foot-down on-time rate.
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
- Not yet: rotation in degrees and true bat attack angle. The bat barrel blurs at 30–60 fps, so the barrel can't be
  tracked yet. That needs Phase 2 high-speed capture (see `ARCHITECTURE.md`).

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
- Shown only with a bat sensor: bat speed, launch angle and exit velocity. Never from the camera.

## 8. Real-time mode
- Built: the live session (`src/components/live/LiveSession.tsx`) is labeled "Live estimate". Swings from video are
  labeled "Processed from video · every frame". Both labels show on every swing page.

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
