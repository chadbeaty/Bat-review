import type { Metadata } from "next";
import { StartClient } from "./StartClient";

export const metadata: Metadata = {
  title: "Set up your hitter",
  description: "Set up a hitter and record your first swing. Free, on the phone you have, and your swings stay on it.",
};

export default function StartPage() {
  return <StartClient />;
}
