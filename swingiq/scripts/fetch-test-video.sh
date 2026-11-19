#!/usr/bin/env bash
# Downloads a free stock clip of a real batter filmed head to toe (Pexels license: free to use, not redistributed in
# this repo) and turns it into test media:
#  - swing.y4m: a 30 fps "camera feed" for the live-camera test (Chromium uses it as a fake webcam)
#  - swing.webm: the same swing as a video file, for the record/upload test
# The slow-motion original is sped back up to real time (4×) and padded with stance frames. The batter takes a toe
# tap and a leg lift, plants, and swings: a good test of the legs-and-feet engine.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/video
mkdir -p "$OUT"
if [ ! -f "$OUT/swing.y4m" ]; then
  curl -fsSL -A "Mozilla/5.0" -o "$OUT/source.mp4" https://videos.pexels.com/video-files/5182770/5182770-hd_1280_720_25fps.mp4
  ffmpeg -v error -y -t 7.2 -i "$OUT/source.mp4" \
    -vf "setpts=PTS/4,fps=30,scale=640:360,tpad=start_duration=2.5:start_mode=clone:stop_duration=1.5:stop_mode=clone" \
    -pix_fmt yuv420p "$OUT/swing.y4m"
  rm -f "$OUT/source.mp4"
fi
if [ ! -f "$OUT/swing.webm" ]; then
  ffmpeg -v error -y -i "$OUT/swing.y4m" -c:v libvpx-vp9 -b:v 1M -deadline realtime -cpu-used 8 "$OUT/swing.webm"
fi
echo "test media ready in $OUT"
