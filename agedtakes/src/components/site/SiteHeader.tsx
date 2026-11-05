import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { MobileMenu } from "./MobileMenu";

export const NAV = [
  { href: "/cases", label: "Investigations" },
  { href: "/people", label: "People" },
  { href: "/predictions", label: "Predictions" },
  { href: "/never-sell", label: "Never Sell" },
  { href: "/methodology", label: "Methodology" },
];

function today() {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date());
}

export function SiteHeader() {
  return (
    <header className="border-b border-ink">
      <div className="border-b border-rule">
        <div className="wrap flex h-8 items-center justify-between">
          <span className="meta hidden sm:inline">{today()}</span>
          <span className="meta">The internet has a long memory.</span>
          <span className="meta hidden items-center gap-4 sm:flex">
            <Link href="/submit" className="link">Submit a receipt</Link>
            <Link href="/#newsletter" className="link">Newsletter</Link>
          </span>
        </div>
      </div>
      <div className="wrap flex items-center justify-between gap-4 py-4">
        <Link href="/" aria-label="Aged Takes — home" className="shrink-0">
          <Wordmark size="md" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="font-mono text-xs uppercase tracking-[0.12em] text-ink-2 hover:text-red">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <form action="/search" className="hidden md:block" role="search">
            <label htmlFor="header-search" className="sr-only">Search people and predictions</label>
            <input id="header-search" name="q" type="search" placeholder="Search the archive" className="field !w-52 !py-1.5 !text-sm" />
          </form>
          <Link href="/search" className="btn btn-ghost btn-sm md:hidden" aria-label="Search">Search</Link>
          <MobileMenu items={NAV} />
        </div>
      </div>
    </header>
  );
}
