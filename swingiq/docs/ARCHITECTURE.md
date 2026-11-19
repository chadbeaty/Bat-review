# SwingIQ Live: architecture, feasibility and roadmap

This is the plan behind SwingIQ Live, plus a straight answer on what a phone camera can and can't measure. Read the "What an iPhone can measure" table first. It drives every product decision below.

## 1. Existing environment

- Monorepo `chadbeaty/Bat-review`. Sibling apps: Barrel Talk (static, root), slow-pitch marketplace (`web/`), Aged Takes (`agedtakes/`). They all run Next.js 16, React 19, Tailwind 4, Supabase and Vercel. SwingIQ uses the same stack so it can share habits, CI patterns and hosting.
- SwingIQ lives in `swingiq/` and stands on its own: its own `package.json`, its own Supabase schema, and its own Vercel project.
- Supabase org is on the free plan with two active projects already (Aged Takes and the marketplace), so a third free project can't be created right now. SwingIQ is built **local-first**. Everything works on the phone with no account. Accounts and cloud backup switch on as soon as a Supabase project is connected (see `README.md`, "Turn on accounts").
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

## 6. Bat tracking: how it can work

- **Phase 1 (now):** no bat tracking. Bat speed is shown as unavailable with the reason. Hand speed (a real, related measure) is shown as a camera estimate.
- **Phase 2, native app:** capture at 120 or 240 fps with AVFoundation, run a trained bat-keypoint model (knob and barrel end) on each frame, and fit the bat as a line segment rotating around the hands. Barrel-end speed at the contact frame = **bat speed**. The bat's angle across the contact frames = **attack angle** and **vertical bat angle**. Scale comes from the bat's known length (from "My Bats"), which is far better than guessing from the player's body.
- **Accuracy target:** within ±3 mph of a bat sensor at 240 fps, side view, good light. Validated against a sensor before we ever show it to customers. Until it's validated, it stays labeled "beta estimate".
- **Sensors:** a pluggable `ExternalMeasurement` interface (`src/engine/external.ts`) lets bat sensors and radars feed values tagged `sensor`. Phase 1 supports manual entry (type in a number from your Pocket Radar, Blast or Diamond Kinetics). Bluetooth sensor pairing needs the native app (iPhone Safari doesn't support Web Bluetooth).

## 7. Ball tracking: how it can work

- A slow-pitch ball after contact moves 60–100 mph. At 30 fps it's a blur that crosses the frame in two or three frames. At 240 fps it's 30–60 clean samples.
- **Phase 2, native, 240 fps, side view:** background subtraction + small ball detector + Kalman filter for the first ~10 ft after contact. Launch angle comes straight from the trajectory. Exit velocity = distance/time, scaled using the bat length or a calibration mark (home plate is 17 in wide).
- **Can't measure from one phone:** landing spot and true carry distance in a cage (the net stops the ball). The spray chart is built from **manual tagging** (pull / center / oppo × grounder / liner / fly / pop-up), available on every swing now. On a field, a second phone behind the plate could auto-tag direction later.

## 8. What an iPhone can measure

| Metric | Browser, ~30 fps | Native, 120–240 fps | Source tag | Notes |
| --- | --- | --- | --- | --- |
| Swing detected, swing count | Yes | Yes | measured | |
| Contact vs. miss, contact time | Yes (mic) | Yes (mic) | measured | Needs mic permission |
| Swing time (launch → contact) | Estimate ±33 ms | ±5–10 ms | cv_estimated | With mic contact, the end point is much sharper |
| Load, stride, launch, contact, finish phases | Yes | Yes | cv_estimated | |
| Stride length, stride timing | Yes (side view, feet visible) | Yes | cv_estimated | Scaled by the player's height |
| Head movement | Yes | Yes | cv_estimated | |
| Hands dropping in the load | Yes | Yes | cv_estimated | |
| Weight shift (hips over front foot) | Yes (side view) | Yes | cv_estimated | |
| Balance at finish | Yes | Yes | cv_estimated | |
| Hip / shoulder turn, separation | Rough (3D estimate) | Better | cv_estimated | One-camera depth is the weak spot; shown with lower confidence |
| Kinematic sequence (hips → shoulders → hands) | Rough | Yes | cv_estimated | Peaks are 10–30 ms apart, so 30 fps can blur the order |
| Hand speed | Rough, in-plane only | Good | cv_estimated | Not bat speed |
| **Bat speed** | **No** | Phase 2 (bat model) | — | Needs bat tracking or a sensor |
| **Attack angle, bat angles** | **No** | Phase 2 | — | Needs bat tracking |
| **Exit velocity** | **No** | Phase 2 (estimate) | — | Needs ball tracking + calibration |
| **Launch angle** | **No** | Phase 2 | — | Needs ball tracking |
| Landing spot, distance | No | No (in a cage) | manual | Manual tags drive the spray chart |

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

Pricing note: plans only sell features that exist. Until Phase 2 ships, Pro can't promise bat speed or exit velocity.
