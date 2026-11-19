import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SwingIQ Live",
    short_name: "SwingIQ",
    description: "Real-time slow-pitch softball swing analysis from your phone.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b0d0c",
    theme_color: "#0b0d0c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
