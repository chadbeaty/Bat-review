# Camera-only speed tracking: research report

Researched 2026-11-20 for the Gapper speed engine. Everything here was checked against current public sources that
day; anything I couldn't verify says so. Sources are listed at the bottom.

## 1. The short answer

- **Exit velocity from one phone camera is solved well enough to build on**, as long as the phone films at 120–240 fps,
  sits still, and gets a ruler for scale. Gapper already had this (ball tracking + gravity + ball size); this pass gives
  it real frame times and the lens's real focal length from the native camera.
- **Bat speed from one camera is the hard one.** Nobody publishes a validated single-camera method. The only academic
  attempt found (MIT thesis, 2023) worked on synthetic swings only. Commercial camera products (Blast's camera mode)
  measure ball flight with the camera and bat speed with a **sensor**. So Gapper's barrel tracker is new work, built on
  a rigid-body model with the bat's known length as the constraint (section 5). It is validated on rendered swings only
  until a radar/sensor session is run.
- **Native iPhone capture is required.** Mobile Safari gives a web page ~30 fps. 120/240 fps, true frame timestamps,
  dropped-frame reports, shutter control and lens intrinsics only exist in AVFoundation.

## 2. Competitors and products

| Product | What the camera measures | Method (public info) | Accuracy evidence | API / licensing |
| --- | --- | --- | --- | --- |
| **Blast Motion: Blast Vision / Ball Flight in the Blast app** | Exit velo, launch angle, carry distance (camera). Bat speed comes from the **bat sensor**, not the camera. | iPhone/iPad on a tripod, landscape, rear camera, ball hits into a net; needs the ball to cross the full screen. | A third-party page cites ±5 mph EV / ±1° LA vs launch monitors (unverified). Bat Digest's review found EV **8–10 mph higher than HitTrax** but repeatable. | No public developer API or SDK found. Blast's sensor data stays in Blast's apps. |
| **Ballista Tracking** (ballistatracking.com) | Could not verify. | — | — | Searches on 2026-11-20 returned no page from that domain and no product by that name (only unrelated ballistics calculators). Treat as unavailable; recheck if the owner has a direct link. |
| **"Baseball Radar" / mercandalli.com and similar video-radar apps** | Pitch speed and EV from slo-mo video. | Side-on slo-mo, ≥120 fps, stable phone. | Vendor claims "within a few percent of a radar gun". No independent test found. | Consumer apps, no API. |
| **SmartPitch** | Claims EV and launch angle from the phone. | Not public. | None found. | None. |
| **3motionAI (3DNeuroNet)** | 3D skeletons from one 2D video (pitching and hitting biomechanics). Used by Big League AI for swing capture; partnerships with PBR and Driveline. | Proprietary 3D pose. | Not public. | Described as "embeddable", but no public API/SDK docs. **No bat-speed or exit-velo API.** Possible future body-tracking upgrade via a business deal; not needed now. |
| **Theia (bat tracking)** | 3D bat tracking for baseball (markerless, multi-camera). | Multi-camera lab system. | — | Enterprise. Confirms the field: precise bat tracking is usually multi-camera. |

**Where Gapper can beat them**
1. Bat speed **and** exit velo from the camera alone, as two independent measurements (Blast needs the sensor for bat speed).
2. Every number carries a ± and a confidence, and refuses to show a number when the clip can't support it (Blast's
   camera EV reads high with no warning, per Bat Digest).
3. Slow-pitch specific: steep 6–12 ft arcs (gravity is a free ruler), 12" yellow balls, front toss and live pitching,
   not just tee work.
4. True per-frame timing from the native sidecar, so a hot phone that slips from 240 to ~200 fps can't inflate speeds
   (an open-source golf launch monitor author documents exactly this 22% error).
5. A guided setup that checks frame rate, light/shutter, level, steadiness and framing before you record.

## 3. Platform technology

### Apple AVFoundation (capture): **use it**
- Formats must be read from `AVCaptureDevice.formats` at runtime; never assume. 240 fps formats exist at 1280×720 on
  older phones and 1920×1080 on newer ones (a developer log shows an iPhone 12 Pro Max with 1920×1080 at 1–240 fps).
- Set `sessionPreset = .inputPriority` before setting `activeFormat`, or the session can fall back to 30 fps.
- 1080p240 is not supported in H.264; record HEVC.
- At 240 fps the shutter can't be longer than 1/240 s; shorter is allowed within the format's `minExposureDuration`.
  Gapper aims for 1/1000 s and raises ISO to compensate (`setExposureModeCustom`).
