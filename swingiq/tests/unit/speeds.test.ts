import { describe, expect, it } from "vitest";
import {
  SOFTBALL_12,
  assumedCamera,
  batSpeedFromCollision,
  ballSizeScale,
  collisionEfficiency,
  combineScales,
  fitPitch,
  gravityScale,
  polyFit,
  type TrackPoint,
} from "@/engine/ballflight";
import { MotionTracker } from "@/engine/motion";
import { analyzeSpeeds, checkTimeBase } from "@/engine/speeds";
import { renderHit, type SynthOpts } from "../support/synth";

function analyze(o: SynthOpts, extra: { fps?: number } = {}) {
  const clip = renderHit(o);
  const mt = new MotionTracker(clip.w, clip.h);
  for (const f of clip.frames) mt.push(f.t, f.rgba);
  const res = analyzeSpeeds(mt.frames(), {
    bodyPxPerIn: null,
    ball: SOFTBALL_12,
    cam: clip.cam,
    hintT: clip.contactT,
    fps: extra.fps ?? o.fps ?? 240,
    frameHeight: clip.h,
    certification: "USA",
  });
  return { clip, res, mt };
}

describe("ball-flight math", () => {
  it("fits a parabola with the right curvature", () => {
    const ts = Array.from({ length: 20 }, (_, i) => i / 240);
    const ys = ts.map((t) => 100 + 50 * t + 0.5 * 2000 * t * t);
    const f = polyFit(ts, ys, 2, 0)!;
    expect(2 * f.c2).toBeCloseTo(2000, 3);
    expect(f.c1).toBeCloseTo(50, 3);
  });

  it("recovers pixels-per-foot from a pitch's fall, correcting for drag", () => {
    // 90 px/ft, pitch at 25 mph dropping at 30°, with drag: build the track from the same physics.
    const s = 90;
    const pts: TrackPoint[] = [];
    let x = 0, y = 0, vx = -25 * 1.4667 * Math.cos(Math.PI / 6), vy = 25 * 1.4667 * Math.sin(Math.PI / 6);
    const k = 0.0033;
    for (let i = 0; i < 50; i++) {
      pts.push({ t: i / 240, x: x * s, y: y * s, d: 0.318 * s });
      for (let j = 0; j < 50; j++) {
        const dt = 1 / 240 / 50;
        const v = Math.hypot(vx, vy);
        vx += -k * v * vx * dt;
        vy += (32.174 - k * v * vy) * dt;
        x += vx * dt;
        y += vy * dt;
      }
    }
    const p = fitPitch(pts)!;
    const g = gravityScale(p, SOFTBALL_12)!;
    expect(g.pxPerFt / s).toBeGreaterThan(0.985);
    expect(g.pxPerFt / s).toBeLessThan(1.015);
    expect(ballSizeScale(p.ds, SOFTBALL_12)!.pxPerFt / s).toBeCloseTo(1, 1);
  });

  it("widens the band when the two rulers disagree", () => {
    const agree = combineScales([{ pxPerFt: 100, rel: 0.05, source: "a" }, { pxPerFt: 102, rel: 0.05, source: "b" }])!;
    const clash = combineScales([{ pxPerFt: 100, rel: 0.05, source: "a" }, { pxPerFt: 130, rel: 0.05, source: "b" }])!;
    expect(agree.agree).toBe(true);
    expect(agree.rel).toBeLessThan(0.05);
    expect(clash.agree).toBe(false);
    expect(clash.rel).toBeGreaterThan(0.1);
  });

  it("bat speed from the collision formula matches the certification test", () => {
    // USA/ASA lab: 25 mph pitch + 85 mph bat -> 98 mph limit.
    const e = collisionEfficiency("USA");
    const b = batSpeedFromCollision(98, 0, 25, e.eA, 0);
    expect(b.mph).toBeCloseTo(85, 0);
    expect(collisionEfficiency("USSSA").eA).toBeGreaterThan(e.eA);
  });

  it("assumes a typical phone field of view", () => {
    const c = assumedCamera(1920, 1080);
    expect(c.fPx).toBeGreaterThan(1400);
    expect(c.fPx).toBeLessThan(1600);
  });
});

