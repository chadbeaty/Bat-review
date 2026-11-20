import { describe, expect, it } from "vitest";
import { BatTracker, type BatObs } from "@/engine/battrack";
import { analyzeBatSpeed, selectTrack } from "@/engine/batspeed";
import { localPoly } from "@/engine/localpoly";
import { renderSwing, type SynthBatOpts } from "../support/synthBat";

function run(o: SynthBatOpts, extra: { prior?: number | null; noContact?: boolean } = {}) {
  const clip = renderSwing(o);
  const bt = new BatTracker(clip.w, clip.h);
  for (const f of clip.frames) bt.push(f.t, f.rgba, f.hints);
  const res = analyzeBatSpeed({
    obs: bt.obs,
    cam: clip.cam,
    pxPerIn: extra.prior === null ? null : clip.pxPerIn * (extra.prior ?? 1),
    batLengthIn: clip.batLengthIn,
    contactT: extra.noContact ? null : clip.contactT,
  });
  return { clip, res };
}

describe("local polynomial smoothing on real timestamps", () => {
  it("recovers the slope of a cubic through uneven samples", () => {
    const ts: number[] = [];
    for (let t = 0; t < 0.2; t += 1 / 240) if (Math.floor(t * 1000) % 7 !== 3) ts.push(t);
    const f = (t: number) => 2 + 30 * t - 400 * t * t + 900 * t * t * t;
    const df = (t: number) => 30 - 800 * t + 2700 * t * t;
    const fit = localPoly(ts, ts.map(f), 0.015, 3);
    for (let i = 5; i < ts.length - 5; i++) expect(fit.dy[i]).toBeCloseTo(df(ts[i]), 3);
  });
});

describe("bat track selection", () => {
  it("follows the smoothly rotating candidate, not a stronger one that jumps around", () => {
    const obs: BatObs[] = [];
    for (let i = 0; i < 30; i++) {
      const phi = -2 + i * 0.12; // ~29 rad/s at 240 fps
      const decoy = i % 2 ? 1.4 : -0.3;
      obs.push({ t: i * (1000 / 240), hx: 0, hy: 0, phi: decoy, len: 80, fan: 0.1, conf: 0.9, alts: [{ phi, len: 150, fan: 0.1, conf: 0.6 }] });
    }
    const out = selectTrack(obs);
    for (let i = 0; i < 30; i++) expect(out[i].phi).toBeCloseTo(-2 + i * 0.12, 5);
  });
});

describe("bat speed engine (rendered swings with known sweet-spot speed)", () => {
  const cases: [string, SynthBatOpts][] = [
    ["typical swing, 240 fps", {}],
    ["fast swing, long shutter", { omegaPk: 54, handMph: 22, shutter: 1 }],
    ["pitcher on the left, camera turned 30°", { dir: -1, yawDeg: 30 }],
    ["dropped frames", { dropRate: 0.15 }],
  ];
  for (const [name, o] of cases) {
    it(name, () => {
      const { clip, res } = run(o);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const err = res.peakMph - clip.truth.peakMph;
      expect(Math.abs(err)).toBeLessThan(Math.max(3.5, 1.5 * res.pm));
      expect(Math.abs(err) / clip.truth.peakMph).toBeLessThan(0.06);
      expect(res.pm).toBeGreaterThan(1);
    }, 60_000);
  }

  it("works without a body-size ruler (bat length alone) and without a contact time", () => {
    const { clip, res } = run({}, { prior: null, noContact: true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(Math.abs(res.peakMph - clip.truth.peakMph) / clip.truth.peakMph).toBeLessThan(0.07);
  }, 60_000);

  it("refuses a swing seen edge-on instead of guessing", () => {
    const { res } = run({ camPitchDeg: 0, batDownDeg: 2, attackDeg: 0 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("edge_on");
  }, 60_000);

  it("refuses when the bat was barely seen", () => {
    const res = analyzeBatSpeed({ obs: [], cam: { cx: 480, cy: 270, fPx: 750, fRel: 0.1 }, pxPerIn: 5, batLengthIn: 34 });
    expect(res.ok).toBe(false);
  });
});
