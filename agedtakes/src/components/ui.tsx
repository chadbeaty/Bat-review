import Link from "next/link";
import type { ReactNode } from "react";
import {
  CASE_TYPE_LABELS, CONFIDENCE, PREDICTION_STATUS_LABELS, STATEMENT_TYPE_LABELS,
  type CaseType, type Confidence, type PredictionStatus, type StatementType,
} from "@/lib/editorial";
import { formatDate, formatShortDate, hostname, truncate } from "@/lib/format";
import type { CaseCard as CaseCardData, PersonCard as PersonCardData, Source } from "@/lib/data/types";

export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block bg-ink px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-paper ${className}`} title="This record is fictional and exists only to demonstrate the site.">
      Demo only · fictional
    </span>
  );
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  verified: "text-ink border-ink",
  strong: "text-ink-2 border-ink-2",
  unconfirmed: "text-muted border-muted",
  disputed: "text-amber border-amber",
};

export function ConfidenceBadge({ level, withHelp = false }: { level: Confidence | null; withHelp?: boolean }) {
  if (!level) return null;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`stamp ${CONFIDENCE_STYLE[level]}`}>Evidence: {CONFIDENCE[level].label}</span>
      {withHelp && <span className="meta">{CONFIDENCE[level].short}</span>}
    </span>
  );
}

const TYPE_TONE: Partial<Record<CaseType, string>> = {
  prediction_aged_poorly: "text-red",
  broken_promise: "text-red",
  prediction_aged_well: "text-well",
  kept_promise: "text-well",
  never_sell: "text-red-ink",
  did_they_sell: "text-red-ink",
};

export function CaseTypeLabel({ type }: { type: CaseType }) {
  return <span className={`kicker !text-[0.6875rem] font-semibold ${TYPE_TONE[type] ?? "!text-ink-2"}`}>{CASE_TYPE_LABELS[type]}</span>;
}

const PRED_TONE: Record<PredictionStatus, string> = {
  open: "bg-paper-2 text-ink-2",
  resolved_correct: "bg-well-wash text-well",
  resolved_incorrect: "bg-red-wash text-red-ink",
  partially_correct: "bg-amber-wash text-amber",
  unscorable: "bg-paper-3 text-muted",
  disputed: "bg-amber-wash text-amber",
};

export function PredictionStatusBadge({ status }: { status: PredictionStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.08em] ${PRED_TONE[status]}`}>
      {PREDICTION_STATUS_LABELS[status]}
    </span>
  );
}

export function StatementTypeBadge({ type }: { type: StatementType }) {
  const strong = type === "explicit_commitment" || type === "prediction" || type === "documented_action";
  return (
    <span className={`inline-block border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.12em] ${strong ? "border-ink text-ink" : "border-rule text-muted"}`}>
      {STATEMENT_TYPE_LABELS[type]}
    </span>
  );
}

export function SectionHeading({ kicker, title, href, linkLabel, children }: { kicker?: string; title: string; href?: string; linkLabel?: string; children?: ReactNode }) {
  return (
    <div className="rule-double mb-6 flex flex-wrap items-end justify-between gap-3 pt-3">
      <div>
        {kicker && <p className="kicker mb-1 !text-red">{kicker}</p>}
        <h2 className="headline text-3xl sm:text-4xl">{title}</h2>
        {children && <div className="mt-2 max-w-2xl text-ink-2">{children}</div>}
      </div>
      {href && (
        <Link href={href} className="meta link whitespace-nowrap !text-ink">
          {linkLabel ?? "See all"} →
        </Link>
      )}
    </div>
  );
}

export function QuoteBlock({ quote, size = "md", attribution }: { quote: string; size?: "md" | "lg" | "sm"; attribution?: ReactNode }) {
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-3xl sm:text-[2.6rem]" }[size];
  return (
    <figure className="relative">
      <blockquote className={`headline !font-medium !leading-[1.15] ${text}`}>
        <span aria-hidden className="mr-1 text-red">“</span>
        {quote}
        <span aria-hidden className="ml-0.5 text-red">”</span>
      </blockquote>
      {attribution && <figcaption className="meta mt-3">{attribution}</figcaption>}
    </figure>
  );
}

export function SourceLine({ source, timecode }: { source: Source | null | undefined; timecode?: string | null }) {
  if (!source) return <span className="meta">Source not recorded</span>;
  const href = source.canonical_url ?? source.archive_url;
  return (
    <span className="meta">
      {source.publisher ? `${source.publisher} · ` : ""}
      {href ? (
        <a href={href} className="link !text-ink-2" target="_blank" rel="noopener noreferrer nofollow">
          {source.title}
        </a>
      ) : (
        source.title
      )}
      {timecode ? ` · at ${timecode}` : ""}
      {source.published_at ? ` · ${formatShortDate(source.published_at)}` : ""}
      {href ? ` · ${hostname(href)}` : ""}
      {source.archive_url && source.canonical_url && (
        <>
          {" · "}
          <a href={source.archive_url} className="link" target="_blank" rel="noopener noreferrer nofollow">archived copy</a>
        </>
      )}
    </span>
  );
}

