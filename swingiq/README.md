# SwingIQ Live

Real-time slow-pitch softball swing analysis from a phone. Put the phone on a tripod, step in, and hit. SwingIQ spots every swing on its own, saves a clip, scores your mechanics and gives one cue, spoken if you want.

- **Architecture, feasibility, costs, roadmap:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Start there.
- **What a phone can and can't measure** is in that doc, and also inside the app at `/how-it-works`.

## What's built (Phase 1)

| Feature | Where |
| --- | --- |
| Hitter profiles (several per phone), height for scaling | Home first run, Profile |
| Live session: camera, setup guide, live setup checks (light, full body, distance, angle, steadiness, tracking speed), hands-free start | `/live` |
| Body tracking (MediaPipe Pose, on the phone) with skeleton overlay | `src/live/engine.ts` |
| Automatic swing detection (no taps) with pre/post-roll clips | `src/engine/detector.ts` |
| Bat-ball contact from the mic | `src/engine/contact.ts`, `public/worklets/contact-energy.js` |
| Phases: stance, load, stride, launch, contact, finish | `src/engine/analyzer.ts` |
| Metrics with source + confidence + method on every number; unavailable ones explain why | `src/engine/analyzer.ts`, `src/engine/catalog.ts` |
| SwingIQ mechanics score and one cue per swing (slow-pitch rules) | `src/engine/scoring.ts`, `src/engine/feedback.ts` |
| Voice cues (on/off, frequency, voice, quiet mode) | `src/live/voice.ts` |
| Basic/Advanced live view, pause, end, review last swing, session notes, end-of-session summary with next focus | `src/components/live/LiveSession.tsx` |
| Frame-by-frame review with skeleton, grip path and phase jumps | `src/components/ClipPlayer.tsx` |
| Manual hit tags (spray chart), sensor/radar reading entry, swing notes, delete swing/video | `/swings/[id]` |
| Progress: personal bests, trends, spray chart, 30-day/season/all-time filters | `/progress` |
| My Bats with per-bat average score | Profile |
| Export all data, delete everything | Profile |
| Supabase schema for all 20 tables + RLS + private clip storage, sign-up/sign-in/reset, cloud backup, account deletion | `supabase/migrations`, `src/lib/sync.ts` |

Everything works with no account: data lives on the phone (IndexedDB). Accounts and backup switch on when Supabase is connected.

## Run it

```sh
npm install          # also copies the pose runtime and downloads the pose models into public/vision
npm run dev          # http://localhost:3000 (camera needs https or localhost)
```

To try it on a phone during development, open the dev server through an https tunnel, or use the Vercel preview link.

## Tests

```sh
npm test                         # engine unit tests + database security tests
npm run build && npm run test:e2e
```

- **Engine tests** use real MediaPipe output from a real batter clip (`tests/fixtures/pose-batter-*.json`) plus a synthetic swing with known stride, hand drop and head movement, so the measurements are checked against ground truth.
- **Database tests** build a throwaway Postgres from the migrations and check that users only ever see their own data (needs Postgres: `TEST_DATABASE_URL`, default `postgres://postgres@localhost:54329/postgres?host=/tmp`; skipped when none is running).
- **End-to-end tests** run every page on phone and desktop sizes. The live test feeds a real batter's swing to Chromium as a fake webcam and checks that the app finds the swing with no taps, scores it, saves the clip and plays it back. Get the clip once with `scripts/fetch-test-video.sh` (Mixkit free license; not stored in the repo).

## Turn on accounts (optional)

1. Create a Supabase project (the free plan allows two active projects; this org already has two, so either upgrade or pause one).
2. Apply `supabase/migrations/*.sql` to it.
3. In Vercel → project → Settings → Environment Variables add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (server only, used for account deletion). Redeploy.
4. In Supabase → Authentication → URL configuration, set the site URL to the live domain.

## Field tuning

During a session, `window.__swingiq` in the browser console shows frames processed, the fastest hand speed seen, the last rejected candidate and why, and which processor (GPU/CPU) is running the tracker. Detection thresholds live in `DEFAULT_DETECTOR` (`src/engine/detector.ts`).

## Design

"Night league under the lights": charcoal night field with a faint cage-net mesh, chalk-white type, one optic softball yellow for whatever is live, stitch red only for the one thing to fix. Archivo (wide) for numbers and headings so they read from 8 feet away; Atkinson Hyperlegible Next for everything else. The score is drawn as a slow-pitch arc landing on the plate.
