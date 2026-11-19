import { ImageResponse } from "next/og";
import { appIconSvg, dataUri } from "@/brand/svg";

/** Install icon (192 px). Full-bleed navy with the symbol inside the maskable safe zone (middle 80%). */
export function GET() {
  return new ImageResponse(
    (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={dataUri(appIconSvg({ rounded: false, scale: 0.56 }))} width={192} height={192} alt="" />
    ),
    { width: 192, height: 192 },
  );
}
