# Gapper: architecture, feasibility and roadmap

This is the plan behind Gapper, plus a straight answer on what a phone camera can and can't measure. Read the "What an iPhone can measure" table first. It drives every product decision below.

## 1. Existing environment

- Monorepo `chadbeaty/Bat-review`. Sibling apps: Barrel Talk (static, root), slow-pitch marketplace (`web/`), Aged Takes (`agedtakes/`). They all run Next.js 16, React 19, Tailwind 4, Supabase and Vercel. Gapper uses the same stack so it can share habits, CI patterns and hosting.
- Gapper lives in `swingiq/` and stands on its own: its own `package.json`, its own Supabase schema, and its own Vercel project.
- Supabase org is on the free plan with two active projects already (Aged Takes and the marketplace), so a third free project can't be created right now. Gapper is built **local-first**. Everything works on the phone with no account. Accounts and cloud backup switch on as soon as a Supabase project is connected (see `README.md`, "Turn on accounts").
- Barrel Talk's bat catalog (`data/bats.json`, 121 bats) is the natural seed for "My Bats" model pickers later.

## 2. System architecture

```
 PHONE (all real-time work happens here: no per-swing server cost)
 ┌───────────────────────────────────────────────────────────────────────┐
 │ Camera (getUserMedia today; AVFoundation in the native app)            │
 │   │                                                                   │
 │   ├─► Frame ring buffer (last ~4 s, downscaled canvases)  ──► clip     │
 │   │                                                                   │
 │   └─► Pose tracker (MediaPipe Pose Landmarker, GPU, on device)        │
 │          │ 33 body points per frame, image + 3D "world" coordinates    │
 │          ├─► Setup checks (light, framing, steadiness, angle, fps)     │
 │          └─► Swing detector (hand-speed state machine)                 │
 │                 │ swing found                                          │
 │ Microphone ──► Contact listener (bat-ball "crack" onset) ──┐           │
 │                 ▼                                          ▼           │
 │            Swing analyzer: phases ► metrics ► scores ► one cue         │
 │                 │                                                     │
 │                 ├─► Result card + spoken cue (Web Speech / AVSpeech)  │
 │                 └─► Local store (IndexedDB): swing, pose, clip frames  │
 └─────────────────┬─────────────────────────────────────────────────────┘
                   │ when signed in: summaries + metrics (small rows)
                   ▼                    clips only if the player opts in
 SUPABASE  Postgres (RLS on every table) · Auth · private Storage bucket
                   │
                   ├─► analysis_jobs queue ──► worker (Phase 2: bat/ball models
                   │                            on uploaded high-fps clips)
 VERCEL    Next.js app + API routes (coach, Stripe webhooks, admin)
                   │
 STRIPE (Phase 5) · RESEND (email) · LLM provider (coach, Phase 3, text only)
```

Design rules:

1. **Real-time work never leaves the phone.** Pose tracking, swing detection, metrics and feedback all run on device. Sending video frames to a server or an AI API would add latency, cost money on every swing, and fail on cage Wi-Fi.
2. **The server stores results, not frames.** A swing's synced row is a few kilobytes. Video stays on the phone unless the player chooses to back it up.
3. **An LLM never measures anything.** The coach (Phase 3) only gets numbers the vision engine already measured, with their confidence, and explains them. It can't invent a bat speed because it never sees one that wasn't measured.
4. **Every metric carries its provenance.** Each value is tagged `measured`, `cv_estimated`, `sensor` or `unavailable`, with a confidence score, a method and an explanation. Unavailable metrics show the reason, never a placeholder number.

## 3. Required services

| Service | Use | Phase | Cost at start |
| --- | --- | --- | --- |
| Vercel | Hosting, API routes | 1 | Free (Hobby); Pro $20/mo once it's a business |
| Supabase | Auth, Postgres, Storage | 1 (optional), required from 4 | Free tier, then Pro $25/mo |
| MediaPipe Tasks Vision | Pose model + runtime, served from our own domain | 1 | Free (Apache 2.0) |
| Web Speech API / AVSpeechSynthesizer | Spoken cues | 1 | Free, on device |
| Resend | Sign-up, reset and session-summary emails | 1 (with auth) | Free up to 3,000/mo |
| LLM API (provider-agnostic interface) | AI hitting coach Q&A | 3 | ~$0.003–0.01 per question |
| Stripe Billing | Subscriptions | 5 | 2.9% + 30¢ per charge, 0.7% Billing |
| Apple Developer Program | Native iOS app (high-fps capture) | 2 | $99/yr |

## 4. Computer vision technology choice

