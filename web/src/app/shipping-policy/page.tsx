import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Shipping policy", description: "How shipping is quoted, paid for, labeled and tracked." };

export default function ShippingPolicyPage() {
  return <ComingSoon title={"Shipping policy"} phase={"Phase 4"} description={"How shipping is quoted, paid for, labeled and tracked."} />;
}
