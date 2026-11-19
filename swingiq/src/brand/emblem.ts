/**
 * The Gapper emblem system: the pictorial Gap Mark, the home-plate crest, the round patch and the horizontal lockup.
 *
 * The Gap Mark is a ballfield from above: the infield diamond at home, the outfield as one bold band, split by the
 * gap in left-center, with a line drive streaking through it and the ball out past the wall. Every shape is a flat
 * fill so it prints in one color (screen print, embroidery, vinyl) as well as full color.
 *
 * Shapes come in three roles so one drawing serves every colorway:
 *   ground: the badge background (navy in full color; knocked out in one color)
 *   ink:    the field, letters and keylines (white in full color)
 *   accent: the ball and its streak (lime in full color)
 */
import { A, E, G, H, N, O, P, R, T_, W_, setLine, space, type Glyph } from "./geometry";

export type Shape = { d: string; role: "ground" | "ink" | "accent" };
export type Art = { w: number; h: number; shapes: Shape[] };

const f = (n: number) => Math.round(n * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;

/** Where a line (point p, unit direction u) meets a circle of radius r around c, taking the far intersection. */
function lineCircle(p: [number, number], u: [number, number], c: [number, number], r: number): [number, number] {
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  const b = dx * u[0] + dy * u[1];
  const cc = dx * dx + dy * dy - r * r;
  const t = -b + Math.sqrt(Math.max(0, b * b - cc));
  return [p[0] + u[0] * t, p[1] + u[1] * t];
}
const angleOf = (c: [number, number], p: [number, number]) => {
  const a = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
};

/* ------------------------------------------------------------------ Gap Mark */

export const MARK_GEOM = {
  home: [100, 190] as [number, number],
  /** Infield: a solid fan out to rInfield with the grass diamond cut out of it. */
  rInfield: 74,
  diamondHalf: 21,
  diamondCenter: 40,
  /** Outfield band between rIn and rOut, split by the gap. */
  rIn: 84,
  rOut: 142,
  /** The gap: its direction (degrees on screen; 270 = dead center field) and width. */
  gapAt: 249,
  gapW: 14,
  ballR: 12.5,
  ballAt: 163,
};

/** The Gap Mark in a 200 x 200 box. */
export function gapMark(): Art {
  const g = MARK_GEOM;
  const c = g.home;
  // Infield fan (clockwise on screen) with the diamond cut out (counter-clockwise, so it stays a hole).
  const i1 = pt(c[0], c[1], g.rInfield, 225);
  const i2 = pt(c[0], c[1], g.rInfield, 315);
  const infield = `M${f(c[0])} ${f(c[1])}L${f(i1[0])} ${f(i1[1])}A${g.rInfield} ${g.rInfield} 0 0 1 ${f(i2[0])} ${f(i2[1])}Z`;
  const dc = c[1] - g.diamondCenter;
  const h = g.diamondHalf;
  const diamondHole = poly([
    [c[0], dc + h],
    [c[0] + h, dc],
    [c[0], dc - h],
    [c[0] - h, dc],
  ]);
  // The gap's two edges: lines parallel to the gap ray, offset either side by half its width.
  const u: [number, number] = [Math.cos(rad(g.gapAt)), Math.sin(rad(g.gapAt))];
  const n: [number, number] = [-u[1], u[0]];
  const edge = (side: number): [number, number] => [c[0] + n[0] * side * (g.gapW / 2), c[1] + n[1] * side * (g.gapW / 2)];
  const L = edge(-1);
  const Rr = edge(1);
  const lo = lineCircle(L, u, c, g.rOut);
  const li = lineCircle(L, u, c, g.rIn);
  const ro = lineCircle(Rr, u, c, g.rOut);
  const ri = lineCircle(Rr, u, c, g.rIn);
  const band = (a1: number, a2: number, outerFrom: [number, number] | null, outerTo: [number, number] | null, innerFrom: [number, number] | null, innerTo: [number, number] | null) => {
    const o1 = outerFrom ?? pt(c[0], c[1], g.rOut, a1);
    const o2 = outerTo ?? pt(c[0], c[1], g.rOut, a2);
    const i2b = innerTo ?? pt(c[0], c[1], g.rIn, a2);
    const i1b = innerFrom ?? pt(c[0], c[1], g.rIn, a1);
    const big = a2 - a1 > 180 ? 1 : 0;
    return `M${f(o1[0])} ${f(o1[1])}A${g.rOut} ${g.rOut} 0 ${big} 1 ${f(o2[0])} ${f(o2[1])}L${f(i2b[0])} ${f(i2b[1])}A${g.rIn} ${g.rIn} 0 ${big} 0 ${f(i1b[0])} ${f(i1b[1])}Z`;
  };
  const leftField = band(225, angleOf(c, lo), null, lo, null, li);
  const restField = band(angleOf(c, ro), 315, ro, null, ri, null);
  // The line drive: a comet streak up the gap, thin where it left the bat, full width at the ball.
  const ball = pt(c[0], c[1], g.ballAt, g.gapAt);
  const P0 = pt(c[0], c[1], g.rIn + 22, g.gapAt);
  const P1 = pt(c[0], c[1], g.ballAt - g.ballR * 0.4, g.gapAt);
  const w0 = 1.1;
  const w1 = g.ballR * 0.56;
  const streak = poly([
    [P0[0] + n[0] * w0, P0[1] + n[1] * w0],
    [P1[0] + n[0] * w1, P1[1] + n[1] * w1],
    [P1[0] - n[0] * w1, P1[1] - n[1] * w1],
    [P0[0] - n[0] * w0, P0[1] - n[1] * w0],
  ]);
  return {
    w: 200,
    h: 200,
    shapes: [
      { d: infield + diamondHole + leftField + restField, role: "ink" },
      { d: streak, role: "accent" },
      { d: circle(ball[0], ball[1], g.ballR), role: "accent" },
    ],
  };
}

/* ------------------------------------------------------------------ helpers */

/** Places an art piece inside another at (x, y) with scale k. */
function place(art: Art, x: number, y: number, k: number): Shape[] {
  return art.shapes.map((s) => ({ ...s, d: transformPath(s.d, x, y, k) }));
}

/** Applies translate + uniform scale to a path of absolute M/L/H/V/A/Z commands. */
export function transformPath(d: string, x: number, y: number, k: number): string {
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, cmd: string, args: string) => {
    const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "H") return `H${f(v[0] * k + x)}`;
    if (cmd === "V") return `V${f(v[0] * k + y)}`;
    if (cmd === "A") return `A${f(v[0] * k)} ${f(v[1] * k)} ${v[2]} ${v[3]} ${v[4]} ${f(v[5] * k + x)} ${f(v[6] * k + y)}`;
    if (cmd === "Z") return "Z";
    return `${cmd}${f(v[0] * k + x)} ${f(v[1] * k + y)}`;
  });
}