export function CaseCard({ item, variant = "default" }: { item: CaseCardData; variant?: "default" | "lead" | "compact" }) {
  if (variant === "lead") {
    return (
      <article className="group animate-rise">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CaseTypeLabel type={item.case_type} />
          {item.is_demo && <DemoBadge />}
        </div>
        <Link href={`/cases/${item.slug}`} className="block">
          <h3 className="headline text-4xl group-hover:text-red-ink sm:text-5xl lg:text-[3.4rem]">{item.title}</h3>
        </Link>
        {item.quote && (
          <p className="mt-5 border-l-[3px] border-red pl-4 font-[family-name:var(--font-display)] text-xl italic text-ink-2">“{truncate(item.quote, 180)}”</p>
        )}
        {item.summary && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-2">{item.summary}</p>}
        <CardMeta item={item} />
      </article>
    );
  }
  if (variant === "compact") {
    return (
      <article className="group border-t border-rule py-4 first:border-t-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <CaseTypeLabel type={item.case_type} />
          {item.is_demo && <DemoBadge />}
        </div>
        <Link href={`/cases/${item.slug}`}>
          <h3 className="headline text-xl group-hover:text-red-ink">{item.title}</h3>
        </Link>
        <p className="meta mt-1">
          {item.person?.name} · {formatShortDate(item.published_at)}
        </p>
      </article>
    );
  }
  return (
    <article className="group flex flex-col border-t border-ink pt-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CaseTypeLabel type={item.case_type} />
        {item.is_demo && <DemoBadge />}
      </div>
      <Link href={`/cases/${item.slug}`}>
        <h3 className="headline text-2xl group-hover:text-red-ink">{item.title}</h3>
      </Link>
      {item.summary && <p className="mt-2 text-[0.98rem] leading-relaxed text-ink-2">{truncate(item.summary, 220)}</p>}
      <CardMeta item={item} />
    </article>
  );
}

function CardMeta({ item }: { item: CaseCardData }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      {item.person && (
        <Link href={`/people/${item.person.slug}`} className="meta link !text-ink">
          {item.person.name}
        </Link>
      )}
      <time className="meta" dateTime={item.published_at}>{formatDate(item.published_at)}</time>
      {item.evidence_confidence && <span className="meta">· Evidence: {CONFIDENCE[item.evidence_confidence].label}</span>}
      {item.is_sponsored && <span className="meta !text-amber">· Sponsored</span>}
    </div>
  );
}

export function PersonAvatar({ name, imageUrl, size = 56 }: { name: string; imageUrl: string | null; size?: number }) {
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- images come from editor-configured hosts; sized explicitly.
    return <img src={imageUrl} alt="" width={size} height={size} className="shrink-0 object-cover grayscale" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center border border-ink bg-paper-2 font-[family-name:var(--font-display)] font-bold text-ink" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

export function PersonCard({ person }: { person: PersonCardData }) {
  return (
    <article className="group flex gap-4 border-t border-rule py-4">
      <PersonAvatar name={person.name} imageUrl={person.image_url} />
      <div className="min-w-0">
        <Link href={`/people/${person.slug}`}>
          <h3 className="headline text-xl group-hover:text-red-ink">{person.name}</h3>
        </Link>
        {person.occupation && <p className="text-sm text-ink-2">{person.occupation}</p>}
        <p className="meta mt-1">
          {person.cases_published} investigation{person.cases_published === 1 ? "" : "s"}
          {person.categories.length > 0 && ` · ${person.categories.filter((c) => c.kind === "person").map((c) => c.name).slice(0, 2).join(", ")}`}
        </p>
        {person.is_demo && <DemoBadge className="mt-2" />}
      </div>
    </article>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-rule px-6 py-10 text-center">
      <p className="headline text-2xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-2">{children}</div>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="meta mb-6">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {item.href ? <Link href={item.href} className="link">{item.label}</Link> : <span aria-current="page" className="text-ink-2">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, total, pageSize, basePath, params }: { page: number; total: number; pageSize: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && k !== "page" && sp.set(k, v));
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <nav aria-label="Pages" className="mt-10 flex items-center justify-between border-t border-rule pt-4">
      {page > 1 ? <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>← Newer</Link> : <span />}
      <span className="meta">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>Older →</Link> : <span />}
    </nav>
  );
}

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  // JSON-LD is serialized with "<" escaped so content can never close the script tag.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-10 border-b-[3px] border-double border-ink pb-6">
      {kicker && <p className="kicker mb-3 !text-red">{kicker}</p>}
      <h1 className="headline text-5xl sm:text-6xl">{title}</h1>
      {children && <div className="mt-4 max-w-3xl text-lg leading-relaxed text-ink-2">{children}</div>}
    </header>
  );
}
