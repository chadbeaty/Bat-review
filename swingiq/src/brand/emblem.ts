/**
 * The Gapper emblem system: the Gap Mark, the bag tag, the round patch and the horizontal lockup.
 *
 * The idea: slow pitch plays four outfielders, so there are three gaps, not two. The Gap Mark is the outfield seen
 * from home plate: four heavy blocks (LF, LCF, RCF, RF) with three gaps between them, and a 12-inch ball that has
 * just broken through the left-center gap, the wall splintering behind it. Every shape is a flat fill so it prints in
 * one color (screen print, embroidery, vinyl) as well as full color.
 *
 * Shapes come in three roles so one drawing serves every colorway:
 *   ground: the badge background (carbon black in full color; knocked out in one color)
 *   ink:    the outfield, home plate, letters and keylines (white in full color)
 *   accent: the ball and its streak (electric lime in full color)
 */
import { A, E, G, P, R, SECONDARY, TAGLINE, chivo, chivoLine, setLine, wordmark, type Glyph } from "./geometry";

export type Shape = { d: string; role: "ground" | "ink" | "accent" };
export type Art = { w: number; h: number; shapes: Shape[] };
type Pt = [number, number];

const f = (n: number) => Math.round(n * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;
const pt = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(rad(a)), c[1] + r * Math.sin(rad(a))];
const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
export const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
const circleRev = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;

/** Where a line (point p, unit direction u) meets a circle of radius r around c, taking the far intersection. */
function lineCircle(p: Pt, u: Pt, c: Pt, r: number): Pt {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const b = dx * u[0] + dy * u[1];
  const cc = dx * dx + dy * dy - r * r;
  const t = -b + Math.sqrt(Math.max(0, b * b - cc));
  return [p[0] + u[0] * t, p[1] + u[1] * t];
}

/* ------------------------------------------------------------------ Gap Mark */

export const MARK_GEOM = {
  home: [100, 196] as Pt,
  /** The outfield band, from the infield edge out to the wall. */
  rIn: 88,
  rOut: 140,
  /** Fair territory, foul line to foul line (degrees on screen; 270 = straight away center). */
  from: 225,
  to: 315,
  /** Four outfielders, three gaps. Gap width for the two the ball didn't take, and the one it broke through. */
  gapW: 9,
  breakW: 24,
  /** Which gap the ball broke through: 0 = left-center, 1 = the middle, 2 = right-center. */
  breakAt: 0,
  ballR: 16,
  ballAt: 172,
};

/** Boundary rays between the four outfield blocks. */
export const gapAngles = () => {
  const g = MARK_GEOM;
  const step = (g.to - g.from) / 4;
  return [1, 2, 3].map((i) => g.from + step * i);
};

