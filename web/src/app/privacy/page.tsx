import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Privacy policy", description: "How member data is collected, used and protected, prepared for legal review before launch." };

export default function PrivacyPage() {
  return <ComingSoon title={"Privacy policy"} phase={"Phase 7"} description={"How member data is collected, used and protected, prepared for legal review before launch."} />;
}
