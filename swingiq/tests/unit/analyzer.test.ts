import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeSwing, type AnalyzeContext } from "@/engine/analyzer";
import { detectSwings } from "@/engine/detector";
import type { MetricKey, PoseFrame } from "@/engine/types";
import { GEOM, synthSwing, type SynthOptions } from "../support/synthetic";

const ctx = (over: Partial<AnalyzeContext> = {}): AnalyzeContext => ({
  geom: GEOM,
  hand: "R",
  view: "side",
  heightIn: 70,
  cameraFps: 30,
  audioContactT: null,
  micOn: false,
  ...over,
});

function run(o: SynthOptions = {}, c: Partial<AnalyzeContext> = {}) {
  const s = synthSwing(o);
  const { swings } = detectSwings(s.frames, GEOM);
  expect(swings).toHaveLength(1);
  const w = swings[0];
  const frames = s.frames.filter((f) => f.t >= w.clipStart && f.t <= w.clipEnd);
  return { a: analyzeSwing(frames, w, ctx(c)), s, w };
}

const v = (a: ReturnType<typeof analyzeSwing>, k: MetricKey) => a.metrics[k]?.value ?? null;

describe("swing analyzer: measurements against known ground truth", () => {
  it("recovers stride, hand drop and head movement in inches", () => {
    const { a } = run({ strideIn: 9, handDropIn: 3, headFwdIn: 1.5, fps: 60 });
    expect(v(a, "strideLength")).toBeGreaterThan(7.5);
    expect(v(a, "strideLength")).toBeLessThan(10.5);
    expect(v(a, "handDrop")).toBeGreaterThan(2);
    expect(v(a, "handDrop")).toBeLessThan(4);
    expect(v(a, "headMovement")).toBeGreaterThan(0.8);
    expect(v(a, "headMovement")).toBeLessThan(3);
  });

  it("finds the phases in order", () => {
    const { a } = run({ fps: 60 });
    const p = a.phases;
    expect(p.loadStart).not.toBeNull();
    expect(p.strideStart).not.toBeNull();
    expect(p.footPlant).not.toBeNull();
    expect(p.stanceStart).toBeLessThan(p.loadStart!);
    expect(p.loadStart!).toBeLessThan(p.launch);
    expect(p.strideStart!).toBeLessThan(p.footPlant!);
    expect(p.launch).toBeLessThan(p.contact);
    expect(p.contact).toBeLessThan(p.finish);
    expect(p.contactSource).toBe("pose");
  });

  it("reads weight shift at contact", () => {
    const back = v(run({ weightAtContact: 0.5, fps: 60 }).a, "weightShift")!;
    const drift = v(run({ weightAtContact: 1.15, fps: 60 }).a, "weightShift")!;
    expect(back).toBeLessThan(drift);
    expect(drift).toBeGreaterThan(95);
  });

  it("orders the kinematic sequence hips → shoulders → hands", () => {
    const { a } = run({ fps: 60 });
    expect(a.metrics.sequence?.text?.startsWith("Hips → Shoulders")).toBe(true);
    expect(v(a, "separation")).toBeGreaterThan(5);
  });

  it("uses the mic's contact time when it falls inside the swing", () => {
    const { s, w } = run();
    const frames = s.frames.filter((f) => f.t >= w.clipStart && f.t <= w.clipEnd);
    const heard = analyzeSwing(frames, w, ctx({ audioContactT: w.launch + 140, micOn: true }));
    expect(heard.phases.contactSource).toBe("audio");
    expect(heard.metrics.swingTime?.value).toBeCloseTo(140, 0);
    expect(heard.metrics.contact?.value).toBe(1);
    const elsewhere = analyzeSwing(frames, w, ctx({ audioContactT: w.launch - 900, micOn: true }));
    expect(elsewhere.phases.contactSource).toBe("pose");
    expect(elsewhere.metrics.contact?.value).toBe(0);
  });
});

