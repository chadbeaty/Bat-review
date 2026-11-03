import Link from "next/link";
import { brand } from "@/config/brand";
import { LogoMark, LogoWordmark } from "./Logo";

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

/** The footer is a lineup card: each real group of links is a numbered row in the batting order. */
export function Footer() {
  const social = Object.entries(brand.social).filter(([, url]) => url);
  return (
    <footer className="on-ink ink-band mt-auto border-t-[6px] border-double border-[#5a6670]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="wrap grid gap-8 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] md:gap-12">
        <div className="grid content-start gap-4">
          <div className="inline-flex items-center gap-3 text-[#e9ecec]">
            <LogoMark size={44} />
            <LogoWordmark rule={false} className="text-2xl !text-[#e9ecec]" />
          </div>
          <p className="max-w-xs text-sm text-[#b9c4c9]">{brand.description}</p>
          <p className="label !text-[0.625rem] text-[#9fb0b8]">Lineup card · {new Date().getFullYear()}</p>
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
        <ol className="grid border-y-2 border-dashed border-[#5a6670]">
          {COLUMNS.map((col, i) => (
            <li key={col.title} className="grid gap-3 border-b-2 border-dashed border-[#5a6670] py-5 last:border-b-0 sm:grid-cols-[3.25rem_1fr]">
              <span className="font-mono text-2xl font-bold leading-none text-[#9fb0b8]" aria-hidden="true">
                {i + 1}
              </span>
              <nav aria-label={col.title} className="grid gap-3">
                <h2 className="disp text-lg text-[#e9ecec]">{col.title}</h2>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[#d3dadc] hover:text-white hover:underline">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </li>
          ))}
        </ol>
      </div>
      <div className="border-t-2 border-dashed border-[#5a6670]">
        <p className="wrap py-5 text-xs text-[#a9b6bb]">
          © {new Date().getFullYear()} {brand.name}. {brand.name} is an independent marketplace. Manufacturer names identify products
          only and do not imply affiliation or endorsement. {brand.name} does not manufacture equipment or certify the safety of used
          equipment.
        </p>
      </div>
    </footer>
  );
}
