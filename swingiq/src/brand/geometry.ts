/**
 * Gapper logo geometry: the drawn letters of the GAPPER wordmark, and Chivo Black Italic set as shapes for taglines.
 *
 * The wordmark is ours, not a typeface: heavy squared letters with chamfered corners (like the cut edges of a carbon
 * bat graphic), leaning forward at 10 degrees. The G is left open at the top right: that opening is the gap.
 * Everything is drawn on a 100-unit cap height, caps from y = 0 to the baseline at y = 100, using straight lines
 * only, so the lean is an exact shear and the files print cleanly at any size.
 */
import { CHIVO_BLACK_ITALIC, CHIVO_SPACE } from "./type";

export type Pt = [number, number];
export type Glyph = { w: number; paths: string[] };

const f = (n: number) => Math.round(n * 100) / 100;

/** Stroke weight and corner chamfer of the wordmark letters (units of the 100-unit cap height). */
export const STROKE = 22;
export const CHAMFER = 20;
/** Forward lean of the wordmark: tan(10 degrees). */
export const LEAN = 0.1763;

/** Inner chamfer that keeps the stroke even around a cut corner. */
const inner = (c = CHAMFER, t = STROKE) => Math.max(4, c - t * 0.4142);

/** Signed area on screen (y down): positive = clockwise as you look at it. */
function area(pts: Pt[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}
/** Every outer contour winds clockwise and every counter (hole) counter-clockwise, so overlaps fill solid. */
const orient = (pts: Pt[], hole = false): Pt[] => ((area(pts) > 0) !== hole ? pts : [...pts].reverse());
const lean = ([x, y]: Pt): Pt => [x + (100 - y) * LEAN, y];
const path = (pts: Pt[], hole = false) => `M${orient(pts, hole).map(lean).map(([x, y]) => `${f(x)} ${f(y)}`).join("L")}Z`;

/** G: a chamfered ring left open at the top right (the gap), with a crossbar coming in from the right. */
export function G(): Glyph {
  const W = 96;
  const T = STROKE;
  const c = CHAMFER;
  const ci = inner();
  const barTop = 40;
  const barBot = barTop + T;
  const topEnd = 64; // where the top bar stops: the gap runs from here to the right edge
  return {
    w: W,
    paths: [
      path([
        [topEnd, 0], [c, 0], [0, c], [0, 100 - c], [c, 100], [W - c, 100], [W, 100 - c], [W, barTop], [W / 2 + 2, barTop],
        [W / 2 + 2, barBot], [W - T, barBot], [W - T, Math.max(barBot, 100 - T - ci)], [W - T - ci, 100 - T], [T + ci, 100 - T],
        [T, 100 - T - ci], [T, T + ci], [T + ci, T], [topEnd, T],
      ]),
    ],
  };
}

/** A: chamfered shoulders, a full crossbar, a squared counter. */
export function A(): Glyph {
  const W = 92;
  const T = STROKE;
  const c = CHAMFER;
  const ci = inner();
  const barTop = 50;
  return {
    w: W,
    paths: [
      path([[0, 100], [0, c], [c, 0], [W - c, 0], [W, c], [W, 100], [W - T, 100], [W - T, barTop + T], [T, barTop + T], [T, 100]]),
      path([[T, barTop], [T, T + ci], [T + ci, T], [W - T - ci, T], [W - T, T + ci], [W - T, barTop]], true),
    ],
  };
}

/** P: a stem and a squared bowl with its two right corners cut. */
export function P(): Glyph {
  const W = 80;
  const T = STROKE;
  const c = CHAMFER;
  const ci = inner();
  const bowl = 68; // bottom of the bowl
  return {
    w: W,
    paths: [
      path([[0, 100], [0, 0], [W - c, 0], [W, c], [W, bowl - c], [W - c, bowl], [T, bowl], [T, 100]]),
      path([[T, T], [W - T - ci, T], [W - T, T + ci], [W - T, bowl - T - ci], [W - T - ci, bowl - T], [T, bowl - T]], true),
    ],
  };
}

/** R: the P with a leg kicked out from under the bowl. */
export function R(): Glyph {
  const p = P();
  const T = STROKE;
  const W = 86;
  const legW = T * 1.18;
  const x0 = 34;
  return { w: W, paths: [...p.paths, path([[x0, 60], [x0 + legW, 60], [W, 100], [W - legW, 100]])] };
}

/** E: a stem and three arms; the outer left corners are cut. */
export function E(): Glyph {
  const W = 62;
  const T = STROKE;
  const c = CHAMFER;
  const mid = 50 - T / 2;
  return {
    w: W,
    paths: [
      path([
        [0, c], [c, 0], [W, 0], [W, T], [T, T], [T, mid], [W - 6, mid], [W - 6, mid + T], [T, mid + T], [T, 100 - T], [W, 100 - T],
        [W, 100], [c, 100], [0, 100 - c],
      ]),
    ],
  };
}

export const space = (w: number): Glyph => ({ w, paths: [] });

/** Lays glyphs out left to right with per-pair spacing; returns the paths moved into place. */
export function setLine(glyphs: Glyph[], gaps: number[]): { w: number; paths: string[] } {
  let x = 0;
  const paths: string[] = [];
  glyphs.forEach((g, i) => {
    for (const p of g.paths) paths.push(translate(p, x, 0));
    x += g.w + (i < gaps.length ? gaps[i] : 0);
  });
  return { w: f(x), paths };
}

/** Shifts every point in a path of absolute M/L/H/V/Q/A/Z commands. */
export function translate(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d;
  return d.replace(/([MLHVQAZ])([^MLHVQAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === "H") return `H${f(n[0] + dx)}`;
    if (cmd === "V") return `V${f(n[0] + dy)}`;
    if (cmd === "A") return `A${n[0]} ${n[1]} ${n[2]} ${n[3]} ${n[4]} ${f(n[5] + dx)} ${f(n[6] + dy)}`;
    if (cmd === "Z") return "Z";
    const out: string[] = [];
    for (let i = 0; i < n.length; i += 2) out.push(`${f(n[i] + dx)} ${f(n[i + 1] + dy)}`);
    return `${cmd}${out.join(" ")}`;
  });
}

/** The GAPPER wordmark: drawn letters, optically spaced (the open G and the A's shoulders sit tighter). */
export function wordmark() {
  return setLine([G(), A(), P(), P(), E(), R()], [7, 11, 13, 13, 12]);
}

/** Chivo Black Italic glyphs for a line of capitals, as Glyphs on the 100-unit cap height. `track` adds space. */
export function chivo(text: string, track = 0): Glyph[] {
  return [...text.toUpperCase()].map((ch) => {
    if (ch === " ") return space(CHIVO_SPACE + track);
    const g = CHIVO_BLACK_ITALIC[ch];
    if (!g) throw new Error(`No baked glyph for "${ch}": add it to scripts/bake-brand-type.py`);
    return { w: g.w + track, paths: [g.d] };
  });
}

/** A line of Chivo Black Italic capitals as one laid-out line. */
export function chivoLine(text: string, track = 0) {
  const gs = chivo(text, track);
  return setLine(gs, gs.map(() => 0));
}

export const TAGLINE = "OWN THE GAPS";
export const SECONDARY = "BUILT FOR SLOWPITCH";
