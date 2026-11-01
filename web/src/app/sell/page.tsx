import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Sell your gear", description: "List a bat or any other slow-pitch equipment in about three minutes. Free to list; you pay a commission only when it sells." };

export default function SellPage() {
  return <ComingSoon title={"Sell your gear"} phase={"Phase 2"} description={"List a bat or any other slow-pitch equipment in about three minutes. Free to list; you pay a commission only when it sells."} />;
}
