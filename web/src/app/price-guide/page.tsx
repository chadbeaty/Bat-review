import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Bat price guide", description: "A page for every bat model with current asking prices, verified sold prices and trends, kept strictly separate." };

export default function PriceGuidePage() {
  return <ComingSoon title={"Bat price guide"} phase={"Phase 6"} description={"A page for every bat model with current asking prices, verified sold prices and trends, kept strictly separate."} />;
}
