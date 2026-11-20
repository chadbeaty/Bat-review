#!/usr/bin/env python3
"""Score a detector on the held-out test split, the way the speed engines need it scored.

Plain mAP hides what matters here. This reports:
  - ball recall in the 10 frames after contact (exit velo needs those frames) and before it (pitch speed),
  - ball center error in pixels (sub-pixel accuracy is what turns into mph),
  - bat recall during the swing and keypoint error (knob, sweet spot, barrel end) as % of the bat's length,
  - false detections per frame (a ghost ball becomes a fake exit velo),
  - all of it split by drill, setting and lighting, so a regression in dim cages can't hide in the average.

Usage: python3 ml/eval/eval_detector.py TEST_ANNOTATIONS.jsonl PREDICTIONS.jsonl [--out report.json] [--baseline old.json]
Predictions: one JSON per line {"clip_id", "frame_index", "objects": [{"cls", "bbox", "score", "center"?, "knob"?, ...}]}
With --baseline the script exits non-zero if any headline number got worse by more than its tolerance.
"""
import argparse
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

TOL = {"ball_recall_post": 0.02, "ball_center_px": 0.3, "bat_recall": 0.02, "sweet_spot_err_pct": 0.5, "false_balls_per_frame": 0.005}


def iou(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
    iy = max(0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    u = aw * ah + bw * bh - inter
    return inter / u if u > 0 else 0


def center(o):
    if "center" in o:
        return o["center"]
    x, y, w, h = o["bbox"]
    return [x + w / 2, y + h / 2]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("truth", type=Path)
    ap.add_argument("pred", type=Path)
    ap.add_argument("--out", type=Path)
    ap.add_argument("--baseline", type=Path)
    ap.add_argument("--score", type=float, default=0.4)
    a = ap.parse_args()

    truth = [json.loads(l) for l in a.truth.read_text().splitlines() if l.strip()]
    preds = {}
    for l in a.pred.read_text().splitlines():
        if l.strip():
            p = json.loads(l)
            preds[(p["clip_id"], p["frame_index"])] = [o for o in p["objects"] if o.get("score", 1) >= a.score]

    # Frames after contact, per clip.
    contact = {}
    for r in truth:
        if r.get("contact"):
            contact[r["clip_id"]] = r["frame_index"]

    groups = defaultdict(lambda: defaultdict(list))

    def add(keys, metric, v):
        for k in keys:
            groups[k][metric].append(v)

    for r in truth:
        c = r.get("conditions", {})
        keys = ["all"] + [f"{k}={c[k]}" for k in ("drill", "setting", "lighting") if c.get(k)]
        ps = preds.get((r["clip_id"], r["frame_index"]), [])
        balls = [o for o in r["objects"] if o["cls"] == "ball"]
        pballs = [o for o in ps if o["cls"] == "ball"]
        ci = contact.get(r["clip_id"])
        post = ci is not None and 0 < r["frame_index"] - ci <= 10
        matched = set()
        for b in balls:
            best = max(((iou(b["bbox"], p["bbox"]), j) for j, p in enumerate(pballs)), default=(0, -1))
            hit = best[0] >= 0.3
            add(keys, "ball_recall_post" if post else "ball_recall_other", 1.0 if hit else 0.0)
            if hit:
                matched.add(best[1])
                (tx, ty), (px, py) = center(b), center(pballs[best[1]])
                add(keys, "ball_center_px", math.hypot(tx - px, ty - py))
        add(keys, "false_balls_per_frame", float(len(pballs) - len(matched)))
        for bt in (o for o in r["objects"] if o["cls"] == "bat"):
            pb = [o for o in ps if o["cls"] == "bat"]
            best = max(((iou(bt["bbox"], p["bbox"]), p) for p in pb), default=(0, None), key=lambda x: x[0])
            add(keys, "bat_recall", 1.0 if best[0] >= 0.3 else 0.0)
            p = best[1]
            if p and bt.get("knob") and bt.get("barrel_end"):
                L = math.dist(bt["knob"], bt["barrel_end"]) or 1
                for k in ("knob", "sweet_spot", "barrel_end"):
                    if bt.get(k) and p.get(k):
                        add(keys, f"{k}_err_pct", 100 * math.dist(bt[k], p[k]) / L)

    report = {g: {m: round(sum(v) / len(v), 4) for m, v in ms.items() if v} | {"frames_n": len(ms.get("false_balls_per_frame", []))} for g, ms in groups.items()}
    text = json.dumps(report, indent=2)
    print(text)
    if a.out:
        a.out.write_text(text)
    if a.baseline:
        base = json.loads(a.baseline.read_text())["all"]
        now = report.get("all", {})
        worse = []
        for m, tol in TOL.items():
            if m not in base or m not in now:
                continue
            lower_better = m in ("ball_center_px", "sweet_spot_err_pct", "false_balls_per_frame")
            delta = (now[m] - base[m]) if lower_better else (base[m] - now[m])
            if delta > tol:
                worse.append(f"{m}: {base[m]} -> {now[m]}")
        if worse:
            print("REGRESSION:\n  " + "\n  ".join(worse), file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
