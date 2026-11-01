import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "FAQ", description: "Answers to common questions from buyers and sellers." };

export default function FaqPage() {
  return <ComingSoon title={"FAQ"} phase={"Phase 7"} description={"Answers to common questions from buyers and sellers."} />;
}
