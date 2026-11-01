import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Bats", description: "Every used bat for sale, with filters for brand, model, year, weight, stamp, weighting, condition and price." };

export default function BatsPage() {
  return <ComingSoon title={"Bats"} phase={"Phase 2"} description={"Every used bat for sale, with filters for brand, model, year, weight, stamp, weighting, condition and price."} />;
}