/** Rotates a path (absolute commands; H/V are expanded first) about the origin by deg, then translates. */
function rotatePath(d: string, deg: number, tx: number, ty: number): string {
  const c = Math.cos(rad(deg));
  const s = Math.sin(rad(deg));
  const R = (x: number, y: number) => `${f(x * c - y * s + tx)} ${f(x * s + y * c + ty)}`;
  let cx = 0;
  let cy = 0;
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, cmd: string, args: string) => {
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
    cx = v[0];
    cy = v[1];
    return `${cmd}${R(cx, cy)}`;
  });
}

/** Text set from our own letters, as ink shapes, `capH` tall, starting at (x, y) top-left. */
function text(line: ReturnType<typeof setLine>, x: number, y: number, capH: number): Shape[] {
  const k = capH / 100;
  return [
    { d: line.paths.map((p) => transformPath(p, x, y, k)).join(""), role: "ink" },
    ...line.balls.map((b) => ({ d: circle(b.cx * k + x, b.cy * k + y, b.r * k), role: "accent" as const })),
  ];
}

/** Letters laid around a circle. `top` reads clockwise over the top; otherwise it reads left to right along the bottom. */
function arcText(glyphs: Glyph[], tracking: number, cx: number, cy: number, r: number, capH: number, top: boolean, centerDeg: number): Shape[] {
  const k = capH / 100;
  const widths = glyphs.map((g) => g.w);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1);
  const rMid = top ? r + capH / 2 : r - capH / 2;
  const span = ((total * k) / rMid) * (180 / Math.PI);
  const ink: string[] = [];
  const balls: Shape[] = [];
  let run = 0;
  glyphs.forEach((g, i) => {
    const mid = run + g.w / 2;
    run += g.w + tracking;
    const frac = (mid / total - 0.5) * span;
    const phi = top ? centerDeg + frac : centerDeg - frac;
    const [ax, ay] = pt(cx, cy, r, phi);
    const rot = top ? phi + 90 : phi - 90;
    for (const p of g.paths) ink.push(rotatePath(transformPath(p, (-g.w / 2) * k, -100 * k, k), rot, ax, ay));
    if (g.ball) {
      const bx = (g.ball.cx - g.w / 2) * k;
      const by = (g.ball.cy - 100) * k;
      const c = Math.cos(rad(rot));
      const s = Math.sin(rad(rot));
      balls.push({ d: circle(bx * c - by * s + ax, bx * s + by * c + ay, g.ball.r * k), role: "accent" });
    }
    void i;
  });
  return [{ d: ink.join(""), role: "ink" }, ...balls];
}

