import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Terms of service", description: "The marketplace terms, prepared for review by a qualified attorney before launch." };

export default function TermsPage() {
  return <ComingSoon title={"Terms of service"} phase={"Phase 7"} description={"The marketplace terms, prepared for review by a qualified attorney before launch."} />;
}