- `captureOutput(_:didDrop:from:)` reports every dropped frame with a reason; sample-buffer presentation times give
  true frame times.
- `AVCaptureConnection.isCameraIntrinsicMatrixDeliveryEnabled` attaches the lens's intrinsic matrix (focal length and
  principal point in pixels) to each frame: a real calibration for free.
- Video stabilization must be **off** for measurement (it warps the picture frame to frame).

### Apple Vision
- `VNDetectTrajectoriesRequest` / `DetectTrajectoriesRequest` (iOS 14 / iOS 18): finds parabolic trajectories of small
  objects across frames. Apple documents no frame-rate limits; developers report the size settings need trial and
  error. It returns normalized 2D curves, not speeds, and is built for a moving ball crossing a static scene. Useful as
  a **second opinion** for the pitch (the slow-pitch arc is a clean parabola). Not adopted yet: Gapper's own tracker
  already fits the same physics with drag and gives per-frame ball sizes (the depth cue), which Vision doesn't expose.
- `VNTrackObjectRequest`: generic box tracker; developer forums report errors with very small boxes. A softball at
  12 ft is small and blurred, so not a fit for the ball. Possible later for the bat once a detector seeds the box.
- `VNDetectHumanRectanglesRequest`: **used** in the native setup check (is the whole hitter in frame, is there room in
  front for the ball).
- `VNDetectHumanBodyPose3DRequest`: an option for body tracking in the native app; Gapper keeps MediaPipe so web and
  native share one analysis.

### OpenCV
Classical building blocks (background subtraction, blob tracking, Kalman filters, calibration, optical flow, sub-pixel
corners). Gapper's engines implement the specific pieces they need in plain TypeScript (no browser APIs), so the same
code runs in tests, in the browser and later on device; pulling OpenCV.js (≈8 MB of wasm) into the web app isn't worth
it. For the native port, OpenCV's iOS framework stays an option for camera calibration with a checkerboard if the
per-frame intrinsics prove insufficient.

The reference repo named in the brief, `bq-engineering/baseball-tracking-velocity`, could not be found on 2026-11-20
(no repository by that owner or name in search). Similar public projects (`pascalewalters/baseball-tracking`,
`syncom/psfv`, MIT-licensed pitch-speed-from-video in Go) compute average speed from a pixels-per-foot ratio: the
"pixel displacement labeled as mph" approach the brief rules out. Nothing to reuse beyond ideas Gapper already has.

### Object detection models and licenses

