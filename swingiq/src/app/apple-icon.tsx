import { ImageResponse } from "next/og";
import { LOGO_SVG } from "@/components/Logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the gold seam mark on onyx. */
export default function AppleIcon() {
  const src = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG(null)).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "linear-gradient(160deg, #18181b 0%, #070708 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        { }
        <img src={src} width={132} height={132} alt="" />
      </div>
    ),
    size,
  );
}
