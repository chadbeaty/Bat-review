import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Shop all equipment", description: "Search and filter every listing by category, brand, price, condition and location." };

export default function ShopPage() {
  return <ComingSoon title={"Shop all equipment"} phase={"Phase 2"} description={"Search and filter every listing by category, brand, price, condition and location."} />;
}
