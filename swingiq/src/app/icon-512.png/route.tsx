import { ImageResponse } from "next/og";
import { LOGO_SVG } from "@/components/Logo";

/** Install icon (512 px). Maskable-safe: the mark sits well inside the middle 80%. */
export function GET() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG(null)).toString("base64")}`;
  const s = 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, #18181b 0%, #070708 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={Math.round(s * 0.62)} height={Math.round(s * 0.62)} alt="" />
      </div>
    ),
    { width: s, height: s },
  );
}
