import type { Metadata, Viewport } from "next";
import { Chivo } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PlayerProvider } from "@/components/PlayerProvider";
import { SITE } from "@/brand/site";
import "./globals.css";

/** One family for the whole brand: black italic capitals for headlines and big numbers, regular for reading. */
const chivo = Chivo({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-chivo", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.what}. ${SITE.secondaryTitle}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE.name, url: SITE.url, title: `${SITE.name}: ${SITE.what}`, description: SITE.description },
  twitter: { card: "summary_large_image", title: `${SITE.name}: ${SITE.what}`, description: SITE.description },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0c0e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={chivo.variable}>
      <body>
        <PlayerProvider>
          <AppShell>{children}</AppShell>
        </PlayerProvider>
      </body>
    </html>
  );
}