/** The Gap Mark in a 200 x 200 box. */
export function gapMark(): Art {
  const g = MARK_GEOM;
  const c = g.home;
  const rays = gapAngles();
  const widths = rays.map((_, i) => (i === g.breakAt ? g.breakW : g.gapW));
  /** A point on a gap edge: the line parallel to the ray, offset sideways by half the gap, where it meets radius r. */
  const edge = (ray: number, w: number, side: -1 | 1, r: number): Pt => {
    const u: Pt = [Math.cos(rad(ray)), Math.sin(rad(ray))];
    const n: Pt = [-u[1], u[0]];
    const p: Pt = [c[0] + n[0] * side * (w / 2), c[1] + n[1] * side * (w / 2)];
    return lineCircle(p, u, c, r);
  };
  // Each block: from its left boundary to its right one (a foul line or a gap edge).
  const blocks: string[] = [];
  const shards: string[] = [];
  for (let i = 0; i < 4; i++) {
    const leftRay = i === 0 ? null : rays[i - 1];
    const rightRay = i === 3 ? null : rays[i];
    const oL = leftRay === null ? pt(c, g.rOut, g.from) : edge(leftRay, widths[i - 1], 1, g.rOut);
    const iL = leftRay === null ? pt(c, g.rIn, g.from) : edge(leftRay, widths[i - 1], 1, g.rIn);
    const oR = rightRay === null ? pt(c, g.rOut, g.to) : edge(rightRay, widths[i], -1, g.rOut);
    const iR = rightRay === null ? pt(c, g.rIn, g.to) : edge(rightRay, widths[i], -1, g.rIn);
    blocks.push(`M${f(oL[0])} ${f(oL[1])}A${g.rOut} ${g.rOut} 0 0 1 ${f(oR[0])} ${f(oR[1])}L${f(iR[0])} ${f(iR[1])}A${g.rIn} ${g.rIn} 0 0 0 ${f(iL[0])} ${f(iL[1])}Z`);
  }
  // The break: two splinters knocked out past the wall on either side of the ball's path.
  const br = rays[g.breakAt];
  const u: Pt = [Math.cos(rad(br)), Math.sin(rad(br))];
  const n: Pt = [-u[1], u[0]];
  const at = (r: number, s: number): Pt => [c[0] + u[0] * r + n[0] * s, c[1] + u[1] * r + n[1] * s];
  shards.push(poly([at(g.rOut + 4, -g.breakW / 2 - 9), at(g.rOut + 19, -g.breakW / 2 - 17), at(g.rOut + 12, -g.breakW / 2 - 2)]));
  shards.push(poly([at(g.rOut + 5, g.breakW / 2 + 4), at(g.rOut + 14, g.breakW / 2 + 17), at(g.rOut + 20, g.breakW / 2 + 5)]));
  // The line drive: a comet streak from the plate out through the gap, full width at the ball.
  const ball = at(g.ballAt, 0);
  const r0 = g.rIn + 12;
  const r1 = g.ballAt - g.ballR * 0.3;
  const w0 = 1.6;
  const w1 = g.ballR * 0.62;
  const streak = poly([at(r0, w0), at(r1, w1), at(r1, -w1), at(r0, -w0)]);
  return {
    w: 200,
    h: 200,
    shapes: [
      { d: blocks.join("") + shards.join(""), role: "ink" },
      { d: streak, role: "accent" },
      { d: circle(ball[0], ball[1], g.ballR), role: "accent" },
    ],
  };
}

/** The drawn area of the Gap Mark inside its 200 box: [x, y, w, h]. */
export const MARK_BOX: [number, number, number, number] = [0, 20, 200, 128];
const [, MY, , MH] = MARK_BOX;

/* ------------------------------------------------------------------ path helpers */

const CMD = /([MLHVQAZ])([^MLHVQAZ]*)/g;

/** Places an art piece inside another at (x, y) with scale k. */
function place(art: Art, x: number, y: number, k: number): Shape[] {
  return art.shapes.map((s) => ({ ...s, d: transformPath(s.d, x, y, k) }));
}

/** Applies scale k then translate (x, y) to a path of absolute M/L/H/V/Q/A/Z commands. */
export function transformPath(d: string, x: number, y: number, k: number): string {
  return d.replace(CMD, (_, cmd: string, args: string) => {
    const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "H") return `H${f(v[0] * k + x)}`;
    if (cmd === "V") return `V${f(v[0] * k + y)}`;
    if (cmd === "A") return `A${f(v[0] * k)} ${f(v[1] * k)} ${v[2]} ${v[3]} ${v[4]} ${f(v[5] * k + x)} ${f(v[6] * k + y)}`;
    if (cmd === "Z") return "Z";
    const out: string[] = [];
    for (let i = 0; i < v.length; i += 2) out.push(`${f(v[i] * k + x)} ${f(v[i + 1] * k + y)}`);
    return `${cmd}${out.join(" ")}`;
  });
}

/** Rotates a path (absolute commands; H/V are expanded) about the origin by deg, then translates. */
function rotatePath(d: string, deg: number, tx: number, ty: number): string {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const R = (x: number, y: number) => `${f(x * c - y * s + tx)} ${f(x * s + y * c + ty)}`;
  let cx = 0;
  let cy = 0;
  return d.replace(CMD, (_, cmd: string, args: string) => {
    const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "H") {
      cx = v[0];
      return `L${R(cx, cy)}`;
    }
    if (cmd === "V") {
      cy = v[0];
      return `L${R(cx, cy)}`;
    }
    if (cmd === "A") {
      cx = v[5];
      cy = v[6];
      return `A${v[0]} ${v[1]} ${f(v[2] + deg)} ${v[3]} ${v[4]} ${R(cx, cy)}`;
    }
    if (cmd === "Z") return "Z";
    const out: string[] = [];
    for (let i = 0; i < v.length; i += 2) out.push(R(v[i], v[i + 1]));
    cx = v[v.length - 2];
    cy = v[v.length - 1];
    return `${cmd}${out.join(" ")}`;
  });
}

