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
  /** Player's leg length in inches (hip to ankle), for scaling leg rules. */
  legIn?: number;
  /** Front foot was still landing when the hands started. */
  lateFoot?: boolean;
  /** Ankle-to-ankle width at foot plant ÷ stance width (side view). */
  widthRatio?: number | null;
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
    id: "lateFoot",
    basedOn: ["strideTiming"],
    // Elite slow-pitch hitters land the front heel ~0.2 s before contact (Wu et al.); under ~0.1 s the foot is
    // still landing while the hands go.
    severity: (m, c) => {
      const v = val(m, "strideTiming");
      if (v === null) return 0;
      return Math.max((100 - v) / 80, c.lateFoot && v < 140 ? 0.3 : 0);
    },
    text: "Your front foot was still landing as you swung. Start your step at the top of the arc so it's down as the ball comes in.",
    spoken: "Get the foot down sooner.",
    improved: { text: "Better: your front foot was down in time.", spoken: "Better. Foot down on time." },
  },
  {
    id: "strideWait",
    basedOn: ["strideTiming"],
    severity: (m) => {
      const v = val(m, "strideTiming");
      return v === null ? 0 : (v - 450) / 250;
    },
    text: "You landed early and waited. Start your stride a touch later, as the ball starts down, so foot-down flows right into the swing.",
    spoken: "Foot down, go.",
    improved: { text: "Better: foot-down flowed right into your swing.", spoken: "Better rhythm." },
  },
  {
    id: "softFront",
    basedOn: ["frontLegBlock"],
    // Coaches split on straight vs. slightly bent at contact, so only a knee that keeps collapsing after plant is a fault.
    severity: (m) => {
      const v = val(m, "frontLegBlock", 0.2);
      return v === null ? 0 : (-8 - v) / 12;
    },
    text: "Your front knee kept bending after your foot landed. Plant and firm up the front leg so your hips can turn against it.",
    spoken: "Firm front side.",
    improved: { text: "Better: your front leg firmed up into contact.", spoken: "Better. Firm front side." },
  },
  {
    id: "backCollapse",
    basedOn: ["backKnee"],
    severity: (m) => {
      const v = val(m, "backKnee", 0.2);
      return v === null ? 0 : (100 - v) / 20;
    },
    text: "Your back leg collapsed under you. Stay taller on the back side and drive the back knee toward the front knee.",
    spoken: "Stay tall on the back side.",
    improved: { text: "Better: you stayed taller on your back side.", spoken: "Better. Stayed tall." },
  },
  {
    id: "happyFeet",
    basedOn: ["frontFootSlide"],
    severity: (m) => {
      const v = val(m, "frontFootSlide");
      return v === null ? 0 : (v - 4) / 3;
    },
    text: "Your front foot kept moving after it landed. Plant it early and turn around it.",
    spoken: "Plant and turn.",
    improved: { text: "Better: your front foot stayed planted.", spoken: "Better. Planted." },
  },
  {
    id: "barCast",
    basedOn: ["handCast"],
    severity: (m) => {
      const v = val(m, "handCast", 0.25);
      return v === null ? 0 : (v - 40) / 25;
    },
    text: "Your hands pushed away from your body before your hips turned. Keep them tight until the hips start.",
    spoken: "Hands tight. Hips first.",
    improved: { text: "Better: your hands stayed tight to your body.", spoken: "Better. Hands tight." },
  },
  {
    id: "shoulderDrop",
    basedOn: ["shoulderDrop"],
    severity: (m) => {
      const v = val(m, "shoulderDrop", 0.25);
      return v === null ? 0 : (v - 40) / 12;
    },
    text: "Your back shoulder dropped a lot at contact. Keep your shoulders more level and drive through the middle of the ball.",
    spoken: "Level shoulders.",
    improved: { text: "Better: your shoulders stayed more level.", spoken: "Better. Level shoulders." },
  },
  {
    id: "uppercut",
    basedOn: ["handPathAngle"],
    severity: (m) => {
      const v = val(m, "handPathAngle", 0.25);
      return v === null ? 0 : (v - 30) / 12;
    },
    text: "Your hands were swinging steeply upward through contact. Flatten it out: aim for line drives up the middle, not lift.",
    spoken: "Flatter. Line drives.",
    improved: { text: "Better: a flatter path through contact.", spoken: "Better. Flatter path." },
  },
  {
    id: "chop",
    basedOn: ["handPathAngle"],
    severity: (m) => {
      const v = val(m, "handPathAngle", 0.25);
      return v === null ? 0 : (-12 - v) / 10;
    },
    text: "Your hands were moving down through contact. Stay behind the ball and match its path with a slightly upward swing.",
    spoken: "Stay behind it. Finish high.",
    improved: { text: "Better: your hands came through level or slightly up.", spoken: "Better path." },
  },
  {
    id: "contactDeep",
    basedOn: ["contactPoint"],
    severity: (m) => {
      const v = val(m, "contactPoint", 0.3);
      return v === null ? 0 : (-3 - v) / 5;
    },
    text: "You made contact with your hands behind your front hip. Get the foot down a beat earlier so you meet the ball out in front.",
    spoken: "Meet it out front.",
    improved: { text: "Better: you met the ball out in front.", spoken: "Better. Out front." },
  },
  {
    id: "overstride",
    basedOn: ["strideLength"],
    severity: (_m, c) => (c.widthRatio ? (c.widthRatio - 1.6) / 0.4 : 0),
    text: "Long stride: your feet got much wider than your stance. Take a shorter step with the same timing to keep your head and eyes steady.",
    spoken: "Shorter step.",
    improved: { text: "Better: shorter, more controlled stride.", spoken: "Better stride." },
  },
];

export function buildCues(m: Metrics, c: CueContext): Cue[] {
  const fixes = RULES.map((r) => ({ r, sev: r.severity(m, c) }))
    .filter((x) => x.sev > 0)
    .sort((a, b) => b.sev - a.sev)
    .map(({ r }): Cue => ({ id: r.id, tone: "fix", text: r.text, spoken: r.spoken, basedOn: r.basedOn }));
  // Root causes before symptoms: deep contact usually comes from drifting forward or a late front foot, so when
  // either is present, coach that first.
  const deep = fixes.findIndex((f) => f.id === "contactDeep");
  const cause = fixes.findIndex((f) => f.id === "drift" || f.id === "lateFoot");
  if (deep >= 0 && cause > deep) fixes.splice(cause + 1, 0, fixes.splice(deep, 1)[0]);

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
  const footDown = val(m, "strideTiming");
  const block = val(m, "frontLegBlock", 0.2);
  if (footDown !== null && footDown >= 140 && footDown <= 380 && block !== null && block >= 8) {
    praise.push({
      id: "goodLegs",
      tone: "praise",
      text: "Good legs: your front foot was down on time and your front side firmed up into contact.",
      spoken: "Good legs. Firm front side.",
      basedOn: ["strideTiming", "frontLegBlock"],
    });
  }
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
