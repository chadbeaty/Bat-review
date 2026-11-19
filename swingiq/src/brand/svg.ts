/**
 * Gapper logo files as SVG markup, all generated from `geometry.ts`. `public/brand/` holds the exported copies
 * (kept in sync by tests/unit/brand.test.ts) and the app's icons and link-preview cards are drawn from these too.
 */
import { joined, mark, tagline, wordmark } from "./geometry";

export const BRAND = {
  navy: "#101827",
  slate: "#202D40",
  lime: "#B7F34A",
  /** The ball on light backgrounds: brand lime is too pale on white, so it deepens. */
  limeOnLight: "#6CA81B",
  white: "#FFFFFF",
  steel: "#8995A6",
} as const;

export type Tone = "dark" | "light" | "mono";
/** Letter and ball colors for each background. `mono` uses currentColor for both (stamps, embossing, one-color print). */
const ink = (tone: Tone) =>
  tone === "dark" ? { fill: BRAND.white, ball: BRAND.lime, sub: BRAND.steel } : tone === "light" ? { fill: BRAND.navy, ball: BRAND.limeOnLight, sub: BRAND.navy } : { fill: "currentColor", ball: "currentColor", sub: "currentColor" };

const svgOpen = (vb: string, title: string, extra = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"${extra}><title>${title}</title>`;
const ballsOf = (bs: { cx: number; cy: number; r: number }[], fill: string) => bs.map((b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="${fill}"/>`).join("");

/** The G symbol on its own. Square viewBox with the ring centered. */
export function markSvg(tone: Tone = "dark"): string {
  const m = mark();
  const c = ink(tone);
  return `${svgOpen("-2 -4 108 108", "Gapper")}<path d="${joined(m.paths)}" fill="${c.fill}"/>${m.ball ? ballsOf([m.ball], c.ball) : ""}</svg>`;
}

/** The GAPPER wordmark (primary logo): the G symbol leads the custom letters. */
export function wordmarkSvg(tone: Tone = "dark"): string {
  const w = wordmark();
  const c = ink(tone);
  return `${svgOpen(`-2 -4 ${w.w + 4} 108`, "Gapper")}<path d="${joined(w.paths)}" fill="${c.fill}"/>${ballsOf(w.balls, c.ball)}</svg>`;
}

/** Secondary logo: wordmark with OWN THE GAP. set to the same width underneath; the period is the ball. */
export function lockupSvg(tone: Tone = "dark"): string {
  const w = wordmark();
  const t = tagline();
  const c = ink(tone);
  const s = w.w / t.w;
  const y = 136;
  return `${svgOpen(`-2 -4 ${w.w + 4} ${y + 100 * s + 8}`, "Gapper. Own the gap.")}<path d="${joined(w.paths)}" fill="${c.fill}"/>${ballsOf(w.balls, c.ball)}<g transform="translate(0 ${y}) scale(${s.toFixed(5)})"><path d="${joined(t.paths)}" fill="${c.sub}"/>${ballsOf(t.balls, c.ball)}</g></svg>`;
}

/** App icon: the symbol on a navy tile. `rounded` false gives a full-bleed square for maskable/PWA icons. */
export function appIconSvg({ rounded = true, scale = 0.62 }: { rounded?: boolean; scale?: number } = {}): string {
  const m = mark();
  const size = 512;
  const k = (size * scale) / 104;
  const ox = (size - 104 * k) / 2;
  const oy = (size - 100 * k) / 2;
  return `${svgOpen(`0 0 ${size} ${size}`, "Gapper")}<rect width="${size}" height="${size}" ${rounded ? 'rx="112"' : ""} fill="${BRAND.navy}"/><g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)}) scale(${k.toFixed(5)})"><path d="${joined(m.paths)}" fill="${BRAND.white}"/>${m.ball ? ballsOf([m.ball], BRAND.lime) : ""}</g></svg>`;
}

/** Every exported brand file, by name in public/brand/. */
export function brandFiles(): Record<string, string> {
  return {
    "gapper-mark.svg": markSvg("dark"),
    "gapper-mark-light.svg": markSvg("light"),
    "gapper-mark-mono.svg": markSvg("mono"),
    "gapper-wordmark.svg": wordmarkSvg("dark"),
    "gapper-wordmark-light.svg": wordmarkSvg("light"),
    "gapper-wordmark-mono.svg": wordmarkSvg("mono"),
    "gapper-lockup-tagline.svg": lockupSvg("dark"),
    "gapper-lockup-tagline-light.svg": lockupSvg("light"),
    "gapper-app-icon.svg": appIconSvg(),
    "gapper-app-icon-square.svg": appIconSvg({ rounded: false, scale: 0.56 }),
  };
}

export const dataUri = (svg: string) => `data:image/svg+xml;base64,${typeof Buffer !== "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg)}`;
