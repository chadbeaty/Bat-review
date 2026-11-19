import { ImageResponse } from "next/og";
import { LOGO_SVG } from "@/components/Logo";

export const alt = "SwingIQ: the slow-pitch swing lab in your pocket";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The card that shows when the link is texted or posted. */
export default function TwitterImage() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG(null)).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 84px",
          background: "radial-gradient(90% 70% at 18% 0%, #2a2214 0%, #0b0b0d 55%, #060607 100%)",
          color: "#f5f2ea",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          { }
          <img src={src} width={120} height={120} alt="" />
          <div style={{ display: "flex", fontSize: 64, letterSpacing: 14, fontWeight: 600 }}>
            SWING<span style={{ color: "#d7b46a" }}>IQ</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 66, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, maxWidth: 900 }}>The slow-pitch swing lab in your pocket.</div>
          <div style={{ marginTop: 22, fontSize: 30, color: "#bfbab0" }}>Every swing scored, legs and feet first. Exit velo from slo-mo.</div>
        </div>
        <div style={{ display: "flex", height: 4, width: 220, background: "linear-gradient(90deg, #f3dfa6, #d7b46a, #a87f3e)", borderRadius: 2 }} />
      </div>
    ),
    size,
  );
}
