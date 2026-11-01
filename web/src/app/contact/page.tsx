import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Contact", description: "How to reach support." };

export default function ContactPage() {
  return <ComingSoon title={"Contact"} phase={"Phase 7"} description={"How to reach support."} />;
}
