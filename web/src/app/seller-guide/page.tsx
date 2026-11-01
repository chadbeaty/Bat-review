import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Seller guide", description: "How to photograph, describe, price, pack and ship used equipment, especially long bat boxes." };

export default function SellerGuidePage() {
  return <ComingSoon title={"Seller guide"} phase={"Phase 7"} description={"How to photograph, describe, price, pack and ship used equipment, especially long bat boxes."} />;
}
