import type { Metadata } from "next";
import { JustHitSession } from "@/components/justhit/JustHitSession";

export const metadata: Metadata = { title: "Just Hit" };

export default function HitPage() {
  return <JustHitSession />;
}
