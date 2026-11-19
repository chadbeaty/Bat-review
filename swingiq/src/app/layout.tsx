import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Michroma } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PlayerProvider } from "@/components/PlayerProvider";
import "./globals.css";

const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const michroma = Michroma({ subsets: ["latin"], weight: "400", variable: "--font-michroma", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SwingIQ Live", template: "%s · SwingIQ Live" },
  description: "The slow-pitch swing lab in your pocket: every swing scored, legs and feet first, exit velo from slo-mo.",
  applicationName: "SwingIQ Live",
  appleWebApp: { capable: true, title: "SwingIQ", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#060607",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${michroma.variable}`}>
      <body>
        <PlayerProvider>
          <AppShell>{children}</AppShell>
        </PlayerProvider>
      </body>
    </html>
  );
}
