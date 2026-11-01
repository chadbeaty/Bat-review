import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "About", description: "Who runs the marketplace and why it exists." };

export default function AboutPage() {
  return <ComingSoon title={"About"} phase={"Phase 7"} description={"Who runs the marketplace and why it exists."} />;
}
