# Gapper slow-pitch dataset and models

Gapper's long-term edge: a labeled library of **real adult slow-pitch footage** (12" yellow balls, composite slow-pitch
bats, steep arcs, cages and fields, front toss and live pitching). Generic baseball models were trained on white
baseballs from broadcast angles; they don't know what a slow-pitch swing looks like from a phone on a fence.

Nothing here runs on the website or costs money per swing. Training happens occasionally on a rented GPU or a Mac;
the finished model runs on the iPhone (Core ML).

## What gets labeled
Schema: `schema/annotation.schema.json`. Per frame:
- **ball**: box, center (middle of the streak if blurred), state (pitch / batted / other), blur, occluded.
- **bat**: box, **knob**, **sweet spot** (6" from the end), **barrel end**, optional outline, blur, occluded.
- **hitter**: box, hands. **plate**: box.
- **contact**: true on the first frame ball and bat touch.
- **conditions**: setting, drill, outcome, ball, barrel color, bat length, lighting, view, device, fps.
- **reference** (optional): radar / sensor readings for that swing, for validation.

Labeling rules: label only what you can see. A ball hidden behind the bat gets no box (don't guess). Blurred bats get
their whole smear in the outline and the knob/end at the middle of the smear.

## Coverage targets
`tools/build_dataset.py` checks these (frames): tee 300, front toss 600, live slow-pitch 1,500; indoor cage 600,
outdoor cage 300, field by day 600, field at night 300; dim 300, backlit 150; misses 150, fouls 150, grounders 200,
liners 300, flies 300. Also aim for at least 25 different hitters, 15 bats (several barrel colors), right- and
left-handed, and five iPhone models.

## Pipeline
1. **Record** with the Gapper iOS app (every recording has a `.json` sidecar with true frame times). Only footage from
   players who agreed in writing to it being used for training.
2. **Extract** frames around each swing:
   `python3 ml/tools/extract_frames.py recordings/ frames/ --every 2`
3. **Label** in any tool that exports the schema (CVAT and Label Studio both work with a small converter; keep the
   `manifest.jsonl` fields).
4. **Build** the training set (player-level splits, so test hitters are never seen in training):
   `python3 ml/tools/build_dataset.py dataset/ frames/annotations.jsonl`
5. **Train**: `pip install -r ml/train/requirements.txt` then
   `python3 ml/train/train_detector.py dataset/ runs/v1 --size small`
6. **Export** to Core ML with a parity check: `python3 ml/train/export_coreml.py runs/v1`
7. **Evaluate** on the test split and gate against the previous model:
   `python3 ml/eval/eval_detector.py dataset/test.jsonl preds.jsonl --out runs/v1/eval.json --baseline runs/v0/eval.json`
8. **Ship** only if the evaluator and the app's speed benchmark (`tests/unit/speed-benchmark.test.ts`) both pass.

## How the model plugs in
The bat tracker (`src/engine/battrack.ts`) and ball tracker (`src/engine/motion.ts`) accept candidates. Today they come
from motion masks. A trained detector adds bat boxes/keypoints and ball boxes as better candidates; the physics
engines (`batspeed.ts`, `ballflight.ts`) stay the same. That keeps every number explainable: the model finds things,
the physics measures them.

## Licenses (checked 2026-11-20)
- **RF-DETR** Nano/Small/Medium/Large: Apache-2.0. Do not use the XL/2XL "Plus" models (different license).
- **Not used**: Ultralytics YOLO (AGPL-3.0, and models trained with it inherit it) and BaseballCV models/datasets
  (AGPL-3.0 now). Training on our own footage from scratch-pretrained COCO weights keeps the models ours.
- Footage and labels belong to Gapper under the players' consent; keep consent records with the session.

## Privacy
Footage shows real people. Keep raw video out of git (this folder only holds code). Store it in a private bucket,
strip names from file names (use pseudonymous player ids), and delete a player's footage if they ask.
