import { ImageResponse } from "next/og";
import type { CaseType } from "@/lib/editorial";

// Share-image generator for approved cases: one design system, several templates and sizes.
// Formats: "og" (1200×630, links on X/Facebook/LinkedIn), "square" (1080×1080, Instagram/Facebook feed),
// "story" (1080×1920, Instagram Stories, TikTok, YouTube Shorts covers).

export const FORMATS = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const;
export type SocialFormat = keyof typeof FORMATS;

export const TEMPLATES = {
  aged_poorly: { label: "PREDICTION AGED POORLY", color: "#b0261a" },
  aged_well: { label: "PREDICTION AGED WELL", color: "#2e5a3a" },
  did_they_sell: { label: "DID THEY SELL?", color: "#8c1d13" },
  never_sell: { label: "NEVER SELL", color: "#8c1d13" },
  broken_promise: { label: "BROKEN PROMISE", color: "#b0261a" },
  kept_promise: { label: "PROMISE KEPT", color: "#2e5a3a" },
  investigation: { label: "INVESTIGATION", color: "#15130f" },
  weekly: { label: "THE WEEKLY AGED TAKES", color: "#b0261a" },
} as const;
export type SocialTemplate = keyof typeof TEMPLATES;

export function templateForCaseType(t: CaseType): SocialTemplate {
  switch (t) {
    case "prediction_aged_poorly": return "aged_poorly";
    case "prediction_aged_well": return "aged_well";
    case "did_they_sell": return "did_they_sell";
    case "never_sell": return "never_sell";
    case "broken_promise": return "broken_promise";
    case "kept_promise": return "kept_promise";
    default: return "investigation";
  }
}

export type CardInput = {
  template: SocialTemplate;
  headline: string;
  subject?: string | null;
  quote?: string | null;
  date?: string | null;
  confidence?: string | null;
  isDemo?: boolean;
  /** A short required qualification shown on every card (e.g. "A transfer is not a sale."). */
  footnote?: string | null;
  url?: string | null;
};

// Brand fonts for share images, fetched once per server instance from Google Fonts as TTF (Satori cannot read
// WOFF2). If the font host is unreachable the card still renders with the default font.
let fontCache: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 800; style: "normal" | "italic" }[]> | null = null;

async function fetchFont(family: string, weight: number, italic = false): Promise<ArrayBuffer> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:${italic ? "ital," : ""}wght@${italic ? "1," : ""}${weight}`, {
    // An older user agent makes Google serve TTF.
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
    signal: AbortSignal.timeout(4000),
  }).then((r) => r.text());
  const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
  if (!url) throw new Error("font url not found");
  return fetch(url, { signal: AbortSignal.timeout(4000) }).then((r) => r.arrayBuffer());
}

export function loadBrandFonts() {
  fontCache ??= Promise.all([
    fetchFont("Fraunces", 800).then((data) => ({ name: "Fraunces", data, weight: 800 as const, style: "normal" as const })),
    fetchFont("Source+Serif+4", 400, true).then((data) => ({ name: "Source Serif", data, weight: 400 as const, style: "italic" as const })),
    fetchFont("IBM+Plex+Mono", 400).then((data) => ({ name: "Plex Mono", data, weight: 400 as const, style: "normal" as const })),
  ]).catch(() => {
    fontCache = null;
    return [];
  });
  return fontCache;
}

function clip(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

export async function socialCard(input: CardInput, format: SocialFormat = "og") {
  const { width, height } = FORMATS[format];
  const fonts = await loadBrandFonts();
  const has = (name: string) => fonts.some((f) => f.name === name);
  const display = has("Fraunces") ? "Fraunces" : "serif";
  const italic = has("Source Serif") ? "Source Serif" : "serif";
  const mono = has("Plex Mono") ? "Plex Mono" : "monospace";
  const t = TEMPLATES[input.template];
  const tall = format === "story";
  const pad = tall ? 90 : 64;
  const headSize = format === "og" ? (input.headline.length > 90 ? 46 : 56) : tall ? 84 : 66;
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: "#f5f0e6", color: "#15130f", padding: pad, fontFamily: display }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "6px solid #15130f", paddingBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: tall ? 54 : 40, fontWeight: 900, letterSpacing: -1 }}>
            <span>AGED</span>
            <span style={{ marginLeft: 12, color: "#b0261a", border: "5px solid #b0261a", padding: "0 10px", transform: "rotate(-2deg)" }}>TAKES</span>
          </div>
          {input.isDemo && <div style={{ display: "flex", background: "#15130f", color: "#f5f0e6", fontSize: 20, padding: "6px 12px", letterSpacing: 3, fontFamily: mono }}>DEMO ONLY · FICTIONAL</div>}
        </div>
        <div style={{ display: "flex", marginTop: tall ? 120 : 34, fontSize: tall ? 30 : 22, letterSpacing: 5, color: t.color, fontFamily: mono }}>
          <span style={{ border: `3px solid ${t.color}`, padding: "6px 12px", transform: "rotate(-1.5deg)" }}>{t.label}</span>
        </div>
        <div style={{ display: "flex", marginTop: 26, fontSize: headSize, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5 }}>{clip(input.headline, tall ? 140 : 120)}</div>
        {input.quote && (format !== "og" || input.headline.length < 70) && (
          <div style={{ display: "flex", marginTop: 28, borderLeft: "8px solid #b0261a", paddingLeft: 22, fontSize: tall ? 44 : 30, fontStyle: "italic", fontFamily: italic, color: "#37332c", lineHeight: 1.25 }}>
            “{clip(input.quote, tall ? 220 : 140)}”
          </div>
        )}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid #15130f", paddingTop: 16, fontSize: tall ? 28 : 21, color: "#37332c", fontFamily: mono }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{[input.subject, input.date].filter(Boolean).join(" · ")}</span>
            {input.confidence && <span>EVIDENCE: {input.confidence.toUpperCase()}</span>}
          </div>
          {input.footnote && <div style={{ display: "flex", marginTop: 8, color: "#85600c" }}>{clip(input.footnote, 110)}</div>}
          <div style={{ display: "flex", marginTop: 8, color: "#6b655b" }}>{input.url ? clip(input.url.replace(/^https?:\/\//, ""), 70) : "THE INTERNET HAS A LONG MEMORY."}</div>
        </div>
      </div>
    ),
    { width, height, fonts: fonts.length ? fonts : undefined }
  );
}

/** The qualification a template must always carry, so virality never strips the context. */
export function requiredFootnote(template: SocialTemplate): string | null {
  if (template === "did_they_sell" || template === "never_sell") return "A transfer or exchange deposit is not, by itself, a sale. Sources in the full case.";
  if (template === "aged_poorly" || template === "aged_well") return "Scored against the stated deadline and resolution criteria.";
  return "Full evidence and sources at the link.";
}
