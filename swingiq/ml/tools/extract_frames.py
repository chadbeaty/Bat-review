#!/usr/bin/env python3
"""Pull frames out of Gapper recordings for labeling.

Each native recording is a .mov plus a .json sidecar (same stem) holding the true time of every frame. This script
writes PNG frames around each swing the phone marked (or the whole clip with --all) and a manifest.jsonl with one
stub annotation per frame, pre-filled from the sidecar (device, fps, frame time). Labelers then fill in objects.

Usage:
  python3 ml/tools/extract_frames.py RECORDINGS_DIR OUT_DIR [--all] [--before 0.6] [--after 0.4] [--every 1]
Needs ffmpeg on the PATH. No Python packages beyond the standard library.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def frames_to_keep(times, marks, before, after, every, keep_all):
    keep = []
    for i, t in enumerate(times):
        if i % every:
            continue
        if keep_all or any(m - before <= t <= m + after for m in marks):
            keep.append(i)
    return keep


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("recordings", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--all", action="store_true", help="every frame, not just around swing marks")
    ap.add_argument("--before", type=float, default=0.6, help="seconds before each swing mark")
    ap.add_argument("--after", type=float, default=0.4, help="seconds after each swing mark")
    ap.add_argument("--every", type=int, default=1, help="keep every Nth frame (2 halves the labeling work at 240 fps)")
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    manifest = (a.out / "manifest.jsonl").open("a")
    n_total = 0
    for mov in sorted(a.recordings.glob("*.mov")):
        side = mov.with_suffix(".json")
        if not side.exists():
            print(f"skip {mov.name}: no sidecar", file=sys.stderr)
            continue
        meta = json.loads(side.read_text())
        times = meta["frameTimes"]
        keep = frames_to_keep(times, meta.get("swingMarks", []), a.before, a.after, a.every, a.all)
        if not keep:
            print(f"skip {mov.name}: no swing marks (use --all)", file=sys.stderr)
            continue
        clip_dir = a.out / mov.stem
        clip_dir.mkdir(exist_ok=True)
        # Decode every frame in order (frame N of the stream = sidecar frameTimes[N]) and keep the chosen ones.
        sel = "+".join(f"eq(n\\,{i})" for i in keep)
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(mov), "-vf", f"select='{sel}'", "-vsync", "0", str(clip_dir / "f_%06d.png")],
            check=True,
        )
        written = sorted(clip_dir.glob("f_*.png"))
        if len(written) != len(keep):
            print(f"warning {mov.name}: wrote {len(written)} frames, expected {len(keep)}", file=sys.stderr)
        fmt = meta["format"]
        w, h = (fmt["width"], fmt["height"]) if meta.get("orientation") == "landscape" else (fmt["height"], fmt["width"])
        for path, idx in zip(written, keep):
            final = clip_dir / f"{idx:06d}.png"
            path.rename(final)
            manifest.write(json.dumps({
                "clip_id": mov.stem,
                "frame_index": idx,
                "t": times[idx],
                "image": str(final.relative_to(a.out)),
                "width": w,
                "height": h,
                "objects": [],
                "conditions": {"setting": "", "drill": "", "device": meta.get("device", ""), "fps": round(meta.get("measuredFps", 0), 1)},
            }) + "\n")
            n_total += 1
    manifest.close()
    print(f"{n_total} frames ready for labeling in {a.out}")


if __name__ == "__main__":
    main()
