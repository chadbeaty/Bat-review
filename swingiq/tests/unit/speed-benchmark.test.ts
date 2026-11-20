// Accuracy regression gate for both speed engines, on a fixed set of rendered clips with known truth.
// This is NOT a real-world accuracy number (that comes from scripts/validation-report.mjs against a radar). It stops a
// code or model change from silently making the engines worse: CI fails if the error or the success count slips past
// the stored baseline. After a deliberate improvement, refresh the baseline:
//   UPDATE_SPEED_BASELINE=1 npx vitest run tests/unit/speed-benchmark.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOFTBALL_12 } from "@/engine/ballflight";
import { analyzeBatSpeed } from "@/engine/batspeed";
import { BatTracker } from "@/engine/battrack";
import { MotionTracker } from "@/engine/motion";
import { analyzeSpeeds } from "@/engine/speeds";
import { renderHit, type SynthOpts } from "../support/synth";
import { renderSwing, type SynthBatOpts } from "../support/synthBat";

const BASELINE = fileURLToPath(new URL("../benchmarks/speed-baseline.json", import.meta.url));

const EV_CASES: SynthOpts[] = [
  { evMph: 62, launchDeg: 8, sprayDeg: 0 },
  { evMph: 78, launchDeg: 18, sprayDeg: 12 },
  { evMph: 91, launchDeg: 24, sprayDeg: -15 },
  { evMph: 70, launchDeg: -4, sprayDeg: 5, shutter: 1 },
  { evMph: 85, launchDeg: 14, sprayDeg: 20, dir: -1 },
  { evMph: 98, launchDeg: 30, sprayDeg: 0, noise: 6 },
];
const BAT_CASES: SynthBatOpts[] = [
  {},
  { omegaPk: 38, handMph: 14 },
  { omegaPk: 54, handMph: 22, shutter: 1 },
  { yawDeg: 30, dir: -1 },
  { dropRate: 0.15, noise: 5 },
];

type Summary = { n: number; ok: number; mae: number; maxAbs: number };

function summarize(errs: (number | null)[]): Summary {
  const ok = errs.filter((e): e is number => e !== null);
  const abs = ok.map(Math.abs);
  return { n: errs.length, ok: ok.length, mae: abs.length ? abs.reduce((a, b) => a + b, 0) / abs.length : Infinity, maxAbs: abs.length ? Math.max(...abs) : Infinity };
}

describe("speed engines benchmark (regression gate)", () => {
  it("exit velo and bat speed stay at least as accurate as the baseline", () => {
    const evErr = EV_CASES.map((o) => {
      const clip = renderHit(o);
      const mt = new MotionTracker(clip.w, clip.h);
      for (const f of clip.frames) mt.push(f.t, f.rgba);
      const r = analyzeSpeeds(mt.frames(), { bodyPxPerIn: null, ball: SOFTBALL_12, cam: clip.cam, hintT: clip.contactT, fps: 240, frameHeight: clip.h, certification: "USA" });
      const v = r.metrics.exitVelocity?.value;
      return v === null || v === undefined ? null : v - o.evMph;
    });
    const batErr = BAT_CASES.map((o) => {
      const clip = renderSwing(o);
      const bt = new BatTracker(clip.w, clip.h);
      for (const f of clip.frames) bt.push(f.t, f.rgba, f.hints);
      const r = analyzeBatSpeed({ obs: bt.obs, cam: clip.cam, pxPerIn: clip.pxPerIn, batLengthIn: clip.batLengthIn, contactT: clip.contactT });
      return r.ok ? r.peakMph - clip.truth.peakMph : null;
    });
    const now = { ev: summarize(evErr), bat: summarize(batErr) };
    if (process.env.UPDATE_SPEED_BASELINE) {
      writeFileSync(BASELINE, JSON.stringify({ note: "Rendered-clip benchmark, mph. Not a real-world accuracy figure.", ...now }, null, 2) + "\n");
      return;
    }
    const base = JSON.parse(readFileSync(BASELINE, "utf8")) as { ev: Summary; bat: Summary };
    for (const k of ["ev", "bat"] as const) {
      expect(now[k].ok, `${k}: fewer successful readings than baseline`).toBeGreaterThanOrEqual(base[k].ok);
      expect(now[k].mae, `${k}: mean error worse than baseline`).toBeLessThanOrEqual(base[k].mae * 1.25 + 0.3);
      expect(now[k].maxAbs, `${k}: worst error worse than baseline`).toBeLessThanOrEqual(base[k].maxAbs * 1.3 + 0.5);
    }
  }, 180_000);
});
