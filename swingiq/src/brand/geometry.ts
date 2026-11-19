/**
 * Gapper logo geometry: the one source for every logo, icon and lockup.
 *
 * Everything is drawn on a 100-unit cap height. Letters are built from circles and straight strokes so the wordmark
 * is ours, not a typeface. The G is the symbol: an outfield arc with its opening up and to the right (the gap) and the
 * ball sitting in it. Each letter is a list of filled shapes (separate paths, so overlaps never cancel out).
 */

export type Glyph = { w: number; paths: string[]; ball?: { cx: number; cy: number; r: number } };

const f = (n: number) => Math.round(n * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;

/** Annulus arc from a1 to a2 degrees, clockwise on screen (0 = 3 o'clock, 90 = 6 o'clock). */
function ringArc(cx: number, cy: number, R: number, r: number, a1: number, a2: number): string {
  const p = (rr: number, a: number) => `${f(cx + rr * Math.cos(rad(a)))} ${f(cy + rr * Math.sin(rad(a)))}`;
  const large = a2 - a1 > 180 ? 1 : 0;
  if (a2 - a1 >= 360) {
    // Full ring: two half arcs each way.
    return `M${p(R, 0)}A${R} ${R} 0 1 1 ${p(R, 180)}A${R} ${R} 0 1 1 ${p(R, 0)}ZM${p(r, 0)}A${r} ${r} 0 1 0 ${p(r, 180)}A${r} ${r} 0 1 0 ${p(r, 0)}Z`;
  }
  return `M${p(R, a1)}A${R} ${R} 0 ${large} 1 ${p(R, a2)}L${p(r, a2)}A${r} ${r} 0 ${large} 0 ${p(r, a1)}Z`;
}
const rect = (x: number, y: number, w: number, h: number) => `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;

/** The gap: the G opens from GAP_FROM to 360 degrees (upper right), and the ball sits in the middle of it. */
export const GAP_FROM = 299;

/** G: the symbol. Arc + bar; the opening is the gap and `ball` sits in it. */
export function G(T: number, withBall = true): Glyph {
  const R = 52;
  const r = R - T;
  const cx = 52;
  const cy = 50;
  const paths = [ringArc(cx, cy, R, r, 0, GAP_FROM), rect(cx - 2, cy, R + 2, T)];
  const mid = (R + r) / 2;
  const a = (GAP_FROM + 360) / 2;
  return {
    w: 104,
    paths,
    ball: withBall ? { cx: f(cx + mid * Math.cos(rad(a))), cy: f(cy + mid * Math.sin(rad(a))), r: f(T * 0.55) } : undefined,
  };
}

/** A with no crossbar and a flat apex: the open letter. */
export function A(T: number, W = 92): Glyph {
  const apex = T * 1.15;
  const ax1 = (W - apex) / 2;
  const ax2 = (W + apex) / 2;
  const k = ax1 / 100; // horizontal run per unit of height
  const tx = T / Math.cos(Math.atan(k));
  const yi = 100 - (W / 2 - tx) / k;
  return { w: W, paths: [poly([[0, 100], [ax1, 0], [ax2, 0], [W, 100], [W - tx, 100], [W / 2, yi], [tx, 100]])] };
}

/** P: stem and a half-round bowl. */
export function P(T: number): Glyph {
  const Ro = 32;
  const cx = 30;
  return {
    w: cx + Ro,
    paths: [rect(0, 0, T, 100), rect(T - 1, 0, cx - T + 1, T), rect(T - 1, 2 * Ro - T, cx - T + 1, T), ringArc(cx, Ro, Ro, Ro - T, 270, 450)],
  };
}

/** R: P with a diagonal leg kicked out from under the bowl. */
export function R(T: number): Glyph {
  const p = P(T);
  const top = 2 * 32 - T;
  const x0 = 24;
  const run = 18;
  const tx = T / Math.cos(Math.atan(run / (100 - top)));
  return { w: x0 + run + tx, paths: [...p.paths, poly([[x0, top], [x0 + tx, top], [x0 + run + tx, 100], [x0 + run, 100]])] };
}

export function E(T: number): Glyph {
  return { w: 56, paths: [rect(0, 0, T, 100), rect(T - 1, 0, 57 - T, T), rect(T - 1, 50 - T / 2, 51 - T, T), rect(T - 1, 100 - T, 57 - T, T)] };
}
export function O(T: number): Glyph {
  return { w: 104, paths: [ringArc(52, 50, 52, 52 - T, 0, 360)] };
}
export function T_(T: number): Glyph {
  return { w: 64, paths: [rect(0, 0, 64, T), rect(32 - T / 2, 0, T, 100)] };
}
export function H(T: number): Glyph {
  return { w: 70, paths: [rect(0, 0, T, 100), rect(70 - T, 0, T, 100), rect(T - 1, 50 - T / 2, 72 - 2 * T, T)] };
}
export function N(T: number): Glyph {
  const W = 72;
  return { w: W, paths: [rect(0, 0, T, 100), rect(W - T, 0, T, 100), poly([[0, 0], [T * 1.25, 0], [W, 100], [W - T * 1.25, 100]])] };
}
export function W_(T: number): Glyph {
  // Two V's (flat-bottomed, like the A turned over) overlapping into one W.
  const v = (x: number, w: number): string => {
    const foot = T * 1.15;
    const bx1 = x + (w - foot) / 2;
    const bx2 = x + (w + foot) / 2;
    const k = (w - foot) / 2 / 100;
    const tx = T / Math.cos(Math.atan(k));
    const yi = (w / 2 - tx) / k;
    return poly([[x, 0], [x + tx, 0], [x + w / 2, yi], [x + w - tx, 0], [x + w, 0], [bx2, 100], [bx1, 100]]);
  };
  const w = 70;
  const off = w - T * 1.15 - 2;
  return { w: off + w, paths: [v(0, w), v(off, w)] };
}
export function dot(T: number): Glyph {
  return { w: T * 1.2, paths: [], ball: { cx: T * 0.6, cy: 100 - T * 0.6, r: T * 0.6 } };
}
export const space = (w: number): Glyph => ({ w, paths: [] });

/** Lays glyphs out left to right with per-pair spacing; returns paths translated into place. */
export function setLine(glyphs: Glyph[], gaps: number[]): { w: number; paths: string[]; balls: { cx: number; cy: number; r: number }[] } {
  let x = 0;
  const paths: string[] = [];
  const balls: { cx: number; cy: number; r: number }[] = [];
  glyphs.forEach((g, i) => {
    for (const p of g.paths) paths.push(translate(p, x, 0));
    if (g.ball) balls.push({ cx: f(g.ball.cx + x), cy: g.ball.cy, r: g.ball.r });
    x += g.w + (i < gaps.length ? gaps[i] : 0);
  });
  return { w: f(x), paths, balls };
}

/** Shifts every coordinate pair in a path made only of M/L/H/V/A/Z commands. */
function translate(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "H") return `H${f(n[0] + dx)}`;
    if (cmd === "V") return `V${f(n[0] + dy)}`;
    if (cmd === "A") return `A${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4]} ${f(n[5] + dx)} ${f(n[6] + dy)}`;
    if (cmd === "Z") return "Z";
    return `${cmd}${f(n[0] + dx)} ${f(n[1] + dy)}`;
  });
}

/** All shapes as one path: every shape winds clockwise, so overlaps fill solid with no anti-aliasing seams. */
export const joined = (paths: string[]) => paths.join("");

/** The main wordmark weight and the lighter tagline weight. */
export const WORD_T = 19;
export const TAG_T = 16;

export function wordmark() {
  return setLine([G(WORD_T), A(WORD_T), P(WORD_T), P(WORD_T), E(WORD_T), R(WORD_T)], [4, 12, 16, 16, 15]);
}
export function tagline() {
  const t = TAG_T;
  return setLine(
    [O(t), W_(t), N(t), space(64), T_(t), H(t), E(t), space(64), G(t, false), A(t), P(t), dot(t)],
    [26, 24, 0, 0, 24, 26, 0, 0, 20, 26, 18],
  );
}
export function mark() {
  return G(WORD_T);
}
