import Link from "next/link";
import type { ReactNode } from "react";
import type { ListingCard } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { BatDrawing } from "@/components/BatDrawing";
import { CategoryIcon } from "@/components/icons";

/**
 * The Rack: a chain-link fence with bats hanging knob-up, drawn to scale from their real specs. Each bat wears a
 * yellow hang tag (price, model, stamp) and the whole thing is one link to the listing. Scrolls sideways on phones.
 */
export function Rack({ listings, wrap = true, testId, children }: { listings: ListingCard[]; wrap?: boolean; testId?: string; children?: ReactNode }) {
  return (
    <div className="fence">
      <div className="wrap pb-6 pt-4">
        <div className={`rack-scroll rack-sway ${wrap ? "wraps" : ""}`} tabIndex={-1}>
          <ul className="rack-row" data-testid={testId}>
            {listings.map((l) => (
              <li key={l.id} className="contents">
                <RackItem listing={l} />
              </li>
            ))}
          </ul>
        </div>
        {children}
      </div>
    </div>
  );
}

function RackItem({ listing }: { listing: ListingCard }) {
  const bat = listing.extra?.bat ?? null;
  const stamp = listing.extra?.stamps?.[0];
  return (
    <Link href={listingPath(listing.id)} className="hang">
      <span className="hang-swing">
        <span className="hook" aria-hidden="true" />
        {bat ? (
          <BatDrawing spec={bat} orientation="vertical" size={8.2} decorative className="bat" />
        ) : (
          <span className="mt-1 ml-[18px] grid h-24 w-24 place-items-center text-ink-soft" aria-hidden="true">
            <CategoryIcon slug={listing.extra?.categorySlug} size={56} />
          </span>
        )}
        <span className="htag">
          <span className="p block">{formatPrice(listing.askingPriceCents)}</span>
          <span className="m block">{listing.title}</span>
          {stamp && <span className="s block">{stamp}</span>}
        </span>
      </span>
    </Link>
  );
}

/** The designed empty fence: shown when there are no real listings. */
export function EmptyFence({ title = "The fence is empty", body = "Be the first to hang a bat.", href = "/sell", cta = "Sell a bat" }: { title?: string; body?: string; href?: string; cta?: string }) {
  return (
    <div className="fence" data-testid="empty-fence">
      <div className="wrap grid gap-5 py-9 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="grid gap-2">
          <div className="rail" aria-hidden="true" />
          <div className="mt-3 grid gap-2 border-2 border-dashed border-ink bg-surface/90 p-5">
            <p className="disp text-2xl sm:text-3xl">
              {title} <span aria-hidden="true">&mdash;</span> <span className="block sm:inline">{body.toLowerCase()}</span>
            </p>
            <p className="text-ink-soft">Every bat that hangs here is a real listing from a real player. Nothing is staged.</p>
          </div>
        </div>
        <Link href={href} className="btn btn-primary self-center px-5 py-3">
          {cta}
        </Link>
      </div>
    </div>
  );
}
