import { describe, expect, it } from "vitest";
import { ContactListener } from "@/engine/contact";
import { applyExternal, validExternal } from "@/engine/external";
import { challengeProgress, coachingFor } from "@/engine/coaching";
import { scoreSwing } from "@/engine/scoring";
import { evaluateSetup, luminance, readyToBat } from "@/engine/setup";
import type { Landmark, MetricValue } from "@/engine/types";
import { shouldSpeak } from "@/live/voice";
import { swingRows } from "@/lib/sync";
import { synthSwing } from "../support/synthetic";

describe("contact listener", () => {
  it("hears a sharp crack over cage noise and ignores the noise", () => {
    const c = new ContactListener();
    let onsets = 0;
    let t = 0;
    for (let i = 0; i < 400; i++, t += 3) if (c.push(t, 0.004 + (i % 7) * 0.0005) !== null) onsets++;
    expect(onsets).toBe(0);
    expect(c.push(t, 0.2)).toBe(t);
    // Ringing right after the crack doesn't count again.
    expect(c.push(t + 3, 0.15)).toBeNull();
  });

  it("finds the contact inside a swing window only", () => {
    const c = new ContactListener();
    for (let t = 0; t < 1200; t += 3) c.push(t, 0.003);
    c.push(1200, 0.3);
    for (let t = 1203; t < 3000; t += 3) c.push(t, 0.003);
    c.push(3000, 0.25);
    expect(c.contactIn(1100, 1400)).toBe(1200);
    expect(c.contactIn(1500, 2900)).toBeNull();
  });
});

describe("setup checks", () => {
  const lm = synthSwing({ noSwing: true }).frames[0].lm as Landmark[];
  const base = { view: "side" as const, recent: Array(12).fill(lm), aspect: 720 / 1280, brightness: { mean: 120, clipped: 0 }, shifts: Array(10).fill(1), cameraFps: 30, poseFps: 30 };

  it("passes a good setup", () => {
    const checks = evaluateSetup(base);
    expect(checks.every((c) => c.status === "ok")).toBe(true);
    expect(readyToBat(checks)).toBe(true);
  });

  it("flags darkness, a shaky phone, slow tracking and an empty frame", () => {
    const byId = (cs: ReturnType<typeof evaluateSetup>, id: string) => cs.find((c) => c.id === id)!.status;
    expect(byId(evaluateSetup({ ...base, brightness: { mean: 20, clipped: 0 } }), "light")).toBe("bad");
    expect(byId(evaluateSetup({ ...base, shifts: Array(10).fill(14) }), "steady")).toBe("bad");
    expect(byId(evaluateSetup({ ...base, poseFps: 10 }), "fps")).toBe("bad");
    const empty = evaluateSetup({ ...base, recent: Array(12).fill(null) });
    expect(byId(empty, "body")).toBe("bad");
    expect(readyToBat(empty)).toBe(false);
  });

  it("warns when the angle doesn't match the chosen view", () => {
    // The synthetic hitter faces the camera (side view), so "behind" should be flagged.
    expect(evaluateSetup({ ...base, view: "behind" }).find((c) => c.id === "angle")!.status).toBe("warn");
  });

  it("measures brightness", () => {
    const dark = new Uint8ClampedArray(4 * 16).fill(10);
    const bright = new Uint8ClampedArray(4 * 16).fill(200);
    expect(luminance(dark).mean).toBeLessThan(luminance(bright).mean);
  });
});

describe("scoring", () => {
  const mv = (key: MetricValue["key"], value: number, confidence = 0.8): MetricValue => ({ key, value, confidence, source: "cv_estimated" });

  it("needs at least two categories and three checks", () => {
    expect(scoreSwing({ balance: mv("balance", 90) }, "side").overall).toBeNull();
    expect(scoreSwing({ balance: mv("balance", 90), headMovement: mv("headMovement", 1) }, "side").overall).toBeNull();
    const s = scoreSwing({ balance: mv("balance", 90), headMovement: mv("headMovement", 1), strideTiming: mv("strideTiming", 220) }, "side");
    expect(s.overall).toBeGreaterThan(85);
  });

  it("breaks the score into six categories and marks unmeasured ones", () => {
    const s = scoreSwing({ balance: mv("balance", 80), headMovement: mv("headMovement", 2), strideTiming: mv("strideTiming", 60) }, "side");
    const byKey = Object.fromEntries((s.categories ?? []).map((c) => [c.key, c]));
    expect(Object.keys(byKey).sort()).toEqual(["balance", "batPath", "contact", "followThrough", "rotation", "timing"]);
    expect(byKey.timing.score).toBeLessThan(60);
    expect(byKey.rotation.score).toBeNull();
    expect(byKey.rotation.reason).toBeTruthy();
    expect(byKey.balance.inputs).toContain("Quiet head");
  });

  it("skips unavailable metrics", () => {
    const s = scoreSwing(
      { balance: mv("balance", 80), headMovement: mv("headMovement", 2), weightShift: { key: "weightShift", value: null, confidence: 0, source: "unavailable" } },
      "side",
    );
    expect(s.components.map((c) => c.key)).not.toContain("stayBack");
  });

  it("punishes drifting past the front foot", () => {
    const base = { balance: mv("balance", 80), strideTiming: mv("strideTiming", 220) };
    const ok = scoreSwing({ ...base, weightShift: mv("weightShift", 60) }, "side").overall!;
    const drift = scoreSwing({ ...base, weightShift: mv("weightShift", 120) }, "side").overall!;
    expect(drift).toBeLessThan(ok);
  });
});

