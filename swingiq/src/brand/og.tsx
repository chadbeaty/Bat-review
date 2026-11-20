import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { crest } from "./emblem";
import { SITE } from "./site";
import { BRAND, artSvg, dataUri } from "./svg";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `${SITE.name}. ${SITE.taglineTitle} ${SITE.secondaryTitle} ${SITE.what}.`;

const TAG = artSvg(crest(), "dark", "Gapper");
const [, , tw, th] = (TAG.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1").split(" ").map(Number);

/** Carbon twill under light from the top, as one background image. */
const carbon = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
<pattern id="w" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#121417"/><rect width="6" height="12" fill="#16181c"/><rect y="0" width="12" height="2" fill="#0d0e10" opacity="0.6"/></pattern>
<radialGradient id="l" cx="0.22" cy="-0.15" r="0.85"><stop offset="0" stop-color="#e6ecf2" stop-opacity="0.14"/><stop offset="1" stop-color="#e6ecf2" stop-opacity="0"/></radialGradient>
<linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7d848b"/><stop offset="0.4" stop-color="#e6e9ec"/><stop offset="0.6" stop-color="#9aa1a8"/><stop offset="1" stop-color="#7d848b" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1200" height="630" fill="url(#w)"/>
<rect width="1200" height="630" fill="url(#l)"/>
<rect x="0" y="0" width="1200" height="3" fill="url(#a)"/>
</svg>`;

/** Chivo instances (SIL OFL, see fonts/OFL.txt) so the card is set in the brand face. */
const font = (f: string) => readFileSync(join(process.cwd(), "src/brand/fonts", f));

/** The card shown when a Gapper link is texted or posted. The headline block leans like the wordmark. */
export function ogImage() {
  const tagW = 300;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", color: BRAND.white }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUri(carbon)} width={1200} height={630} alt="" style={{ position: "absolute", left: 0, top: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 70, padding: "0 84px", width: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(TAG)} width={tagW} height={Math.round((tagW * th) / tw)} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontFamily: "Chivo Black", fontStyle: "italic", fontWeight: 900, fontSize: 112, letterSpacing: -2, lineHeight: 0.9, transform: "skewX(-9deg)", transformOrigin: "left bottom" }}>OWN THE</div>
            <div style={{ display: "flex", fontFamily: "Chivo Black", fontStyle: "italic", fontWeight: 900, fontSize: 112, letterSpacing: -2, lineHeight: 0.9, transform: "skewX(-9deg)", transformOrigin: "left bottom" }}>
              GAPS<span style={{ color: BRAND.lime }}>.</span>
            </div>
            <div style={{ marginTop: 28, fontFamily: "Chivo Black", fontStyle: "italic", fontWeight: 900, fontSize: 40, letterSpacing: 1, color: BRAND.lime, transform: "skewX(-9deg)", transformOrigin: "left bottom" }}>BUILT FOR SLOWPITCH.</div>
            <div style={{ marginTop: 16, fontFamily: "Chivo", fontSize: 26, lineHeight: 1.4, color: "#c6cace", maxWidth: 620 }}>
              Swing analytics for adult slow-pitch softball. Record. Analyze. Improve.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Chivo Black", data: font("Chivo-900Italic.ttf"), weight: 900, style: "italic" },
        { name: "Chivo", data: font("Chivo-400.ttf"), weight: 400, style: "normal" },
      ],
    },
  );
}
