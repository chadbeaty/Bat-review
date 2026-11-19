import type { CameraView, Cue, MetricKey, MetricValue } from "./types";

type Metrics = Partial<Record<MetricKey, MetricValue>>;

export type CueContext = {
  view: CameraView;
  micOn: boolean;
  /** Previous swing's metrics, for "better than last time". */
  previous?: Metrics;
  /** Head movement toward the pitcher (+) and downward (+), inches, from the analyzer. */
  headFwdIn: number;
  headDownIn: number;
};

const val = (m: Metrics, k: MetricKey, minConf = 0.3): number | null => {
  const mv = m[k];
  if (!mv || mv.source === "unavailable" || mv.value === null || mv.confidence < minConf) return null;
  return mv.value;
};

type Rule = {
  id: string;
  basedOn: MetricKey[];
  /** Returns how far past the line this swing is (>0 means the cue applies; bigger is worse). */
  severity: (m: Metrics, c: CueContext) => number;
  text: string;
  spoken: string;
  /** Said instead when last swing had this problem and this one doesn't. */
  improved: { text: string; spoken: string };
};

/**
 * Slow-pitch cue rules. The pitch drops in on a 6–12 ft arc, so the classic faults are getting out front
 * (drifting/lunging, which rolls the hands over into pull-side grounders), dropping the hands, and pulling the
 * head off the ball. Every rule is tied to a measured metric; nothing here fires without data behind it.
 */
const RULES: Rule[] = [
  {
    id: "drift",
    basedOn: ["weightShift", "headMovement"],
    severity: (m, c) => {
      const ws = val(m, "weightShift");
      const byWeight = ws !== null ? (ws - 95) / 20 : 0;
      const byHead = c.view === "side" && val(m, "headMovement") !== null ? (c.headFwdIn - 5) / 4 : 0;
      return Math.max(byWeight, byHead);
    },
    text: "You drifted forward onto your front side. Let the ball travel down the arc and stay back on your legs.",
    spoken: "Stay back. Let it travel.",
    improved: { text: "Better: you stayed back this time instead of drifting forward.", spoken: "Better. You stayed back." },
  },
  {
    id: "handDrop",
    basedOn: ["handDrop"],
    severity: (m) => {
      const v = val(m, "handDrop");
      return v === null ? 0 : (v - 4) / 3;
    },
    text: "Your hands dropped during the load. Keep them at shoulder height as you start the swing.",
    spoken: "Hands dropped. Keep them up.",
    improved: { text: "Better: your hands stayed up through the load.", spoken: "Better. Hands stayed up." },
  },
  {
    id: "head",
    basedOn: ["headMovement"],
    severity: (m) => {
      const v = val(m, "headMovement");
      return v === null ? 0 : (v - 6) / 4;
    },
    text: "Your head moved a lot before contact. Keep it quiet so your eyes stay on the ball longer.",
    spoken: "Quiet head.",
    improved: { text: "Better: your head stayed much quieter this time.", spoken: "Better. Quiet head." },
  },
  {
    id: "balance",
    basedOn: ["balance"],
    severity: (m) => {
      const v = val(m, "balance");
      return v === null ? 0 : (55 - v) / 25;
    },
    text: "You came off balance at the finish. Swing at a speed you can hold your finish with.",
    spoken: "Hold your finish.",
    improved: { text: "Better: you held your finish.", spoken: "Better balance." },
  },
  {
    id: "armsFirst",
    basedOn: ["sequence"],
    severity: (m) => {
      const v = val(m, "sequence", 0.35);
      return v === 0 ? 0.6 : 0;
    },
    text: "Your arms started before your hips. Let your hips start the swing and the hands follow.",
    spoken: "Hips first.",
    improved: { text: "Better: your hips led the swing.", spoken: "Better. Hips led." },
  },
  {
    id: "overstride",
    basedOn: ["strideLength"],
    severity: (m) => {
      const v = val(m, "strideLength");
      return v === null ? 0 : (v - 20) / 8;
    },
    text: "That was a long stride. Shorten it to keep your head and eyes steady.",
    spoken: "Shorter stride.",
    improved: { text: "Better: shorter, more controlled stride.", spoken: "Better stride." },
  },
  {
    id: "lateFoot",
    basedOn: ["strideTiming"],
    severity: (m) => {
      const v = val(m, "strideTiming");
      return v === null ? 0 : (-40 - v) / 80;
    },
    text: "Your front foot was still moving when you swung. Get it down earlier, as the ball starts down from its peak.",
    spoken: "Get the foot down early.",
    improved: { text: "Better: your front foot was down before you swung.", spoken: "Better. Foot down early." },
  },
  {
    id: "noSeparation",
    basedOn: ["separation"],
    severity: (m) => {
      const v = val(m, "separation", 0.35);
      return v === null ? 0 : (5 - v) / 10;
    },
    text: "Your hips and shoulders turned together. Let the hips open a beat before the shoulders.",
    spoken: "Hips, then shoulders.",
    improved: { text: "Better: your hips opened ahead of your shoulders.", spoken: "Better separation." },
  },
];

export function buildCues(m: Metrics, c: CueContext): Cue[] {
  const fixes = RULES.map((r) => ({ r, sev: r.severity(m, c) }))
    .filter((x) => x.sev > 0)
    .sort((a, b) => b.sev - a.sev)
    .map(({ r }): Cue => ({ id: r.id, tone: "fix", text: r.text, spoken: r.spoken, basedOn: r.basedOn }));

  const improvements: Cue[] = [];
  if (c.previous) {
    for (const r of RULES) {
      const was = r.severity(c.previous, c);
      const now = r.severity(m, c);
      if (was > 0.15 && now <= -0.25) improvements.push({ id: `${r.id}-better`, tone: "praise", ...r.improved, basedOn: r.basedOn });
    }
  }

  const praise: Cue[] = [];
  const bal = val(m, "balance");
  const head = val(m, "headMovement");
  if (bal !== null && bal >= 85 && head !== null && head <= 3) {
    praise.push({
      id: "solid",
      tone: "praise",
      text: "Solid swing. Your head stayed quiet and you held a balanced finish.",
      spoken: "Good swing. Great balance.",
      basedOn: ["balance", "headMovement"],
    });
  } else if (bal !== null && bal >= 80) {
    praise.push({ id: "balanced", tone: "praise", text: "Good balance through the finish.", spoken: "Good balance.", basedOn: ["balance"] });
  }

  const info: Cue[] = [];
  if (c.micOn && m.contact?.value === 0) {
    info.push({
      id: "noContact",
      tone: "info",
      text: "No contact heard. On a miss, track the ball all the way down the arc into the zone.",
      spoken: "Track it down.",
      basedOn: ["contact"],
    });
  }

  // One primary cue: a real fault comes first, then an improvement, then praise, then info.
  const ordered = [...fixes.slice(0, 1), ...improvements, ...fixes.slice(1), ...praise, ...info];
  if (ordered.length === 0) {
    ordered.push({
      id: "logged",
      tone: "info",
      text: "Swing logged. Nothing stood out. Keep that same rhythm.",
      spoken: "Swing logged.",
      basedOn: [],
    });
  }
  return ordered;
}