/** Rounded convex polygon (corner radius r) as a path. */
function roundedPoly(pts: [number, number][], r: number): string {
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const v1 = [p0[0] - p1[0], p0[1] - p1[1]];
    const v2 = [p2[0] - p1[0], p2[1] - p1[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    const a: [number, number] = [p1[0] + (v1[0] / l1) * r, p1[1] + (v1[1] / l1) * r];
    const b: [number, number] = [p1[0] + (v2[0] / l2) * r, p1[1] + (v2[1] / l2) * r];
    d += `${i === 0 ? "M" : "L"}${f(a[0])} ${f(a[1])}Q${f(p1[0])} ${f(p1[1])} ${f(b[0])} ${f(b[1])}`;
  }
  return `${d}Z`;
}

/** Moves every edge of a convex polygon (listed clockwise on screen) inward by d. */
function inset(pts: [number, number][], d: number): [number, number][] {
  const n = pts.length;
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const l = Math.hypot(ex, ey);
    const nx = -ey / l;
    const ny = ex / l; // inward normal for clockwise-on-screen order
    return { p: [p[0] + nx * d, p[1] + ny * d], e: [ex, ey] };
  });
  return lines.map((L1, i) => {
    const L0 = lines[(i - 1 + n) % n];
    const den = L0.e[0] * L1.e[1] - L0.e[1] * L1.e[0];
    const t = ((L1.p[0] - L0.p[0]) * L1.e[1] - (L1.p[1] - L0.p[1]) * L1.e[0]) / den;
    return [L0.p[0] + L0.e[0] * t, L0.p[1] + L0.e[1] * t] as [number, number];
  });
}

/** A ring between two rounded polygons (outer clockwise, inner counter-clockwise), for keylines. */
function polyRing(outer: [number, number][], inner: [number, number][], r1: number, r2: number) {
  return roundedPoly(outer, r1) + roundedPoly([...inner].reverse(), r2);
}

/* ------------------------------------------------------------------ crest */

export const WORD_T2 = 20;
export function plainWordmark() {
  return setLine([G(WORD_T2, false), A(WORD_T2), P(WORD_T2), P(WORD_T2), E(WORD_T2), R(WORD_T2)], [6, 12, 16, 16, 15]);
}
function taglineLine(t = 15) {
  return setLine([O(t), W_(t), N(t), space(56), T_(t), H(t), E(t), space(56), G(t, false), A(t), P(t)], [24, 22, 0, 0, 22, 24, 0, 0, 18, 24]);
}

/**
 * The crest: home plate turned into a shield (flat top, square shoulders, point at the bottom). The Gap Mark fills
 * the top with the ball bursting out through the rim; GAPPER rides a band across the middle; OWN THE GAP sits in the
 * point. Double keyline like a stitched patch.
 */
