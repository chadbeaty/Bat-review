import { ImageResponse } from "next/og";
import { appIconSvg, dataUri } from "@/brand/svg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the Gap Mark on navy. Full-bleed; iOS rounds the corners itself. */
export default function AppleIcon() {
  return new ImageResponse(
    (
       
      <img src={dataUri(appIconSvg({ rounded: false, scale: 0.72 }))} width={180} height={180} alt="" />
    ),
    size,
  );
}