describe("slo-mo speeds from rendered video", () => {
  it("measures a hit up the middle", () => {
    const { res, clip } = analyze({ evMph: 85, launchDeg: 15, sprayDeg: 0 });
    const ev = res.metrics.exitVelocity!;
    expect(ev.source).toBe("cv_estimated");
    expect(Math.abs(ev.value! - 85)).toBeLessThan(85 * 0.04);
    expect(ev.plusMinus).toBeGreaterThan(0);
    expect(Math.abs(res.metrics.launchAngle!.value! - 15)).toBeLessThanOrEqual(3);
    expect(Math.abs(res.metrics.pitchSpeed!.value! - clip.truth.pitchMph)).toBeLessThan(clip.truth.pitchMph * 0.1);
    expect(Math.abs(res.metrics.descentAngle!.value! - clip.truth.descentDeg)).toBeLessThan(5);
    expect(res.metrics.batSpeed!.source).toBe("cv_estimated");
    expect(res.timeBase).toBeNull();
    expect(Math.abs(res.contactT! - clip.contactT)).toBeLessThan(15);
  });

  it("doesn't undercount a pulled ball (moving away from the camera)", () => {
    const { res } = analyze({ evMph: 90, launchDeg: 20, sprayDeg: 25, w: 720, h: 405 });
    expect(res.debug.ev?.depthUsed).toBe(true);
    expect(Math.abs(res.metrics.exitVelocity!.value! - 90)).toBeLessThan(90 * 0.06);
  });

  it("doesn't undercount an opposite-field ball (toward the camera)", () => {
    const { res } = analyze({ evMph: 80, launchDeg: 10, sprayDeg: -20, w: 720, h: 405 });
    expect(Math.abs(res.metrics.exitVelocity!.value! - 80)).toBeLessThan(80 * 0.06);
  });

  it("works for a lefty (ball leaves to the left of the picture)", () => {
    const { res } = analyze({ evMph: 75, launchDeg: 25, sprayDeg: 5, dir: -1, w: 720, h: 405 });
    expect(Math.abs(res.metrics.exitVelocity!.value! - 75)).toBeLessThan(75 * 0.05);
    expect(Math.abs(res.metrics.launchAngle!.value! - 25)).toBeLessThanOrEqual(3);
  });

  it("stays close when the pitch has backspin the app can't see", () => {
    const { res } = analyze({ evMph: 85, launchDeg: 15, sprayDeg: 0, liftG: 0.06, w: 720, h: 405 });
    const ev = res.metrics.exitVelocity!;
    expect(Math.abs(ev.value! - 85)).toBeLessThan(85 * 0.07);
    // The ± band should cover the truth.
    expect(Math.abs(ev.value! - 85)).toBeLessThan(2.5 * ev.plusMinus!);
  });

  it("catches a wrong slow-motion setting from the pitch's fall", () => {
    // Real 240 fps frames, but timestamps as if the player said "normal speed" for an 8x slowed export.
    const { res, mt, clip } = analyze({ evMph: 85, launchDeg: 15, sprayDeg: 0, timeScale: 8, w: 720, h: 405 }, { fps: 30 });
    expect(res.timeBase).toBe(8);
    expect(res.metrics.exitVelocity!.source).toBe("unavailable");
    expect(checkTimeBase(mt.frames(), { bodyPxPerIn: null, ball: SOFTBALL_12, frameHeight: clip.h })).toBe(8);
  });

  it("says why when the video isn't slo-mo", () => {
    const { res } = analyze({ evMph: 85, launchDeg: 15, sprayDeg: 0, fps: 30, w: 720, h: 405 });
    expect(res.metrics.exitVelocity!.source).toBe("unavailable");
    expect(res.metrics.exitVelocity!.reason).toMatch(/slo-mo/i);
  });
});

describe("slo-mo speed accuracy across random hits", () => {
  it("stays within a few percent and inside its own ± band", () => {
    let seed = 11;
    const r = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const errs: number[] = [];
    let outside = 0;
    for (let i = 0; i < 12; i++) {
      const dir = r() < 0.5 ? 1 : -1;
      const o: SynthOpts = {
        evMph: 55 + r() * 55,
        launchDeg: -5 + r() * 40,
        sprayDeg: -28 + r() * 56,
        pitchMph: 18 + r() * 12,
        descentDeg: 20 + r() * 25,
        liftG: -0.05 + r() * 0.1,
        shutter: 0.05 + r() * 0.4,
        noise: 2 + r() * 5,
        dir,
        w: 720,
        h: 405,
        contact: { X: (r() - 0.3) * 1.5 * dir, Y: 0.4 + r() * 1.2, Z: 7.5 + r() * 4 },
      };
      const { res } = analyze(o);
      const ev = res.metrics.exitVelocity!;
      expect(ev.value, JSON.stringify({ o, debug: res.debug, reason: ev.reason })).not.toBeNull();
      const e = ev.value! - o.evMph;
      errs.push(Math.abs(e) / o.evMph);
      if (Math.abs(e) > 2.5 * ev.plusMinus!) outside++;
    }
    errs.sort((a, b) => a - b);
    expect(errs[errs.length >> 1]).toBeLessThan(0.03);
    expect(errs[errs.length - 1]).toBeLessThan(0.08);
    expect(outside).toBe(0);
  }, 120_000);
});
