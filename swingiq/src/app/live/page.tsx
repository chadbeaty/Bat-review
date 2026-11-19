import type { Metadata } from "next";
import { LiveSession } from "@/components/live/LiveSession";

export const metadata: Metadata = { title: "Live session" };

export default function LivePage() {
  return <LiveSession />;
}
