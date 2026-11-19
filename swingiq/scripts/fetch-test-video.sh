#!/usr/bin/env bash
# Downloads a free stock clip of a real batter (Mixkit free license; not redistributed in this repo) and turns it into
# a 30 fps "camera feed" for the end-to-end test: the slow-motion swing is sped back up to real time and padded
# with stance frames, then written as .y4m, which Chromium can use as a fake webcam.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/video
mkdir -p "$OUT"
[ -f "$OUT/swing.y4m" ] && exit 0
curl -fsSL -o "$OUT/source.mp4" https://assets.mixkit.co/videos/871/871-720.mp4
ffmpeg -v error -y -t 4.6 -i "$OUT/source.mp4" \
  -vf "setpts=PTS/5,fps=30,scale=640:360,tpad=start_duration=2.5:start_mode=clone:stop_duration=2:stop_mode=clone" \
  -pix_fmt yuv420p "$OUT/swing.y4m"
rm -f "$OUT/source.mp4"
echo "test video ready: $OUT/swing.y4m"
