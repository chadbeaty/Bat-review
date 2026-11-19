import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectSwings } from "@/engine/detector";
import type { PoseFrame } from "@/engine/types";
import { GEOM, synthSwing } from "../support/synthetic";

type Fixture = { width: number; height: number; fps: number; frames: PoseFrame[] };
const load = (name: string): Fixture => JSON.parse(readFileSync(join(__dirname, "..", "fixtures", name), "utf8"));

describe("swing detector on real footage", () => {
  // Real batter (upper body, low angle), run through MediaPipe Pose at 30 fps: 2.5 s of stance, one swing, follow-through
  // and a camera pan afterwards.
  for (const name of ["pose-batter-upper-30fps.json", "pose-batter-upper-30fps-lite.json"]) {
    it(`finds exactly one swing (${name.includes("lite") ? "lite" : "full"} model)`, () => {
      const fx = load(name);
      const { swings } = detectSwings(fx.frames, { width: fx.width, height: fx.height });
      expect(swings).toHaveLength(1);
      const s = swings[0];
      // The forward move happens between ~2.6 s and ~3.0 s in the clip.
      expect(s.launch).toBeGreaterThan(2500);
      expect(s.launch).toBeLessThan(2900);
      expect(s.peak - s.launch).toBeGreaterThan(30);
      expect(s.peak - s.launch).toBeLessThan(400);
      expect(s.peakSpeed).toBeGreaterThan(8);
      // Pre-roll covers the stance.
      expect(s.clipStart).toBeLessThan(s.launch - 1500);
    });
  }

  it("ignores the hitter standing in the box", () => {
    const fx = load("pose-batter-upper-30fps.json");
    const still = fx.frames.filter((f) => f.t < 2500);
    expect(detectSwings(still, { width: fx.width, height: fx.height }).swings).toHaveLength(0);
  });
});

describe("swing detector on synthetic motion", () => {
  it("detects a normal swing", () => {
    const { frames } = synthSwing();
    expect(detectSwings(frames, GEOM).swings).toHaveLength(1);
  });

  it("detects a swing at 60 fps and at 15 fps", () => {
    expect(detectSwings(synthSwing({ fps: 60 }).frames, GEOM).swings).toHaveLength(1);
    expect(detectSwings(synthSwing({ fps: 15 }).frames, GEOM).swings).toHaveLength(1);
  });

  it("ignores waggles and jitter", () => {
    const { frames } = synthSwing({ noSwing: true, jitterPx: 3 });
    const r = detectSwings(frames, GEOM);
    expect(r.swings).toHaveLength(0);
  });

  it("ignores a slow practice motion", () => {
    const { frames } = synthSwing({ speed: 0.25 });
    expect(detectSwings(frames, GEOM).swings).toHaveLength(0);
  });

  it("rejects fast hand motion while walking out of the box", () => {
    const { frames } = synthSwing({ walkInPerS: 160 });
    expect(detectSwings(frames, GEOM).swings).toHaveLength(0);
  });

  it("counts two swings separated by a few seconds, never one swing twice", () => {
    const a = synthSwing().frames;
    const last = a[a.length - 1].t;
    const b = synthSwing({ seed: 11 }).frames.map((f) => ({ ...f, t: f.t - a[0].t + last + 33 }));
    expect(detectSwings([...a, ...b], GEOM).swings).toHaveLength(2);
  });

  it("survives a short tracking dropout during the follow-through", () => {
    const { frames, launchT } = synthSwing();
    const holed = frames.map((f) => (f.t > launchT + 300 && f.t < launchT + 450 ? { ...f, lm: null } : f));
    expect(detectSwings(holed, GEOM).swings).toHaveLength(1);
  });
});