/** A laid-out line as ink, `capH` tall, with its top-left at (x, y). */
function text(line: { w: number; paths: string[] }, x: number, y: number, capH: number): Shape {
  const k = capH / 100;
  return { d: line.paths.map((p) => transformPath(p, x, y, k)).join(""), role: "ink" };
}
const widthOf = (line: { w: number }, capH: number) => (line.w * capH) / 100;

/** Glyphs laid around a circle. `top` reads clockwise over the top; otherwise left to right along the bottom. */
function arcText(glyphs: Glyph[], tracking: number, cx: number, cy: number, r: number, capH: number, top: boolean, centerDeg: number): Shape {
  const k = capH / 100;
  const total = glyphs.reduce((a, g) => a + g.w, 0) + tracking * (glyphs.length - 1);
  const rMid = top ? r + capH / 2 : r - capH / 2;
  const span = ((total * k) / rMid) * (180 / Math.PI);
  const ink: string[] = [];
  let run = 0;
  for (const g of glyphs) {
    const mid = run + g.w / 2;
    run += g.w + tracking;
    const frac = (mid / total - 0.5) * span;
    const phi = top ? centerDeg + frac : centerDeg - frac;
    const [ax, ay] = pt([cx, cy], r, phi);
    const rot = top ? phi + 90 : phi - 90;
    for (const p of g.paths) ink.push(rotatePath(transformPath(p, (-g.w / 2) * k, -100 * k, k), rot, ax, ay));
  }
  return { d: ink.join(""), role: "ink" };
}

