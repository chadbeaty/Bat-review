import type { SwingWindow } from "./detector";
import {
  FEET,
  KEY_JOINTS,
  L,
  NOSE_TO_ANKLE_FRACTION,
  clamp,
  dist,
  frameHasBody,
  hands,
  hipCenter,
  median,
  noseToAnkles,
  px,
  sides,
  smoothSeries,
  torso,
  unwrap,
  vis,
  yawDeg,
  type P2,
} from "./geometry";
import { buildCues } from "./feedback";
import { analyzeLowerBody } from "./lowerbody";
import { scoreSwing } from "./scoring";
import type {
  CameraView,
  FrameGeometry,
  Handedness,
  Landmark,
  MetricKey,
  MetricValue,
  PoseFrame,
  QualityReport,
  SwingAnalysis,
  SwingPhases,
} from "./types";

export type AnalyzeContext = {
  geom: FrameGeometry;
  hand: Handedness;
  view: CameraView;
  /** Player's standing height in inches (used to turn pixels into inches). */
  heightIn: number;
  cameraFps: number;
  /** Time (ms, session clock) of a bat-ball sound inside this swing, if the mic heard one. */
  audioContactT: number | null;
  /** Whether the mic was listening at all. */
  micOn: boolean;
  /** Metrics from this player's recent swings, newest first (for "better than last time" cues). */
  previous?: Partial<Record<MetricKey, MetricValue>>[];
};

const IN_PER_S_TO_MPH = 3600 / 63360;

type Row = {
  t: number;
  lm: Landmark[];
  world: PoseFrame["world"];
  hands: P2;
  nose: P2;
  hip: P2;
  leadAnkle: P2;
  rearAnkle: P2;
  leadShoulder: P2;
  rearShoulder: P2;
  feetVis: number;
};

function unavailable(key: MetricKey, reason: string): MetricValue {
  return { key, source: "unavailable", value: null, confidence: 0, reason };
}

function estimate(key: MetricKey, value: number, confidence: number, extra: Partial<MetricValue> = {}): MetricValue {
  return { key, source: "cv_estimated", value, confidence: clamp(confidence, 0.05, 0.95), ...extra };
}

/** Index of the row whose time is closest to t. */
function jointAngle(a: P2, b: P2, c: P2): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  return d ? (Math.acos(clamp((v1.x * v2.x + v1.y * v2.y) / d, -1, 1)) * 180) / Math.PI : NaN;
}

function at(rows: Row[], t: number): number {
  let best = 0;
  for (let i = 1; i < rows.length; i++) if (Math.abs(rows[i].t - t) < Math.abs(rows[best].t - t)) best = i;
  return best;
}

/**
 * Full analysis of one detected swing: phases, metrics (each with its source and confidence), scores and one cue.
 * `frames` should cover the swing window including pre- and post-roll.
 */
