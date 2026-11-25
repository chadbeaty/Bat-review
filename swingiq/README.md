# Gapper

Live at **https://getgapper.com** (also https://swingiq-live.vercel.app). New visitors get the scroll site (`public/site/`, see `docs/site/BRIEF.md`); anyone with a hitter set up gets the app. Brand kit: `public/brand/BRAND.md`.

Real-time slow-pitch softball swing analysis from a phone. Put the phone on a tripod, step in, and hit. Gapper spots every swing on its own, saves a clip, scores your mechanics and gives one cue, spoken if you want.

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
| Gapper mechanics score and one cue per swing (slow-pitch rules) | `src/engine/scoring.ts`, `src/engine/feedback.ts` |
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

## Accounts and sync across devices

Sign-in is optional; everything works on the phone with no account. Signing in syncs a player's hitters, bats,
sessions and swings (full records plus the tracked body points) both ways, so the same history shows on every device
they sign in on. Video never leaves the phone that recorded it; other devices replay the tracked skeleton.

- **Database:** Supabase project `gapper` (`jqhkpqevdpfkfswwlzxj`, us-east-1, free plan). Schema and security rules in
  `supabase/migrations/` (applied to the live project as well as committed). Database tests: `tests/db/`.
- **Website:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key, public by design)
  are set in Vercel for production, preview and development. No server secret is used: "Delete account" calls the
  `delete_my_account()` database function.
- **How sync works:** `src/lib/sync.ts` (push changed records and delete tombstones, then pull everything changed since
  the last sync, one cursor per table). `src/components/SyncProvider.tsx` runs it on sign-in, on opening the app,
  when it comes back to the front or online, and a few seconds after any save or delete (never during a live
  session). `src/lib/store/db.ts` marks every app save as changed and leaves a tombstone for every delete.
- **Emails** (confirm sign-up, reset password) go through Supabase Auth. Supabase's built-in mailer only delivers to
  the project's own team, so public sign-ups need custom SMTP: Resend's free plan, sending from getgapper.com
  (Supabase → Authentication → Emails → SMTP). Site URL and allowed redirect URLs are set under Authentication →
  URL Configuration (`https://getgapper.com`, `https://getgapper.com/**`, `https://swingiq-live.vercel.app/**`,
  `https://*-ai-toolbox2.vercel.app/**`, `http://localhost:3000/**`).
- **Local development:** put the two `NEXT_PUBLIC_` values in `.env.local` (git-ignored). Without them the app runs
  with sign-in switched off, which is how CI runs.

## Field tuning

During a session, `window.__swingiq` in the browser console shows frames processed, the fastest hand speed seen, the last rejected candidate and why, and which processor (GPU/CPU) is running the tracker. Detection thresholds live in `DEFAULT_DETECTOR` (`src/engine/detector.ts`).

## Design

Brand kit: `public/brand/BRAND.md`. Design system and screens: `docs/DESIGN.md` (v4 "carbon and alloy" with the v5
"Strobe" layer). Audit and directions behind the current look: `docs/design/REDESIGN-2026-11.md`.