/** Rounded rectangle path (clockwise). */
function roundRect(x: number, y: number, w: number, h: number, r: number, reverse = false): string {
  if (!reverse) {
    return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${r} ${r} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${r} ${r} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 1 ${f(x + r)} ${f(y)}Z`;
  }
  return `M${f(x + r)} ${f(y)}A${r} ${r} 0 0 0 ${f(x)} ${f(y + r)}V${f(y + h - r)}A${r} ${r} 0 0 0 ${f(x + r)} ${f(y + h)}H${f(x + w - r)}A${r} ${r} 0 0 0 ${f(x + w)} ${f(y + h - r)}V${f(y + r)}A${r} ${r} 0 0 0 ${f(x + w - r)} ${f(y)}Z`;
}

/** The gap rule: four bars with three gaps, the ball sitting in the left-center gap. */
function gapRule(cx: number, y: number, w: number, h: number): Shape[] {
  const gap = h * 2.6;
  const bar = (w - gap * 3) / 4;
  const x0 = cx - w / 2;
  const bars: string[] = [];
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (bar + gap);
    bars.push(poly([[x, y], [x + bar, y], [x + bar, y + h], [x, y + h]]));
  }
  const bx = x0 + bar + gap / 2;
  return [
    { d: bars.join(""), role: "ink" },
    { d: circle(bx, y + h / 2, h * 1.05), role: "accent" },
  ];
}

/* ------------------------------------------------------------------ wordmark + taglines */

export function plainWordmark() {
  return wordmark();
}

/* ------------------------------------------------------------------ bag tag (the printable badge) */

/**
 * The bag tag: the badge a tournament player clips to a bat bag. A tall rounded tag with a grommet hole at the
 * top, the Gap Mark, GAPPER, the gap rule, OWN THE GAPS and BUILT FOR SLOWPITCH. Exported as "crest" for history.
 */
export function crest(): Art {
  const W = 220;
  const H = 312;
  const shapes: Shape[] = [];
  // The tag with the grommet hole punched through it.
  const hole = { cx: W / 2, cy: 30, r: 9 };
  shapes.push({ d: roundRect(0, 0, W, H, 28) + circleRev(hole.cx, hole.cy, hole.r), role: "ground" });
  // Keyline inset like a stitched edge, and the metal grommet ring.
  shapes.push({ d: roundRect(9, 9, W - 18, H - 18, 21) + roundRect(12.5, 12.5, W - 25, H - 25, 17.5, true), role: "ink" });
  shapes.push({ d: circle(hole.cx, hole.cy, hole.r + 5.5) + circleRev(hole.cx, hole.cy, hole.r + 1.6), role: "ink" });
  // The mark.
  const k = 0.9;
  shapes.push(...place(gapMark(), W / 2 - 100 * k, 58 - MY * k, k));
  // GAPPER.
  const wm = wordmark();
  const capH = 30;
  const wmW = widthOf(wm, capH);
  const nameY = 58 + MH * k + 18;
  shapes.push(text(wm, W / 2 - wmW / 2 - 3, nameY, capH));
  // The gap rule.
  const ruleY = nameY + capH + 13;
  shapes.push(...gapRule(W / 2, ruleY, wmW, 3.2));
  // OWN THE GAPS / BUILT FOR SLOWPITCH.
  const t1 = chivoLine(TAGLINE, 4);
  const t1H = 15;
  shapes.push(text(t1, W / 2 - widthOf(t1, t1H) / 2, ruleY + 17, t1H));
  const t2 = chivoLine(SECONDARY, 8);
  const t2H = 8.4;
  shapes.push(text(t2, W / 2 - widthOf(t2, t2H) / 2, ruleY + 17 + t1H + 10, t2H));
  return { w: W, h: H, shapes };
}

/* ------------------------------------------------------------------ patch */

/** Round patch: GAPPER over the top, BUILT FOR SLOWPITCH under the bottom, the mark in the middle. */
export function patch(): Art {
  const S = 240;
  const c = S / 2;
  const shapes: Shape[] = [{ d: circle(c, c, 120), role: "ground" }];
  shapes.push({ d: circle(c, c, 113) + circleRev(c, c, 109.5), role: "ink" });
  shapes.push({ d: circle(c, c, 77) + circleRev(c, c, 74.5), role: "ink" });
  shapes.push(arcText([G(), A(), P(), P(), E(), R()], 12, c, c, 83, 19, true, 270));
  shapes.push(arcText(chivo(SECONDARY, 6), 2, c, c, 104, 12.5, false, 90));
  for (const a of [180, 0]) {
    const [x, y] = pt([c, c], 92, a);
    shapes.push({ d: circle(x, y, 4.6), role: "accent" });
  }
  const k = 0.62;
  shapes.push(...place(gapMark(), c - 100 * k, c - (MY + MH / 2) * k, k));
  return { w: S, h: S, shapes };
}

/* ------------------------------------------------------------------ horizontal lockup */

/** Mark + GAPPER side by side, for headers and letterheads. */
export function lockupH(): Art {
  const m = gapMark();
  const k = 0.62;
  const wm = wordmark();
  const capH = 50;
  const shapes: Shape[] = [...place(m, 0, -MY * k, k)];
  const x = 200 * k + 14;
  const markH = MH * k;
  shapes.push(text(wm, x, markH - capH - 2, capH));
  return { w: x + widthOf(wm, capH) + capH * 0.18, h: markH, shapes };
}

/** GAPPER over OWN THE GAPS, the tagline set to the wordmark's width. */
export function wordmarkTagline(): Art {
  const wm = wordmark();
  const t = chivoLine(TAGLINE, 6);
  const s = wm.w / t.w;
  const y = 128;
  return {
    w: wm.w + 18,
    h: y + 100 * s,
    shapes: [text(wm, 0, 0, 100), text(t, 0, y, 100 * s)],
  };
}

/** The three brand words as one line, for the brand sheet. */
export function pillars(): Art {
  const line = setLine(chivo("RECORD. ANALYZE. IMPROVE.", 4), []);
  return { w: line.w, h: 100, shapes: [text(line, 0, 0, 100)] };
}