| Option | Verdict |
| --- | --- |
| **MediaPipe Pose Landmarker (Tasks Vision)** | **Chosen for body tracking.** 33 points including heels and toes, 3D world coordinates, GPU in browsers (WebGL) and native (iOS/Android SDKs), free, ~9 MB "full" model runs in real time on recent phones. Same model on web and native, so analysis code ports over 1:1. |
| Apple Vision `VNDetectHumanBodyPose3DRequest` | Strong on iPhone, iOS only. A good second opinion in the native app, but it would split our analysis code by platform. Keep it as an option. |
| MoveNet / BlazePose via TensorFlow.js | Similar accuracy, bigger runtime, fewer points (MoveNet has no feet). No advantage. |
| OpenCV | Not a pose model. Useful in Phase 2 for classical ball tracking (background subtraction, blob tracking) and lens calibration. |
| Custom bat detector (YOLO-family, Core ML / TFLite) | **Phase 2.** No off-the-shelf model tracks a softball bat's barrel reliably. We train one on our own labeled frames (bat knob + barrel end keypoints). That's the path to bat speed and attack angle. |
| Custom ball detector | **Phase 2.** Small object detector + Kalman tracker on 120–240 fps native capture. |

## 5. Real-time swing detection (how it works)

The detector watches the **hands** (midpoint of both wrists, since both hands are on the bat) and measures their speed in **torso lengths per second**. That unit stays the same whether the phone sits 8 feet or 20 feet away, so it doesn't need calibrating.

State machine (`src/engine/detector.ts`):

1. **Idle:** hand speed low. Waggles and bat taps stay under the start threshold.
2. **Armed:** hand speed crosses the start threshold. Track the peak.
3. **Closing:** speed falls back below the end threshold. The candidate gets judged on:
   - peak speed above the swing threshold (a real swing is 3–6× a waggle),
   - duration between 120 ms and 900 ms,
   - hands traveled at least ~1.2 torso lengths,
   - body tracking confidence stayed good,
   - the hips didn't travel like the player was walking out of the box.
4. **Accepted:** we keep recording ~0.5 s of follow-through, cut the clip (1.6 s before launch to 0.5 s after finish) from the frame buffer, run the full analysis, and play the cue.
5. **Cooldown** of ~1.2 s so one swing never counts twice.

**Contact detection** uses the microphone. Bat-on-ball contact is a sharp broadband "crack" that stands far above cage noise for a few milliseconds. We only accept an audio onset that falls inside the swing's launch-to-finish window, so other cages' hits don't count. Only an onset close to peak hand speed counts. The sound itself is timed to a few milliseconds; lining it up with camera frames adds roughly ±20 ms of clock uncertainty, which still beats a 30 fps frame (33 ms). It also tells a swing-and-miss from contact.

## 6. Ball and bat speed from slo-mo video (built)

Owner's call: no extra hardware, everything in the app. So speeds come from **slo-mo video uploaded on the Record screen** (iPhone Camera app Slo-mo, 120 or 240 fps). Live mode (30 fps) still can't measure them and says so.

