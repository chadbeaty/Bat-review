# Just Hit (Simple mode)

A fast lane in front of the app: open, tap **Just Hit**, tap record, swing. One grade, one fix, **Again**. Every existing screen is still there and unchanged; Just Hit only sits in front of them.

## Flow
- `/start` (where the scroll site's "Start swinging" lands) and `/` for anyone in Simple mode show the Just Hit home (`src/components/justhit/JustHitHome.tsx`): one big button to `/hit`, a small **Full setup** (`/start?setup=full`, the existing setup form) or, for a hitter who already has a full profile, **Full app**.
- `/hit` (`JustHitSession.tsx`) creates a guest if there's no hitter, opens the camera straight away (the existing `LiveEngine`, side view, no mic so there's only one permission prompt), shows a batter outline, one hint ("Side view · ~10 ft back") and a record button. Record can be tapped while the tracker is still loading; it starts listening as soon as it's ready.
- The first swing goes to the result: the Gapper Score dial, **one fix** (`src/engine/oneFix.ts`), an "Estimated" tag for guests, one profile question, **Again** (straight back to a listening camera) and **See full breakdown** (the existing `/swings/[id]` page).
- The body tracker starts downloading while the home screen is showing, so the camera is ready sooner. Measured in the browser test: about 5 s from opening `/start` to a recording camera, two taps.

## Guest mode and defaults (`src/lib/guest.ts`)
- A guest is a normal `Player` with `guest: true` and `assumed: ["heightIn", "hand"]`, on defaults of 5'9" and bats right.
- Height only scales inches and mph (4" off ≈ 6% off). Score, timing and the legs-and-feet faults don't use it.
- Batting side matters for the legs (which leg is in front), so side-view swings check it from the swing itself (`src/engine/handedness.ts`: grip travel toward the lead shoulder, and grip set up on the rear-shoulder side). A clear lefty swing is re-read as a lefty and the guest's side is updated. Tested on synthetic swings and their mirror images; not yet checked on real lefty footage.
- Swings recorded while anything is on a default carry `estimated: true` and show "Estimated" on the result and the full breakdown.

## Progressive profile
- After a swing, at most one question per visit (tab session): height, then side, then name. "Not now" is fine.
- Answering keeps the same player id, so every swing stays theirs; `guest` becomes false. Fields not answered stay in `assumed`.
- A guest who taps **Full setup** fills the existing form with their guest record (same id) and lands on the full app.

## The one fix
Straight from the analyzer's ranked feedback, no new rules: the worst legs-and-feet fault first (`LEG_METRICS` in `src/engine/catalog.ts`, the same list as the "Legs and feet" section), then the worst fault of any kind, then (nothing to fix) the top praise as "Keep doing this".

## Simple vs Full
`settings.appMode` ("simple" | "full"), switched in Profile › Session settings › Simple mode. Unset: new hitters and guests get Simple; hitters who set up a full profile before Just Hit keep the full dashboard.

## Tests
- Unit: `tests/unit/justhit.test.ts` (defaults, guest upgrade, question order, app mode, batting side, one fix).
- Browser: `tests/e2e/justhit.spec.ts` (real swing clip as the camera: two taps, grade, fix, question, Again, full breakdown, Simple/Full switch; guest Full setup upgrade).
