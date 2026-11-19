import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { crest } from "./emblem";
import { SITE } from "./site";
import { BRAND, artSvg, dataUri } from "./svg";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `${SITE.name}. ${SITE.taglineTitle} Hitting analytics on your phone.`;

const CREST = artSvg(crest(), "dark", "Gapper");
const [, , cw, ch] = (CREST.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1").split(" ").map(Number);

/** The outfield's mowing stripes and the light from the top, as one background image. */
const turf = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs><radialGradient id="l" cx="0.2" cy="-0.1" r="0.8"><stop offset="0" stop-color="#eaf4ff" stop-opacity="0.13"/><stop offset="1" stop-color="#eaf4ff" stop-opacity="0"/></radialGradient>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#172338"/><stop offset="1" stop-color="#0f1726"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#b)"/>
${Array.from({ length: 22 }, (_, i) => `<path d="M${i * 120 - 400} 630 L${i * 120 - 400 + 255} 0 L${i * 120 - 400 + 315} 0 L${i * 120 - 400 + 60} 630Z" fill="#ffffff" fill-opacity="0.028"/>`).join("")}
<rect width="1200" height="630" fill="url(#l)"/></svg>`;

/** Mona Sans instances (SIL OFL, see fonts/OFL.txt) so the card is set in the brand face. */
const font = (f: string) => readFileSync(join(process.cwd(), "src/brand/fonts", f));

/** The card shown when a Gapper link is texted or posted. */
export function ogImage() {
  const crestW = 360;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: BRAND.white }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(turf)} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 64, padding: "0 80px", width: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(CREST)} width={crestW} height={Math.round((crestW * ch) / cw)} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Mona Expanded", fontSize: 104, letterSpacing: -3, lineHeight: 0.9, transform: "skewX(-8deg)" }}>OWN</div>
            <div style={{ display: "flex", fontFamily: "Mona Expanded", fontSize: 104, letterSpacing: -3, lineHeight: 0.9, transform: "skewX(-8deg)" }}>
              THE GAP<span style={{ color: BRAND.lime }}>.</span>
            </div>
            <div style={{ marginTop: 30, fontFamily: "Mona Semi", fontSize: 36 }}>Know your swing. Own your game.</div>
            <div style={{ marginTop: 14, fontFamily: "Mona", fontSize: 25, lineHeight: 1.35, color: "#c3cad5", maxWidth: 600 }}>
              The hitting lab in your pocket: every swing scored, legs and feet first. Exit velo and bat speed from slo-mo.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Mona Expanded", data: font("MonaSans-ExpandedExtraBold.ttf"), weight: 800, style: "normal" },
        { name: "Mona Semi", data: font("MonaSans-SemiExpandedSemiBold.ttf"), weight: 600, style: "normal" },
        { name: "Mona", data: font("MonaSans-Regular.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
