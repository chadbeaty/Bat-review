import type { Cue, MetricKey, MetricValue } from "./types";

/**
 * Gapper Coach: for the biggest issue in a swing, a plain-language explanation, one correction, a drill and a
 * 10-swing challenge. Rules-based on measured metrics only (no language model guessing), so every word traces back
 * to a number on the swing. Drills come from slow-pitch coaching sources (see docs/reports).
 */
type Metrics = Partial<Record<MetricKey, MetricValue>>;

export type Challenge = {
  /** What to aim for, in plain words. */
  goal: string;
  /** Metric the challenge is judged on. */
  metric: MetricKey;
  /** true = this swing passed; null = the metric wasn't measured on this swing (doesn't count). */
  test: (m: Metrics) => boolean | null;
};

export type Coaching = {
  issueId: string;
  title: string;
  why: string;
  fix: string;
  drill: { name: string; how: string };
  challenge: Challenge;
};

const v = (m: Metrics, k: MetricKey): number | null => {
  const mv = m[k];
  return mv && mv.source !== "unavailable" && mv.value !== null ? mv.value : null;
};
const check = (k: MetricKey, ok: (x: number) => boolean) => (m: Metrics) => {
  const x = v(m, k);
  return x === null ? null : ok(x);
};

const PLAYBOOK: Record<string, Omit<Coaching, "issueId" | "fix">> = {
  lateFoot: {
    title: "Front foot down late",
    why: "If your front foot is still landing when your hands start, your swing has nothing solid to push against and your timing changes every pitch. Skilled slow-pitch hitters land about 0.2 seconds before contact.",
    drill: { name: "Step at the peak", how: "Have someone toss high arcs. Say \"step\" out loud when the ball reaches the top of its arc and have your foot down before it starts falling into the zone." },
    challenge: { goal: "Foot down 0.14–0.38 s before contact", metric: "strideTiming", test: check("strideTiming", (x) => x >= 140 && x <= 380) },
  },
  strideWait: {
    title: "Landing early and waiting",
    why: "Landing too early and then waiting stalls your momentum. The swing should flow out of foot-down, not start from a dead stop.",
    drill: { name: "Step, pause, swing (shorten the pause)", how: "Front tosses: stride and plant, count \"one\" quickly, swing. Each round, shrink the pause until foot-down and swing feel like one move." },
    challenge: { goal: "Foot down no more than 0.42 s before contact", metric: "strideTiming", test: check("strideTiming", (x) => x <= 420) },
  },
  drift: {
    title: "Drifting forward",
    why: "When your weight and head slide toward the pitcher, you meet the ball with your upper body out front. That's how slow-pitch hitters roll over into pull-side ground balls.",
    drill: { name: "Deep tee, stay back", how: "Set the tee even with your back hip. Hit line drives up the middle without your head moving forward. Let the ball travel to you." },
    challenge: { goal: "Hips stay at or behind 90% of the way to your front foot", metric: "weightShift", test: check("weightShift", (x) => x <= 90) },
  },
  handDrop: {
    title: "Hands dropping in the load",
    why: "Dropping your hands makes the swing longer and loopier, so you start earlier and hit under the ball more often.",
    drill: { name: "Hands-at-the-shoulder holds", how: "Take your stance, load, and freeze for two seconds at launch with your hands still at shoulder height. Ten reps, then swing for real." },
    challenge: { goal: "Hand drop under 3 inches", metric: "handDrop", test: check("handDrop", (x) => x <= 3) },
  },
  head: {
    title: "Head moving",
    why: "Your eyes ride on your head. When it moves, the ball appears to jump, and the contact point gets harder to find.",
    drill: { name: "Quiet-head mirror swings", how: "Dry swings facing a mirror or your phone. Keep your head inside an imaginary box from stance to contact." },
    challenge: { goal: "Head moves less than 4 inches", metric: "headMovement", test: check("headMovement", (x) => x <= 4) },
  },
  balance: {
    title: "Losing balance at the finish",
    why: "If you can't hold your finish, you swung harder than you can control, and your contact suffers for it.",
    drill: { name: "Finish and hold", how: "Every swing, hold your finish for a three count with your weight over your front leg. If you have to step to catch yourself, swing at 80%." },
    challenge: { goal: "Balance score 70 or better", metric: "balance", test: check("balance", (x) => x >= 70) },
  },
  softFront: {
    title: "Soft front side",
    why: "Your front leg is the wall your hips turn against. If the knee keeps bending after you land, the turn leaks and the bat slows down.",
    drill: { name: "Plant and firm", how: "Slow-motion swings: land, then straighten (firm up) the front knee as you turn. Feel the front hip pull back as the leg firms." },
    challenge: { goal: "Front knee doesn't collapse after landing", metric: "frontLegBlock", test: check("frontLegBlock", (x) => x >= -3) },
  },
  backCollapse: {
    title: "Back leg collapsing",
    why: "Sitting down on the back leg drops the back shoulder and sends the bat under the ball: hello, pop-ups.",
    drill: { name: "Tall back side", how: "Swing with a ball or pool noodle between your knees. Drive the back knee toward the front knee instead of down." },
    challenge: { goal: "Back knee stays above 105°", metric: "backKnee", test: check("backKnee", (x) => x >= 105) },
  },
  overstride: {
    title: "Overstriding",
    why: "A long stride drops your head and eyes and makes you lunge. Slow-pitch power comes from turning, not from reaching toward the pitcher.",
    drill: { name: "Chalk-line stride", how: "Mark a line 6 inches in front of your front foot. Stride to it, not past it, for a full round of front toss." },
    challenge: { goal: "Feet no more than 1.5× your stance width at foot down", metric: "strideLength", test: (m) => (m.strideLength?.aux === undefined ? null : m.strideLength.aux <= 1.5) },
  },
  happyFeet: {
    title: "Front foot moving after landing",
    why: "If the front foot keeps sliding or re-stepping, there's no fixed axis to rotate around, so timing and power both suffer.",
    drill: { name: "Plant and turn", how: "Put a towel under your front heel. Land on it and keep it pinned while you swing." },
    challenge: { goal: "Front foot moves less than 3 inches after landing", metric: "frontFootSlide", test: check("frontFootSlide", (x) => x <= 3) },
  },
  barCast: {
    title: "Hands casting away",
    why: "When the hands push away from the body before the hips turn, the swing gets long and slow, like swinging a door from the wrong end.",
    drill: { name: "Fence drill", how: "Stand a bat's length from a fence or net and make slow swings without hitting it. The hands have to stay tight to get through." },
    challenge: { goal: "Hands move out less than 30% before contact", metric: "handCast", test: check("handCast", (x) => x <= 30) },
  },
  shoulderDrop: {
    title: "Back shoulder dropping",
    why: "A big back-shoulder drop tilts the swing under the ball, which turns line drives into pop-ups.",
    drill: { name: "Level-shoulder tee work", how: "Tee at belt height. Focus on driving the ball back up the middle with shoulders that stay closer to level." },
    challenge: { goal: "Shoulder tilt under 35°", metric: "shoulderDrop", test: check("shoulderDrop", (x) => x <= 35) },
  },
  uppercut: {
    title: "Uppercutting",
    why: "Trying to lift every pitch with a steep upward swing produces pop-ups. Slow-pitch line drives come from a slightly upward path.",
    drill: { name: "Line drives to the gaps", how: "Front toss. Aim every swing at a line drive into a gap. Count a swing as a miss if it goes up instead of out." },
    challenge: { goal: "Hand path under 25° upward through contact", metric: "handPathAngle", test: check("handPathAngle", (x) => x <= 25) },
  },
  chop: {
    title: "Chopping down",
    why: "Swinging down on a ball that's already falling makes you hit the top of it: ground balls and rollovers.",
    drill: { name: "High-finish swings", how: "Every swing, finish with your hands high over your front shoulder. It pulls the path into a slight upward line." },
    challenge: { goal: "Hand path level or upward through contact", metric: "handPathAngle", test: check("handPathAngle", (x) => x >= -5) },
  },
  contactDeep: {
    title: "Contact too deep",
    why: "Meeting the ball behind your front hip means you're late: weak contact to the opposite side and a lot of foul balls.",
    drill: { name: "Out-front tee", how: "Move the tee a few inches in front of your front foot and drive balls up the middle. Feel where contact should be." },
    challenge: { goal: "Hands at or in front of the front hip at contact", metric: "contactPoint", test: check("contactPoint", (x) => x >= -2) },
  },
};