describe("swing analyzer: honesty rules", () => {
  it("never gives a number for bat speed, exit velocity, launch or attack angle", () => {
    const { a } = run();
    for (const k of ["batSpeed", "exitVelocity", "launchAngle", "attackAngle"] as MetricKey[]) {
      expect(a.metrics[k]?.source).toBe("unavailable");
      expect(a.metrics[k]?.value).toBeNull();
      expect(a.metrics[k]?.reason).toBeTruthy();
    }
  });

  it("marks stride and weight shift unavailable when the feet can't be seen", () => {
    const { a } = run({ hideFeet: true });
    expect(a.metrics.strideLength?.source).toBe("unavailable");
    expect(a.metrics.weightShift?.source).toBe("unavailable");
    expect(a.quality.feetVisible).toBe(false);
  });

  it("marks stride and weight shift unavailable from behind the plate", () => {
    const { a } = run({}, { view: "behind" });
    expect(a.metrics.strideLength?.source).toBe("unavailable");
    expect(a.metrics.strideLength?.reason).toMatch(/side view/i);
  });

  it("every metric carries a source and a 0–1 confidence; unavailable ones carry no value", () => {
    const { a } = run();
    for (const m of Object.values(a.metrics)) {
      expect(["measured", "cv_estimated", "sensor", "unavailable"]).toContain(m!.source);
      expect(m!.confidence).toBeGreaterThanOrEqual(0);
      expect(m!.confidence).toBeLessThanOrEqual(1);
      if (m!.source === "unavailable") expect(m!.value).toBeNull();
    }
  });

  it("lowers confidence for timing at a low frame rate", () => {
    const fast = run({ fps: 60 }).a.metrics.swingTime!.confidence;
    const slow = run({ fps: 15 }).a.metrics.swingTime!.confidence;
    expect(slow).toBeLessThan(fast);
  });
});

describe("swing analyzer: one cue per swing, based on what happened", () => {
  it("calls out dropped hands", () => {
    const { a } = run({ handDropIn: 7, fps: 60 });
    expect(a.cue.id).toBe("handDrop");
    expect(a.cue.tone).toBe("fix");
  });

  it("calls out drifting forward", () => {
    const { a } = run({ weightAtContact: 1.25, headFwdIn: 7, fps: 60 });
    expect(a.cue.id).toBe("drift");
  });

  it("notices when the last swing's problem got fixed", () => {
    const prev = run({ handDropIn: 7, fps: 60 }).a.metrics;
    const { a } = run({ handDropIn: 1, fps: 60 }, { previous: [prev] });
    expect(a.observations.some((c) => c.id === "handDrop-better")).toBe(true);
  });

  it("gives a score from the checks the footage supported", () => {
    const { a } = run({ fps: 60 });
    expect(a.score.overall).not.toBeNull();
    expect(a.score.overall!).toBeGreaterThanOrEqual(0);
    expect(a.score.overall!).toBeLessThanOrEqual(100);
    expect(a.score.components.length).toBeGreaterThanOrEqual(4);
  });
});

describe("swing analyzer on real footage", () => {
  it("analyzes the real batter clip honestly (upper body only)", () => {
    const fx = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "pose-batter-upper-30fps.json"), "utf8")) as { width: number; height: number; frames: PoseFrame[] };
    const geom = { width: fx.width, height: fx.height };
    const [w] = detectSwings(fx.frames, geom).swings;
    const frames = fx.frames.filter((f) => f.t >= w.clipStart && f.t <= w.clipEnd);
    const a = analyzeSwing(frames, w, { ...ctx(), geom });
    // A real slow-pitch swing: launch to contact 100–400 ms.
    expect(a.metrics.swingTime!.value!).toBeGreaterThan(80);
    expect(a.metrics.swingTime!.value!).toBeLessThan(400);
    // Legs are out of frame in this clip, so anything that needs feet must say so.
    expect(a.quality.feetVisible).toBe(false);
    expect(a.metrics.strideLength?.source).toBe("unavailable");
    expect(a.metrics.handSpeed?.source).toBe("cv_estimated");
    expect(a.cue.text.length).toBeGreaterThan(10);
    expect(a.handPath.length).toBeGreaterThan(3);
  });
});
