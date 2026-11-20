import { describe, expect, it } from "vitest";
import { analyzeSwing, type AnalyzeContext } from "@/engine/analyzer";
import { LEG_METRICS } from "@/engine/catalog";
import { detectSwings } from "@/engine/detector";
import { checkHand, inferHandedness } from "@/engine/handedness";
import { pickOneFix } from "@/engine/oneFix";
import type { Cue, Landmark, PoseFrame, SwingAnalysis } from "@/engine/types";
import { GUEST_DEFAULTS, answerQuestion, appMode, isEstimated, newGuest, nextQuestion, parseHeight } from "@/lib/guest";
import { DEFAULT_SETTINGS, type Player } from "@/lib/store/types";
import { GEOM, synthSwing } from "../support/synthetic";

// ---------- helpers ----------

/** MediaPipe's left/right landmark pairs (nose, 0, has no pair). */
const PAIRS: [number, number][] = [[1, 4], [2, 5], [3, 6], ...Array.from({ length: 13 }, (_, i): [number, number] => [7 + 2 * i, 8 + 2 * i])];

/** The same body seen in a mirror: a righty becomes a lefty. Optionally also flip the picture (phone on the other side). */
function mirrorBody(frames: PoseFrame[], flipImage: boolean): PoseFrame[] {
  const swap = (lm: Landmark[]) => {
    const out = lm.map((p) => ({ ...p, x: flipImage ? 1 - p.x : p.x }));
    for (const [a, b] of PAIRS) [out[a], out[b]] = [out[b], out[a]];
    return out;
  };
  return frames.map((f) => ({ ...f, lm: f.lm ? swap(f.lm) : null }));
}
/** Same hitter, phone on the other side of the plate: the picture flips, the body's left and right don't. */
const flipImage = (frames: PoseFrame[]) => frames.map((f) => ({ ...f, lm: f.lm ? f.lm.map((p) => ({ ...p, x: 1 - p.x })) : null }));

function swingOf(frames: PoseFrame[]) {
  const { swings } = detectSwings(frames, GEOM);
  expect(swings).toHaveLength(1);
  const w = swings[0];
  return { w, clip: frames.filter((f) => f.t >= w.clipStart && f.t <= w.clipEnd) };
}

const ctx = (over: Partial<AnalyzeContext> = {}): AnalyzeContext => ({
  geom: GEOM,
  hand: "R",
  view: "side",
  heightIn: GUEST_DEFAULTS.heightIn,
  cameraFps: 60,
  audioContactT: null,
  micOn: false,
  ...over,
});

const cue = (id: string, tone: Cue["tone"], basedOn: Cue["basedOn"]): Cue => ({ id, tone, text: id, spoken: id, basedOn });
const analysisWith = (observations: Cue[]): Pick<SwingAnalysis, "cue" | "observations"> => ({ cue: observations[0], observations });

// ---------- default profile ----------

describe("Just Hit: default profile", () => {
  it("a guest starts on the documented defaults, marked as assumed", () => {
    const g = newGuest("g1", 1000);
    expect(g).toMatchObject({ id: "g1", name: "Guest", heightIn: 69, hand: "R", guest: true, createdAt: 1000 });
    expect(g.assumed).toEqual(["heightIn", "hand"]);
    expect(isEstimated(g)).toBe(true);
  });

  it("the default height is inside what the profile form accepts", () => {
    expect(GUEST_DEFAULTS.heightIn).toBeGreaterThanOrEqual(48);
    expect(GUEST_DEFAULTS.heightIn).toBeLessThanOrEqual(90);
  });

  it("the analyzer runs end to end on the defaults and gives a score, a cue and calibrated legs numbers", () => {
    const { w, clip } = swingOf(synthSwing({ fps: 60, heightIn: 72 }).frames);
    const g = newGuest("g");
    const a = analyzeSwing(clip, w, ctx({ hand: g.hand, heightIn: g.heightIn }));
    expect(a.score.overall).not.toBeNull();
    expect(a.cue.text.length).toBeGreaterThan(0);
    expect(a.quality.calibrated).toBe(true);
    expect(a.metrics.strideTiming?.value).not.toBeNull();
  });

  it("a wrong default height scales inches but leaves timing and the score alone", () => {
    // True height 74"; the guest default reads it as 69".
    const { w, clip } = swingOf(synthSwing({ fps: 60, heightIn: 74, strideIn: 10 }).frames);
    const real = analyzeSwing(clip, w, ctx({ heightIn: 74 }));
    const guess = analyzeSwing(clip, w, ctx({ heightIn: GUEST_DEFAULTS.heightIn }));
    expect(guess.metrics.strideTiming?.value).toBe(real.metrics.strideTiming?.value);
    expect(guess.score.overall).toBe(real.score.overall);
    const ratio = guess.metrics.strideLength!.value! / real.metrics.strideLength!.value!;
    expect(ratio).toBeCloseTo(69 / 74, 2);
  });
});

