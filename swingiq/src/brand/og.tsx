import { ImageResponse } from "next/og";
import { SITE } from "./site";
import { BRAND, dataUri, lockupSvg } from "./svg";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = `${SITE.name}. ${SITE.taglineTitle} Hitting analytics on your phone.`;

/** The gap from above, as in the landing page: three fielders, a line drive splitting left-center to the wall. */
const field = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 210">
<path d="M180 196 L22 48 M180 196 L338 48" stroke="#34445d" stroke-width="1.2" fill="none"/>
<path d="M22 48 Q180 -30 338 48" fill="none" stroke="#8995A6" stroke-opacity="0.6" stroke-width="1.6"/>
${[[92, 92], [180, 66], [268, 92]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="30" fill="#ffffff" fill-opacity="0.04" stroke="#8995A6" stroke-opacity="0.4" stroke-dasharray="2 4"/><circle cx="${x}" cy="${y}" r="4" fill="#c3cad5"/>`).join("")}
<path d="M180 190 l9 -9 l-9 -9 l-9 9 z" fill="none" stroke="#c3cad5" stroke-width="1.4"/>
<path d="M180 182 L115 23" stroke="${BRAND.lime}" stroke-width="3" stroke-linecap="round"/>
<circle cx="115" cy="23" r="7" fill="${BRAND.lime}"/></svg>`;

const LOCKUP = lockupSvg("dark");
const [, , vw, vh] = (LOCKUP.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1 1").split(" ").map(Number);

/** The card shown when a Gapper link is texted or posted. */
export function ogImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.navy, color: BRAND.white, padding: "70px 76px" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(LOCKUP)} width={330} height={Math.round((330 * vh) / vw)} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.04 }}>Know your swing.</div>
            <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.04, color: "#c3cad5" }}>Own your game.</div>
            <div style={{ marginTop: 26, fontSize: 27, lineHeight: 1.35, color: BRAND.steel, maxWidth: 560 }}>
              Hitting analytics on your phone: every swing scored, legs and feet first. Exit velo and bat speed from slo-mo.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUri(field)} width={420} height={245} alt="" />
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
