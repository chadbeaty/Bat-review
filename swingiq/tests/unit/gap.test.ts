import { describe, expect, it } from "vitest";
import { GAP_MIN_CONFIDENCE, gapDisplay, gapReading, gapSpoken, gapVerdict, scoreboardSpeech } from "@/engine/gap";
import type { MetricValue, SwingAnalysis } from "@/engine/types";
import { FOOT_DOWN_WINDOW } from "@/lib/insights";

type In = Pick<SwingAnalysis, "phases" | "metrics" | "quality">;

function swing({ footPlant = 1000 as number | null, contact = 1210, conf = 0.7, fps = 30, st }: { footPlant?: number | null; contact?: number; conf?: number; fps?: number; st?: MetricValue | null } = {}): In {
  const strideTiming: MetricValue | undefined =
    st === null ? undefined : st ?? { key: "strideTiming", source: "cv_estimated", value: footPlant === null ? null : contact - footPlant, confidence: conf };
  return {
    phases: { stanceStart: 0, loadStart: null, strideStart: 800, footPlant, launch: 1050, contact, finish: 1500, contactSource: "pose" },
    metrics: strideTiming ? { strideTiming } : {},
    quality: { poseFps: fps, cameraFps: fps, visibility: 0.9, feetVisible: true, calibrated: true } as In["quality"],
  };
}

describe("gap timer", () => {
  it("reads foot down to contact in seconds, rounded to hundredths, with ± one frame", () => {
    const g = gapReading(swing({ footPlant: 1000, contact: 1207 }));
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.seconds).toBe(0.21);
    expect(g.plusMinus).toBe(0.04); // one frame at 30 fps = 0.033 s, rounded up
    expect(g.fps).toBe(30);
    expect(g.source).toBe("cv_estimated");
    expect(g.confidence).toBe(0.7);
    expect(g.verdict).toBe("window");
  });

  it("tightens the ± at 60 fps", () => {
    const g = gapReading(swing({ fps: 60 }));
    expect(g.ok && g.plusMinus).toBe(0.02);
  });

  it("falls back to 30 fps when the tracking rate is unknown", () => {
    const g = gapReading(swing({ fps: 0 }));
    expect(g.ok && g.fps).toBe(30);
  });

  it("shows a dash when foot down wasn't found", () => {
    const g = gapReading(swing({ footPlant: null, st: null }));
    expect(g.ok).toBe(false);
    if (g.ok) return;
    expect(g.short).toBe("Foot down not found");
    expect(g.source).toBe("unavailable");
  });

  it("passes on the reason when the feet weren't in view", () => {
    const g = gapReading(
      swing({ footPlant: null, st: { key: "strideTiming", source: "unavailable", value: null, confidence: 0, reason: "Your feet weren't visible. Move the phone back." } }),
    );
    expect(!g.ok && g.short).toBe("Feet not in view");
    expect(!g.ok && g.reason).toMatch(/feet weren't visible/);
  });

  it("says when there was no stride to time", () => {
    const g = gapReading(
      swing({ footPlant: null, st: { key: "strideTiming", source: "unavailable", value: null, confidence: 0, reason: "No stride or toe tap, so there's no foot-down moment to time." } }),
    );
    expect(!g.ok && g.short).toBe("No stride to time");
  });

  it("refuses a low-confidence reading", () => {
    const g = gapReading(swing({ conf: GAP_MIN_CONFIDENCE - 0.01 }));
    expect(!g.ok && g.short).toBe("Low confidence");
    expect(gapReading(swing({ conf: GAP_MIN_CONFIDENCE })).ok).toBe(true);
  });

  it("refuses when there's no strideTiming metric to vouch for it", () => {
    expect(gapReading(swing({ st: null })).ok).toBe(false);
  });

  it("handles contact before foot down", () => {
    const g = gapReading(swing({ footPlant: 1300, contact: 1210 }));
    expect(!g.ok && g.short).toBe("Foot not down at contact");
  });

  it("counts a foot landing exactly at contact as a zero gap", () => {
    const g = gapReading(swing({ footPlant: 1210, contact: 1210 }));
    expect(g.ok && g.seconds).toBe(0);
    expect(g.ok && g.verdict).toBe("quick");
  });

  it("ignores a foot down far too early to belong to the swing", () => {
    expect(gapReading(swing({ footPlant: 0, contact: 2000 })).ok).toBe(false);
  });

  it("judges against the slow-pitch window, not baseball's", () => {
    expect(gapVerdict(0.2).verdict).toBe("window");
    expect(gapVerdict(0.1).verdict).toBe("quick");
    expect(gapVerdict(0.5).verdict).toBe("waited");
    // Same window the rest of the app uses.
    expect(gapVerdict(FOOT_DOWN_WINDOW.lo / 1000).verdict).toBe("window");
    expect(gapVerdict(FOOT_DOWN_WINDOW.hi / 1000).verdict).toBe("window");
  });

  it("formats for the board and the voice", () => {
    expect(gapDisplay(0.2)).toBe("0.20");
    expect(gapSpoken(0.21)).toBe("point two one");
    expect(gapSpoken(0.4)).toBe("point four oh");
    expect(gapSpoken(1.05)).toBe("one point oh five");
  });

  it("builds the scoreboard callout", () => {
    const ok = gapReading(swing({ footPlant: 1000, contact: 1210 }));
    expect(scoreboardSpeech(72, ok, "Hands dropped.")).toBe("72. Gap, point two one. Hands dropped.");
    const no = gapReading(swing({ footPlant: null, st: null }));
    expect(scoreboardSpeech(72, no, "Hands dropped.")).toBe("72. Hands dropped.");
    expect(scoreboardSpeech(null, no, "Stay in view.")).toBe("Stay in view.");
  });
});