export function analyzeSwing(frames: PoseFrame[], win: SwingWindow, ctx: AnalyzeContext): SwingAnalysis {
  const g = ctx.geom;
  const s = sides(ctx.hand);
  const rows: Row[] = frames.filter((f) => frameHasBody(f, 0.4)).map((f) => {
    const lm = f.lm!;
    return {
      t: f.t,
      lm,
      world: f.world,
      hands: hands(lm, g),
      nose: px(lm[L.nose], g),
      hip: hipCenter(lm, g),
      leadAnkle: px(lm[s.leadAnkle], g),
      rearAnkle: px(lm[s.rearAnkle], g),
      leadShoulder: px(lm[s.leadShoulder], g),
      rearShoulder: px(lm[s.rearShoulder], g),
      feetVis: vis(lm, FEET),
    };
  });

  if (rows.length < 6) {
    // The detector only fires with good tracking, so this is rare: tracking dropped right after.
    return emptyAnalysis(win, ctx, rows.length);
  }

  // ---------- Quality ----------
  const span = (rows[rows.length - 1].t - rows[0].t) / 1000;
  const poseFps = span > 0 ? (rows.length - 1) / span : 0;
  const visibility = rows.reduce((a, r) => a + vis(r.lm, KEY_JOINTS), 0) / rows.length;
  const feetVisible = rows.filter((r) => r.feetVis >= 0.5).length / rows.length >= 0.7;
  const quality: QualityReport = { poseFps, cameraFps: ctx.cameraFps, visibility, feetVisible, calibrated: ctx.heightIn > 0 };
  // Timing-sensitive confidence: 60 fps or better is full marks, 15 fps is poor.
  const fpsFactor = clamp((poseFps - 12) / 48, 0.15, 1);
  const visFactor = clamp((visibility - 0.4) / 0.5, 0.2, 1);

  // ---------- Scale ----------
  const scalePx = median(rows.map((r) => torso(r.lm, g)));
  const stanceEnd = Math.min(win.launch - 500, rows[0].t + 400);
  const stanceRows = rows.filter((r) => r.t <= Math.max(stanceEnd, rows[0].t + 150));
  const stance = stanceRows.length ? stanceRows : rows.slice(0, 3);
  let inPerPx: number;
  let scaleConfidence: number;
  if (feetVisible) {
    const h = median(stance.map((r) => noseToAnkles(r.lm, g)));
    inPerPx = (ctx.heightIn * NOSE_TO_ANKLE_FRACTION) / h;
    scaleConfidence = 0.85;
  } else {
    // Shoulder-center to hip-center is about 29% of standing height for adults. Rougher than a full-body measure.
    inPerPx = (ctx.heightIn * 0.29) / scalePx;
    scaleConfidence = 0.6;
  }
  // In a profile view (behind/front) the hitter's height still scales correctly, but sideways movement is
  // foreshortened less predictably.
  const viewFactor = ctx.view === "side" ? 1 : 0.75;

  const base = {
    hands: { x: median(stance.map((r) => r.hands.x)), y: median(stance.map((r) => r.hands.y)) },
    nose: { x: median(stance.map((r) => r.nose.x)), y: median(stance.map((r) => r.nose.y)) },
    hip: { x: median(stance.map((r) => r.hip.x)), y: median(stance.map((r) => r.hip.y)) },
    leadAnkle: { x: median(stance.map((r) => r.leadAnkle.x)), y: median(stance.map((r) => r.leadAnkle.y)) },
    rearAnkle: { x: median(stance.map((r) => r.rearAnkle.x)), y: median(stance.map((r) => r.rearAnkle.y)) },
  };

  // ---------- Hand speed series ----------
  const hx = smoothSeries(rows.map((r) => r.hands.x), 1);
  const hy = smoothSeries(rows.map((r) => r.hands.y), 1);
  const speedPx: number[] = rows.map((r, i) => {
    if (i === 0) return 0;
    const dt = (r.t - rows[i - 1].t) / 1000;
    return dt > 0 ? Math.hypot(hx[i] - hx[i - 1], hy[i] - hy[i - 1]) / dt : 0;
  });
  const speed = smoothSeries(speedPx, 1);

  // ---------- Forward direction (toward the pitcher) in image x ----------
  // Side view: the lead shoulder is on the pitcher's side. Cross-check with where the hands go from launch to peak.
  const shoulderSign = Math.sign(median(stance.map((r) => r.leadShoulder.x - r.rearShoulder.x)));
  const iLaunch0 = at(rows, win.launch);
  void yawDeg;
  void unwrap;
  const iPeak0 = at(rows, win.peak);
  const handSign = Math.sign(hx[iPeak0] - hx[iLaunch0]);
  const fwd = ctx.view === "side" ? shoulderSign || handSign || 1 : handSign || 1;

  // ---------- Phases ----------
  const launch = win.launch;
  // Peak hand speed between launch and the end of the fast part.
  let iPeak = iLaunch0;
  for (let i = iLaunch0; i < rows.length && rows[i].t <= win.end + 50; i++) if (speed[i] > speed[iPeak]) iPeak = i;
  // Contact sits right around peak hand speed; a sound far from that moment isn't this swing's contact.
  const audioOk = ctx.audioContactT !== null && ctx.audioContactT >= launch + 50 && ctx.audioContactT <= win.peak + 150;
  const contact = audioOk ? ctx.audioContactT! : rows[iPeak].t;
  const iContact = at(rows, contact);

  // Load: the grip moves back (away from the pitcher) before launch.
  const preLaunch = rows.filter((r) => r.t >= rows[0].t && r.t <= launch);
  let loadStart: number | null = null;
  let loadedT = launch;
  if (preLaunch.length >= 3) {
    const back = preLaunch.map((r) =>
      ctx.view === "side" ? (-(r.hands.x - base.hands.x) * fwd) / scalePx : dist(r.hands, base.hands) / scalePx,
    );
    let iMax = 0;
    for (let i = 1; i < back.length; i++) if (back[i] > back[iMax]) iMax = i;
    if (back[iMax] >= 0.06) {
      loadedT = preLaunch[iMax].t;
      let i0 = iMax;
      while (i0 > 0 && back[i0 - 1] > back[iMax] * 0.15) i0--;
      loadStart = preLaunch[i0].t;
    }
  }

  // Finish: hands slow right down after contact, or the end of the clip.
  let finish = rows[rows.length - 1].t;
  const quietPx = 1.0 * scalePx;
  for (let i = iContact + 2; i < rows.length; i++) {
    if (speed[i] < quietPx && speed[i - 1] < quietPx) {
      finish = rows[i].t;
      break;
    }
  }

  // Legs and feet: front-foot events, stride, front-knee block, back heel, hip start (see lowerbody.ts).
  const lb = analyzeLowerBody(
    rows.map((r) => ({ t: r.t, lm: r.lm, world: r.world })),
    { geom: g, hand: ctx.hand, view: ctx.view, launch, contact, loadedT, finish, fwd },
  );
  const strideStart = lb.available ? lb.strideStart : null;
  const footPlant = lb.available ? lb.footPlant : null;
  const legIn = lb.legLenPx * inPerPx;

  const phases: SwingPhases = {
    stanceStart: rows[0].t,
    loadStart,
    strideStart,
    footPlant,
    launch,
    contact,
    finish,
    contactSource: audioOk ? "audio" : "pose",
  };

  // ---------- Metrics ----------
  const m: Partial<Record<MetricKey, MetricValue>> = {};
  const swingMs = contact - launch;
  m.swingTime = estimate("swingTime", swingMs, (audioOk ? 0.55 : 0.35) + 0.4 * fpsFactor * visFactor, {
    reason: audioOk ? undefined : "End point estimated from peak hand speed (no contact sound heard).",
  });
  if (loadStart !== null) {
    const loadMs = launch - loadStart;
    m.loadTime = estimate("loadTime", loadMs, 0.3 + 0.4 * fpsFactor * visFactor);
    if (swingMs > 40) m.tempoRatio = estimate("tempoRatio", loadMs / swingMs, 0.25 + 0.4 * fpsFactor * visFactor);
  } else {
    m.loadTime = unavailable("loadTime", "No clear load: your hands didn't move back before the swing.");
  }

  const peakMph = speed[iPeak] * inPerPx * IN_PER_S_TO_MPH;
  m.handSpeed = estimate("handSpeed", peakMph, 0.45 * fpsFactor * scaleConfidence * viewFactor * visFactor + 0.1, {
    reason: "Counts only movement across the camera's view, so it reads lower than a sensor would.",
  });

  m.batSpeed = unavailable("batSpeed", "Needs bat tracking (high-speed native capture, Phase 2) or a bat sensor.");
  m.exitVelocity = unavailable("exitVelocity", "Needs ball tracking with high-speed capture (Phase 2) or a radar.");
  m.launchAngle = unavailable("launchAngle", "Needs ball tracking with high-speed capture (Phase 2) or a launch monitor.");
  m.attackAngle = unavailable("attackAngle", "Needs bat tracking (Phase 2) or a bat sensor.");

  // ---------- Legs and feet ----------
  const feetReason = lb.reason ?? "Your feet weren't visible. Move the phone back so you're in the picture head to toe.";
  const legConf = clamp((lb.feetVisibility - 0.4) / 0.5, 0.2, 1);
  if (!lb.available) {
    for (const k of ["strideLength", "weightShift", "strideTiming", "timingStyle", "frontLegBlock", "backHeel", "strideDirection", "backKnee", "frontFootSlide"] as const) {
      m[k] = unavailable(k, feetReason);
    }
  } else {
    m.timingStyle = estimate("timingStyle", lb.episodes.filter((e) => e.start < launch).length, 0.4 + 0.4 * legConf * fpsFactor, {
      text: lb.timingStyle,
    });

    // Foot down: how long before contact the front foot landed. Elite slow-pitch hitters: about 0.2 s (Wu et al.).
    if (footPlant !== null) {
      m.strideTiming = estimate("strideTiming", contact - footPlant, 0.35 + 0.45 * fpsFactor * legConf, {
        text: lb.lateFoot ? "Still landing when the hands started" : undefined,
      });
    } else if (lb.strideStart === null) {
      m.strideTiming = unavailable("strideTiming", "No stride or toe tap, so there's no foot-down moment to time.");
    } else {
      m.strideTiming = unavailable("strideTiming", "Couldn't find when your front foot landed.");
    }

    if (ctx.view === "side") {
      m.strideLength = estimate("strideLength", (lb.strideLegs ?? 0) * legIn, 0.35 + 0.45 * legConf * scaleConfidence, {
        text:
          lb.stanceWidthLegs && lb.plantWidthLegs
            ? `Feet went from ${Math.round(lb.stanceWidthLegs * legIn)} in apart to ${Math.round(lb.plantWidthLegs * legIn)} in at foot down (${(lb.plantWidthLegs / lb.stanceWidthLegs).toFixed(2)}× your stance)`
            : undefined,
      });
      // Hip center between the rear (0%) and lead (100%) ankle at contact.
      const r = rows[iContact];
      const span = (r.leadAnkle.x - r.rearAnkle.x) * fwd;
      if (Math.abs(span) / scalePx > 0.15) {
        const pct = (((r.hip.x - r.rearAnkle.x) * fwd) / span) * 100;
        const headPct = (((r.nose.x - r.rearAnkle.x) * fwd) / span) * 100;
        m.weightShift = estimate("weightShift", pct, 0.3 + 0.45 * legConf, { text: `Head ${Math.round(headPct)}% of the way to your front foot` });
      } else {
        m.weightShift = unavailable("weightShift", "Your feet were too close together in the picture to tell.");
      }
      m.strideDirection = unavailable("strideDirection", "Stride direction shows from behind the plate. Use behind view.");
    } else {
      m.strideLength = unavailable("strideLength", "Stride goes toward or away from the camera in this view. Use side view.");
      m.weightShift = unavailable("weightShift", "Weight shift goes toward or away from the camera in this view. Use side view.");
      if (lb.strideOffsetLegs !== null) {
        const inches = lb.strideOffsetLegs * legIn;
        m.strideDirection = estimate("strideDirection", inches, 0.25 + 0.3 * legConf, {
          text: Math.abs(inches) < 3 ? "Straight at the pitcher" : inches > 0 ? "Closed (toward the plate)" : "Open (away from the plate)",
        });
      } else {
        m.strideDirection = unavailable("strideDirection", "No stride to measure.");
      }
    }

    // Happy feet: did the front foot stay planted between landing and contact?
    if (lb.footSlideLegs !== null) {
      const inches = lb.footSlideLegs * legIn;
      m.frontFootSlide = estimate("frontFootSlide", inches, 0.3 + 0.4 * legConf * fpsFactor, {
        text: inches < 2 ? "Stayed planted" : inches < 4 ? "Settled a little" : "Kept moving after landing",
      });
    } else {
      m.frontFootSlide = unavailable("frontFootSlide", footPlant === null ? "Needs a foot-down moment." : "Your foot landed right at contact.");
    }

    // Front-leg block: change in front-knee angle from foot plant to contact (+ = straightened, firming up).
    if (lb.leadKneePlant !== null && lb.leadKneeContact !== null) {
      const near = ctx.view === "front"; // from the pitcher's side the front leg is the near leg
      const base = lb.kneeMethod === "3d" ? 0.25 : near ? 0.5 : 0.35;
      m.frontLegBlock = estimate("frontLegBlock", lb.leadKneeContact - lb.leadKneePlant, base * (0.5 + 0.5 * legConf * fpsFactor), {
        text: `Front knee ${Math.round(lb.leadKneePlant)}° at foot down → ${Math.round(lb.leadKneeContact)}° at contact`,
        reason: lb.kneeMethod === "3d" ? "Facing your chest, the knee bends toward the lens, so this uses a rougher 3D estimate. Behind or front view reads knees better." : undefined,
      });
    } else {
      m.frontLegBlock = unavailable("frontLegBlock", footPlant === null ? "Needs a foot-down moment to compare against." : "Couldn't see your front knee clearly.");
    }

    // Back knee at contact: only from behind or in front, where the knee bends across the picture. Qualitative.
    if (ctx.view !== "side") {
      const rk = rows[iContact].lm;
      const rearKnee = ctx.hand === "R" ? L.rightKnee : L.leftKnee;
      if (rk[s.rearHip].v > 0.5 && rk[rearKnee].v > 0.5 && rk[s.rearAnkle].v > 0.5) {
        const a = jointAngle(px(rk[s.rearHip], g), px(rk[rearKnee], g), px(rk[s.rearAnkle], g));
        const near = ctx.view === "behind";
        m.backKnee = estimate("backKnee", a, (near ? 0.4 : 0.25) * legConf, {
          text: a < 100 ? "Sank deep (sitting down)" : a < 125 ? "Bent and athletic" : "Tall",
        });
      } else m.backKnee = unavailable("backKnee", "Couldn't see your back leg clearly.");
    } else {
      m.backKnee = unavailable("backKnee", "Back-knee bend shows best from behind the plate.");
    }

    if (ctx.view === "side" && lb.rearHeelVisible) {
      m.backHeel = lb.rearHeelUpRel !== null
        ? estimate("backHeel", lb.rearHeelUpRel, 0.3 + 0.3 * legConf * fpsFactor, {
            text: lb.rearHeelUpRel <= 0 ? `Came up ${Math.abs(lb.rearHeelUpRel)} ms before contact` : `Came up ${lb.rearHeelUpRel} ms after contact`,
          })
        : estimate("backHeel", 9999, 0.3, { text: "Stayed down through the swing" });
      if (lb.rearHeelUpRel === null) m.backHeel.value = null;
    } else {
      m.backHeel = unavailable("backHeel", ctx.view === "side" ? "Couldn't see your back heel clearly." : "The back heel shows best from the side.");
    }
  }

  // Head movement from stance to contact. In side view, keep the forward part too (drifting toward the pitcher).
  const head = rows[iContact].nose;
  const headFwdIn = ((head.x - base.nose.x) * fwd) * inPerPx;
  const headDownIn = (head.y - base.nose.y) * inPerPx;
  const headIn = Math.hypot(head.x - base.nose.x, head.y - base.nose.y) * inPerPx;
  m.headMovement = estimate("headMovement", headIn, 0.4 + 0.45 * visFactor * scaleConfidence * viewFactor, {
    text:
      ctx.view === "side"
        ? `${Math.abs(headFwdIn).toFixed(1)} in ${headFwdIn >= 0 ? "toward the pitcher" : "back"}, ${Math.abs(headDownIn).toFixed(1)} in ${headDownIn >= 0 ? "down" : "up"}`
        : undefined,
  });

  // Bar cast: do the hands push away from the body early in the swing, before the hips have turned? Side view
  // proxy: grip-to-back-shoulder distance halfway from launch to contact vs. at launch.
  if (ctx.view === "side" && contact - launch >= 60) {
    const gripDist = (r: Row) => dist(r.hands, r.rearShoulder) / scalePx;
    const iMid = at(rows, launch + (contact - launch) / 2);
    const d0 = gripDist(rows[iLaunch0]);
    const d1 = gripDist(rows[iMid]);
    if (d0 > 0.1 && iMid > iLaunch0) {
      const pct = ((d1 - d0) / d0) * 100;
      m.handCast = estimate("handCast", pct, 0.2 + 0.25 * fpsFactor * visFactor, {
        text: pct < 20 ? "Hands stayed tight to the body" : pct < 40 ? "Hands drifted out a little" : "Hands pushed away early (casting)",
      });
    }
  } else if (ctx.view !== "side") {
    m.handCast = unavailable("handCast", "Casting shows best from the side.");
  }

  // Hand drop: how far the grip sinks RELATIVE TO THE SHOULDERS between stance and launch (image y grows downward).
  // Measured against the shoulders, not the ground, so sinking into the legs during the load isn't called a hand drop.
  const handRel = (r: Row) => r.hands.y - (r.leadShoulder.y + r.rearShoulder.y) / 2;
  const baseHandRel = median(stance.map(handRel));
  const loadWin = rows.filter((r) => r.t >= (loadStart ?? rows[0].t) && r.t <= launch + 20);
  if (loadWin.length) {
    const lowest = Math.max(...loadWin.map(handRel));
    m.handDrop = estimate("handDrop", Math.max(0, (lowest - baseHandRel) * inPerPx), 0.4 + 0.45 * visFactor * scaleConfidence);
  }

  // Balance after contact.
  const after = rows.filter((r) => r.t >= contact + 120);
  if (after.length >= 3) {
    let score = 100;
    const reasons: string[] = [];
    // Hip wobble: how much the hip center keeps moving once the swing is done (torso lengths/s).
    const wob: number[] = [];
    for (let i = 1; i < after.length; i++) {
      const dt = (after[i].t - after[i - 1].t) / 1000;
      if (dt > 0) wob.push(dist(after[i].hip, after[i - 1].hip) / scalePx / dt);
    }
    const wobble = median(wob);
    score -= clamp((wobble - 0.35) * 60, 0, 40);
    if (wobble > 0.8) reasons.push("hips kept moving after contact");
    if (feetVisible && ctx.view === "side") {
      const last = after[after.length - 1];
      const lo = Math.min(last.leadAnkle.x, last.rearAnkle.x);
      const hi = Math.max(last.leadAnkle.x, last.rearAnkle.x);
      const pad = 0.15 * scalePx;
      const outside = (x: number) => (x < lo - pad ? lo - pad - x : x > hi + pad ? x - hi - pad : 0) / scalePx;
      score -= clamp(outside(last.nose.x) * 80, 0, 35);
      score -= clamp(outside(last.hip.x) * 100, 0, 35);
      if (outside(last.nose.x) > 0.1) reasons.push("head finished outside your feet");
    }
    m.balance = estimate("balance", clamp(score, 0, 100), 0.35 + 0.4 * visFactor * (feetVisible ? 1 : 0.7), {
      text: reasons.length ? reasons.join("; ") : undefined,
    });
  } else {
    m.balance = unavailable("balance", "The clip ended before the finish.");
  }

  // Rotation: a single camera can't measure hip or shoulder turn in degrees, or any rotation speed, honestly (even
  // two-phone 240 fps systems miss pelvis speed by ~150°/s). Report only which started first: hips or hands.
  const rotReason = "One camera can't measure rotation in degrees reliably. SwingIQ only reports whether your hips started before your hands.";
  m.hipTurn = unavailable("hipTurn", rotReason);
  m.shoulderTurn = unavailable("shoulderTurn", rotReason);
  m.separation = unavailable("separation", rotReason);
  if (poseFps < 50) {
    m.hipLead = unavailable("hipLead", "Needs 60 fps or faster tracking: at 30 fps the hips turn too far between frames to tell which started first.");
  } else if (lb.available && lb.hipOnsetRel !== null) {
    const r = lb.hipOnsetRel;
    m.hipLead = estimate("hipLead", -r, 0.2 + 0.15 * fpsFactor, {
      text: Math.abs(r) <= 20 ? "Hips and hands started together" : r < 0 ? `Hips started ${Math.abs(r)} ms before the hands` : `Hands started ${r} ms before the hips`,
      reason: "Based on the model's depth estimate, which is rough from one camera. Treat it as a hint.",
    });
  } else {
    m.hipLead = unavailable("hipLead", "Couldn't tell when your hips started turning.");
  }

  if (ctx.micOn) {
    m.contact = { key: "contact", source: "measured", value: audioOk ? 1 : 0, confidence: 0.8, text: audioOk ? "Contact" : "No contact heard" };
  } else {
    m.contact = unavailable("contact", "Mic is off. Turn on “Listen for contact” in the session settings.");
  }

  const score = scoreSwing(m, ctx.view, ctx.heightIn, { widthRatio: lb.stanceWidthLegs && lb.plantWidthLegs ? lb.plantWidthLegs / lb.stanceWidthLegs : null });
  const observations = buildCues(m, { view: ctx.view, micOn: ctx.micOn, previous: ctx.previous?.[0], headFwdIn, headDownIn, legIn, lateFoot: lb.lateFoot,
    widthRatio: lb.stanceWidthLegs && lb.plantWidthLegs ? lb.plantWidthLegs / lb.stanceWidthLegs : null });
  const handPath = rows
    .filter((r) => r.t >= (loadStart ?? launch - 400) && r.t <= finish)
    .map((r) => ({ t: r.t, x: r.hands.x / g.width, y: r.hands.y / g.height }));

  return { phases, metrics: m, score, cue: observations[0], observations, quality, handPath };
}

function emptyAnalysis(win: SwingWindow, ctx: AnalyzeContext, n: number): SwingAnalysis {
  const reason = "Body tracking dropped during this swing.";
  const metrics: Partial<Record<MetricKey, MetricValue>> = {
    swingTime: unavailable("swingTime", reason),
  };
  return {
    phases: {
      stanceStart: win.clipStart,
      loadStart: null,
      strideStart: null,
      footPlant: null,
      launch: win.launch,
      contact: win.peak,
      finish: win.end,
      contactSource: "pose",
    },
    metrics,
    score: { overall: null, components: [] },
    cue: {
      id: "tracking",
      tone: "info",
      text: "Tracking dropped during that swing. Make sure your whole body stays in the frame.",
      spoken: "Lost you. Stay in frame.",
      basedOn: [],
    },
    observations: [],
    quality: { poseFps: n, cameraFps: ctx.cameraFps, visibility: 0, feetVisible: false, calibrated: ctx.heightIn > 0 },
    handPath: [],
  };
}

