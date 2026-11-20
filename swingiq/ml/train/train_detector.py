#!/usr/bin/env python3
"""Fine-tune the slow-pitch detector (ball, bat, hitter, plate) from COCO-pretrained RF-DETR.

Why RF-DETR: Apache-2.0 for the sizes we use (commercial use is fine), strong small-object accuracy for its speed,
and a real-time Nano/Small model is small enough for an iPhone's Neural Engine. Ultralytics YOLO was rejected for its
AGPL license; BaseballCV's models for the same license plus baseball-only training data.

Usage:
  pip install -r ml/train/requirements.txt
  python3 ml/train/train_detector.py DATASET_DIR RUN_DIR [--size small] [--epochs 60] [--batch 8] [--res 640]

DATASET_DIR comes from ml/tools/build_dataset.py. The run directory gets checkpoints, metrics and a model card
(model_card.json) recording the dataset hash, so every model on a phone can be traced to the frames it learned from.
"""
import argparse
import hashlib
import json
import time
from pathlib import Path


def dataset_hash(d: Path) -> str:
    h = hashlib.sha256()
    for split in ("train", "valid", "test"):
        f = d / split / "_annotations.coco.json"
        if f.exists():
            h.update(f.read_bytes())
    return h.hexdigest()[:16]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dataset", type=Path)
    ap.add_argument("run", type=Path)
    ap.add_argument("--size", choices=["nano", "small", "medium"], default="small")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-4)
    # Higher input resolution keeps a 12" ball at 10-14 ft from shrinking to a few pixels.
    ap.add_argument("--res", type=int, default=640)
    a = ap.parse_args()

    import rfdetr  # imported here so --help works without the package

    cls = {"nano": rfdetr.RFDETRNano, "small": rfdetr.RFDETRSmall, "medium": rfdetr.RFDETRMedium}[a.size]
    model = cls(resolution=a.res)
    a.run.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    model.train(
        dataset_dir=str(a.dataset),
        epochs=a.epochs,
        batch_size=a.batch,
        lr=a.lr,
        output_dir=str(a.run),
        early_stopping=True,
    )
    card = {
        "model": f"rfdetr-{a.size}",
        "license": "Apache-2.0 (base weights); fine-tuned weights are Gapper's",
        "resolution": a.res,
        "classes": ["ball", "bat", "hitter", "plate"],
        "dataset": str(a.dataset),
        "dataset_hash": dataset_hash(a.dataset),
        "epochs": a.epochs,
        "train_minutes": round((time.time() - t0) / 60, 1),
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    (a.run / "model_card.json").write_text(json.dumps(card, indent=2))
    print(json.dumps(card, indent=2))


if __name__ == "__main__":
    main()
