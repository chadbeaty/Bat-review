import type { NextConfig } from "next";

// Baseline security headers for every response. A strict Content-Security-Policy (with nonces) is added
// before launch, once the Stripe and analytics script sources are known (see docs/CHECKLIST.md).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Thumbnails of the eBay listings shown in "Elsewhere right now" (eBay's own image host).
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ebayimg.com", pathname: "/**" }],
  },
  // Tailwind CSS v4 runs as a Turbopack loader on every stylesheet.
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