// ---------- guest mode ----------

describe("Just Hit: guest mode and the progressive profile", () => {
  it("asks one thing at a time: height, then side, then name, then nothing", () => {
    let p: Player = newGuest("g");
    expect(nextQuestion(p)).toBe("heightIn");
    p = answerQuestion(p, { field: "heightIn", value: 73 });
    expect(nextQuestion(p)).toBe("hand");
    p = answerQuestion(p, { field: "hand", value: "L" });
    expect(nextQuestion(p)).toBe("name");
    p = answerQuestion(p, { field: "name", value: "  Chad  " });
    expect(nextQuestion(p)).toBeNull();
    expect(p).toMatchObject({ name: "Chad", heightIn: 73, hand: "L", guest: false, assumed: [] });
  });

  it("the first answer upgrades the guest to a normal hitter with the same id (their swings stay theirs)", () => {
    const g = newGuest("keep-me", 5);
    const p = answerQuestion(g, { field: "heightIn", value: 70 });
    expect(p.id).toBe("keep-me");
    expect(p.createdAt).toBe(5);
    expect(p.guest).toBe(false);
    // Side is still a default, so results stay labelled as estimates until it's answered.
    expect(p.assumed).toEqual(["hand"]);
    expect(isEstimated(p)).toBe(true);
    expect(isEstimated(answerQuestion(p, { field: "hand", value: "R" }))).toBe(false);
  });

  it("never asks a hitter who did the full setup", () => {
    const full: Player = { id: "f", name: "Sam", hand: "R", heightIn: 70, createdAt: 0 };
    expect(nextQuestion(full)).toBeNull();
    expect(isEstimated(full)).toBe(false);
  });

  it("an empty name keeps the old one", () => {
    expect(answerQuestion(newGuest("g"), { field: "name", value: "   " }).name).toBe("Guest");
  });

  it("parses height like the profile form", () => {
    expect(parseHeight("5", "11")).toBe(71);
    expect(parseHeight("6", "")).toBe(72);
    expect(parseHeight("", "10")).toBeNull();
    expect(parseHeight("9", "0")).toBeNull();
  });

  it("opens on Just Hit for new hitters and guests, keeps existing full-profile hitters on the dashboard, and obeys the setting", () => {
    const full: Player = { id: "f", name: "Sam", hand: "R", heightIn: 70, createdAt: 0 };
    expect(appMode(DEFAULT_SETTINGS, null)).toBe("simple");
    expect(appMode(DEFAULT_SETTINGS, newGuest("g"))).toBe("simple");
    expect(appMode(DEFAULT_SETTINGS, full)).toBe("full");
    expect(appMode({ appMode: "simple" }, full)).toBe("simple");
    expect(appMode({ appMode: "full" }, newGuest("g"))).toBe("full");
  });
});

// ---------- batting side from the swing ----------

