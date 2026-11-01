import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "How it works", description: "How buying, selling, payment, shipping and payouts work on the marketplace." };

export default function HowItWorksPage() {
  return <ComingSoon title={"How it works"} phase={"Phase 7"} description={"How buying, selling, payment, shipping and payouts work on the marketplace."} />;
}
