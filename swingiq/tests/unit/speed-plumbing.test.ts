import { describe, expect, it } from "vitest";
import { mergeBatSpeed } from "@/engine/speeds";
import type { MetricKey, MetricValue } from "@/engine/types";
import { captureQuality, frameTimeSnapper, type NativeCaptureMeta } from "@/native/capture";
import { toCsv, validationRows } from "@/lib/validation";
import type { SwingRecord } from "@/lib/store/types";

function meta(over: Partial<NativeCaptureMeta> = {}): NativeCaptureMeta {
  const frameTimes = Array.from({ length: 480 }, (_, i) => i / 240);
  return {
    version: 1,
    device: "iPhone16,1",
    format: { width: 1920, height: 1080, fps: 240, lens: "wide", minExposureS: 1e-5, maxExposureS: 1 / 240, hevc: true },
    orientation: "landscape",
    frameTimes,
    droppedFrames: [],
    measuredFps: 240,
    exposureS: { median: 0.001, max: 0.001 },
    iso: { median: 400, max: 500 },
    intrinsics: null,
    gravity: null,
    stability: { maxRotationDegS: 1, moved: false },
    swingMarks: [],
    setupChecks: [],
    ...over,
  };
}

describe("native capture sidecar", () => {
  it("snaps decoded media times to the camera's own frame times, across a dropped frame", () => {
    const times = [0, 1 / 240, 2 / 240, 4 / 240, 5 / 240]; // frame at 3/240 dropped
    const snap = frameTimeSnapper({ frameTimes: times });
    expect(snap(0.0043)).toBeCloseTo(1 / 240, 9);
    expect(snap(4 / 240 + 0.0003)).toBeCloseTo(4 / 240, 9);
    expect(snap(3 / 240)).toBeNull(); // the dropped slot has no frame in the file: caller falls back to media time
    expect(snap(1)).toBeNull(); // nowhere near a real frame
  });

  it("withholds speeds from a hot phone that fell under 100 fps or a phone that moved", () => {
    expect(captureQuality(meta()).speedsOk).toBe(true);
    expect(captureQuality(meta({ measuredFps: 90 })).speedsOk).toBe(false);
    expect(captureQuality(meta({ stability: { maxRotationDegS: 20, moved: true } })).speedsOk).toBe(false);
    expect(captureQuality(meta({ exposureS: { median: 1 / 240, max: 1 / 240 } })).problems.join(" ")).toMatch(/dim/);
  });
});

describe("bat speed merge", () => {
  const derived: MetricValue = { key: "batSpeed", source: "cv_estimated", value: 66, confidence: 0.5, plusMinus: 4, method: "from exit velo", reason: "From exit velo." };

  it("barrel tracking replaces the formula and keeps it as a cross-check", () => {
    const m: Partial<Record<MetricKey, MetricValue>> = { batSpeed: derived };
    mergeBatSpeed(m, { ok: true, peakMph: 68.4, pm: 3.2, peakT: 0, atContactMph: 65, attackDeg: 9, planeViewDeg: 40, residualPx: 1, n: 30, depthIn: 140, scaleFrom: "body+bat", confidence: 0.7, series: [], path: [] }, true);
    expect(m.batSpeed?.method).toBe("barrel tracking");
    expect(m.batSpeed?.value).toBe(68.4);
    expect(m.batSpeed?.reason).toMatch(/Cross-check from exit velo: 66 mph/);
    expect(m.attackAngle?.value).toBe(9);
  });

  it("keeps the labeled formula when barrel tracking fails, and says why", () => {
    const m: Partial<Record<MetricKey, MetricValue>> = { batSpeed: derived };
    mergeBatSpeed(m, { ok: false, code: "edge_on", reason: "Seen edge-on." }, true);
    expect(m.batSpeed?.method).toBe("from exit velo");
    expect(m.batSpeed?.reason).toMatch(/Seen edge-on/);
  });

  it("reports unavailable (never a made-up number) when neither works", () => {
    const m: Partial<Record<MetricKey, MetricValue>> = {};
    mergeBatSpeed(m, { ok: false, code: "few_frames", reason: "Not enough frames." }, true);
    expect(m.batSpeed?.source).toBe("unavailable");
    expect(m.batSpeed?.value).toBeNull();
  });

  it("widens the ± and says so when the bat's length was assumed", () => {
    const m: Partial<Record<MetricKey, MetricValue>> = {};
    mergeBatSpeed(m, { ok: true, peakMph: 70, pm: 2, peakT: 0, atContactMph: null, attackDeg: null, planeViewDeg: 40, residualPx: 1, n: 30, depthIn: 140, scaleFrom: "body+bat", confidence: 0.8, series: [], path: [] }, false);
    expect(m.batSpeed!.plusMinus!).toBeGreaterThan(2);
    expect(m.batSpeed?.reason).toMatch(/34-inch/);
  });
});

describe("accuracy export", () => {
  it("pairs Gapper's camera reading with the typed-in reference, not the overlay", () => {
    const swing = {
      id: "s1",
      sessionId: "x",
      playerId: "p",
      n: 1,
      at: Date.UTC(2026, 10, 20),
      view: "side",
      hand: "R",
      analysis: { metrics: { exitVelocity: { key: "exitVelocity", source: "cv_estimated", value: 76.5, confidence: 0.8, plusMinus: 2.1, method: "ball tracking" } } },
      pose: [],
      frameSize: { width: 1, height: 1 },
      clipFrames: 0,
      external: [{ key: "exitVelocity", value: 78, device: "Pocket Radar", via: "manual", enteredAt: 0 }],
    } as unknown as SwingRecord;
    const rows = validationRows([swing], [], []);
    expect(rows[0].gapper_ev_mph).toBe("76.5");
    expect(rows[0].ref_ev_mph).toBe("78");
    expect(toCsv(rows).split("\n")[0]).toMatch(/^swing_id,date,/);
  });
});
