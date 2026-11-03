import { BatDrawing } from "@/components/BatDrawing";
import { batSpecFromCatalog, describeBat } from "@/lib/bat-drawing";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ListingCard } from "@/components/ListingCard";
import { EmptyState } from "@/components/EmptyState";
import { FirstSwingsForm, ReviewAlertForm, WatchForm } from "@/components/bats/MemberForms";
import { PriceTrendChart } from "@/components/bats/PriceTrendChart";
import { ReviewList } from "@/components/bats/ReviewList";
import { BatMiniCard } from "@/components/bats/BatMiniCard";
import { findBatByPath, getBatDetail, getBatSettings, type BatDetail } from "@/lib/bats";
import {
  CONFIDENCE_LABELS,
  CONSTRUCTION_LABELS,
  MATERIAL_LABELS,
  RELATION_LABELS,
  formatInches,
  formatRange,
  formatWeights,
  maturityInfo,
  weightingText,
} from "@/lib/bat-display";
import { askingBreakdown, askingStats, monthlyTrend, normalizeThresholds, soldBreakdown, soldStats, type PriceThresholds, type SoldStats } from "@/lib/price-stats";
import { BALL_TYPES, DURABILITY_OPTIONS, POP_OPTIONS, STING_LABELS, hitsLabel, optionLabel, summarizeOwnerReports } from "@/lib/owner-reports";
import { formatPrice } from "@/lib/format";
import { compareHref } from "@/lib/compare";
import { siteUrl } from "@/lib/env";
import { brand } from "@/config/brand";
import { EbayElsewhere, passportCompareFromCatalog } from "@/components/EbayElsewhere";
import { matchModelForBat } from "@/lib/catalog-match-data";
import { isEbayEnabled } from "@/lib/ebay/config";

type Params = { manufacturer: string; model: string; year: string };

const loadBat = cache(async (p: Params) => findBatByPath(p.manufacturer, p.model, p.year));

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const bat = await loadBat(await params);
  if (!bat) return { title: "Bat model not found" };
  const title = `${bat.productName} ${bat.stamps.join("/")}: specs, prices and owner reports`;
  const description = `${bat.productName} (${bat.stamps.join(" / ") || "stamp not listed"}): listed specs, current asking prices, verified sold prices, published reviews and First Swings owner reports on ${brand.name}.`;
  return {
    title,
    description,
    alternates: { canonical: bat.path },
    openGraph: { title, description, url: bat.path, type: "website" },
  };
}

