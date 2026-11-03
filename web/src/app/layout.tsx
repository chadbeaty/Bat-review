import type { Metadata, Viewport } from "next";
import { Anybody, Martian_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import { brand, brandCssVariables } from "@/config/brand";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { RoughFilter } from "@/components/RoughFilter";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";

// Anybody is a width + weight variable font; the display look is italic at full width (wdth 150).
const display = Anybody({ subsets: ["latin"], weight: "variable", style: ["normal", "italic"], axes: ["wdth"], display: "swap", variable: "--font-display-face" });
const body = Schibsted_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-body" });
const data = Martian_Mono({ subsets: ["latin"], weight: ["400", "600", "700"], display: "swap", variable: "--font-data" });

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
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:font-bold focus:text-accent-ink">
          Skip to content
        </a>
        {!isSupabaseConfigured && (
          <p className="border-b-2 border-ink bg-surface px-4 py-1.5 text-center text-sm">
            Preview mode: the database isn&apos;t connected, so accounts and listings are off. Catalog data shown is built in.
          </p>
        )}
        <RoughFilter />
        <Header />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
