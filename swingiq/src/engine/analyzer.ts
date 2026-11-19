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

  // Stride: the front foot moves toward the pitcher (side view) or lifts (any view), then plants.
  let strideStart: number | null = null;
  let footPlant: number | null = null;
  let strideIn: number | null = null;
  if (feetVisible) {
    const pre = rows.filter((r) => r.t <= contact + 80);
    const fwdMove = pre.map((r) => (ctx.view === "side" ? ((r.leadAnkle.x - base.leadAnkle.x) * fwd) / scalePx : 0));
    const lift = pre.map((r) => (base.leadAnkle.y - r.leadAnkle.y) / scalePx);
    const moved = pre.map((_, i) => Math.max(fwdMove[i], lift[i]));
    const iStart = moved.findIndex((m) => m > 0.04);
    if (iStart >= 0) {
      strideStart = pre[iStart].t;
      // Plant: after the move starts, the ankle stops (speed under ~0.4 torso/s) and stays down.
      for (let i = Math.max(iStart + 1, 1); i < pre.length; i++) {
        const dt = (pre[i].t - pre[i - 1].t) / 1000;
        const v = dt > 0 ? dist(pre[i].leadAnkle, pre[i - 1].leadAnkle) / scalePx / dt : 99;
        if (v < 0.4 && lift[i] < 0.05 && pre[i].t > strideStart + 60) {
          footPlant = pre[i].t;
          break;
        }
      }
      if (ctx.view === "side") {
        const plantIdx = footPlant !== null ? at(pre, footPlant) : pre.length - 1;
        strideIn = Math.max(0, fwdMove[plantIdx]) * scalePx * inPerPx;
      }
    } else if (ctx.view === "side") {
      strideIn = 0;
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

  if (ctx.view !== "side") {
    m.strideLength = unavailable("strideLength", "Stride goes toward or away from the camera in this view. Use side view.");
    m.weightShift = unavailable("weightShift", "Weight shift goes toward or away from the camera in this view. Use side view.");
  } else if (!feetVisible) {
    m.strideLength = unavailable("strideLength", "Your feet weren't visible. Move the phone back so your whole body fits.");
    m.weightShift = unavailable("weightShift", "Your feet weren't visible. Move the phone back so your whole body fits.");
  } else {
    m.strideLength = estimate("strideLength", strideIn ?? 0, 0.35 + 0.45 * visFactor * scaleConfidence);
    // Hip center between the rear (0%) and lead (100%) ankle at contact.
    const r = rows[iContact];
    const span = (r.leadAnkle.x - r.rearAnkle.x) * fwd;
    if (Math.abs(span) / scalePx > 0.15) {
      const pct = (((r.hip.x - r.rearAnkle.x) * fwd) / span) * 100;
      m.weightShift = estimate("weightShift", pct, 0.3 + 0.45 * visFactor);
    } else {
      m.weightShift = unavailable("weightShift", "Your feet were too close together in the picture to tell.");
    }
  }

  if (feetVisible && footPlant !== null) {
    m.strideTiming = estimate("strideTiming", launch - footPlant, 0.25 + 0.45 * fpsFactor * visFactor);
  } else if (feetVisible && strideStart === null) {
    m.strideTiming = unavailable("strideTiming", "No stride or toe tap detected, so there's no foot-down moment.");
  } else {
    m.strideTiming = unavailable("strideTiming", feetVisible ? "Couldn't find when your front foot landed." : "Your feet weren't visible.");
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

  // Hand drop: lowest grip point between stance and launch vs. stance height (image y grows downward).
  const loadWin = rows.filter((r) => r.t >= (loadStart ?? rows[0].t) && r.t <= launch + 20);
  if (loadWin.length) {
    const lowest = Math.max(...loadWin.map((r) => r.hands.y));
    m.handDrop = estimate("handDrop", Math.max(0, (lowest - base.hands.y) * inPerPx), 0.4 + 0.45 * visFactor * scaleConfidence);
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

  // Rotation from 3D world points.
  const worldRows = rows.filter((r) => r.world && r.world.length >= 25);
  if (worldRows.length >= 6) {
    const hipYaw = unwrap(worldRows.map((r) => yawDeg(r.world![s.rearHip], r.world![s.leadHip])));
    const shYaw = unwrap(worldRows.map((r) => yawDeg(r.world![s.rearShoulder], r.world![s.leadShoulder])));
    const hipS = smoothSeries(hipYaw, 1);
    const shS = smoothSeries(shYaw, 1);
    const wi = (t: number) => at(worldRows, t);
    const iLoaded = wi(loadedT);
    const iC = wi(contact);
    const iF = wi(finish);
    const dir = Math.sign(hipS[iF] - hipS[iLoaded]) || 1;
    const hipTurn = (hipS[iC] - hipS[iLoaded]) * dir;
    const shTurn = (shS[iC] - shS[iLoaded]) * dir;
    const rotConf = 0.25 + 0.25 * fpsFactor * visFactor;
    m.hipTurn = estimate("hipTurn", hipTurn, rotConf);
    m.shoulderTurn = estimate("shoulderTurn", shTurn, rotConf);
    const baseSep = (hipS[0] - shS[0]) * dir;
    let sep = 0;
    for (let i = Math.max(0, wi(strideStart ?? loadedT)); i <= iC; i++) sep = Math.max(sep, (hipS[i] - shS[i]) * dir - baseSep);
    m.separation = estimate("separation", sep, rotConf * 0.9);

    // Kinematic sequence: when did each segment hit its top speed?
    const angVel = (ys: number[]) =>
      ys.map((y, i) => (i === 0 ? 0 : ((y - ys[i - 1]) * dir) / Math.max(1e-3, (worldRows[i].t - worldRows[i - 1].t) / 1000)));
    const inWin = (i: number) => worldRows[i].t >= loadedT && worldRows[i].t <= contact + 150;
    const peakT = (v: number[]) => {
      let best = -1;
      for (let i = 0; i < v.length; i++) if (inWin(i) && (best < 0 || v[i] > v[best])) best = i;
      return best < 0 ? NaN : worldRows[best].t;
    };
    const tHip = peakT(angVel(hipS));
    const tSh = peakT(angVel(shS));
    const tHands = rows[iPeak].t;
    const frameMs = 1000 / Math.max(poseFps, 1);
    if (!Number.isNaN(tHip) && !Number.isNaN(tSh)) {
      const order = [
        { k: "Hips", t: tHip },
        { k: "Shoulders", t: tSh },
        { k: "Hands", t: tHands },
      ].sort((a, b) => a.t - b.t);
      const ideal = order[0].k === "Hips" && order[1].k === "Shoulders";
      const handsFirst = order[0].k === "Hands";
      const tooClose = order[1].t - order[0].t < frameMs * 0.9 || order[2].t - order[1].t < frameMs * 0.9;
      m.sequence = estimate("sequence", ideal ? 2 : handsFirst ? 0 : 1, rotConf * (tooClose ? 0.6 : 1), {
        text: order.map((o) => o.k).join(" → "),
        reason: tooClose ? "Two peaks landed within one frame of each other, so the order is uncertain." : undefined,
      });
    }
  } else {
    for (const k of ["hipTurn", "shoulderTurn", "separation", "sequence"] as const) {
      m[k] = unavailable(k, "3D body points weren't available for this swing.");
    }
  }

  if (ctx.micOn) {
    m.contact = { key: "contact", source: "measured", value: audioOk ? 1 : 0, confidence: 0.8, text: audioOk ? "Contact" : "No contact heard" };
  } else {
    m.contact = unavailable("contact", "Mic is off. Turn on “Listen for contact” in the session settings.");
  }

  const score = scoreSwing(m, ctx.view, ctx.heightIn);
  const observations = buildCues(m, { view: ctx.view, micOn: ctx.micOn, previous: ctx.previous?.[0], headFwdIn, headDownIn });
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

