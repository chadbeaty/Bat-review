# Gapper speed engine: architecture

How Gapper measures exit velocity and bat speed from a phone camera, and why it's built this way. Research behind it:
`RESEARCH.md`. Decisions over time: `DEVLOG.md`. Bridge contract: `NATIVE-BRIDGE.md`. Accuracy testing: `VALIDATION.md`.

## Layers

```
 CAPTURE (native-ios/, Swift + AVFoundation)                       ← new
   240/120 fps · HEVC · stabilization off · 1/1000 s shutter · per-frame timestamps · dropped frames ·
   lens intrinsics · gravity + gyro · live setup checks · swing marks
        │ .mov + sidecar JSON (NativeCaptureMeta)
        ▼
 APPLICATION (Next.js web app, unchanged hosting)                    src/app/record, src/components/NativeCapture
   Record at 240 fps (native) · Upload a slo-mo video (any browser) · live mode (30 fps, body only)
        │
        ▼
 VISION + PROCESSING (pure TypeScript, no browser APIs)              src/engine
   Body:  MediaPipe Pose → hands, shoulders, elbows (60 fps)
   Ball:  motion.ts     background model → round blobs → linked tracks (pitch, batted ball)      ← existing
   Bat:   battrack.ts   "moving now" mask → rays from the hands → bat direction + barrel end   ← new
        │
        ▼
 MEASUREMENT (two separate engines)
   Exit velo:  ballflight.ts + speeds.ts   gravity + ball-size rulers, 3D fit, drag back to contact
   Bat speed:  batspeed.ts + localpoly.ts  swing-plane rigid-body fit with known bat length,
                                           local cubic on real timestamps, v = v_hands + ω × r
   mergeBatSpeed(): barrel tracking replaces the old exit-velo formula; the formula stays as a cross-check
        │  MetricValue { value, ±, confidence, method, reason }
        ▼
 STORAGE (IndexedDB on the phone; Supabase when accounts switch on)  unchanged
        │
 VALIDATION   scripts/validation-report.mjs (vs radar/sensor) · tests/unit/speed-benchmark.test.ts (regression gate)
 ML           ml/ (dataset schema, extraction, player-level splits, RF-DETR training, Core ML export, evaluation)
```

Raw video never leaves the phone unless the player backs it up. No per-swing cloud cost.

## Metric definitions (identical everywhere)

| Metric | Definition | Engine | Shown when |
| --- | --- | --- | --- |
| Exit velocity | Speed of the ball immediately after leaving the bat: linear 3D fit of the first clear frames after contact, gravity removed, drag added back to the moment of contact. Not average speed, not max later in flight. | Ball tracking | ≥ 5 clean frames of the batted ball and ± ≤ 15% |
| Launch angle | Vertical angle of that same velocity. | Ball tracking | Same |
| Bat speed | Peak linear speed of the point 6" from the barrel end ("sweet spot"), from 100 ms before contact to 10 ms after. | Barrel tracking | Plane not edge-on, ≥ 10 clean bat frames over ≥ 50 ms, residual small, 25–115 mph |
| Bat speed (fallback) | From exit velo + pitch speed with the bat's certified collision efficiency; assumes a sweet-spot hit. Labeled "worked out from exit velo". | Collision formula | Barrel tracking failed but exit velo exists |
| Attack angle | Direction of the sweet spot's travel at contact relative to true horizontal (phone's gravity sensor). | Barrel tracking | Native recordings only |
| Pitch speed, descent | From the pitch track just before the plate. | Ball tracking | Pitch tracked |

Every value carries `source` (measured / cv_estimated / sensor / unavailable), `confidence`, `plusMinus` (≈ 1 σ),
`method` and a plain-language `reason`. Unavailable values say why and how to fix it.

## The bat-speed engine in detail

