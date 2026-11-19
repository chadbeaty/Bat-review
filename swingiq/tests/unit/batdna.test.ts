import { describe, expect, it } from "vitest";
import { MIN_SWINGS_TO_COMPARE, batOf, batStats } from "@/lib/batdna";
import type { Bat, Session, SwingRecord } from "@/lib/store/types";
import type { MetricValue, SwingAnalysis } from "@/engine/types";

const bat = (id: string): Bat => ({ id, playerId: "p", brand: "Miken", model: id, lengthIn: 34, weightOz: 27, certification: "USSSA", balance: "end-loaded", createdAt: 0 });
const mv = (key: MetricValue["key"], value: number): MetricValue => ({ key, value, source: "cv_estimated", confidence: 0.7 });

function swing(i: number, o: { batId?: string | null; sessionId?: string; score?: number; foot?: number; contact?: 0 | 1; tag?: "liner" | "grounder"; ext?: number }): SwingRecord {
  const metrics: SwingAnalysis["metrics"] = {};
  if (o.foot !== undefined) metrics.strideTiming = mv("strideTiming", o.foot);
  if (o.contact !== undefined) metrics.contact = { key: "contact", source: "measured", value: o.contact, confidence: 0.8 };
  return {
    id: `s${i}`,
    sessionId: o.sessionId ?? "sess",
    playerId: "p",
    n: i,
    at: i,
    view: "side",
    hand: "R",
    analysis: {
      phases: { stanceStart: 0, loadStart: null, strideStart: null, footPlant: null, launch: 0, contact: 0, finish: 0, contactSource: "pose" },
      metrics,
      score: { overall: o.score ?? null, components: [], categories: [{ key: "timing", label: "Timing", score: o.score ?? null, inputs: [] }] },
      cue: { id: "x", tone: "info", text: "", spoken: "", basedOn: [] },
      observations: [],
      quality: { poseFps: 30, cameraFps: 30, visibility: 1, feetVisible: true, calibrated: true },
      handPath: [],
    },
    pose: [],
    frameSize: { width: 720, height: 1280 },
    clipFrames: 0,
    batId: o.batId,
    tag: o.tag ? { type: o.tag } : undefined,
    external: o.ext !== undefined ? [{ key: "batSpeed", value: o.ext, device: "Blast", via: "manual", enteredAt: 0 }] : undefined,
  };
}

describe("Bat DNA", () => {
  const sessions = new Map<string, Session>([["old", { id: "old", playerId: "p", view: "side", startedAt: 0, endedAt: 0, swingCount: 1, bestScore: null, avgScore: null, cameraFps: 30, poseFps: 30, batId: "b1", notes: "" }]]);

  it("uses the swing's own bat, falling back to its session's", () => {
    expect(batOf(swing(1, { batId: "b2", sessionId: "old" }), sessions)).toBe("b2");
    expect(batOf(swing(2, { sessionId: "old" }), sessions)).toBe("b1");
    expect(batOf(swing(3, { batId: null, sessionId: "old" }), sessions)).toBeNull();
  });

  it("builds stats only from that bat's recorded swings and flags small samples", () => {
    const swings = [
      ...Array.from({ length: 6 }, (_, i) => swing(i, { batId: "b1", score: 70 + (i % 2) * 4, foot: 200 + i * 10, contact: i % 3 ? 1 : 0, tag: i % 2 ? "liner" : "grounder", ext: 60 + i })),
      swing(99, { batId: "b2", score: 40 }),
    ];
    const s = batStats(bat("b1"), swings, sessions);
    expect(s.swings).toBe(6);
    expect(s.enough).toBe(false);
    expect(s.needMore).toBe(MIN_SWINGS_TO_COMPARE - 6);
    expect(s.avgScore).toBe(72);
    expect(s.scoreConsistency).toBeGreaterThan(80);
    expect(s.timingSpreadMs).toBeGreaterThan(0);
    expect(s.contactRate?.n).toBe(6);
    expect(s.linerRate?.rate).toBeCloseTo(0.5);
    expect(s.batSpeed?.n).toBe(6);
    expect(s.categories.timing).toBe(72);
  });

  it("never invents bat speed or launch angle without sensor readings", () => {
    const s = batStats(bat("b2"), [swing(1, { batId: "b2", score: 60 })], sessions);
    expect(s.batSpeed).toBeNull();
    expect(s.launchAngle).toBeNull();
    expect(s.exitVelocity).toBeNull();
  });
});
