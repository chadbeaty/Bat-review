import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Buyer protection", description: "What is covered if an item does not arrive or is not as described, and how disputes are handled." };

export default function BuyerProtectionPage() {
  return <ComingSoon title={"Buyer protection"} phase={"Phase 7"} description={"What is covered if an item does not arrive or is not as described, and how disputes are handled."} />;
}
