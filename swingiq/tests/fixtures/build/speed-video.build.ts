// Builds the slo-mo speed test clips: the real batter footage at 240 frames per second (motion-interpolated) with a
// softball of known speed drawn in over the sky. Run by scripts/fetch-test-video.sh, not by the normal test suite.
//   speed240.webm      – a true 240 fps file
//   speed240x8.webm    – the same frames as an 8× slowed 30 fps export (what iPhone Slo-mo shares look like)
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { ballPath, drawBall } from "../../support/synth";

const DIR = join(__dirname, "..", "video");
const W = 640;
const H = 360;
const FPS = 240;
const START = 1.0; // seconds into the padded batter clip
const END = 4.6;
/** Body tracking puts contact in the batter clip at about 3.63 s; the drawn ball's contact goes there too. */
const CONTACT = 3.633;
export const SPEED_TRUTH = { evMph: 85, launchDeg: 18, sprayDeg: 10, pitchMph: 25, descentDeg: 35 };

it.skipIf(!existsSync(join(DIR, "source.mp4")))("build slo-mo speed clips", async () => {
  const fpx = W / 2 / Math.tan((32.5 * Math.PI) / 180);
  // About 2 ft in front of the batter, who stands ~19 ft from this camera: the ball is drawn at a true-to-life size.
  const Z = 17;
  const path = ballPath({
    ...SPEED_TRUTH,
    w: W,
    h: H,
    dir: -1,
    contact: { X: ((240 - W / 2) / fpx) * Z, Y: ((140 - H / 2) / fpx) * Z, Z },
    contactAtS: CONTACT,
  });
  const decoder = spawn("ffmpeg", [
    "-v", "error", "-t", "7.2", "-i", join(DIR, "source.mp4"),
    "-vf", `setpts=PTS/4,scale=${W}:${H},tpad=start_duration=2.5:start_mode=clone:stop_duration=1.5:stop_mode=clone,minterpolate=fps=${FPS}:mi_mode=blend,trim=start=${START}:end=${END},setpts=PTS-STARTPTS`,
    "-f", "rawvideo", "-pix_fmt", "rgba", "-",
  ]);
  const enc = (rate: number, out: string) =>
    spawn("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-r", String(rate), "-i", "-",
      "-c:v", "libvpx-vp9", "-crf", "20", "-b:v", "0", "-deadline", "realtime", "-cpu-used", "8", "-pix_fmt", "yuv420p", join(DIR, out)]);
  const e240 = enc(FPS, "speed240.webm");
  const e30 = enc(30, "speed240x8.webm");
  const frameBytes = W * H * 4;
  let pending = Buffer.alloc(0);
  let index = 0;
  const write = (p: ReturnType<typeof spawn>, b: Buffer) =>
    new Promise<void>((res) => (p.stdin!.write(b) ? res() : p.stdin!.once("drain", () => res())));
  for await (const chunk of decoder.stdout) {
    pending = Buffer.concat([pending, chunk as Buffer]);
    while (pending.length >= frameBytes) {
      const frame = new Uint8ClampedArray(pending.subarray(0, frameBytes));
      pending = pending.subarray(frameBytes);
      drawBall(frame, W, H, path, START + index / FPS, FPS);
      const b = Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength);
      await Promise.all([write(e240, b), write(e30, b)]);
      index++;
    }
  }
  const done = (p: ReturnType<typeof spawn>) => new Promise<void>((res, rej) => p.on("close", (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  e240.stdin!.end();
  e30.stdin!.end();
  await Promise.all([done(e240), done(e30)]);
  if (index < 600) throw new Error(`only ${index} frames decoded`);
}, 600_000);
