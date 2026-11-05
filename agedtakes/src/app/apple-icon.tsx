import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f0e6" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 140, height: 128, border: "12px solid #b0261a", color: "#b0261a", fontSize: 76, fontWeight: 900, transform: "rotate(-4deg)", fontFamily: "serif" }}>AT</div>
      </div>
    ),
    size
  );
}
