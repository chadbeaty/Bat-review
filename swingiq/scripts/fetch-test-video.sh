#!/usr/bin/env bash
# Downloads a free stock clip of a real batter filmed head to toe (Pexels license: free to use, not redistributed in
# this repo) and turns it into a 30 fps "camera feed" for the end-to-end test: the slow-motion swing is sped back up to
# real time (4×) and padded with stance frames, then written as .y4m, which Chromium can use as a fake webcam.
# The batter takes a toe tap and a leg lift, plants, and swings: a good test of the legs-and-feet engine.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=tests/fixtures/video
mkdir -p "$OUT"
[ -f "$OUT/swing.y4m" ] && exit 0
curl -fsSL -A "Mozilla/5.0" -o "$OUT/source.mp4" https://videos.pexels.com/video-files/5182770/5182770-hd_1280_720_25fps.mp4
ffmpeg -v error -y -t 7.2 -i "$OUT/source.mp4" \
  -vf "setpts=PTS/4,fps=30,scale=640:360,tpad=start_duration=2.5:start_mode=clone:stop_duration=1.5:stop_mode=clone" \
  -pix_fmt yuv420p "$OUT/swing.y4m"
rm -f "$OUT/source.mp4"
echo "test video ready: $OUT/swing.y4m"
