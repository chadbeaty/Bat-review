import { socialCard } from "@/lib/social/card";

export const alt = "Aged Takes — The internet has a long memory.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return socialCard({ template: "investigation", headline: "Some predictions age better than others.", quote: null, footnote: "What they said. What they did. How it held up." });
}