describe("external sensors", () => {
  it("overlays a valid radar reading as a sensor value and rejects nonsense", () => {
    expect(validExternal({ key: "exitVelocity", value: 82 })).toBe(true);
    expect(validExternal({ key: "exitVelocity", value: 400 })).toBe(false);
    const out = applyExternal(
      { exitVelocity: { key: "exitVelocity", value: null, confidence: 0, source: "unavailable" } },
      [{ key: "exitVelocity", value: 82, device: "Pocket Radar", via: "manual", enteredAt: 1 }],
    );
    expect(out.exitVelocity?.source).toBe("sensor");
    expect(out.exitVelocity?.value).toBe(82);
  });
});

describe("voice frequency", () => {
  it("follows the setting", () => {
    expect(shouldSpeak("every", 1, false)).toBe(true);
    expect(shouldSpeak("fixes", 1, false)).toBe(false);
    expect(shouldSpeak("fixes", 1, true)).toBe(true);
    expect(shouldSpeak("every3", 2, true)).toBe(false);
    expect(shouldSpeak("every3", 3, false)).toBe(true);
  });
});

describe("cloud sync mapping", () => {
  it("keeps sources, nulls unavailable values and times events from contact", async () => {
    const { analyzeSwing } = await import("@/engine/analyzer");
    const { detectSwings } = await import("@/engine/detector");
    const s = synthSwing();
    const [w] = detectSwings(s.frames, s.geom).swings;
    const a = analyzeSwing(s.frames.filter((f) => f.t >= w.clipStart && f.t <= w.clipEnd), w, {
      geom: s.geom,
      hand: "R",
      view: "side",
      heightIn: 70,
      cameraFps: 30,
      audioContactT: null,
      micOn: false,
    });
    const rows = swingRows(
      { id: "c1", sessionId: "s", playerId: "p", n: 1, at: 0, view: "side", hand: "R", analysis: a, pose: [], frameSize: s.geom, clipFrames: 0 },
      "remote-session",
      "remote-player",
    );
    const bat = rows.metrics.find((m) => m.metric_key === "batSpeed")!;
    expect(bat.source).toBe("unavailable");
    expect(bat.value).toBeNull();
    expect(rows.events.find((e) => e.event === "contact")!.t_ms).toBe(0);
    expect(rows.events.find((e) => e.event === "launch")!.t_ms).toBeLessThan(0);
  });
});

describe("coach", () => {
  const mv = (key: MetricValue["key"], value: number): MetricValue => ({ key, value, confidence: 0.7, source: "cv_estimated" });

  it("turns the biggest issue into why, fix, drill and a 10-swing challenge", () => {
    const c = coachingFor({ id: "lateFoot", tone: "fix", text: "Get the foot down sooner.", spoken: "", basedOn: ["strideTiming"] }, {}, 60);
    expect(c.title).toMatch(/late/i);
    expect(c.why.length).toBeGreaterThan(40);
    expect(c.drill.name).toBeTruthy();
    expect(c.challenge.metric).toBe("strideTiming");
    expect(c.challenge.test({ strideTiming: mv("strideTiming", 220) })).toBe(true);
    expect(c.challenge.test({ strideTiming: mv("strideTiming", 40) })).toBe(false);
    // Swings where the metric wasn't measured don't count either way.
    expect(c.challenge.test({})).toBeNull();
  });

  it("counts challenge progress only on measured swings", () => {
    const c = coachingFor({ id: "head", tone: "fix", text: "", spoken: "", basedOn: [] }, {}, null).challenge;
    const run = [{ headMovement: mv("headMovement", 2) }, { headMovement: mv("headMovement", 6) }, {}, { headMovement: mv("headMovement", 3) }];
    expect(challengeProgress(c, run)).toEqual({ counted: 3, passed: 2 });
  });

  it("asks for a repeatable swing when nothing needs fixing", () => {
    const c = coachingFor({ id: "solid", tone: "praise", text: "Solid swing.", spoken: "", basedOn: [] }, {}, 82);
    expect(c.issueId).toBe("repeat");
    expect(c.challenge.goal).toContain("77");
  });
});
