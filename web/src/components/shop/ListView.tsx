import Link from "next/link";
import type { ListingCard } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listingPath } from "@/lib/paths";
import { BatDrawing } from "@/components/BatDrawing";
import { CategoryIcon } from "@/components/icons";
import { PassportDiamonds, StampChips, conditionText, sizeText } from "@/components/ListingBits";

/** The dense data-sheet view for scanning: one row per listing, like a spec sheet. */
export function ListView({ listings, testId }: { listings: ListingCard[]; testId?: string }) {
  return (
    <div>
      <div className="sheet-head" aria-hidden="true">
        <span style={{ gridArea: "art" }} />
        <span style={{ gridArea: "main" }}>Bat</span>
        <span style={{ gridArea: "stamps" }}>Stamps</span>
        <span style={{ gridArea: "size" }}>Size</span>
        <span style={{ gridArea: "cond" }}>Condition</span>
        <span style={{ gridArea: "pass" }}>Passport</span>
        <span style={{ gridArea: "price", justifySelf: "end" }}>Price</span>
      </div>
      <ul className="grid gap-2 pt-2 md:gap-1.5" data-testid={testId}>
        {listings.map((l) => (
          <li key={l.id}>
            <Row listing={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ listing }: { listing: ListingCard }) {
  const extra = listing.extra;
  const bat = extra?.bat ?? null;
  const size = sizeText(extra);
  const place = [listing.locationCity, listing.locationState].filter(Boolean).join(", ");
  return (
    <Link href={listingPath(listing.id)} className="sheet-row group">
      <span className="sheet-art">
        {bat ? (
          <BatDrawing spec={bat} fluid decorative detail />
        ) : (
          <span className="grid h-10 place-items-center text-ink-soft" aria-hidden="true">
            <CategoryIcon slug={extra?.categorySlug} size={32} />
          </span>
        )}
      </span>
      <span className="sheet-main grid gap-0.5">
        {extra?.brand && <span className="label !text-[0.625rem] text-ink-soft">{extra.brand}</span>}
        <span className="disp-c line-clamp-2 text-[1.05rem] group-hover:underline">{listing.title}</span>
        {place && <span className="text-xs text-ink-soft">{place}</span>}
      </span>
      <span className="sheet-price">
        <span className="price-tag text-[0.95rem]">{formatPrice(listing.askingPriceCents)}</span>
      </span>
      <span className="sheet-meta">
        <span className="c-stamps">{extra?.stamps.length ? <StampChips stamps={extra.stamps} max={2} /> : <span className="text-xs text-ink-soft">No stamp listed</span>}</span>
        <span className="c-size font-mono text-xs">{size ?? <span className="text-ink-soft">Size n/a</span>}</span>
        <span className="c-cond text-xs">{conditionText(listing) ?? <span className="text-ink-soft">Not rated</span>}</span>
        <span className="c-pass flex items-center gap-1.5 text-xs">
          <PassportDiamonds filled={extra?.passportFilled} />
        </span>
      </span>
    </Link>
  );
}
