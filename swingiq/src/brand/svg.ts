/**
 * Gapper logo files as SVG markup, all generated from `emblem.ts` and `geometry.ts`. `public/brand/` holds the
 * exported copies (kept in sync by tests/unit/brand.test.ts); the app icons and the link-preview card are drawn from
 * these too, and scripts/export-brand-print.mjs turns them into print-ready PDF and PNG files.
 */
import { crest, gapMark, lockupH, patch, plainWordmark, transformPath, type Art, type Shape } from "./emblem";
import { tagline } from "./geometry";

export const BRAND = {
  navy: "#101827",
  slate: "#202D40",
  lime: "#B7F34A",
  /** The ball on light backgrounds: brand lime is too pale on white, so it deepens. */
  limeOnLight: "#6CA81B",
  white: "#FFFFFF",
  steel: "#8995A6",
  black: "#000000",
} as const;

/**
 * Colorways:
 *  - dark:  full color for dark backgrounds (navy badge, white field and letters, lime ball)
 *  - light: full color for light backgrounds (navy letters and field, deep lime ball; badges keep their navy)
 *  - black: one color. Badges print solid with the art knocked out; open marks print solid.
 *  - white: one color for dark garments. Only the art prints, in white; the shirt shows through as the badge.
 */
export type Colorway = "dark" | "light" | "black" | "white";

function colorsFor(cw: Colorway): Record<Shape["role"], string> {
  if (cw === "dark") return { ground: BRAND.navy, ink: BRAND.white, accent: BRAND.lime };
  if (cw === "light") return { ground: BRAND.navy, ink: BRAND.navy, accent: BRAND.limeOnLight };
  if (cw === "black") return { ground: BRAND.black, ink: BRAND.black, accent: BRAND.black };
  return { ground: "none", ink: BRAND.white, accent: BRAND.white };
}

/** Renders an emblem piece. On a badge (has ground) in `light`, the art inside stays white so the badge reads the same. */
export function artSvg(art: Art, cw: Colorway, title: string, pad = 4): string {
  const hasGround = art.shapes.some((s) => s.role === "ground");
  const c = colorsFor(cw);
  if (cw === "light" && hasGround) Object.assign(c, { ink: BRAND.white, accent: BRAND.lime });
  const vb = `${-pad} ${-pad} ${art.w + pad * 2} ${art.h + pad * 2}`;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>`;
  if (cw === "black" && hasGround) {
    // Knock the art out of the badge, and keep any art that sits outside the badge (the ball breaking out) solid.
    const ground = art.shapes.filter((s) => s.role === "ground").map((s) => s.d).join("");
    const els = art.shapes.filter((s) => s.role !== "ground").map((s) => s.d);
    const box = `x="${-pad - 2}" y="${-pad - 2}" width="${art.w + pad * 2 + 4}" height="${art.h + pad * 2 + 4}"`;
    const id = `g${Math.round(art.w)}x${Math.round(art.h)}`;
    return `${head}<defs><mask id="${id}k" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/>${els.map((d) => `<path d="${d}" fill="#000"/>`).join("")}</mask><mask id="${id}o" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><path d="${ground}" fill="#000"/></mask></defs><path d="${ground}" fill="${c.ground}" mask="url(#${id}k)"/><path d="${els.join("")}" fill="${c.ink}" mask="url(#${id}o)"/></svg>`;
  }
  return `${head}${art.shapes
    .filter((s) => c[s.role] !== "none")
    .map((s) => `<path d="${s.d}" fill="${c[s.role]}"/>`)
    .join("")}</svg>`;
}

/** The GAPPER wordmark as an Art piece (ink only). */
export function wordmarkArt(): Art {
  const w = plainWordmark();
  return { w: w.w, h: 100, shapes: [{ d: w.paths.join(""), role: "ink" }] };
}

/** Secondary logo: the wordmark over OWN THE GAP., the tagline set to the same width; the period is the ball. */
export function wordmarkTaglineArt(): Art {
  const w = plainWordmark();
  const t = tagline();
  const s = w.w / t.w;
  const y = 136;
  const shapes: Shape[] = [
    { d: w.paths.join(""), role: "ink" },
    { d: t.paths.map((p) => transformPath(p, 0, y, s)).join(""), role: "ink" },
    ...t.balls.map((b) => ({ d: `M${b.cx * s - b.r * s} ${y + b.cy * s}a${b.r * s} ${b.r * s} 0 1 0 ${b.r * s * 2} 0a${b.r * s} ${b.r * s} 0 1 0 ${-b.r * s * 2} 0Z`, role: "accent" as const })),
  ];
  return { w: w.w, h: y + 100 * s, shapes };
}

/** App icon: the Gap Mark on a navy tile. `rounded` false gives a full-bleed square (maskable/PWA; the OS rounds it). */
export function appIconSvg({ rounded = true, scale = 0.74 }: { rounded?: boolean; scale?: number } = {}): string {
  const m = gapMark();
  const size = 512;
  const k = (size * scale) / 200;
  // The mark's drawing sits in y 25..190 of its box; center that span.
  const ox = (size - 200 * k) / 2;
  const oy = (size - 165 * k) / 2 - 25 * k;
  const inner = m.shapes.map((s) => `<path d="${transformPath(s.d, ox, oy, k)}" fill="${s.role === "ink" ? BRAND.white : BRAND.lime}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Gapper"><title>Gapper</title><rect width="${size}" height="${size}" ${rounded ? 'rx="112"' : ""} fill="${BRAND.navy}"/>${inner}</svg>`;
}

/** Every exported brand file, by name in public/brand/. */
export function brandFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (name: string, art: Art, title: string, cws: Colorway[]) => {
    for (const cw of cws) out[`gapper-${name}${cw === "dark" ? "" : `-${cw}`}.svg`] = artSvg(art, cw, title);
  };
  set("crest", crest(), "Gapper. Own the gap.", ["dark", "black", "white"]);
  set("patch", patch(), "Gapper. Own the gap.", ["dark", "black", "white"]);
  set("mark", gapMark(), "Gapper", ["dark", "light", "black", "white"]);
  set("lockup", lockupH(), "Gapper", ["dark", "light", "black", "white"]);
  set("wordmark", wordmarkArt(), "Gapper", ["dark", "light", "black"]);
  set("wordmark-tagline", wordmarkTaglineArt(), "Gapper. Own the gap.", ["dark", "light", "black"]);
  out["gapper-app-icon.svg"] = appIconSvg();
  out["gapper-app-icon-square.svg"] = appIconSvg({ rounded: false, scale: 0.66 });
  return out;
}

export const dataUri = (svg: string) => `data:image/svg+xml;base64,${typeof Buffer !== "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg)}`;