export default async function BatModelPage({ params }: { params: Promise<Params> }) {
  const bat = await loadBat(await params);
  if (!bat) notFound();
  const settings = await getBatSettings();
  const detail = await getBatDetail(bat, settings.intervalDays);
  const thresholds = normalizeThresholds(settings.minSales, settings.fullSales);
  const maturity = maturityInfo(detail.maturity?.maturity ?? null, { windowDays: settings.windowDays, threshold: settings.earlyThreshold });
  const signInHref = `/sign-in?next=${encodeURIComponent(bat.path)}`;
  // Live eBay listings for this model (off unless eBay is configured). Gamer Bat's own listings stay first.
  const ebayModel = isEbayEnabled() ? await matchModelForBat(bat) : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: bat.productName,
    brand: { "@type": "Brand", name: bat.manufacturerName },
    category: "Slow-pitch softball bat",
    url: `${siteUrl}${bat.path}`,
    ...(detail.specRows.find((s) => s.partNumber)?.partNumber ? { mpn: detail.specRows.find((s) => s.partNumber)!.partNumber } : {}),
    additionalProperty: [
      { "@type": "PropertyValue", name: "Model year", value: bat.modelYear },
      { "@type": "PropertyValue", name: "Certification stamps", value: bat.stamps.join(" / ") },
      ...(bat.barrelLengthInches ? [{ "@type": "PropertyValue", name: "Barrel length", value: bat.barrelLengthInches, unitCode: "INH" }] : []),
    ],
  };

  return (
    <div className="wrap grid gap-10 py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <nav aria-label="Breadcrumb" className="text-sm text-ink-soft">
        <Link href="/price-guide" className="underline">
          Bat database
        </Link>{" "}
        /{" "}
        <Link href={`/manufacturers/${bat.manufacturerSlug}`} className="underline">
          {bat.manufacturerName}
        </Link>{" "}
        / <span>{bat.modelYear}</span>
      </nav>

      <Header detail={detail} maturity={maturity} />

      <Specs detail={detail} />

      <Market detail={detail} thresholds={thresholds} />

      {ebayModel && (
        <EbayElsewhere
          model={ebayModel}
          compare={passportCompareFromCatalog({
            stamps: bat.stamps,
            certificationStatus: detail.certificationStatus,
            certificationSource: detail.certificationSource,
            sales: detail.sales,
            minSales: thresholds.minSales,
          })}
        />
      )}

      <Lineage detail={detail} />

      <Reviews detail={detail} />

      <FirstSwings detail={detail} threshold={settings.earlyThreshold} intervalDays={settings.intervalDays} signInHref={signInHref} />

      <DurabilitySection detail={detail} minOwners={settings.durabilityMinOwners} />

      <section className="grid gap-4 md:grid-cols-2" aria-labelledby="follow-heading">
        <h2 id="follow-heading" className="display text-3xl font-bold md:col-span-2">
          Follow this bat
        </h2>
        <div className="card grid content-start gap-3 p-5">
          <h3 className="font-semibold">Review alerts</h3>
          {detail.viewer.signedIn ? (
            <ReviewAlertForm productId={bat.id} current={detail.viewer.alerts} />
          ) : (
            <SignInPrompt href={signInHref} text="Sign in to get an alert when this bat gets its first review, early owner reports or its first listing." />
          )}
        </div>
        <div className="card grid content-start gap-3 p-5">
          <h3 className="font-semibold">Watchlist</h3>
          {detail.viewer.signedIn ? (
            <WatchForm productId={bat.id} watch={detail.viewer.watch} />
          ) : (
            <SignInPrompt href={signInHref} text="Sign in to watch this model, with an optional target price." />
          )}
        </div>
      </section>

      {detail.alternatives.length > 0 && (
        <section className="grid gap-4" aria-labelledby="alternatives-heading">
          <div className="grid gap-1">
            <h2 id="alternatives-heading" className="display text-3xl font-bold">
              Reviewed alternatives
            </h2>
            <p className="max-w-2xl text-sm text-ink-soft">
              Other models with published reviews and alike listed specs: a shared stamp, the same weighting and construction, and a barrel within half an
              inch. Alike specs don&apos;t mean alike performance.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.alternatives.map((b) => (
              <li key={b.id}>
                <BatMiniCard bat={b} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.related.length > 0 && (
        <section className="grid gap-4" aria-labelledby="related-heading">
          <h2 id="related-heading" className="display text-3xl font-bold">
            More from the {bat.productLineName ?? "same"} line
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.related.map((b) => (
              <li key={b.id}>
                <BatMiniCard bat={b} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SignInPrompt({ href, text }: { href: string; text: string }) {
  return (
    <div className="grid justify-items-start gap-3">
      <p className="text-sm text-ink-soft">{text}</p>
      <Link href={href} className="btn btn-outline">
        Sign in
      </Link>
    </div>
  );
}

function Header({ detail, maturity }: { detail: BatDetail; maturity: { label: string; explanation: string } }) {
  const { bat } = detail;
  return (
    <header className="grid gap-5">
      <div className="grid gap-2">
        <p className="eyebrow">{bat.manufacturerName}</p>
        <h1 className="display text-4xl font-bold sm:text-5xl">{bat.productName}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {bat.stamps.map((s) => (
            <span key={s} className="stamp-chip">
              {s}
            </span>
          ))}
          <span data-testid="release-badge" className="rounded-sm bg-ink px-3 py-1 text-xs font-semibold text-surface">
            {maturity.label}
          </span>
        </div>
        <p className="max-w-2xl text-sm text-ink-soft">{maturity.explanation}</p>
      </div>
      <div className="grid-paper border-2 border-ink px-4 py-5 sm:px-8">
        <BatDrawing spec={batSpecFromCatalog(bat)} fluid label={`${describeBat(batSpecFromCatalog(bat))}, drawn from the catalog's listed specs. Colors are decorative.`} />
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border-2 border-ink bg-ink sm:grid-cols-4">
        <Fact label="Weighting" value={weightingText(bat.weightingType, bat.endloadOz)} />
        <Fact label="Construction" value={CONSTRUCTION_LABELS[bat.constructionType] ?? "Not listed"} />
        <Fact label="Material" value={MATERIAL_LABELS[bat.material] ?? "Not listed"} />
        <Fact label="Barrel length" value={formatInches(bat.barrelLengthInches)} />
      </dl>
      <div className="flex flex-wrap gap-3">
        <Link href={compareHref([bat.slug])} className="btn btn-primary">
          Compare with other bats
        </Link>
        <Link href="#first-swings" className="btn btn-outline">
          First Swings owner reports
        </Link>
      </div>
    </header>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid content-start gap-1 bg-surface p-4">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Specs({ detail }: { detail: BatDetail }) {
  const { bat } = detail;
  const anyVerified = detail.specRows.some((s) => s.verified);
  const source = detail.specRows.find((s) => s.verificationSource)?.verificationSource ?? detail.certificationSource;
  const status = anyVerified ? "Verified" : "Unverified retailer listing";
  const rows: [string, string, string][] = [
    ["Manufacturer", bat.manufacturerName, "Catalog"],
    ["Model", bat.modelName, status],
    ["Model year", bat.modelYear ? String(bat.modelYear) : "Not listed", status],
    ["Stamps", bat.stamps.join(" / ") || "Not listed", detail.certificationStatus === "unverified" ? "Unverified: check the barrel and your league's list" : detail.certificationStatus.replace(/_/g, " ")],
    ["Available weights", formatWeights(bat.weights), bat.weights.length ? status : "Not listed by the source"],
    ["Weighting", weightingText(bat.weightingType, bat.endloadOz), status],
    ["Construction", CONSTRUCTION_LABELS[bat.constructionType] ?? "Not listed", status],
    ["Material", MATERIAL_LABELS[bat.material] ?? "Not listed", status],
    ["Barrel length", formatInches(bat.barrelLengthInches), status],
    ["Barrel diameter", formatInches(bat.barrelDiameterInches), bat.barrelDiameterInches ? status : "Not listed by the source"],
    ["Length", bat.lengthInches ? `${bat.lengthInches}"` : "Not listed", "Standard slow-pitch length, not confirmed by the listing"],
  ];
  const partNumber = detail.specRows.find((s) => s.partNumber)?.partNumber;
  if (partNumber) rows.push(["Part number", partNumber, status]);
  if (detail.listedPrice) rows.push(["Retailer list price (new)", `${detail.listedPrice.typical ? "About " : ""}$${detail.listedPrice.usd}`, "From a retailer listing; not a used price"]);

  return (
    <section className="grid gap-4" aria-labelledby="specs-heading">
      <div className="grid gap-1">
        <h2 id="specs-heading" className="display text-3xl font-bold">
          Specs
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          {anyVerified
            ? "Some specs have been checked. The status column says which."
            : "These specs come from retailer and manufacturer listings and haven't been verified by us yet. Unknown values are shown as not listed, never guessed."}{" "}
          {source && /^https?:\/\//.test(source) && (
            <a href={source} rel="nofollow noopener" target="_blank" className="underline">
              View the source listing
            </a>
          )}
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-soft">
              <th className="p-3 font-medium">Spec</th>
              <th className="p-3 font-medium">Value</th>
              <th className="p-3 font-medium">Verification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, s]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <th scope="row" className="p-3 font-medium">
                  {label}
                </th>
                <td className="p-3">{value}</td>
                <td className="p-3 text-ink-soft">{s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm" data-testid="warranty">
        <span className="font-semibold">Warranty: </span>
        {detail.manufacturer.warrantySummary ?? "Warranty terms not on file."}{" "}
        {detail.manufacturer.warrantySummary && <span className="text-ink-soft">({detail.manufacturer.warrantySource ?? "Check the manufacturer's current terms."})</span>}
        {detail.manufacturer.warrantySourceUrl && (
          <a href={detail.manufacturer.warrantySourceUrl} rel="nofollow noopener" target="_blank" className="ml-1 underline">
            Warranty terms
          </a>
        )}
      </p>
    </section>
  );
}

function SoldBlock({ stats, t }: { stats: SoldStats; t: PriceThresholds }) {
  if (stats.tier === "insufficient")
    return (
      <div className="grid gap-1">
        <p className="font-semibold">Not enough verified sales yet</p>
        <p className="text-sm text-ink-soft">
          {stats.count === 0 ? "No verified sales of this model yet." : `${stats.count} verified ${stats.count === 1 ? "sale" : "sales"} so far.`} We show sold
          prices once a model has at least {t.minSales} verified sales on {brand.name}.
        </p>
      </div>
    );
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {stats.tier === "full" && <Stat label="Actual average completed sale price" value={formatPrice(stats.averageCents)} />}
      <Stat label={stats.tier === "full" ? "Completed sale price range" : "Indicative completed sale price range"} value={formatRange(stats.minCents, stats.maxCents)} />
      <Stat label="Number of verified sales" value={String(stats.count)} />
      <Stat label="Date range covered" value={stats.firstDate === stats.lastDate ? stats.firstDate : `${stats.firstDate} to ${stats.lastDate}`} />
      {stats.tier === "indicative" && (
        <p className="text-sm text-warning sm:col-span-2" role="note">
          Small sample: only {stats.count} verified sales. Treat this range as a rough guide; we show an average from {t.fullSales} sales.
        </p>
      )}
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-mono text-lg">{value}</dd>
    </div>
  );
}

function Market({ detail, thresholds }: { detail: BatDetail; thresholds: PriceThresholds }) {
  const asking = askingStats(detail.listings);
  const sold = soldStats(detail.sales, thresholds);
  const trend = monthlyTrend(detail.sales);
  const soldByWeight = sold.tier === "insufficient" ? [] : soldBreakdown(detail.sales, "weight", thresholds);
  const soldByCondition = sold.tier === "insufficient" ? [] : soldBreakdown(detail.sales, "condition", thresholds);
  const askingByWeight = asking && asking.count > 1 ? askingBreakdown(detail.listings, "weight") : [];
  return (
    <section className="grid gap-5" aria-labelledby="prices-heading">
      <div className="grid gap-1">
        <h2 id="prices-heading" className="display text-3xl font-bold">
          Prices for this model
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          Asking prices are what sellers want today; sold prices are what buyers actually paid in completed orders here. We keep them apart and never blend
          them into one number. Only this exact model, year and stamp is counted.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card grid content-start gap-3 p-5" data-testid="asking-prices">
          <h3 className="font-semibold">Asking prices (live listings)</h3>
          {asking ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Stat label="Current asking-price range" value={formatRange(asking.minCents, asking.maxCents)} />
              <Stat label="Average current asking price" value={formatPrice(asking.averageCents)} />
              <Stat label="Active listings" value={String(asking.count)} />
            </dl>
          ) : (
            <p className="text-sm text-ink-soft">No active listings for this model right now.</p>
          )}
          {askingByWeight.length > 1 && <BreakdownTable title="Asking by weight" rows={askingByWeight.map((g) => ({ label: g.label, value: `${formatRange(g.stats.minCents, g.stats.maxCents)} (${g.stats.count})` }))} />}
        </div>
        <div className="card grid content-start gap-3 p-5" data-testid="sold-prices">
          <h3 className="font-semibold">Sold prices (verified sales)</h3>
          <SoldBlock stats={sold} t={thresholds} />
          {soldByWeight.length > 1 && <BreakdownTable title="Sold by weight" rows={soldByWeight.map((g) => ({ label: g.label, value: breakdownValue(g.stats) }))} />}
          {soldByCondition.length > 1 && <BreakdownTable title="Sold by condition" rows={soldByCondition.map((g) => ({ label: g.label, value: breakdownValue(g.stats) }))} />}
        </div>
      </div>
      {sold.tier !== "insufficient" ? (
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">Verified sold-price trend</h3>
          <PriceTrendChart sales={detail.sales} trend={trend} showAverages={sold.tier === "full"} />
        </div>
      ) : (
        <p className="text-sm text-ink-soft">A price trend chart appears here once there are enough verified sales.</p>
      )}
      <div className="grid gap-3">
        <h3 className="font-semibold">For sale now</h3>
        {detail.listings.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {detail.listings.slice(0, 8).map((l) => (
              <li key={l.id}>
                <ListingCard listing={l} />
              </li>
            ))}
          </ul>
        ) : null}
        {detail.listings.length > 8 && (
          <p className="text-sm text-ink-soft">
            Showing the 8 newest of {detail.listings.length} listings for this model. The asking-price figures above use all of them.
          </p>
        )}
        {detail.listings.length === 0 && (
          <EmptyState title="None listed right now" body="Nobody is selling this exact model at the moment. Set an alert below to hear when one is listed." action={{ href: "/sell", label: "Sell yours" }} />
        )}
      </div>
    </section>
  );
}

function breakdownValue(s: SoldStats): string {
  if (s.tier === "insufficient") return `Not enough verified sales yet (${s.count})`;
  if (s.tier === "indicative") return `${formatRange(s.minCents, s.maxCents)} (${s.count}, small sample)`;
  return `Avg ${formatPrice(s.averageCents)}, ${formatRange(s.minCents, s.maxCents)} (${s.count})`;
}

function BreakdownTable({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-1 text-sm">
      <p className="font-medium">{title}</p>
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1">
            <span>{r.label}</span>
            <span className="font-mono">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Lineage({ detail }: { detail: BatDetail }) {
  const note = detail.lineageNote;
  const predecessors = detail.lineage.filter((l) => l.direction === "predecessor");
  const successors = detail.lineage.filter((l) => l.direction === "successor");
  const siblings = detail.lineage.filter((l) => l.direction === "sibling");
  const namedOnly = note && !note.predecessor_in_catalog && note.predecessor_name;
  const hasAnything = predecessors.length || successors.length || siblings.length || namedOnly || (note?.changes.length ?? 0) > 0;
  return (
    <section className="grid gap-4" aria-labelledby="lineage-heading" data-testid="lineage">
      <h2 id="lineage-heading" className="display text-3xl font-bold">
        What changed from last year
      </h2>
      <div className="card grid gap-4 p-5">
        {!hasAnything ? (
          <p className="text-ink-soft">
            We haven&apos;t identified a previous version of this model. Manufacturers don&apos;t publish year-over-year changelogs, so we only link models
            when retailer or manufacturer listings support it.
          </p>
        ) : (
          <>
            {note && (
              <p className="text-sm">
                <span className="rounded-sm border border-line-strong px-2 py-0.5 text-xs font-semibold">{CONFIDENCE_LABELS[note.confidence] ?? note.confidence}</span>{" "}
                <span className="text-ink-soft">Lineage is our research from retailer and manufacturer listings, not a manufacturer statement.</span>
              </p>
            )}
            {predecessors.map((l) => (
              <p key={l.other.id}>
                <span className="font-semibold">Previous version: </span>
                <Link href={l.other.path} className="underline">
                  {l.other.productName}
                </Link>{" "}
                <span className="text-sm text-ink-soft">({CONFIDENCE_LABELS[l.confidence]})</span>
              </p>
            ))}
            {namedOnly && (
              <p>
                <span className="font-semibold">Previous version: </span>
                {note.predecessor_name} <span className="text-sm text-ink-soft">(not in our catalog yet)</span>
              </p>
            )}
            {successors.map((l) => (
              <p key={l.other.id}>
                <span className="font-semibold">Newer version: </span>
                <Link href={l.other.path} className="underline">
                  {l.other.productName}
                </Link>
              </p>
            ))}
            {siblings.length > 0 && (
              <div>
                <p className="font-semibold">Same platform this year</p>
                <ul className="list-disc pl-5">
                  {siblings.map((l) => (
                    <li key={l.other.id}>
                      <Link href={l.other.path} className="underline">
                        {l.other.productName}
                      </Link>{" "}
                      <span className="text-sm text-ink-soft">({RELATION_LABELS[l.relation]})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {note && note.changes.length > 0 && (
              <div>
                <p className="font-semibold">Reported changes</p>
                <ul className="list-disc pl-5 text-sm">
                  {note.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {note && (
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">Why we think so: </span>
                {note.basis}
              </p>
            )}
            {note && note.sources.length > 0 && (
              <div className="text-sm">
                <p className="font-medium">Sources</p>
                <ul className="grid gap-1">
                  {note.sources.map((s) => (
                    <li key={s} className="break-all">
                      <a href={s} rel="nofollow noopener" target="_blank" className="underline">
                        {s.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Reviews({ detail }: { detail: BatDetail }) {
  const { bat } = detail;
  const none = !detail.reviews.length && !detail.lineReviews.length && !detail.predecessorReviews.length;
  return (
    <section className="grid gap-5" aria-labelledby="reviews-heading">
      <div className="grid gap-1">
        <h2 id="reviews-heading" className="display text-3xl font-bold">
          Published reviews
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          Reviews published elsewhere, with a short summary of what each source says. Ratings are the source&apos;s own; we don&apos;t score bats.
        </p>
      </div>
      {none && (
        <EmptyState
          title="No published reviews yet"
          body="We haven't found a published review of this model. First Swings owner reports below are the earliest evidence; set a review alert to hear when one appears."
        />
      )}
      {detail.reviews.length > 0 && <ReviewList title={`Reviews of the ${bat.productName}`} reviews={detail.reviews} testId="reviews-model" />}
      {detail.predecessorReviews.map((p) => (
        <ReviewList
          key={p.predecessor.id}
          title={`Reviews of the ${p.predecessor.productName}`}
          note="These reviews are of the previous version, not this bat. Changes between years can matter."
          reviews={p.reviews}
          testId="reviews-predecessor"
        />
      ))}
      {detail.lineReviews.length > 0 && (
        <ReviewList
          title={`Reviews covering the ${bat.productLineName ?? ""} line`}
          note="These cover the line in general or other versions and years, not necessarily this exact model."
          reviews={detail.lineReviews}
          testId="reviews-line"
        />
      )}
    </section>
  );
}

function FirstSwings({ detail, threshold, intervalDays, signInHref }: { detail: BatDetail; threshold: number; intervalDays: number; signInHref: string }) {
  const s = summarizeOwnerReports(detail.ownerReports, threshold);
  const nextAt = detail.viewer.nextReportAt ? new Date(detail.viewer.nextReportAt) : null;
  const popTotal = s.pop.better + s.pop.same + s.pop.worse + s.pop.not_sure;
  return (
    <section id="first-swings" className="grid scroll-mt-28 gap-5" aria-labelledby="first-swings-heading">
      <div className="grid gap-1">
        <h2 id="first-swings-heading" className="display text-3xl font-bold">
          First Swings
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft">
          Dated check-ins from owners of this bat. Each owner counts once (their latest check-in). These are personal impressions, not measurements.
        </p>
      </div>

      <div className="card grid gap-4 p-5" data-testid="first-swings-summary">
        {s.owners === 0 ? (
          <p className="text-ink-soft">No owner reports yet. If you own this bat, yours could be the first.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Owners reporting" value={String(s.owners)} />
              <Stat label="Verified owners" value={String(s.verifiedOwners)} />
              <Stat label="Average sting (1–5)" value={s.stingAverage != null ? `${s.stingAverage} (${s.stingResponses})` : "Not enough answers"} />
              <Stat label="Median temperature" value={s.medianTemperatureF != null ? `${s.medianTemperatureF}°F (${s.temperatureResponses})` : "Not stated"} />
            </dl>
            {s.smallSample && (
              <p className="text-sm text-warning" role="note">
                Small sample: {s.owners} {s.owners === 1 ? "owner has" : "owners have"} reported. We need {threshold} before calling these early reports.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Pop compared with their previous gamer</p>
                <ul className="mt-1 grid gap-1 text-sm">
                  {POP_OPTIONS.map((o) => {
                    const n = s.pop[o.value];
                    return (
                      <li key={o.value} className="grid grid-cols-[1fr_auto] items-center gap-2">
                        <span>{o.label}</span>
                        <span className="font-mono">{n}</span>
                        <span className="col-span-2 h-1.5 rounded-full bg-line">
                          <span className="block h-1.5 rounded-full bg-ink" style={{ width: `${popTotal ? (n / popTotal) * 100 : 0}%` }} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div>
                <p className="text-sm font-medium">Balls they hit</p>
                <ul className="mt-1 grid gap-1 text-sm">
                  {s.ballTypes.map((b) => (
                    <li key={b.value} className="flex justify-between gap-2">
                      <span>{optionLabel(BALL_TYPES, b.value)}</span>
                      <span className="font-mono">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card grid gap-4 p-5">
        <h3 className="font-semibold">File a check-in</h3>
        {detail.viewer.signedIn ? (
          <>
            {nextAt && detail.viewer.lastReportAt && (
              <p className="text-sm text-ink-soft" role="note">
                Your last check-in on this bat was on {new Date(detail.viewer.lastReportAt!).toLocaleDateString("en-US", { dateStyle: "medium" })}. Your next one
                opens on {nextAt.toLocaleDateString("en-US", { dateStyle: "medium" })}.
              </p>
            )}
            <FirstSwingsForm productId={detail.bat.id} weights={detail.bat.weights} intervalDays={intervalDays} />
          </>
        ) : (
          <SignInPrompt href={signInHref} text={`Own this bat? Sign in to file a First Swings check-in. One check-in per bat every ${intervalDays} days.`} />
        )}
      </div>

      {detail.latestReports.length > 0 && (
        <div className="grid gap-3">
          <h3 className="font-semibold">Latest check-ins</h3>
          <ul className="grid gap-3 md:grid-cols-2" data-testid="latest-reports">
            {detail.latestReports.map((r) => (
              <li key={r.id} className="card grid gap-2 p-4 text-sm">
                <p className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{r.ownershipVerified ? "Verified owner" : "Owner"}</span>
                  <span className="text-ink-soft">{new Date(r.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
                </p>
                <p className="text-ink-soft">
                  {[r.weightOz ? `${r.weightOz} oz` : null, hitsLabel(r.hitsSoFar), optionLabel(BALL_TYPES, r.ballType), r.temperatureF != null ? `${r.temperatureF}°F` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p>
                  {optionLabel(POP_OPTIONS, r.popVsPreviousGamer)}
                  {r.previousGamer ? ` (previous: ${r.previousGamer})` : ""}. Sting: {r.sting ? `${r.sting}/5 ${STING_LABELS[r.sting]}` : "not stated"}.
                  {r.stillBreakingIn != null ? (r.stillBreakingIn ? " Still breaking in." : " Broken in.") : ""} Condition: {optionLabel(DURABILITY_OPTIONS, r.durabilityStatus)}.
                </p>
                {r.sound && <p className="text-ink-soft">Sound: {r.sound}</p>}
                {r.notes && <p className="whitespace-pre-line">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function DurabilitySection({ detail, minOwners }: { detail: BatDetail; minOwners: number }) {
  const d = detail.durability;
  return (
    <section className="grid gap-4" aria-labelledby="durability-heading">
      <h2 id="durability-heading" className="display text-3xl font-bold">
        Durability tracker
      </h2>
      <div className="card grid gap-3 p-5" data-testid="durability">
        {!d ? (
          <p className="text-ink-soft">
            The tracker appears once at least {minOwners} owners have reported on this bat, so one bad (or lucky) bat doesn&apos;t look like a pattern.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink-soft">
              Each owner&apos;s latest reported condition. {d.reportingOwners} owners reporting, {d.verifiedOwners} verified. Owner-reported, not tested.
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat label="Intact" value={String(d.intact)} />
              <Stat label="Dented" value={String(d.dented)} />
              <Stat label="Cracked" value={String(d.cracked)} />
              <Stat label="Rattles" value={String(d.rattle)} />
              <Stat label="Returned under warranty" value={String(d.returnedWarranty)} />
            </dl>
            <p className="text-sm">
              {d.medianHitsIntact != null && <>Intact bats: median about {Math.round(d.medianHitsIntact)} hits so far. </>}
              {d.ownersReportingFailure > 0 && (
                <>
                  {d.ownersReportingFailure} {d.ownersReportingFailure === 1 ? "owner reported" : "owners reported"} a crack or rattle
                  {d.hitsAtFailure.length ? `, at roughly ${d.hitsAtFailure.join(", ")} hits` : ""}.
                </>
              )}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
