import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { PlayerProvider } from "@/components/PlayerProvider";
import { SITE } from "@/brand/site";
import "./globals.css";

/** One family for the whole brand: wide for headings and numbers, normal width for reading. */
const mona = Mona_Sans({ subsets: ["latin"], axes: ["wdth"], variable: "--font-mona", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.taglineTitle}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE.name, url: SITE.url, title: `${SITE.name}. ${SITE.taglineTitle}`, description: SITE.description },
  twitter: { card: "summary_large_image", title: `${SITE.name}. ${SITE.taglineTitle}`, description: SITE.description },
  appleWebApp: { capable: true, title: SITE.name, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#101827",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mona.variable}>
      <body>
        <PlayerProvider>
          <AppShell>{children}</AppShell>
        </PlayerProvider>
      </body>
    </html>
  );
}