describe("Just Hit: batting side read from a side-view swing", () => {
  const righty = synthSwing({ fps: 60 }).frames;

  it("reads a righty as a righty", () => {
    const { w, clip } = swingOf(righty);
    expect(inferHandedness(clip, w, GEOM)).toMatchObject({ hand: "R" });
    expect(inferHandedness(clip, w, GEOM)!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("reads the mirror image as a lefty, whichever side of the plate the phone is on", () => {
    for (const flip of [true, false]) {
      const { w, clip } = swingOf(mirrorBody(righty, flip));
      expect(inferHandedness(clip, w, GEOM)).toMatchObject({ hand: "L" });
    }
  });

  it("a righty filmed from the other side is still a righty", () => {
    const { w, clip } = swingOf(flipImage(righty));
    expect(inferHandedness(clip, w, GEOM)).toMatchObject({ hand: "R" });
  });

  it("re-reads a lefty's swing as a lefty when the guest default said right", () => {
    const { w, clip } = swingOf(mirrorBody(righty, true));
    const asDefault = analyzeSwing(clip, w, ctx({ hand: "R" }));
    const checked = checkHand(clip, w, ctx({ hand: "R" }), asDefault);
    expect(checked.hand).toBe("L");
    expect(checked.analysis).not.toBe(asDefault);
    // Read as a lefty, the mirrored swing matches the original righty's legs numbers.
    const original = swingOf(righty);
    const truth = analyzeSwing(original.clip, original.w, ctx({ hand: "R" }));
    expect(checked.analysis.metrics.strideTiming?.value).toBeCloseTo(truth.metrics.strideTiming!.value!, 0);
    expect(checked.analysis.metrics.frontLegBlock?.value).toBeCloseTo(truth.metrics.frontLegBlock!.value!, 0);
  });

  it("leaves the analysis alone when the side already matches, or outside side view", () => {
    const { w, clip } = swingOf(righty);
    const a = analyzeSwing(clip, w, ctx());
    expect(checkHand(clip, w, ctx(), a)).toMatchObject({ hand: "R", analysis: a });
    const front = analyzeSwing(clip, w, ctx({ view: "front" }));
    expect(checkHand(clip, w, ctx({ view: "front" }), front)).toMatchObject({ hand: "R", analysis: front, guess: null });
  });

  it("says nothing when there's too little to go on", () => {
    expect(inferHandedness(righty.slice(0, 4), { launch: 0, peak: 100 }, GEOM)).toBeNull();
  });
});

// ---------- the one fix ----------

describe("Just Hit: the one fix", () => {
  it("puts a legs-and-feet fault ahead of a worse upper-body one", () => {
    const f = pickOneFix(analysisWith([cue("handDrop", "fix", ["handDrop"]), cue("head", "fix", ["headMovement"]), cue("lateFoot", "fix", ["strideTiming"])]));
    expect(f).toMatchObject({ kind: "fix", legs: true });
    expect(f.cue.id).toBe("lateFoot");
  });

  it("among legs faults, keeps the analyzer's ranking", () => {
    const f = pickOneFix(analysisWith([cue("softFront", "fix", ["frontLegBlock"]), cue("happyFeet", "fix", ["frontFootSlide"])]));
    expect(f.cue.id).toBe("softFront");
  });

  it("counts drifting forward as a legs fault (it's read from weight shift)", () => {
    const f = pickOneFix(analysisWith([cue("barCast", "fix", ["handCast"]), cue("drift", "fix", ["weightShift", "headMovement"])]));
    expect(f.cue.id).toBe("drift");
  });

  it("falls back to the worst fault when no legs fault fired", () => {
    const f = pickOneFix(analysisWith([cue("handDrop", "fix", ["handDrop"]), cue("head", "fix", ["headMovement"])]));
    expect(f).toMatchObject({ kind: "fix", legs: false });
    expect(f.cue.id).toBe("handDrop");
  });

  it("skips praise sitting ahead of a fault (an improvement can rank first)", () => {
    const f = pickOneFix(analysisWith([cue("drift-better", "praise", ["weightShift"]), cue("head", "fix", ["headMovement"])]));
    expect(f.cue.id).toBe("head");
  });

  it("with nothing to fix, shows the top praise as a keeper", () => {
    const f = pickOneFix(analysisWith([cue("goodLegs", "praise", ["strideTiming", "frontLegBlock"]), cue("balanced", "praise", ["balance"])]));
    expect(f).toMatchObject({ kind: "keep", legs: true });
    expect(f.cue.id).toBe("goodLegs");
  });

  it("works on a swing with no observations (tracking dropped)", () => {
    const logged = cue("logged", "info", []);
    expect(pickOneFix({ cue: logged, observations: [] })).toMatchObject({ kind: "keep", cue: logged });
  });

  it("on a real analyzed swing, picks a legs fault when one fired", () => {
    // A late front foot (still landing as the hands go) and a big hand drop.
    const { w, clip } = swingOf(synthSwing({ fps: 60, handDropIn: 6, leadKneePlant: 165, leadKneeContact: 140 }).frames);
    const a = analyzeSwing(clip, w, ctx());
    const fixes = a.observations.filter((c) => c.tone === "fix");
    const f = pickOneFix(a);
    if (fixes.some((c) => c.basedOn.some((k) => LEG_METRICS.includes(k)))) {
      expect(f.legs).toBe(true);
      expect(f.kind).toBe("fix");
    } else {
      expect(f.cue).toEqual(fixes[0] ?? a.cue);
    }
    expect(a.observations).toContainEqual(f.cue);
  });
});