export function crest(): Art {
  const W = 220;
  const top = 20; // room above the shield for the ball to break out
  const shoulder = top + 214;
  const tip = shoulder + 74;
  const shield: [number, number][] = [
    [0, top],
    [W, top],
    [W, shoulder],
    [W / 2, tip],
    [0, shoulder],
  ];
  const keyOut = inset(shield, 9);
  const keyIn = inset(shield, 12.5);
  const shapes: Shape[] = [{ d: roundedPoly(shield, 18), role: "ground" }, { d: polyRing(keyOut, keyIn, 10, 7), role: "ink" }];
  // The mark, sized so the ball pokes up through the rim.
  const m = gapMark();
  const k = 0.9;
  shapes.push(...place(m, W / 2 - 100 * k, top - 11 - 18 * k, k));
  // GAPPER across the shoulders.
  const wm = plainWordmark();
  const capH = 30;
  const wmW = (wm.w * capH) / 100;
  const nameY = top + 172;
  shapes.push(...text(wm, W / 2 - wmW / 2, nameY, capH));
  // Lime rule under the name, broken in the middle by the ball (the gap again).
  const ruleY = nameY + capH + 10;
  const gapHalf = 9;
  const ruleW = wmW;
  shapes.push({
    d:
      poly([[W / 2 - ruleW / 2, ruleY], [W / 2 - gapHalf, ruleY], [W / 2 - gapHalf, ruleY + 2.8], [W / 2 - ruleW / 2, ruleY + 2.8]]) +
      poly([[W / 2 + gapHalf, ruleY], [W / 2 + ruleW / 2, ruleY], [W / 2 + ruleW / 2, ruleY + 2.8], [W / 2 + gapHalf, ruleY + 2.8]]),
    role: "accent",
  });
  shapes.push({ d: circle(W / 2, ruleY + 1.4, 4), role: "accent" });
  // OWN THE GAP in the point.
  const tg = taglineLine();
  const tgH = 9.5;
  const tgW = (tg.w * tgH) / 100;
  shapes.push(...text(tg, W / 2 - tgW / 2, ruleY + 17, tgH));
  return { w: W, h: tip, shapes };
}

/* ------------------------------------------------------------------ patch */

/** Round patch: GAPPER over the top, OWN THE GAP under the bottom, the mark in the middle, lime balls between. */
export function patch(): Art {
  const S = 240;
  const c = S / 2;
  const shapes: Shape[] = [{ d: circle(c, c, 120), role: "ground" }];
  shapes.push({ d: circle(c, c, 113) + circleRev(c, c, 109.5), role: "ink" });
  shapes.push({ d: circle(c, c, 78) + circleRev(c, c, 75.5), role: "ink" });
  const t = 19;
  shapes.push(...arcText([G(t, false), A(t), P(t), P(t), E(t), R(t)], 18, c, c, 84, 19, true, 270));
  const tt = 15;
  shapes.push(...arcText([O(tt), W_(tt), N(tt), space(46), T_(tt), H(tt), E(tt), space(46), G(tt, false), A(tt), P(tt)], 20, c, c, 103, 12.5, false, 90));
  const sep = 92;
  for (const a of [180, 0]) {
    const [x, y] = pt(c, c, sep, a);
    shapes.push({ d: circle(x, y, 5), role: "accent" });
  }
  const m = gapMark();
  const k = 0.62;
  shapes.push(...place(m, c - 100 * k, c - 104 * k, k));
  return { w: S, h: S, shapes };
}
const circleRev = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 1 ${f(cx - r)} ${f(cy)}Z`;

/* ------------------------------------------------------------------ horizontal lockup */

/** Mark + GAPPER side by side, for headers and letterheads. */
export function lockupH(): Art {
  const m = gapMark();
  const k = 0.5;
  const wm = plainWordmark();
  const capH = 46;
  const shapes: Shape[] = [...place(m, 0, 0, k)];
  const x = 200 * k + 16;
  shapes.push(...text(wm, x, 100 * k - capH / 2 + 18, capH));
  return { w: x + (wm.w * capH) / 100, h: 100, shapes };
}
