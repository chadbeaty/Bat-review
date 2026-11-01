import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import "./globals.css";
import { brand, brandCssVariables } from "@/config/brand";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display-face" });
const body = Public_Sans({ subsets: ["latin"], variable: "--font-body" });
const data = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-data" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${brand.name}: used slow-pitch softball bats and gear`, template: `%s · ${brand.name}` },
  description: brand.description,
  openGraph: { siteName: brand.name, type: "website", description: brand.description },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: brand.colors.paper, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${data.variable} h-full antialiased`}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brandCssVariables() }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {!isSupabaseConfigured && (
          <p className="bg-accent px-4 py-1.5 text-center text-sm text-accent-ink">
            Preview mode: the database isn&apos;t connected, so accounts and listings are off. Catalog data shown is built in.
          </p>
        )}
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
