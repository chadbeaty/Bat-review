#!/usr/bin/env python3
"""Turn labeled frames into a training set: player-level splits, COCO files, and a coverage report.

Input: one or more annotations .jsonl files (schema: ml/schema/annotation.schema.json; "image" paths relative to the
file). Output (RF-DETR's expected layout):
  OUT/train/_annotations.coco.json + images
  OUT/valid/_annotations.coco.json + images
  OUT/test/_annotations.coco.json  + images
  OUT/coverage.md     what the set covers, and the gaps against the coverage targets

Splits are by player (falling back to session, then clip), so no hitter appears in two splits. A model scored on
hitters it trained on looks better than it is.

Usage: python3 ml/tools/build_dataset.py OUT annotations.jsonl [more.jsonl ...] [--seed 7]
"""
import argparse
import hashlib
import json
import shutil
from collections import Counter, defaultdict
from pathlib import Path

CLASSES = ["ball", "bat", "hitter", "plate"]
BAT_KPTS = ["knob", "sweet_spot", "barrel_end"]

# Minimum labeled frames per condition before the set is considered usable (see ml/README.md, "Coverage").
TARGETS = {
    ("drill", "tee"): 300, ("drill", "front_toss"): 600, ("drill", "live_slowpitch"): 1500,
    ("setting", "indoor_cage"): 600, ("setting", "outdoor_cage"): 300, ("setting", "field_day"): 600, ("setting", "field_night"): 300,
    ("lighting", "dim"): 300, ("lighting", "backlit"): 150,
    ("outcome", "miss"): 150, ("outcome", "foul"): 150, ("outcome", "grounder"): 200, ("outcome", "liner"): 300, ("outcome", "fly"): 300,
}


def group_key(rec):
    return rec.get("player_id") or rec.get("session_id") or rec["clip_id"]


def split_of(key, seed):
    h = int(hashlib.sha1(f"{seed}:{key}".encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else "valid" if h < 85 else "test"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", type=Path)
    ap.add_argument("annotations", type=Path, nargs="+")
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()

    coco = {s: {"images": [], "annotations": [], "categories": []} for s in ("train", "valid", "test")}
    for s in coco:
        coco[s]["categories"] = [
            {"id": i + 1, "name": c, **({"keypoints": BAT_KPTS, "skeleton": [[1, 2], [2, 3]]} if c == "bat" else {})}
            for i, c in enumerate(CLASSES)
        ]
        (a.out / s).mkdir(parents=True, exist_ok=True)
    cover = Counter()
    per_split = Counter()
    groups = defaultdict(set)
    ann_id = 1
    for f in a.annotations:
        for line in f.read_text().splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if not r.get("objects"):
                continue  # unlabeled stub
            s = split_of(group_key(r), a.seed)
            groups[s].add(group_key(r))
            per_split[s] += 1
            src = (f.parent / r["image"]).resolve()
            name = f"{r['clip_id']}_{r['frame_index']:06d}{src.suffix}"
            shutil.copy2(src, a.out / s / name)
            img_id = len(coco[s]["images"]) + 1
            coco[s]["images"].append({"id": img_id, "file_name": name, "width": r["width"], "height": r["height"]})
            for k, v in r.get("conditions", {}).items():
                if isinstance(v, str) and v:
                    cover[(k, v)] += 1
            for o in r["objects"]:
                x, y, w, h = o["bbox"]
                ann = {"id": ann_id, "image_id": img_id, "category_id": CLASSES.index(o["cls"]) + 1, "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0}
                if o["cls"] == "bat":
                    kp = []
                    for k in BAT_KPTS:
                        p = o.get(k)
                        kp += [p[0], p[1], 2] if p else [0, 0, 0]
                    ann["keypoints"] = kp
                    ann["num_keypoints"] = sum(1 for i in range(2, len(kp), 3) if kp[i])
                coco[s]["annotations"].append(ann)
                ann_id += 1
    for s, d in coco.items():
        (a.out / s / "_annotations.coco.json").write_text(json.dumps(d))
    leak = groups["train"] & (groups["valid"] | groups["test"])
    lines = ["# Dataset coverage", "", f"Frames: train {per_split['train']}, valid {per_split['valid']}, test {per_split['test']}.",
             f"Hitters/sessions: train {len(groups['train'])}, valid {len(groups['valid'])}, test {len(groups['test'])}.",
             "Leakage check: " + ("none" if not leak else f"{len(leak)} groups in more than one split!"), "",
             "| Condition | Frames | Target | |", "| --- | --- | --- | --- |"]
    for (k, v), target in sorted(TARGETS.items()):
        n = cover[(k, v)]
        lines.append(f"| {k} = {v} | {n} | {target} | {'ok' if n >= target else 'NEED MORE'} |")
    (a.out / "coverage.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