| Option | License (checked 2026-11-20) | Verdict |
| --- | --- | --- |
| Ultralytics YOLOv5/v8/11/26 | **AGPL-3.0**; trained models are covered by default; commercial use needs an Enterprise license | **Rejected** for a closed commercial app. |
| BaseballCV (bat_tracking.pt, ball_tracking.pt, datasets) | Now **AGPL-3.0** community edition + paid commercial license (older v0.1.01–0.1.24 releases were labeled MIT) | **Rejected**: license, and trained on MLB broadcast footage (white baseball, broadcast angles), not slow-pitch. Useful as a reference for annotation formats. |
| **RF-DETR** (Roboflow) Nano/Small/Medium/Large | **Apache-2.0** (the XL/2XL "Plus" models are under a different license: don't use those) | **Chosen** for the slow-pitch detector. A community Core AI port reports ~25 ms for Nano on an iPhone 17 Pro GPU; Roboflow's own small-object AP for Nano is 25.3, so fine-tuning on our own footage is required. |
| YOLOX, RTMDet (MMDetection), D-FINE | Apache-2.0 | Good fallbacks if RF-DETR's Core ML conversion misbehaves. |
| MediaPipe Pose (already in Gapper) | Apache-2.0 | Kept for body tracking: hands, shoulders, elbows feed the bat tracker. |

### Research on bat speed
- MIT thesis "Estimating a Baseball Hitter's Bat Speed Using One Camera" (2023): notes existing approaches need
  multiple cameras at precise distances; tested a regression model on synthetic swings only.
- Bat sensors (Blast, Diamond Kinetics) report sweet-spot speed **6 inches from the barrel end**, computed from knob
  motion plus entered bat length. Gapper uses the same point definition, so numbers are comparable.
- 2022 study: knob-mounted sensors track bat speed reliably against motion capture; angles less precisely.
- Classical lab method: track the end cap in 2D, use the known impact location and rotation axis → bat speed at impact.
  Gapper's rigid-body model is the single-camera generalization: the rotation axis (swing-plane normal) is fit across
  frames instead of known.

## 4. What one camera can and can't do (physics, not opinion)

- **Depth is the missing dimension.** A single image gives direction, not distance. Gapper recovers it from things of
  known size or known physics: the ball's 3.82" diameter, gravity on the pitch arc (32.17 ft/s²), the bat's known
  length, the hitter's height, and now the lens's true focal length.
- **Exit velocity**: the ball is a free projectile. Its first 5–15 frames after contact, with gravity and drag modeled
  and the size change giving the toward/away component, give a defensible 3D launch speed. Defined as the speed right
  off the bat (the fit is extrapolated back to contact, with drag added back), never average or max later in flight.
- **Bat speed**: the bat is a rigid body of known length rotating about the hands. One frame of a bat pointing at the
  lens is ambiguous, but ~40 frames of the same swing share one swing plane. Fitting that plane across frames makes
  each frame's 3D angle recoverable, and `v = v_hands + ω × r` gives the sweet spot's speed. The model can't recover a
  plane seen exactly edge-on (camera level with a flat swing), so the setup asks for the phone at chest height tipped
  slightly down, and the engine refuses edge-on swings instead of guessing.
- **Attack angle** needs to know which way is up in 3D: the native app records the phone's gravity vector; uploads
  can't, so attack angle is native-only.

## Sources
- Blast Vision announcement: https://blastmotion.com/news/blast-vision-delivers-power-visualize-ball-flight/
- Blast FAQ: https://blastmotion.com/faq/
- Blast Ball Flight manual: https://www.manula.com/manuals/blast-motion/blast-baseball-5-0/1/en/topic/ball-flight
- Blast Vision accuracy FAQ: https://www.slimfaq.com/blast-motion/3209-blast-vision-ios/13436-what-s-the-accuracy-of-blast-vision
- Bat Digest Blast Vision review: http://www.batdigest.com/ball-gear/blast-vision-app-review/
- Exit-velocity app roundup: https://mindandmuscle.ai/baseball-exit-velocity-app
- Baseball Radar app: https://mercandalli.com/baseball/
- BaseballCV: https://github.com/BaseballCV/BaseballCV and releases https://github.com/BaseballCV/BaseballCV/releases, PyPI https://pypi.org/project/baseballcv/0.1.32/
- Ultralytics licensing: https://ultralytics.com/blog/is-yolo-free-for-commercial-use
- RF-DETR: https://playground.roboflow.com/models/roboflow/rf-detr, Core AI port https://huggingface.co/coreai-community/RF-DETR-CoreAI
- Apple Vision trajectories: https://developer.apple.com/documentation/vision/vndetecttrajectoriesrequest , https://developer.apple.com/documentation/vision/detecting-moving-objects-in-a-video , forum https://developer.apple.com/forums/thread/676998
- VNTrackObjectRequest small-box issue: https://developer.apple.com/forums/thread/779884
- AVFoundation formats: https://developer.apple.com/documentation/avfoundation/capture-device-formats , TN2409 https://developer.apple.com/library/ios/technotes/tn2409/_index.html , 1080p240 forum https://developer.apple.com/forums/thread/681431 , HFR codec https://developer.apple.com/forums/thread/131542
- iPhone 240 fps golf launch monitor (thermal frame-rate drop): https://github.com/chase16647/golf-launch-monitor
- 3motionAI: https://www.businesswire.com/news/home/20231107193240/en/Breakthrough-AI-Software-Analyzes-Human-Movement-via-Videos-Powers-a-Broad-Range-of-Sports-Health-Fitness-Aging-and-Workplace-Applications , Big League AI https://prnewswire.com/news-releases/big-league-ai-by-pro-athletic-technologies-transforms-baseball-and-softball-hitting-performance-training-with-advanced-ai-technology-302260403.html
- MIT bat-speed thesis: https://dspace.mit.edu/handle/1721.1/151398
- Blast sensor metric definitions: https://blastmotion.com/blog/what-does-a-bat-sensor-actually-measure/
- Capacitor camera plugin references: https://cdn.jsdelivr.net/npm/@capacitor-community/camera-preview@8.0.1/ios/Sources/CameraPreviewPlugin/CameraPreviewPlugin.swift , https://www.dynamsoft.com/codepool/capacitor-camera-preview-plugin.html
- Public pitch-speed repos: https://github.com/pascalewalters/baseball-tracking , https://awesome.ecosyste.ms/projects/github.com%2Fsyncom%2Fpsfv
