import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { BRAND } from "@/lib/seo";

const COLUMNS = [
  { title: "The archive", links: [["/cases", "Investigations"], ["/people", "People"], ["/predictions", "Prediction scoreboard"], ["/never-sell", "Never Sell Index"], ["/search", "Search"]] },
  { title: "Standards", links: [["/methodology", "Methodology"], ["/corrections", "Corrections"], ["/about", "About & independence"], ["/submit", "Submit a receipt"]] },
  { title: "Legal", links: [["/privacy", "Privacy"], ["/terms", "Terms"]] },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-[3px] border-double border-ink bg-paper-2/60">
      <div className="wrap grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Wordmark size="md" />
          <p className="mt-4 max-w-xs text-ink-2">{BRAND.secondary}</p>
          <p className="meta mt-4 max-w-xs">
            Every public claim links to its original source. Corrections are published, dated and permanent.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <p className="kicker mb-3">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="link text-ink-2">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-rule">
        <div className="wrap flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="meta">© {new Date().getUTCFullYear()} {BRAND.name}. Editorially independent. Sponsors never influence conclusions.</p>
          <p className="meta">Nothing here is investment advice.</p>
        </div>
      </div>
    </footer>
  );
}
