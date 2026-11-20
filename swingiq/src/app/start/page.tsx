import type { Metadata } from "next";
import { Suspense } from "react";
import { StartClient } from "./StartClient";

export const metadata: Metadata = {
  title: "Just Hit",
  description: "Open the camera and hit. No sign-up. Free, on the phone you have, and your swings stay on it.",
};

export default function StartPage() {
  return (
    <Suspense>
      <StartClient />
    </Suspense>
  );
}
