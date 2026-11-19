import { crest, gapMark, lockupH, patch, type Art } from "@/brand/emblem";
import { wordmarkArt, wordmarkTaglineArt } from "@/brand/svg";

/*
  Gapper logos for the app, drawn from the same geometry as the files in public/brand/ (src/brand/emblem.ts).
  Colors are CSS values per role: ink (field, letters), accent (the ball and its streak), ground (badge background).
*/

const ART = {
  mark: gapMark(),
  crest: crest(),
  patch: patch(),
  lockup: lockupH(),
  wordmark: wordmarkArt(),
  wordmarkTagline: wordmarkTaglineArt(),
};

type Colors = { ink?: string; accent?: string; ground?: string };
type Props = Colors & { className?: string; title?: string; animate?: boolean };

function ArtSvg({ art, width, height, ink = "var(--color-chalk)", accent = "var(--color-optic)", ground = "var(--color-night)", className = "", title, animate, pad = 2, box }: Props & { art: Art; width?: number; height?: number; pad?: number; box?: [number, number, number, number] }) {
  const [vx, vy, vw, vh] = box ?? [-pad, -pad, art.w + pad * 2, art.h + pad * 2];
  const w = width ?? (height ? (height * vw) / vh : undefined);
  const h = height ?? (width ? (width * vh) / vw : undefined);
  const fill = { ink, accent, ground };
  return (
    <svg width={w} height={h} viewBox={`${vx} ${vy} ${vw} ${vh}`} className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {art.shapes.map((s, i) => (
        <path key={i} d={s.d} fill={fill[s.role]} className={animate && s.role === "accent" ? "land" : undefined} style={animate && s.role === "accent" ? { animationDelay: `${0.5 + i * 0.12}s` } : undefined} />
      ))}
    </svg>
  );
}

/** The Gap Mark: a ballfield from above, the outfield split by the gap, the ball streaking out past the wall. */
export function GapMark({ size = 32, ...p }: Props & { size?: number }) {
  // Cropped to the drawing (the 200-unit box has air above the ball), so it centers where it's placed.
  return <ArtSvg art={ART.mark} width={size} box={[-2, 23, 204, 169]} {...p} />;
}

/** Mark + GAPPER side by side: headers and the desktop rail. `height` is the overall height in px. */
export function LockupH({ height = 28, ...p }: Props & { height?: number }) {
  return <ArtSvg art={ART.lockup} height={height} title="Gapper" {...p} />;
}

/** The home-plate crest: the printable badge. */
export function Crest({ width = 160, ...p }: Props & { width?: number }) {
  return <ArtSvg art={ART.crest} width={width} title="Gapper. Own the gap." {...p} />;
}

/** The round patch. */
export function Patch({ width = 160, ...p }: Props & { width?: number }) {
  return <ArtSvg art={ART.patch} width={width} title="Gapper. Own the gap." {...p} />;
}

/** The GAPPER wordmark on its own. `height` is the cap height in px. */
export function Wordmark({ height = 20, ...p }: Props & { height?: number }) {
  return <ArtSvg art={ART.wordmark} height={height * 1.04} title="Gapper" {...p} />;
}

/** Wordmark over OWN THE GAP. */
export function Lockup({ width = 200, ...p }: Props & { width?: number }) {
  return <ArtSvg art={ART.wordmarkTagline} width={width} title="Gapper. Own the gap." ink={p.ink} {...p} />;
}

/** Back-compat name: the symbol. */
export const LogoMark = GapMark;