/** Coaching for a swing's primary cue. When nothing needs fixing, the challenge is to repeat the swing. */
export function coachingFor(cue: Cue, metrics: Metrics, score: number | null): Coaching {
  const p = PLAYBOOK[cue.id.replace(/-better$/, "")];
  if (cue.tone === "fix" && p) return { issueId: cue.id, fix: cue.text, ...p };
  const wholeBody: Challenge = { goal: "Ten clean swings with your whole body in view", metric: "strideTiming", test: (m) => v(m, "strideTiming") !== null };
  if (cue.id === "noLegs") {
    return {
      issueId: "noLegs",
      title: "Get your legs in the picture",
      why: "Gapper reads the swing from the ground up: when your front foot lands, how your front leg firms up, where your weight goes. Without your legs and shoes in view there's nothing to grade, so it won't guess.",
      fix: cue.text,
      drill: { name: "Frame check", how: "Before you swing, step back until your shoes are in the picture with a little room below them. Phone about waist high, 10 to 15 feet away, facing your chest." },
      challenge: wholeBody,
    };
  }
  return {
    issueId: "repeat",
    title: cue.tone === "praise" ? "Keep it" : "Build a baseline",
    why:
      cue.tone === "praise"
        ? "Nothing stood out as a problem on this swing. The fastest way to get better now is to make this swing repeatable."
        : "Gapper needs a few more swings to see your patterns. Repeat your normal swing.",
    fix: cue.text,
    drill: { name: "Same swing, ten times", how: "Take ten swings with the same timing and the same finish. Hold every finish for a two count." },
    challenge: {
      goal: score !== null ? `Gapper Score ${Math.max(0, score - 5)} or better` : "Ten clean swings with your whole body in view",
      metric: "balance",
      test: (m) => {
        void m;
        return null;
      },
    },
  };
}

/** Challenge progress over a run of swings: passed / counted (swings where the metric was measured). */
export function challengeProgress(c: Challenge, swings: Metrics[], scores: (number | null)[] = [], target?: number) {
  let counted = 0;
  let passed = 0;
  swings.forEach((m, i) => {
    let r = c.test(m);
    if (r === null && target !== undefined) r = scores[i] === null || scores[i] === undefined ? null : scores[i]! >= target;
    if (r === null) return;
    counted++;
    if (r) passed++;
  });
  return { counted, passed };
}