- **Ball tracking** (`src/engine/motion.ts`): running background with a per-pixel shimmer model (fence wires and poles under compression don't count as motion), moving blobs from pixel runs, ball candidates by size and roundness, width measured straight across the motion blur and corrected for edge spill, frame-to-frame linking that coasts through short occlusions, outlier cleanup. The pitch and the batted ball are the two tracks that meet at contact, leaving in opposite directions.
- **Scale with one camera** (`src/engine/ballflight.ts`): two independent rulers, blended by their uncertainty. (1) **Gravity**: the slow-pitch arc is free fall, so the pitch's downward acceleration in px/s² ÷ 32.17 ft/s² = pixels per foot over the plate, where contact happens (Bieler et al., ICCV 2019 use gravity as a ruler the same way). Air drag is modeled; unknown spin (±5% of g) is carried in the error band. (2) **The ball's own width** (12" softball = 3.82").
- **Exit velocity and launch angle**: linear fit of the batted ball's first frames in 3D. Motion toward/away from the camera comes from the ball's change in size, shrunk toward "straight across" in proportion to its uncertainty; drag since contact is added back. Shown with a ± (one standard deviation). Withheld when the ball is clear in fewer than 5 frames or the ± is over 15%.
- **Pitch speed and descent angle** from the pitch track.
- **Slow-motion setting check**: with the ball as the ruler, a wrong time base makes gravity come out wrong by the square of the error (8× read as 1× → g/64). The analyzer votes across the clip and the Record screen re-runs once with the corrected factor. Only long, clean arcs can vote.
- **Bat speed**: from one side camera the barrel points at the lens at contact, so its speed can't be seen directly (an MIT thesis only got single-camera bat speed working on synthetic data). It's computed from measured exit velo and pitch speed with the collision efficiency bats are certified by: EV = eA·pitch + (1 + eA)·bat; eA ≈ 0.12 for USA/ASA (25 + 85 mph lab test → 98 mph limit), ≈ 0.17 USSSA. Labeled as assuming a sweet-spot hit. Attack angle still needs a sensor.
- **Performance**: ball tracking runs on every frame at ≤ 960 px wide (~5 ms/frame on a laptop CPU); body tracking runs on every Nth frame (~60 per real second). The frame for ball tracking is grabbed before anything slow, because at 240 fps one frame of drift between a picture and its timestamp wrecks a speed. Browsers can't play slower than 1/16 speed, so with body tracking running the first pass sees only about two thirds of a 240 fps clip's frames on a laptop (fewer on a slow phone or a busy CI runner), and the batted ball can end up with a handful of points that change run to run (one CI run read 99 mph on the 85 mph test clip). So each swing gets a **second, ball-only pass** over contact −1.75 s to +0.6 s, played at ~24 frames a second on screen with only the ball tracker running; it sees ~95% of frames, and its speeds replace the first pass's when it covered ≥ 90% and found the batted ball. Three back-to-back runs on the test clip: 83, 84, 84 mph (first pass alone: 80, 86, 80).
- **Accuracy so far**: 40 random rendered hits (55–110 mph, ±30° spray, spin, blur, noise): median error 1.4%, worst 5.1%, every reading inside 2× its ±. Real batter footage at 240 fps with a known-speed ball drawn in, through the browser: 83–88 mph on an 85 mph truth, launch 18° on 18°, pitch 24.5 on 25. **Not yet validated against a radar on real slo-mo footage**: do that once with a borrowed radar gun before advertising a number.
- **Sensors** still plug in through `src/engine/external.ts`; a typed-in radar or sensor reading takes priority over the video estimate everywhere.

## 7. Ball tracking extras not built

- Landing spot and carry distance in a cage (the net stops the ball); the spray chart stays manual-tag driven.
- Direct bat tracking (knob + barrel keypoint model) for attack angle and an independent bat speed: would need a trained bat model and ideally a second camera angle.

## 8. What an iPhone can measure

| Metric | Browser, ~30 fps | Slo-mo upload, 120–240 fps | Source tag | Notes |
| --- | --- | --- | --- | --- |
| Swing detected, swing count | Yes | Yes | measured | |
| Contact vs. miss, contact time | Yes (mic) | Yes (mic) | measured | Needs mic permission |
| Swing time (launch → contact) | Estimate ±33 ms | ±5–10 ms | cv_estimated | With mic contact, the end point is much sharper |
| Load, stride, launch, contact, finish phases | Yes | Yes | cv_estimated | |
| Front-foot events: timing move (toe tap / stride / leg lift), foot down vs. contact | Yes (feet visible) | Sharper | cv_estimated | The most reliable lower-body signal: ~1–2 frames error |
| Stride length, stance-to-plant width | Yes (side view) | Yes | cv_estimated | Scaled by the player's height |
| Front foot staying planted ("happy feet") | Yes | Yes | cv_estimated | Heel/ankle only; toe pivot is normal |
| Front-leg block (knee change plant → contact) | As a change, ±~10° | Better | cv_estimated | Absolute knee angles aren't shown |
| Back knee, back heel, stride direction | Rough / view-dependent | Better | cv_estimated | Back knee shown as words only |
| Head movement | Yes | Yes | cv_estimated | |
| Hands dropping in the load | Yes | Yes | cv_estimated | |
| Weight shift (hips over front foot) | Yes (side view) | Yes | cv_estimated | |
| Balance at finish | Yes | Yes | cv_estimated | |
| Hip / shoulder turn in degrees, separation, rotation speeds | **No** | **No** (needs 2+ cameras) | — | Even 2 iPhones at 240 fps miss pelvis speed by ~150°/s; not shown |
| Hips-before-hands start order | No at 30 fps | Hint at 60+ fps | cv_estimated | Shown only at 60 fps or faster |
| Hand speed | Rough, in-plane only | Rough | cv_estimated | Not bat speed |
| **Exit velocity** | **No** | **Yes, slo-mo upload, ± shown** | cv_estimated | Gravity + ball-size scale (section 6) |
| **Launch angle** | **No** | **Yes, slo-mo upload** | cv_estimated | |
| **Pitch speed, descent angle** | **No** | **Yes, slo-mo upload** | cv_estimated | |
| **Bat speed** | **No** | **Estimate from exit velo + pitch speed** | cv_estimated | Assumes a sweet-spot hit |
| **Attack angle, bat angles** | **No** | No | — | Needs a sensor |
| Landing spot, distance | No | No (in a cage) | manual | Manual tags drive the spray chart |

Lower-body research and thresholds: `docs/reports/Slow pitch lower body mechanics.md`.

## 9. Technical limitations (plain version)

1. **Frame rate in the browser.** iPhone Safari gives web apps 30 fps for most camera setups. Some Androids and desktops give 60. That's enough for body mechanics but not for the bat or ball, which move too far between frames. **120/240 fps needs the native iOS app** (AVFoundation `AVCaptureDevice.Format` with high `videoSupportedFrameRateRanges`).
2. **Pose speed.** The pose model runs at 20–60 fps depending on the phone. The app measures the real rate and lowers confidence for timing-sensitive metrics when it's slow.
3. **One camera = weak depth.** Rotation and anything toward/away from the lens are estimates. Side view is best for stride, head and weight shift. Behind view is best for hand path and rotation.
4. **Motion blur.** Indoor cages are dim, so the camera uses slow shutter speeds and fast hands smear. The setup check warns when light is low.
5. **Netting and other people.** Cage netting can confuse tracking a little. Other hitters in frame get ignored because the tracker follows one person, but setup asks for a clear background.
6. **Battery and heat.** Continuous camera + GPU drains about 15–25% an hour on a recent iPhone. Sessions keep the screen awake and show the tracking rate so slowdowns are visible.
7. **Background limits.** iPhone suspends web camera access when the screen locks or the app goes to the background. The native app has the same rule, so the screen stays on during a session.

## 10. Infrastructure cost estimates

Assumptions: an active user runs 8 sessions/month × 40 swings = 320 swings. Synced data ≈ 6 KB per swing (metrics + compressed pose) → ~2 MB/user/month. Clip backup is opt-in. 20% of users back up clips at ~1.5 MB each. Coach: 15 questions/user/month on paid plans.

| | 100 users | 1,000 users | 10,000 users |
| --- | --- | --- | --- |
| Vercel | $0 (Hobby) → $20 | $20 | $20–150 (bandwidth) |
| Supabase (DB + Auth) | $0 | $25 | $25 + compute add-on ~$60 |
| Storage (opt-in clips) | $0 | ~$2 (100 GB-mo incl.) | ~$20–40 |
| Model + wasm downloads (cached, ~24 MB once per device) | $0 | included | included |
| LLM coach | ~$5 | ~$45 | ~$450 |
| Resend | $0 | $0–20 | $20–90 |
| **Total / month** | **~$5–25** | **~$90–110** | **~$600–800** |
| Revenue at 25% paid × $14.99 | $375 | $3,750 | $37,500 |

On-device processing is what keeps this cheap. A cloud-video design (upload every swing, run pose on GPUs) would cost roughly $0.002–0.01 per swing → $640–3,200/month at 1,000 users before anything else.

## 11. Native iOS: what needs it

| Feature | Browser | Native iOS |
| --- | --- | --- |
| Pose, swing detection, body metrics | ✅ | ✅ |
| Voice cues, mic contact detection | ✅ | ✅ |
| 60 fps capture | Some devices | ✅ |
| 120 / 240 fps capture | ❌ | ✅ (AVFoundation) |
| Bat speed, attack angle, exit velo, launch angle | ❌ | ✅ (Phase 2) |
| Bluetooth bat sensors / radars | ❌ (no Web Bluetooth on iOS) | ✅ (CoreBluetooth) |
| App Store distribution, in-app purchase | ❌ | ✅ |

Plan: a SwiftUI shell around the same product. The capture layer is AVFoundation. Pose uses MediaPipe's iOS SDK (same model, same landmarks), so `src/engine/*` gets ported to Swift or run in a `JSContext`. The engine is pure TypeScript with no browser APIs on purpose. Swings sync to the same Supabase tables.

## 12. Roadmap

| Phase | What ships | Status |
| --- | --- | --- |
| **1. Prove live capture** | App foundation, player profiles, camera setup guide + live checks, pose overlay, automatic swing detection, mic contact detection, clip capture, frame-by-frame review with phases, body metrics with provenance, one cue per swing, voice cues, manual hit tags, local history, progress basics, Supabase schema + RLS + auth (switches on when connected) | **Built in this pass** |
| 2. Performance analytics | Native iOS capture app (120/240 fps), bat keypoint model + bat speed, attack angle, ball tracker + launch angle / exit velo estimates, validation study vs. sensors, Bluetooth sensors | Next |
| 3. AI coaching | LLM coach over measured data (strengths, weaknesses, drills, routine), swing comparison (synced side-by-side + overlay), Swing DNA (per-player correlations, minimum sample sizes) | |
| 4. Performance platform | Cloud history, progress dashboards, spray charts + heat maps, bat comparisons, share cards | |
| 5. Commercialization | Stripe plans + trials + usage limits, teams/coach dashboards, admin dashboard, onboarding emails | |

Pricing note: plans only sell features that exist. Exit velo and bat speed now exist from slo-mo uploads, labeled with their ± range; don't advertise a specific accuracy until it's been checked against a radar on real footage.
