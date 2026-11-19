# How accurately can one phone camera with markerless pose estimation measure lower-body kinematics in a fast swing?

Scope: what one phone camera running markerless pose estimation (mainly MediaPipe Pose / BlazePose, plus OpenPose, MoveNet, RTMPose and Apple Vision) can and cannot measure of the hips, legs and feet during fast sports movements, with batting as the target. The notes cover validation numbers, camera placement, frame rate, foot-plant detection, filtering, on-device speed and commercial products. Research done 2026-11-19. Every number below has a source link. Items marked "per search summary" come from a search-engine digest of the paper and not from a full-text read, so check them before quoting.

---

## 1. What do published validation studies show for pose estimation vs. marker-based capture or IMUs (knee, hip, ankle, pelvis, foot)?

### Takeaway
With a clean side (sagittal) view, a visible limb and walking-speed motion, single-camera 2D knee and hip flexion angles land at about 2–6° mean absolute error against marker-based capture. Ankle angles are consistently worse, roughly 7–9° bias or error. Once the movement is fast, deep, rotational or partly blocked from view, or the camera is off-axis, error grows to roughly 8–30° RMSE. There is **no peer-reviewed validation of a single-phone pose model for batting**. The closest data are (a) a single-camera pitching system whose authors hold equity in it and whose method was criticised as possibly overfit, and (b) a two-iPhone, 240 fps batting comparison from Uplift and Driveline, which still showed large pelvis angular-velocity errors (MAE about 153°/s).

### Cited Findings

