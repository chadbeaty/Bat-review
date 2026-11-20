# Speed engine development log

## 2026-11-20: camera-only speed engine, native capture, bat tracking

Owner's brief: keep slo-mo uploads, add real-speed tracking with Gapper's own camera; separate engines for exit velo
and bat speed; build a proprietary slow-pitch dataset; no fake precision.

**Audit.** Gapper already measured exit velo, launch angle and pitch speed from slo-mo uploads (ball tracking with
gravity and ball-size rulers, rendered-hit median error 1.4%). Bat speed was derived from exit velo + pitch speed with
the bat's collision efficiency: not a bat measurement. Capture was browser-only (30 fps live, or Camera-app slo-mo
uploads with a manually chosen slow-motion factor). No native app.

**Research** (`RESEARCH.md`). Blast's camera measures ball flight but bat speed comes from its sensor; no public API.
"Ballista Tracking" and the `bq-engineering` reference repo couldn't be found. Ultralytics YOLO and BaseballCV are now
AGPL-3.0: rejected for a commercial app. RF-DETR N/S/M/L is Apache-2.0: chosen. No validated single-camera bat-speed
method exists publicly.

**Decision 1: native capture through a Capacitor shell + one local Swift plugin.** Keeps the web app, hosting,
accounts and analysis as they are. Rejected: native rewrite, React Native, streaming frames over the bridge. The plugin
records HEVC at 240/120 fps with stabilization off, a 1/1000 s target shutter, every frame's timestamp, dropped frames,
lens intrinsics, gravity and gyro, and live setup checks. The video + sidecar go to the existing analyzer, which now
snaps frame times to the camera clock and uses the real focal length. "Real speed": no slow-motion factor to pick.

**Decision 2: a separate bat-speed engine.** New pixel tracker (`battrack.ts`) and physics (`batspeed.ts`): swing-plane
rigid-body fit with the known bat length, local cubic smoothing on real timestamps, `v = v_hands + ω × r` at the
sweet spot (6" from the end, same point as bat sensors). Exit velo stays on ball tracking. The old formula remains as a
labeled fallback and as a cross-check in the explanation.

- First version: 1 of 8 rendered swings passed. Cause: rays toward the hips blocked the bat at contact (in a side view
  the bat at contact points across the plate, which projects down over the legs), and the strongest ray was often a
  moving body edge. Fix: only the arms are excluded; the tracker returns up to three candidates per frame and a dynamic
  program picks the one that rotates smoothly. Result: 8 of 8, mean error ≈ 1 mph.
- Stress tests: noise + 4 px pose jitter → +7% (inside its ±); unknown body scale → fine (bat length alone);
  bat length off by 1" → +4% (so the bat's length matters: the app says when it assumed 34"); 120 fps + 1/120 s shutter
  on a 90 mph swing → −8%, so the ± now grows with lower frame rates and wider blur fans. A level camera with a flat
  swing is refused as edge-on, with the fix in plain words.
- Speed: ~0.3–0.7 s per swing in Node.

**Decision 3: dataset and models before claims.** `ml/` has the annotation schema (ball, bat with knob / sweet spot /
barrel end, hitter, plate; conditions; reference readings), frame extraction from native recordings using the sidecar,
player-level splits with a coverage report, RF-DETR training with a model card, Core ML export with a parity check, and
an evaluator that scores what the speed engines need (ball recall right after contact, center error in pixels, bat
keypoint error) with a regression gate. No model is trained yet: there's no labeled slow-pitch footage yet.

**Decision 4: validation tooling.** Profile › "Export for accuracy testing" pairs Gapper's readings with typed-in
radar/sensor readings; `scripts/validation-report.mjs` produces the full report and refuses to call a target with
fewer than 50 paired swings. `tests/unit/speed-benchmark.test.ts` is a CI regression gate on rendered clips.

**Not verified in this session (no iPhone in the build environment):** the Swift code hasn't run on a phone yet.
Update the same day: a GitHub Actions macOS runner (`gapper-ios.yml`) compiled it cleanly on the first try (unsigned,
arm64), so compile errors are caught in CI from now on. Real-world accuracy of both engines is unknown until
a radar/sensor session.