1. **Find the bat in each frame** (`battrack.ts`). A pixel is "moving now" if it differs from the running background
   *and* from the frame ~9 ms earlier (kills the ghost a bat leaves where it rested). From the hands (MediaPipe,
   interpolated to every frame with Catmull-Rom), cast 360 rays; score each by how much of it is moving between 17%
   and 100% of the bat's expected length; skip rays into the arms. Return up to three peaks per frame (bat plus
   decoys such as a moving body edge), each with its direction (fan middle = mid-exposure), barrel-end distance,
   fan width and confidence.
2. **Pick the bat's path** (`selectTrack`): dynamic programming over the candidates, penalizing direction changes
   faster than any real swing and jumps in apparent length.
3. **Fit the swing** (`analyzeBatSpeed`): unknowns are the swing-plane normal (2), the camera-to-hands distance (1,
   with a prior from the hitter's height) and one angle ψ per frame. The model projects the bat's tip through the real
   (or assumed) lens; error is the pixel difference in direction (weighted) and length. Coarse search over 320 plane
   normals × 3 distances, then local refinement; Huber loss; outlier frames dropped.
4. **Differentiate on real timestamps** (`localpoly.ts`): weighted local cubic fits (not a moving average, which
   shaves the peak) give ω(t) and its standard error; local quadratic for the hands.
5. **Speed**: `v_ss = dH/dt + ω · r_ss · t̂`, `r_ss = bat length − 4.5" grip − 6"`. Peak in the definition window.
6. **Uncertainty**: hands-term scale error, ω noise from the fit, 3% out-of-plane model error, lens error, fit
   residual, and a frame-rate/blur term (120 fps and long shutters flatten the peak).
7. **Refusals**: few frames, poor fit, plane edge-on (with the fix: raise the phone, tip it down or move it toward
   the pitcher), implausible result.

Rendered-swing results (`tests/unit/batspeed.test.ts`, `tests/benchmarks/speed-baseline.json`): mean error 1.6 mph,
worst 3.8 mph across blur, dropped frames, camera yaw and a mirrored hitter; bat length 1" wrong → +4%. **Not yet
checked against a radar or bat sensor on real swings.**

## Decisions and rejected alternatives

| Decision | Chosen | Rejected and why |
| --- | --- | --- |
| Native integration | Capacitor shell loading getgapper.com + one local Swift plugin | Full native rewrite (duplicates the whole app); React Native (rebuild the UI); browser-only (no 240 fps, no timestamps). |
| Frames across the bridge | Native writes a file + sidecar; the web analyzes the file | Streaming 240 fps frames over the JS bridge (too much data per second; would drop frames). |
| Bat speed method | Rigid-body swing-plane fit with known bat length | Derive from exit velo only (not a bat measurement: reads low on mishits; the brief requires separate engines); single-frame 2D tip speed (wrong whenever the bat points toward the camera, which it does at contact from the side). |
| Smoothing | Local polynomial on real timestamps | Moving average (flattens the peak); Savitzky–Golay on an even grid (wrong across dropped frames); Kalman (fine, but needs a motion model tuned per swing; local cubic is simpler and bias-free at the peak). |
| Detector | RF-DETR (Apache-2.0), fine-tuned on Gapper footage | Ultralytics YOLO and BaseballCV (AGPL-3.0); off-the-shelf COCO "sports ball" (not trained on blurred 12" softballs). |
| Ball trajectory | Gapper's own tracker (sizes per frame, drag, two rulers) | Apple `VNDetectTrajectoriesRequest` as the primary (no ball size, normalized 2D only): keep as a possible cross-check. |
| Exposure | 1/1000 s target, ISO compensates, warn when light runs out | Auto exposure (often 1/240 s indoors: the barrel smears across ~15° per frame). |

## Upgrade path (designed in)

- The bat tracker takes candidates from any source: today the motion mask, tomorrow the Core ML detector's bat box
  and keypoints (`ml/`). The physics doesn't change.
- New models ship as files with a model card (dataset hash) and must pass `ml/eval/eval_detector.py --baseline` and
  the engine benchmark before they replace the old one.
- The engines are pure TypeScript, so they can run in a Web Worker or be ported to Swift unchanged in behavior.
