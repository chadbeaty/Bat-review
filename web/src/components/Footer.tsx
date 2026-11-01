import Link from "next/link";
import { brand } from "@/config/brand";
import { Wordmark } from "./Wordmark";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/shop", label: "All equipment" },
      { href: "/bats", label: "Bats" },
      { href: "/shop/gloves", label: "Gloves" },
      { href: "/shop/bags", label: "Bags" },
      { href: "/shop/cleats", label: "Cleats" },
      { href: "/shop/accessories", label: "Accessories" },
      { href: "/manufacturers", label: "Manufacturers" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/price-guide", label: "Bat price guide" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/buyer-protection", label: "Buyer protection" },
      { href: "/seller-guide", label: "Seller guide" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
      { href: "/shipping-policy", label: "Shipping policy" },
      { href: "/returns-policy", label: "Returns and disputes" },
    ],
  },
];

export function Footer() {
  const social = Object.entries(brand.social).filter(([, url]) => url);
  return (
    <footer className="mt-auto border-t border-line bg-surface" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="wrap grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="grid content-start gap-3">
          <Wordmark />
          <p className="max-w-xs text-sm text-ink-soft">{brand.description}</p>
          {social.length > 0 && (
            <ul className="flex gap-3 text-sm">
              {social.map(([name, url]) => (
                <li key={name}>
                  <a href={url} rel="noopener noreferrer" className="capitalize underline">
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="grid content-start gap-2">
            <h2 className="eyebrow">{col.title}</h2>
            <ul className="grid gap-1.5 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-ink-soft hover:text-ink hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="wrap py-5 text-xs text-ink-soft">
          © {new Date().getFullYear()} {brand.name}. {brand.name} is an independent marketplace. Manufacturer names identify products
          only and do not imply affiliation or endorsement. {brand.name} does not manufacture equipment or certify the safety of used
          equipment.
        </p>
      </div>
    </footer>
  );
}
