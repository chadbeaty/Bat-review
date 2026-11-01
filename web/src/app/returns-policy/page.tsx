import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Returns and disputes", description: "When returns are accepted and how disputes are opened and resolved." };

export default function ReturnsPolicyPage() {
  return <ComingSoon title={"Returns and disputes"} phase={"Phase 5"} description={"When returns are accepted and how disputes are opened and resolved."} />;
}