**Gait and running (best-case conditions)**
- Stenum et al. 2021 (PLOS Comput Biol): OpenPose on 2D sagittal video at 25 Hz vs. 100 Hz motion capture. Mean absolute error was **hip 4.0°, knee 5.6°, ankle 7.4°**. Step time, step length and hip/knee angles were accurate. Double-support time and ankle angles were less accurate. — [Stenum 2021, PMC8099131](https://pmc.ncbi.nlm.nih.gov/articles/PMC8099131)
- Yang & Park 2024 (Bioengineering): MediaPipe BlazePose v0.9.3 in 2D. One Samsung Galaxy S22 at **30 fps**, about 3 m away at 0.8 m height, filming treadmill walking (n=20) vs. OptiTrack at 120 Hz. Best-position MAE was **hip 1.92° (r 0.97), knee 2.4° (r 0.98), ankle 2.29° (r 0.84)**. Overall MAE was hip 2.35°, knee 2.82°, ankle 3.06°. The camera behind the subject gave the worst ankle result (MAE 3.97°, r 0.63; right ankle r 0.45). — [Yang & Park 2024, PMC10886083](https://pmc.ncbi.nlm.nih.gov/articles/PMC10886083/)
- 2D frontal and sagittal markerless study: OpenPose vs. Qualisys reprojected into each view, overground walking, n=15. **Camera-side sagittal knee** bias was 1.5° (SD 4.1°, limits of agreement −6.5 to 9.6°, r² 0.98). **Camera-side hip** bias was −3.6° (SD 4.6°). **Camera-side ankle** bias was −8.4° (SD 5.2°, r² 0.82). For the **occluded side**, the SD of bias was 40% (ankle), 69% (knee) and 108% (hip) larger. In the frontal plane, ankle limits of agreement were −23.4 to 23.8° (r² 0.26). — [PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)
- Running on a treadmill, BlazePose on one iPhone 13 side view about 1.8 m away, 31 runners and 9,327 strides vs. 14-camera Vicon at 200 Hz. **Knee flexion ICC(2,1) was 0.961 (left) and 0.979 (right)**, with overestimation near full extension at initial contact. Foot angle ICC was 0.981 (left) and 0.844 (right, the occluded far leg), with consistent underestimation. The paper does not report RMSE. The Methods say 240 fps and the Discussion says 60 fps, which is an internal conflict. — [PMC9866353](https://pmc.ncbi.nlm.nih.gov/articles/PMC9866353/)
- Menychtas et al. 2023: MediaPipe v0.9 and OpenPose BODY_25 vs. Vicon. Older adults (n=17) on a treadmill, 100 Hz sagittal camera. MediaPipe's limits of agreement were "pretty large for all joints," including the knee. **MediaPipe's ankle was "completely misidentified"** because of left/right label swaps when the far leg crossed behind. For OpenPose, the hip and ankle confidence-interval widths were about 20.6–20.8°. — [Menychtas 2023, PMC10511642](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511642/)
- Hulleck et al. 2023 preprint: BlazePose vs. AlphaPose vs. Vicon in gait. BlazePose had lower RMSE than AlphaPose, with a peak of **about 14.2° at the left knee at slow speed** (per search summary). — [Research Square rs-3239200](https://www.researchsquare.com/article/rs-3239200/v1)
- Monocular 3D gait (2025, ACM): **MediaPipe3D knee RMSE about 13.78°**, and RTMPose3D was "marginally" more accurate (per search summary). — [ACM 10.1145/3748522.3779919](https://dl.acm.org/doi/pdf/10.1145/3748522.3779919)
- Comparison of visual trackers (arXiv 2025): mean 2D angle errors of 4–10° for trunk, hip and knee. Knee error was **RTMPose about 4.3°, MoveNet about 4.8°, MediaPipe about 5.9°**. Averaging all three trackers gave the lowest overall error (per search summary). — [arXiv 2505.04713](https://arxiv.org/pdf/2505.04713)

**Squats, sit-to-stand, lunges, jumps (larger range of motion, faster)**
- Yue, Gu & Yu 2026 (JMIR Rehab): **BlazePose Heavy** (mediapipe 0.10.33) on one **iPhone 17 Pro**. Lateral view, knee height, 2.0 m away, 1080p at 60 fps (120 fps for 2 subjects), n=15. Against goniometer-set static angles, **RMSE was 15.49°** and ICC 0.874, with **+11° bias at 30–60° flexion and −4.6° to −10.6° bias at 90–120°** (the direction of error reverses, so no single offset can correct it). Against 2D manual annotation (Kinovea), **squat RMSE was 8.78°** (ICC 0.773, bias +6.2°), **sit-to-stand RMSE 7.59°**, and **single-leg stance RMSE 12.88°** (ICC 0.136). Without a confidence gate, squat RMSE rose to 25.43°. **15.7% of target frames failed** a detection-confidence threshold of 0.3. — [Yue 2026, PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)
- OpenPose from four iPads at 45° azimuths, front lunges, n=16, vs. 12-camera Vicon. **Knee RMSE was 15.5–18.2°** in three views and **29.4°** in the worst (front-left) view. Hip RMSE was 15.2–25.3°. Mean absolute deviation of peak knee flexion was 14.1–23.8°. — [Viewing-angle study, PMC11819822](https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/)
- Multi-view (three-camera) MediaPipe vs. Vicon in squats and lunges, n=6: overall mean angle error **about 6.4°** (per search summary). This is not a single-camera result. — [MDPI Sensors, doi 10.3390/s26216773](https://doi.org/10.3390/s26216773)
- Knee osteoarthritis pilot (2D app vs. markerless reference): knee flexion **MAE 9.3–21.9° in 2D and 14.1–25.8° in 3D**. Out-of-plane motion such as tibial torsion is "geometrically projected onto the sagittal plane" by one camera (per search summary). — [ResearchGate 410859976](https://www.researchgate.net/publication/410859976_Gait_assessment_using_a_2D_video-based_pose_estimation_app_in_comparison_to_a_markerless_motion_capture_system_in_subjects_with_osteoarthritis_of_the_knee_-_a_pilot_study)
- Mini review (2025): Pilla-Barroso et al. 2024 found MediaPipe errors "less than 20 degrees" against OptiTrack across five exercises. They proposed acceptable error as under 25% of range of motion (under 20° for motions over 90°, about 10° for motions up to 40°). The review's table lists MediaPipe at about 10° or less. — [Mini review, PMC12378739](https://pmc.ncbi.nlm.nih.gov/articles/PMC12378739/)
- A systematic review of 22 validation studies of AI markerless capture found the strongest and most consistent evidence for **lower-extremity sagittal-plane** kinematics (per search summary). — [SportRxiv systematic review](https://sportrxiv.org/index.php/server/preprint/view/1015)

**Throwing and batting (fast, rotational)**
- **pitchAI** (Dobos et al. 2022, Sports Biomechanics), a single-camera system: one iPhone at 240 Hz (per preprint snippet) vs. marker-based capture. Time-series r² ranged from **0.69 (glove-arm shoulder external rotation) to 0.98 (trunk and pelvis rotation)**. RMSE ranged from **4.37° (trunk lateral tilt) to 20.78°**. The published abstract says 10 pitchers. An earlier preprint described 38, which is a conflict. Several authors are shareholders in the parent company. — [PubMed 36409062](https://www.pubmed.gov/36409062/); [preprint](https://sportrxiv.org/index.php/server/preprint/view/101)
  - Caveat: the Driveline/Uplift report says pitchAI's results are "highly likely ... not representative" of production performance, because a neural-network correction appears to have been fit to the marker-based joint centres used in the comparison. — [Driveline–Uplift report, Dec 2023](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- **Uplift Capture**: **two** iPhones (13 / 13 Pro) at **240 fps**, portrait for hitting, against 17-camera OptiTrack marker-based capture at 360 Hz. The sample was 13 hitters and 63 swings after quality checks; 22 hitters were recruited. Hitting results:
  - **Pelvis angular velocity about vertical: MAE 153.17°/s, cross-correlation 0.79**
  - Trunk angular velocity: MAE 163.27°/s, CC 0.82
  - **X-factor (trunk–pelvis separation): MAE 14.60°, CC 0.55**
  - Trunk flexion: MAE 6.17°, CC 0.93
  - Trunk lateral tilt: MAE 7.17°, CC 0.93
  - Bat angular velocity: MAE 307.78°/s, CC 0.91

  The report evaluated **no knee, hip-flexion, stride or foot metrics** for hitting. It names **pelvis landmarks as the likely main source of X-factor error**. The authors conclude Uplift "is not equivalent" to ground truth but can monitor "gross coordination strategies." — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- Uplift in pitching, best two-camera configuration: pelvis velocity MAE 106.39°/s (CC 0.85) vs. marker-based capture, and 71.93°/s (CC 0.94) vs. 8-camera markerless capture. Camera placement changed pelvis-velocity MAE from 167 to 106°/s. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- No peer-reviewed single-phone batting validation was found. The open-source "swing-lab" single-video baseball/softball analyser describes itself as early and experimental, says it suits comparing a player to their own baseline rather than producing absolute numbers, and reports a contact-frame estimate about 5 frames late on its test clip. — [swing-lab GitHub](https://github.com/reichenbach/swing-lab)
- Golf: Ingwersen et al. 2023 (DTU) tested off-the-shelf **monocular 3D** pose models against marker-based golf-swing capture. They found "significant model errors" despite convincing reprojections, and concluded current models "cannot be used out of the box for advanced golf analytics." — [Ingwersen 2023, DTU Orbit](https://orbit.dtu.dk/en/publications/evaluating-current-state-of-monocular-3d-pose-models-for-golf/)
- For comparison, multi-camera venue systems vs. marker-based capture in pitching: MPJPE (average 3D joint position error) of 56.6 ± 9.4 mm (Hawk-Eye) and 52.0 ± 12.3 mm (Theia3D), with shoulder rotation the most variable (per search summary). — [Univ. of Kentucky record](https://scholars.uky.edu/en/publications/assessing-the-accuracy-of-in-stadium-and-portable-multi-camera-ma/)

### Inferences
- The figures of 2–6° for knee and hip angles come from **slow, planar walking with the measured limb facing the camera**. A batting swing breaks all three conditions: it is fast, the pelvis rotates about 90°, and the back leg is often behind the front leg. Realistic single-phone knee-angle error in a swing is more likely **in the 8–15° range** (as for squats, lunges and fast tasks above), with occasional much larger outliers when the left/right labels swap.
- Even a commercial two-iPhone, 240 fps system with biomechanical model fitting (inverse kinematics) had pelvis angular-velocity errors of about 150°/s in hitting. A single browser-run BlazePose camera will do no better. **Absolute peak pelvis velocity (°/s) should not be shown as a number** from one phone. Shape and timing, such as "did the pelvis peak before the trunk," are more defensible, and Uplift's CC of about 0.8 supports pattern-level use.
- Several fast-motion sources show bias that is **direction-dependent and subject-dependent** (Yue 2026 sign reversal; Uplift X-factor underestimation). A fixed calibration offset will not fix it. Within-player trends from the same camera setup are much safer than absolute values or comparisons between players.

### Gaps
- No peer-reviewed validation of single-camera MediaPipe/BlazePose for **batting** (baseball or softball) lower-body kinematics. None found for slow-pitch softball at all.
- No validation found for **tennis serve** lower-body kinematics from one phone. Not searched in depth because of the tool-call budget.
- The pitchAI full-text numbers for pelvis rotation RMSE and lead-knee angles were not retrieved; the SportRxiv PDF returned HTTP 403.
- Uplift's supplementary slides, with per-frame confidence intervals, were not retrieved.

---

## 2. How accurate are BlazePose's foot landmarks (heel 29/30, foot index 31/32) and ankles, and what are the failure modes?

### Takeaway
No study was found that validates BlazePose heel or foot-index landmark **positions** directly against markers. Indirect evidence shows ankle angles are the weakest lower-limb output: about 7–9° bias, large frontal-plane errors, and complete failures in some gait trials. Even so, foot landmarks are good enough for **event timing**, with heel strike and toe-off detected in 95–99% of cases at 20–30 ms mean error. The dominant failure mode is **left/right swapping and flicker when one leg passes behind the other**. The leg farther from the camera is consistently less accurate.

### Cited Findings
- Camera-side sagittal ankle (OpenPose): bias −8.4°, limits of agreement −18.6 to 1.9°. Occluded-side ankle limits were −23.6 to 5.1°. Frontal ankle r² was 0.26. Sagittal ankle angles were judged usable only in early and mid-stance. — [PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)
- MediaPipe's ankle was "completely misidentified" in statistical parametric mapping, because left and right were swapped when the right leg crossed behind the body during stance and the skeleton flickered. OpenPose's metatarsal (toe) keypoints were misidentified on multiple frames, giving an erratic ankle trace. — [Menychtas 2023, PMC10511642](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511642/)
- Foot angle (strike angle) from a BlazePose side view: ICC 0.981 for the near (left) foot vs. 0.844 for the far (right) foot, with consistent underestimation. The left leg occludes the right mid-stride. Foot-strike pattern classification (rearfoot, midfoot, forefoot) was 95.2% (near foot) and 89.8% (far foot) accurate. — [PMC9866353](https://pmc.ncbi.nlm.nih.gov/articles/PMC9866353/)
- Ankle angle was best from a side position (MAE 2.29°, r 0.84) and worst from behind (MAE 3.97°, r 0.63; right ankle r 0.45). Left-side angles (nearer the camera) beat right-side ones, attributed to occlusion. — [Yang & Park 2024, PMC10886083](https://pmc.ncbi.nlm.nih.gov/articles/PMC10886083/)
- A 2025 postural-assessment comparison flagged MediaPipe ankle error at MAE over 5° and urged "caution for the ankle segment" (per search summary). — [ResearchGate 398607117](https://www.researchgate.net/publication/398607117_A_Deep_Dive_into_MediaPipe_Pose_for_Postural_Assessment_A_Comparative_Investigation)
- A review summary found that no vision method reliably measured the ankle against Vicon, while RTMPose and MediaPipe came closest at hip and knee (per search summary). — [MDPI Sensors 26(16):5063 narrative review](https://www.mdpi.com/1424-8220/26/16/5063)
- Using the **foot index** (with the hip), BlazePose Heavy at 25 fps detected 95.2–99.0% of heel strikes and toe-offs, with some left/right misidentification affecting timing (see section 6). — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- In BlazePose Heavy knee testing, plausible failure causes listed were self-occlusion by the other limb, out-of-plane limb rotation and foreshortening, side-selection errors, and amplified error when segments are nearly in line (near full extension). — [Yue 2026, PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)
- MediaPipe provides a per-landmark `visibility` value from 0.0 to 1.0, the likelihood that the landmark is present and not occluded. — [MediaPipe Pose docs](https://chuoling.github.io/mediapipe/solutions/pose)
- A GitHub issue reports world-landmark knee and ankle positions differing by more than 10 cm in a symmetric, mirror-image leg pose. This is anecdotal. — [mediapipe issue #4917](https://github.com/google-ai-edge/mediapipe/issues/4917)

### Inferences
- In a batting stance seen from the side, the **back foot is partly hidden by the front leg** for much of the swing, especially during back-foot pivot and heel lift. Treat back-foot heel and toe landmarks as low-confidence by default. Do not compute a back-ankle angle.
- Foot landmarks are better used for **events** (when the front foot lands, whether the back heel lifts, front-foot direction relative to a calibration frame) than for **angles**. Ankle dorsiflexion and plantarflexion and foot rotation from one camera should not be reported as numbers.
- Guard against left/right swaps explicitly: check whether `x` ordering flips within one or two frames, check sudden jumps in foot position greater than a plausible per-frame displacement, and apply a minimum visibility threshold. The Yue 2026 data show that confidence gating cut squat RMSE from 25° to 9°.
- Shoes and motion blur are probable failure contributors. No study isolating them was found (see Gaps).

### Gaps
- No study was found that reports BlazePose heel (29/30) or foot-index (31/32) **position error in cm** against markers. The 2026 multi-view MediaPipe paper (doi 10.3390/s26216773) may contain this, but its full text was not retrieved.
- No study was found isolating the effect of **shoes vs. barefoot**, foot rotation (toe-out), or motion blur on foot-landmark accuracy. The Yue 2026 study used barefoot subjects in dark, fitted clothing against a plain background.

---

## 3. How accurate are MediaPipe's 3D "world landmarks" for depth and rotation, and can pelvis axial rotation be measured from the side or from behind?

### Takeaway
BlazePose's world landmarks are **inferred** depth, learned from 2D images with GHUM body-model fits and human depth-ordering labels. No measurement of depth is involved. Google reports a mean 3D error of about 36–45 mm on its own evaluation, but no independent study validating pelvis axial rotation from MediaPipe world landmarks was found. Generic monocular 3D models failed golf-swing validation. Even two-camera triangulation (Uplift) had large pelvis-velocity errors. Pelvis rotation from one camera should be treated as **qualitative only**.

### Cited Findings
- `pose_world_landmarks` are real-world 3D coordinates **in metres with the origin at the midpoint between the hips**. Image-landmark `z` uses the hip midpoint as origin and is "roughly the same scale as x". The docs give no accuracy claim for z. — [MediaPipe Pose docs](https://chuoling.github.io/mediapipe/solutions/pose)
- BlazePose GHUM 3D was trained by fitting the GHUM body model to 2D-annotated images. To resolve 2D-to-3D ambiguity, annotators labelled depth order between skeleton edges, which reduced depth-ordering errors from 25% to 3%. The model predicts pose relative to the hip centre, inside a 2 m cube. The page gives no numeric 3D joint error. — [TensorFlow blog, BlazePose GHUM TF.js (2021)](https://blog.tensorflow.org/2021/08/3d-pose-detection-with-mediapipe-blazepose-ghum-tfjs.html)
- The BlazePose GHUM Holistic paper reports 3D mean absolute error of **36 mm (Heavy), 39 mm (Full) and 45 mm (Lite)** on Google's evaluation data (per search summary of the paper's table). — [arXiv 2206.11678](https://arxiv.org/abs/2206.11678v1)
- Ingwersen 2023: monocular 3D models showed "significant model errors" against marker-based golf-swing data, which they judged too large for kinematic analysis. — [DTU Orbit](https://orbit.dtu.dk/en/publications/evaluating-current-state-of-monocular-3d-pose-models-for-golf/)
- With two iPhones, triangulation and inverse kinematics in hitting, pelvis angular velocity still had MAE 153°/s (CC 0.79) and X-factor MAE 14.6° (CC 0.55). Errors were attributed mainly to pelvis landmarks. In pitching, camera configuration changed pelvis-velocity accuracy substantially (MAE 167 vs. 106°/s). — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- pitchAI (single camera, proprietary 3D lifting) reported r² 0.98 for pelvis rotation. As noted in section 1, the method was criticised as possibly overfit to the reference data. — [PubMed 36409062](https://www.pubmed.gov/36409062/); [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- A 2D camera "cannot capture out-of-plane motion such as ... rotation because [it lacks] depth information." Depth-sensor body tracking also struggles with internal and external rotation. — [Mini review, PMC12378739](https://pmc.ncbi.nlm.nih.gov/articles/PMC12378739/)
- MediaPipe accuracy "strongly depends on the viewing angle," with more error under occlusion. Its z is relative to the estimated hip depth (per search summary of a robotics paper). — [arXiv 2607.18197](https://arxiv.org/pdf/2607.18197)
- The hip joint centre is hard to locate from images. The OpenPose viewing-angle study lists this as a main error source, alongside perspective. — [PMC11819822](https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/)
- A phone-based shoulder range-of-motion study found out-of-plane projection was the main error and suggested it could be corrected if phone orientation is known. — [Sensors 24(2):534](https://doi.org/10.3390/s24020534)

### Inferences
- **From the side (camera facing the batter's chest across the plate, the golf "face-on" view):** pelvis axial rotation shows up only as a change in apparent hip width (projected width ≈ true width × cos θ). The change is smallest near the square-to-camera starting position, where cos θ is flat, so this view is least sensitive at exactly the start of rotation. It also cannot tell rotating toward the camera from rotating away, and depends on the poorly located hip landmarks. A rough "hips opened by about X°" estimate is possible after a stance calibration frame, but expect error of tens of degrees.
- **From behind (catcher's view, along the pitch line):** at stance the hips are seen edge-on and overlap, so hip width is near zero and noisy. As the pelvis opens toward the pitcher, apparent width increases. This view is more sensitive to the first 45° of opening but worst for occlusion of the far hip. Neither single view measures axial rotation directly.
- MediaPipe world-landmark `z` can supply the sign (which hip is closer to the camera) and a coarse angle. Given the lack of validation, the GitHub anecdote of 10 cm or more errors, and the golf result, **use world-landmark pelvis rotation only for qualitative cues** (for example "hips started opening before hands moved") and not as a displayed degree value.
- Pelvis **timing** (when hip width starts changing fast, relative to front-foot plant) is likely more reliable than pelvis **angle** or **velocity magnitude**, because timing survives a constant scale error.

### Gaps
- No independent validation of MediaPipe `pose_world_landmarks` pelvis or hip rotation against motion capture was found, in any movement.
- No published comparison of side vs. behind single-camera views for **pelvis axial rotation** was found. The inferences above are geometric reasoning, not measured results.

---

## 4. How do camera view, height, distance and lens affect 2D joint-angle error, and where should the camera go for a batter?

### Takeaway
Two-dimensional joint angles are only trustworthy when the joint moves in a plane roughly parallel to the image sensor, the limb is on the camera side, and the camera is about level with the joint, roughly 2–3 m away. Off-axis views (45° azimuth) produced knee RMSE of 15–29°, mainly from **perspective rather than keypoint error**. Back views beat front views when a pure side view is impossible. For a batter no single view covers everything, so the camera position has to be chosen by metric.

### Cited Findings
- Four iPads at 45° azimuths, lunges: back-left and back-right gave knee RMSE of 16.7° and 15.5° (ICC 0.95–0.96). Front-left gave **29.4°** (limits of agreement −51 to 62°) because the far leg was poorly visible. The authors found "no estimation errors" in keypoints per se and attribute the discrepancies to **perspective in 2D angle calculation**. They recommend back views over front views when a standard sagittal or frontal view is not possible. — [PMC11819822](https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/)
- Five smartphone positions, about 3 m distance, 0.8 m height, 30 fps: side positions were best (hip and knee at one oblique-side position, ankle at another). The behind position was worst for the ankle. Placing the camera on the side of the measured leg improved results. — [Yang & Park 2024, PMC10886083](https://pmc.ncbi.nlm.nih.gov/articles/PMC10886083/)
- The occluded-side sagittal hip had SD of bias 108% larger than the visible side. Frontal-plane hip and knee limits of agreement were 35–46% of their range of motion. — [PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)
- Out-of-plane motion is projected onto the sagittal angle by one camera (knee osteoarthritis pilot, per search summary). — [ResearchGate 410859976](https://www.researchgate.net/publication/410859976_Gait_assessment_using_a_2D_video-based_pose_estimation_app_in_comparison_to_a_markerless_motion_capture_system_in_subjects_with_osteoarthritis_of_the_knee_-_a_pilot_study)
- Setup in the best-controlled recent BlazePose study: tripod, **lateral view at knee height, 2.0 m**, plain pale wall, even lighting, fitted dark clothing, floor marks for subject and camera. Even so, 15.7% of frames failed confidence checks. — [Yue 2026, PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)
- BlazePose's published accuracy figures were evaluated on images with a single person **2–4 m from the camera**. — [MediaPipe Pose docs](https://chuoling.github.io/mediapipe/solutions/pose)
- MediaPipe Pose detects only one person per frame. — [Mini review, PMC12378739](https://pmc.ncbi.nlm.nih.gov/articles/PMC12378739/)
- Uplift hitting used two phones in **portrait** orientation, at approximate clock positions "5 and 2" around a right-handed hitter. In pitching, the "6 and 3" configuration was better for pelvis and trunk velocity and X-factor. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- The 2D image-plane knee angle is sensitive to out-of-plane motion, perspective and parallax, and keypoint noise, especially near full extension (per search summary of an IMU paper). — [arXiv 2607.26027](https://arxiv.org/pdf/2607.26027)

### Inferences (placement for a batter; geometric reasoning, not validated)
- **Face-on / open-side view** (camera across the plate facing the batter's chest, perpendicular to the pitch line, phone at about hip height, 3–4 m away, full body and feet in frame). This is the best single view for:
  - **stride length and stride direction**, since stride toward the pitcher is in the image plane;
  - **front-foot plant timing** and lead-leg extension or "bracing" at contact, partly in-plane;
  - head and centre-of-mass sway along the pitch line;
  - back-heel lift.

  Knee flexion in stance is partly out of plane here, because the feet point toward the plate, so absolute knee angles carry perspective error.
- **Behind / catcher view** (along the pitch line). The knees flex roughly in this image plane during stance, which is better for stance knee flexion. Stride length is foreshortened along the depth axis, and the front leg is partly hidden by the back leg. Back views also performed better than front views off-axis in the OpenPose study.
- **Camera height:** level with the hips or knees (about 0.8–1.0 m) keeps the leg segments close to parallel to the sensor. High or low angles foreshorten the thigh and shank and bias knee angles. This is consistent with the 0.8 m and knee-height setups in the validation studies.
- **Distance and framing:** keep the batter 2–4 m away (the range BlazePose was evaluated at) and require **feet fully in frame with margin**, since foot landmarks are needed for events. Portrait orientation fits a standing batter, as Uplift used for hitting.
- **Lens:** use the phone's main 1× camera rather than the ultra-wide 0.5×. Wide lenses add barrel distortion and perspective stretch near frame edges, which bends straight segments and changes 2D angles. Keep the batter centred.
- **Per-metric policy:** decide which metrics are allowed based on the camera view detected at setup (for example, stride length only from face-on; stance knee flexion only from behind). Do not compute everything from every view.

### Gaps
- No study was found quantifying **lens distortion** (wide vs. main lens) effects on pose-estimated joint angles.
- No study was found on **camera height** effects specifically. The heights above are what validation studies used, not tested alternatives.
- No study was found testing camera placements for a **batter**. The placement inferences are untested.

---

## 5. How do frame rate (30 vs. 60 vs. 120/240 fps) and motion blur affect measuring fast events and peak angular velocity, and what is the minimum fps for peak pelvis velocity?

### Takeaway
No study directly comparing pose-estimator accuracy at 30, 60 and 120 fps for sports was found. Every serious baseball system validated so far records at **240 fps** (Uplift, pitchAI). Gait studies at 25 fps already show event-timing errors of 20–30 ms and say 25 fps is too slow for short phases. Peak pelvis angular velocity in hitting is roughly 400°/s, and trunk velocity reaches about 600–850°/s. **30 fps is inadequate for velocities or sub-frame timing, 60 fps is the practical floor for event timing, and 120–240 fps is needed for meaningful peak-velocity estimates.** These thresholds are inferences from the evidence, not tested cut-offs.

### Cited Findings
- Uplift Capture (iPhone 13 / 13 Pro) records at **240 fps**. The ground-truth system was 360 Hz, downsampled to 240 Hz for comparison. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- pitchAI was validated with an iPhone 11 at **240 Hz** (per preprint snippet). — [SportRxiv preprint](https://sportrxiv.org/index.php/server/preprint/view/101)
- At 25 fps, the authors note that **25 fps is low for the short double-support phase (about 0.20 s)** and may be inadequate for faster walking. — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- The running study suggests higher frame rates (120/240 fps) may be needed at faster running speeds. — [PMC9866353](https://pmc.ncbi.nlm.nih.gov/articles/PMC9866353/)
- The AthletePose3D dataset recorded running at **120 fps** "to capture fine details" and track-and-field at 60 fps. That was a dataset design choice, not a tested comparison. — [AthletePose3D, CVPR 2025 Workshop](https://openaccess.thecvf.com/content/CVPR2025W/CVSPORTS/papers/Yeung_AthletePose3D_A_Benchmark_Dataset_for_3D_Human_Pose_Estimation_and_CVPRW_2025_paper.pdf)
- A head-impact video analysis found peak velocity estimation needed at least one high-frame-rate view. — [CHOP head acceleration events](https://injury.research.chop.edu/sites/injury.research.chop.edu/files/2022-10/CHAMP-video-analysis_0.pdf)
- Peak angular velocities in baseball hitting (n=3, marker-based): **pelvis about 389°/s, trunk about 601°/s, bat about 1953°/s**, peaking in that order. — [ISBS proceedings (Konstanz)](https://ojs.ub.uni-konstanz.de/cpa/article/view/6368/5737)
- Peak upper-torso angular velocity was **857°/s in adult and 717°/s in youth** baseball hitters. — [Age-level hitting kinematics (ResearchGate PDF)](https://www.researchgate.net/profile/Marc_Taylor/publication/38009961_A_comparison_of_age_level_on_baseball_hitting_kinematics/links/0fcfd50ed8b3209236000000.pdf)
- In BlazePose knee testing, 60 and 120 fps were both used, but frame rate was not analysed as a variable. — [Yue 2026, PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)
- In object tracking (not human pose), accuracy of 3D location and rotation improved from 30 to 60 to 120 fps, attributed to less motion blur and more temporal samples. — [Sub-frame 6D pose of fast moving objects (ResearchGate)](https://www.researchgate.net/publication/337531606_Sub-frame_Appearance_and_6D_Pose_Estimation_of_Fast_Moving_Objects)

### Inferences
- Rotation per frame at a peak pelvis velocity of about 389°/s (arithmetic from the cited value): **30 fps → about 13°/frame; 60 fps → about 6.5°/frame; 120 fps → about 3.2°/frame; 240 fps → about 1.6°/frame.** At an adult trunk peak of 857°/s, 30 fps means about 29° per frame. A velocity peak lasting perhaps 100 ms gets only about 3 samples at 30 fps, so the sampled maximum will usually miss and underestimate the true peak. Differentiating noisy angles also amplifies landmark jitter.
- **Event timing:** at 30 fps one frame is 33 ms, so foot-plant timing is quantised to about ±17 ms before any detection error. Studies at 25 fps already show 20–30 ms MAE. Foot-plant-to-contact intervals in a swing are short (exact slow-pitch values are not in these notes), so 30 fps can blur the ordering of front-foot plant, pelvis start and hands start. 60 fps halves the quantisation, and 120/240 fps makes it negligible next to landmark noise.
- **Motion blur:** exposure time can't exceed the frame interval, so 120/240 fps capture forces exposures of 1/120 s or shorter, which reduces blur on fast-moving feet and hands. At 30 fps indoors, auto-exposure may choose about 1/30–1/60 s, giving visibly smeared limbs. Shutter speed probably matters as much as frame rate.
- **Practical trade-off for SwingIQ:** live in-browser inference cannot run at 120–240 fps (see section 8). A workable design is to (a) run live pose at whatever rate the device sustains for setup checks and coarse feedback, and (b) for lower-body metrics, record the swing at the highest camera frame rate available and run pose estimation offline, frame by frame, on the stored clip.
- **Minimum fps for peak pelvis velocity:** no validated threshold exists. Given that both validated baseball systems use 240 fps and still show about 100–150°/s errors, peak pelvis velocity from one phone should stay hidden at any frame rate, which matches the current architecture rule. Timing of the pelvis peak relative to foot plant could become reasonable at 120 fps or higher.

### Gaps
- No direct study of pose-estimator joint-angle or angular-velocity accuracy at 30 vs. 60 vs. 120 vs. 240 fps in human sports movements was found.
- No study was found quantifying the effect of motion blur or shutter speed on BlazePose landmark accuracy.
- No slow-pitch softball peak pelvis velocity or foot-plant-to-contact duration was found in this search. Other research notes may cover it.

---

## 6. How can foot strike or foot plant be detected from 2D pose, and how large is the timing error vs. force plates or markers?

### Takeaway
Simple kinematic rules on pose landmarks work: foot-index position relative to the hip, or heel/foot vertical position combined with velocity dropping below a threshold. They give about **20–30 ms mean absolute timing error at 25 fps**, with 95–99% of events detected, compared with Vicon. Contact-time error was about 10–14 ms with BlazePose on a high-frame-rate side view. Toe-off and short phases are less reliable than heel strike. No foot-plant validation against force plates for batting was found.

### Cited Findings
- **Hip-to-foot-index distance method** (BlazePose Heavy, 25 fps, Vicon at 100 Hz, n=31). Heel strike is the peak in the horizontal hip-to-foot-index distance and toe-off is the minimum. Peaks must reach 35–46% of the maximum, troughs must be at or below 18%, and events must be at least 0.8 s apart. Signals were spline gap-filled and low-pass filtered with a 10th-order Butterworth (normalised cutoff 0.1752). Results:
  - Heel strike: mean error −4 ms (left) / +20 ms (right); **MAE 20 ms (left) / 30 ms (right)**; detection 97.2% / 99.0%.
  - Toe-off: MAE 20 ms; detection 98.0% / 95.2%.
  - Two false detections in total; some left/right limb misidentification.

  — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- **OpenPose, sagittal video at 25 Hz** vs. motion capture at 100 Hz: toe-off group mean difference up to 2 mocap frames (**20 ms**), mean absolute difference up to 3 frames (**30 ms**). — [Stenum 2021, PMC8099131](https://pmc.ncbi.nlm.nih.gov/articles/PMC8099131)
- **BlazePose on a running treadmill** (iPhone 13 side view vs. Vicon): contact-time mean error 0.011 s (left) / 0.014 s (right), ICC 0.86. Swing-time mean error 0.014 / 0.033 s. Step-time ICC 0.81 / 0.75. The far (right) foot was worse. — [PMC9866353](https://pmc.ncbi.nlm.nih.gov/articles/PMC9866353/)
- **Comparison of event detectors on BlazePose-topology landmarks** (preprint, marker-based reference, 50 ms tolerance): heel-strike F1 of **0.655–0.912** for the best detector (BIKE), which won in 6 of 7 conditions. Zeni's method was best for toe-off in 5 of 7. Scores fell as acquisition quality dropped. — [Research Square rs-10854607](https://assets-eu.researchsquare.com/files/rs-10854607/v1_covered_1bf7d0aa-a81a-4037-b9f4-fbe0c7b01c18.pdf?c=1790844120)
- With marker-based kinematics, foot-velocity methods reach median heel-strike accuracy of about 6–13 ms. Marker-based event methods vary by 30–100 ms depending on marker placement (per search summary). — [medRxiv dual-minima algorithm](https://www.medrxiv.org/content/10.1101/2021.08.27.21262720.full.pdf); [ScienceDirect, automatic gait event detection](https://www.sciencedirect.com/science/article/abs/pii/S0966636206001068)
- Uplift/Driveline time-normalised hitting from **foot contact to ball contact**, using Driveline's own event detection, but did not report foot-contact timing error. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)

### Inferences (how to compute front-foot plant in a swing)
- Batting is not gait. The front foot lifts, strides, and lands once, and its landing is often toe-first with a quick heel drop. A suitable detector:
  1. Track the front-foot heel and foot-index image `y` (vertical), plus horizontal `x` along the stride direction, in a **face-on** view. Normalise by a body length such as hip-to-ankle distance, so thresholds hold at any distance from the camera.
  2. Smooth with a zero-lag low-pass filter (section 7).
  3. Define **stride start** as the first frame where the front foot's horizontal velocity exceeds a threshold, sustained for several frames.
  4. Define **foot plant** as the first frame after stride start where foot vertical position returns to within a small tolerance of its stance baseline **and** foot speed (horizontal and vertical) drops below a threshold, for example under about 10–15% of the stride's peak foot speed, sustained for at least 2–3 frames. Use heel `y` for heel-down and foot-index `y` for toe-touch, and report both where visible.
  5. Interpolate the threshold crossing between frames (sub-frame timing), and gate on landmark `visibility`.
- Expect timing error of about one to two frames: roughly 30–60 ms at 30 fps, 15–30 ms at 60 fps, better at 120/240 fps, plus some systematic offset. Show plant as an event marker on the timeline, not as a precise millisecond value, unless running at 120 fps or higher.
- The same velocity-threshold logic can detect **back-heel lift**: back heel `y` rising above its stance baseline by a normalised threshold. The back foot's lower visibility makes this less reliable.

### Gaps
- No validation of pose-based **front-foot plant detection in batting or pitching** against force plates was found.
- No validated velocity threshold values for foot plant in swings were found. The numbers suggested above are design starting points to tune on labelled footage, not published values.

---

## 7. What is best practice for filtering and smoothing pose-derived angles and velocities?

### Takeaway
Most markerless biomechanics work uses a **zero-lag (forward-backward) 4th-order Butterworth low-pass filter on keypoints, with a 5–8 Hz cutoff, 6 Hz being typical**. Uplift uses a zero-lag Butterworth before biomechanical model fitting. MediaPipe's own temporal smoothing (`smooth_landmarks`) is on by default for video. For fast swings, a 6 Hz cutoff would flatten real peaks. Faster events need a higher cutoff (marker-based hitting studies use higher values, but not verified here). Real-time display needs a causal filter, while offline analysis of a recorded clip should use zero-lag filtering. No study validating cutoffs for pose-derived velocities in sport was found.

### Cited Findings
- Uplift smooths 3D keypoints with a **zero-lag, effective 4th-order low-pass Butterworth filter** before inverse kinematics. The cutoff is not stated. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- Sports2D, an open 2D pose-and-angle tool, defaults to a **6 Hz Butterworth** filter (per search summary). — [Sports2D GitHub](https://github.com/davidpagnon/Sports2D)
- Pose2Sim offers Butterworth filtering, including an option to filter on velocity (differentiate, filter, integrate) and a cutoff that adapts to velocity (per search summary). — [Pose2Sim GitHub](https://github.com/perfanalytics/pose2sim)
- An athlete-jumping study comparing markerless and marker-based capture used a **4th-order bidirectional Butterworth at 6 Hz** (per search summary). — [Scientific Reports 2025, s41598-025-02739-9](https://www.nature.com/articles/s41598-025-02739-9)
- Menychtas 2023 low-pass filtered OpenPose and MediaPipe signals at **5 Hz** for gait. — [PMC10511642](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511642/)
- PMC10384445 used a **10th-order Butterworth, normalised cutoff 0.1752**, on 25 fps data for gait events. — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- The running-gait BlazePose study used a **5-sample moving average** on each keypoint. — [PMC9866353](https://pmc.ncbi.nlm.nih.gov/articles/PMC9866353/)
- MediaPipe's `smooth_landmarks` option (default true) "filters landmarks across different input images to reduce jitter." It is ignored in static-image mode. — [MediaPipe Pose docs](https://chuoling.github.io/mediapipe/solutions/pose)
- In the Yue 2026 study, gating frames by detection confidence was critical: squat RMSE was 25.4° without a gate and 8.8° with a 0.3 threshold. — [PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)

### Inferences
- A normalised cutoff of 0.1752 at 25 fps (Nyquist 12.5 Hz) is about **2.2 Hz** (arithmetic). That suits walking but is far too low for a swing.
- Suggested pipeline for recorded swing clips:
  1. Reject or interpolate frames where landmark `visibility` falls below about 0.5 (tune this; Yue used 0.3–0.5) or where a left/right swap is detected.
  2. Fill short gaps (a few frames) with cubic splines; do not bridge long gaps.
  3. Apply a zero-lag 4th-order Butterworth to landmark positions before computing angles. Start around 8–12 Hz for lower-body positions in a swing, and choose the cutoff by residual analysis on the team's own footage. The cutoff must stay below Nyquist: under 15 Hz at 30 fps, so 30 fps cannot support high cutoffs.
  4. Compute angles, then differentiate with a central difference. For velocities, consider filtering the velocity signal again or using a Savitzky–Golay derivative.
- For **live** overlays, use a causal adaptive filter (One Euro–style, or MediaPipe's built-in smoothing) to trade jitter against lag. Never compute metrics from the live-smoothed stream, because causal filters shift peak timing.
- Report a peak only when enough samples span it: at least about 5 frames inside the peak region is a heuristic, not a published rule.

### Gaps
- No validated Butterworth cutoff for **pose-derived velocities in batting or other fast sports** was found.
- The One Euro filter's original paper and its use inside MediaPipe were not retrieved or verified in this session. Treat the claim that MediaPipe smoothing is One Euro–based as unverified.
- Marker-based hitting studies' typical cutoffs (often cited as about 10–20 Hz) were not verified here.

---

## 8. How fast does MediaPipe Pose (Lite/Full/Heavy) run on recent iPhones and Androids, in the browser and natively, and with what latency?

### Takeaway
Published benchmarks are dated (2019–2021 devices). Google reports native GPU latency of 20 / 25 / 53 ms for Lite / Full / Heavy on a Pixel 3. In the browser (2021 figures), an iPhone 11 ran BlazePose at 43 / 32 / 22 fps on TF.js WebGL but only 9 / 6 fps on the MediaPipe WASM runtime. A Pixel 5 managed 25 / 21 / 8 fps (MediaPipe) or 14 / 10 / 4 fps (TF.js). Real-time browser inference therefore runs at about 15–40 fps, well below the camera's 120–240 fps capture. No recent iPhone 15/16/17 browser benchmarks were found.

### Cited Findings
- MediaPipe Pose (BlazePose GHUM 3D) quality and native latency:

  | Model | Yoga mAP | HIIT mAP | Pixel 3 TFLite GPU | MacBook Pro 2017 |
  |---|---|---|---|---|
  | Heavy | 68.1 | 74.0 | 53 ms | 38 ms |
  | Full | 62.6 | 68.0 | 25 ms | 27 ms |
  | Lite | 45.0 | 53.8 | 20 ms | 25 ms |

  PCK@0.2 on HIIT: 97.5 / 95.7 / 93.5. — [MediaPipe Pose docs](https://chuoling.github.io/mediapipe/solutions/pose)
- Browser fps for Lite / Full / Heavy (TensorFlow blog, 2021):

  | Device | MediaPipe runtime (WASM + GPU) | TF.js WebGL |
  |---|---|---|
  | iPhone 11 | 9 / 6 / N/A | 43 / 32 / 22 |
  | Pixel 5 | 25 / 21 / 8 | 14 / 10 / 4 |
  | MacBook Pro 15" 2019 | 75 / 67 / 34 | 52 / 40 / 24 |

  TF.js was faster on iPhone and iPad, and MediaPipe faster on Android and desktop. — [TensorFlow blog](https://blog.tensorflow.org/2021/08/3d-pose-detection-with-mediapipe-blazepose-ghum-tfjs.html)
- BlazePose Heavy ran at about **9 fps on CPU** offline in a gait study. — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- Offline processing: MediaPipe took 87 s and OpenPose about 2 min 9 s for 17 gait trials. Manual Kinovea annotation took about 2–2.5 h per cycle. — [PMC10511642](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511642/)
- MediaPipe is described as having the fastest runtime and lowest memory use among the frameworks reviewed (review table, uncited there). — [PMC12378739](https://pmc.ncbi.nlm.nih.gov/articles/PMC12378739/)
- MoveNet comes in Lightning (speed) and Thunder (accuracy) variants (vendor-style blog; heuristic only). — [aifitnessapi.com comparison](https://aifitnessapi.com/motion/pose-estimation-models-compared)

### Inferences
- On a modern iPhone or Android (2023–2026), the current `@mediapipe/tasks-vision` PoseLandmarker with GPU delegate likely runs Full at around 30 fps or better in Safari or Chrome. This is unverified (see Gaps) and should be measured on target devices.
- Since live inference rate is below capture rate, plan for **two paths**: live pose at the sustained rate (Lite or Full) for framing checks and "swing detected" triggers, then **offline re-analysis of the stored high-fps clip with Heavy**, running in VIDEO mode frame by frame with original timestamps. Heavy's accuracy gain (HIIT mAP 74.0 vs. 68.0 vs. 53.8) matters most for the small, fast-moving foot landmarks.
- Latency at 20–53 ms per frame is fine for post-swing feedback. Millisecond event timing must come from **capture timestamps**, not from when inference happened to finish.

### Gaps
- No published browser or native benchmarks for **iPhone 13–17 or recent Pixel/Galaxy** devices with the current MediaPipe Tasks API were found.
- **Apple Vision** body pose (VNDetectHumanBodyPoseRequest / 3D body pose): no published accuracy or speed validation was found in this search.
- No RTMPose or MoveNet in-browser fps figures were retrieved.

---

## 9. What do commercial phone-based hitting and golf analysis apps claim to measure in the lower body, and what validation have they published?

### Takeaway
Only **Uplift Labs** has a public, quantitative validation for hitting: a two-iPhone, 240 fps comparison run by Driveline against marker-based capture. It covers pelvis and trunk velocities, X-factor and trunk angles, but **no knee, stride or foot metrics**. pitchAI (pitching only) has a peer-reviewed single-camera paper with conflict-of-interest and overfitting concerns. No independent validation was found for **Sportsbox AI** (golf), which claims single-camera 3D turn, sway, lift and flexion. OnForm, Mustard, Rapsodo and HitTrax were not covered in the sources retrieved.

### Cited Findings
- **Uplift Labs / Uplift Capture:** two iOS devices; joint angles and segment angular velocities; bat tracking. Hitting validation vs. marker-based capture (13 hitters, 63 swings): pelvis velocity MAE 153°/s (CC 0.79), X-factor MAE 14.6° (CC 0.55), trunk flexion MAE 6.2° (CC 0.93). The report says Uplift "is not equivalent" to ground truth but suitable for "gross coordination strategies." It also notes that 22 hitters were recruited but only 13 passed setup, sync and QA filters. — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- **pitchAI (ProPlayAI / 3motionAI):** single camera; pitching joint angles. r² 0.69–0.98 and RMSE 4.37–20.78° vs. marker-based capture. Authors include shareholders. — [PubMed 36409062](https://www.pubmed.gov/36409062/)
- **Sportsbox AI (3D Golf):** markets "patented single camera, markerless 3D motion swing capture" measuring turn, bend, side bend, flexion, sway and lift (per search summary of the App Store listing). A 2024 webinar summary says the company presented "statistical validation," but gives no error figures, sample sizes or methods. No independent peer-reviewed validation was found. — [Sportsbox 3D Golf, App Store](https://apps.apple.com/us/app/id1578921026); [Webinar summary 2024](https://golf.hier-im-netz.de/Knowledge-Base/Webinar-08-04-2024)
- Generic monocular 3D models were judged unusable "out of the box" for golf kinematics. This is relevant context for single-camera golf apps, though Sportsbox's proprietary model was not tested. — [Ingwersen 2023](https://orbit.dtu.dk/en/publications/evaluating-current-state-of-monocular-3d-pose-models-for-golf/)
- **Theia3D and Hawk-Eye** are multi-camera markerless systems (synchronised fixed cameras), not phone apps. In pitching, MPJPE was about 52–57 mm vs. markers (per search summary). — [Theia baseball tracking guide](https://www.theiamarkerless.com/blog/baseball-tracking-system); [Univ. of Kentucky record](https://scholars.uky.edu/en/publications/assessing-the-accuracy-of-in-stadium-and-portable-multi-camera-ma/)

### Inferences
- The commercial field is consistent with the academic evidence. The best-validated phone product uses **two phones at 240 fps plus biomechanical model fitting**, and still reports only coordination-level agreement for pelvis rotation. A single in-browser phone app has no published basis for claiming absolute pelvis, hip-rotation or knee values in a swing.
- SwingIQ's honest position is to show lower-body items as **events and patterns** (stride start, foot plant, back-heel lift, stride length relative to height, front-knee "bracing" trend, sequence order) with a confidence tag, and to keep absolute rotation and velocity values hidden. That matches the existing ARCHITECTURE.md rule against unvalidated camera-derived speed metrics.

### Gaps
- No validation documents were found for **OnForm, Mustard, Rapsodo (hitting), HitTrax, K-Motion, Blast** or other hitting apps in this session. Not searched individually because of the tool budget. HitTrax and Rapsodo are primarily ball- and bat-tracking products, but this was not verified here.
- No Sportsbox AI white paper with numbers was found.

---

## 10. Overall: which leg and foot measurements are trustworthy from one phone, how should they be computed, and which are not?

### Takeaway
From one phone, **timing and positional events** (stride start, front-foot plant, back-heel lift, stride length normalised to body size, step direction) and **visible-side sagittal knee flexion in a well-aligned view** are defensible, with stated uncertainty. **Ankle angles, far-leg angles, frontal-plane knee valgus, pelvis axial rotation in degrees, and any angular velocity magnitude** are not trustworthy enough to show as numbers. Camera geometry (view chosen per metric, feet in frame, hip height, 2–4 m, main lens) and frame rate (record at least 60 fps, ideally 120–240, and analyse offline) matter as much as the model.

### Cited Findings
- Visible-side sagittal knee and hip angles are near marker-based error in walking (knee bias 1.5°, SD 4.1°), while occluded-side and frontal angles are much worse. — [PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)
- In fast or deep movements, BlazePose Heavy knee RMSE is about 8–15° with direction-reversing bias, and up to 25° without confidence gating. — [PMC13730411](https://pmc.ncbi.nlm.nih.gov/articles/PMC13730411)
- Gait events from foot landmarks: 95–99% detected, 20–30 ms MAE at 25 fps. — [PMC10384445](https://pmc.ncbi.nlm.nih.gov/articles/PMC10384445/)
- The ankle is the least reliable joint and is prone to left/right swaps in MediaPipe. — [PMC10511642](https://pmc.ncbi.nlm.nih.gov/articles/PMC10511642/); [PMC10635560](https://pmc.ncbi.nlm.nih.gov/articles/PMC10635560/)
- Pelvis rotation velocity remained inaccurate even in a two-phone, 240 fps commercial system (MAE 153°/s in hitting). — [Driveline–Uplift report](https://static.uplift.ai/validation/Signed_Driveline-Uplift_Kinematic_Model_Comparisons-December_2023.pdf)
- Off-axis camera views raise knee RMSE to 15–29°, mainly from perspective. — [PMC11819822](https://pmc.ncbi.nlm.nih.gov/articles/PMC11819822/)

### Inferences: trust table for a SwingIQ lower-body module

| Measurement | Trust from one phone | Best view | How to compute | Show as |
|---|---|---|---|---|
| Front-foot plant time | **Good** (±1–2 frames) | Face-on | Front heel or foot-index `y` back to baseline **and** foot speed below threshold for 2–3 frames; sub-frame interpolation; visibility gate | Timeline event |
| Stride start / leg-lift time | **Good** | Face-on | Front-foot horizontal speed above threshold, sustained | Timeline event |
| Stride length | **Moderate** (relative, not cm) | Face-on, camera perpendicular to the pitch line | Distance between ankles (or heels) at plant ÷ a body scale (for example hip-to-ankle length or height entered by the user); avoid absolute cm unless calibrated | Ratio such as "stride ≈ 0.8 × leg length" plus within-player trend |
| Stride direction (open/closed) | **Moderate–low** | Behind (catcher view) | Lateral offset of front foot at plant vs. stance line; foreshortened, so use for direction only | Qualitative cue |
| Back-heel lift / back-foot pivot timing | **Moderate–low** (back foot often hidden) | Face-on | Back-heel `y` rise above stance baseline; require visibility | Event with confidence tag |
| Front (lead) knee flexion at plant and at contact; extension ("bracing") trend | **Moderate** if the lead leg is the near leg and the view is aligned; expect about 8–15° error | Face-on for extension trend; behind for stance flexion | Hip–knee–ankle 2D angle from smoothed landmarks; report change (plant → contact) rather than absolute angle | Trend arrow or change in degrees with a wide band |
| Back-knee flexion | **Low** (far leg, occluded) | Behind | Same method, but far-leg occlusion doubles error | Qualitative only |
| Hip flexion (trunk–thigh) | **Moderate** in sagittal walking; uncertain in a swing because hip landmarks are hard to locate | Behind | 2D shoulder–hip–knee angle | Qualitative |
| Pelvis axial rotation (degrees) | **Not trustworthy** | None single-view | Hip-width projection or world-landmark `z`; sign plus coarse estimate only | "Hips opened before / after hands," not degrees |
| Pelvis or hip angular velocity, peak °/s | **Not trustworthy** | — | Even 2 phones at 240 fps: MAE about 150°/s | Do not show |
| Kinematic sequence order (pelvis before trunk before hands) | **Low–moderate** (timing of onsets, not peaks) | Face-on | Onset times from smoothed signals at 120 fps or higher | Qualitative with confidence |
| Ankle dorsi/plantarflexion, foot rotation, knee valgus (frontal) | **Not trustworthy** | — | — | Do not show |
| Head and centre-of-mass sway along the pitch line | **Moderate** | Face-on | Hip-midpoint and nose horizontal displacement ÷ body scale | Relative trend |

Setup requirements implied by the evidence:
- Full body **including both feet** in frame with margin (enforced live).
- One person in view.
- Phone stationary on a tripod or fence mount, at about hip height, 2–4 m away, using the main 1× lens, in portrait.
- The camera view should be detected and stored with each swing, so metrics can be enabled per view.
- Record at the highest fps the device offers (at least 60, preferably 120–240) with good light, then re-run **BlazePose Heavy offline** on the clip.
- Confidence-gate every metric on landmark visibility, and log a source tag and confidence on every metric (as ARCHITECTURE.md already requires).
- Validate against the team's own reference before enabling numbers. Options include IMU-labelled or high-speed hand-labelled swings, and force-plate or pressure-mat foot-plant times if accessible.

### Gaps
- Every recommendation in the trust table is extrapolated from gait, squat, lunge, pitching and two-camera hitting data. **None has been validated for slow-pitch softball batting from one phone.** An in-house validation (labelled frames from 240 fps clips, ideally with a force plate or IMU on the front foot) is the only way to settle the actual error for SwingIQ.
