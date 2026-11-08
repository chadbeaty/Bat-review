import Link from "next/link";

// Small presentational building blocks shared by every page.

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, children, className = "", actions }: { title?: React.ReactNode; subtitle?: React.ReactNode; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: string; href?: string }) {
  const body = (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:border-accent/40">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700",
  accent: "bg-accent-wash text-accent-ink",
  good: "bg-good-wash text-good",
  warn: "bg-warn-wash text-warn",
  bad: "bg-bad-wash text-bad",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <Badge title="Not scored yet">—</Badge>;
  const s = Number(score);
  const tone: Tone = s >= 75 ? "good" : s >= 55 ? "accent" : s >= 40 ? "warn" : "neutral";
  return (
    <span className={`tabular inline-flex min-w-10 justify-center rounded-md px-2 py-0.5 text-sm font-semibold ${TONES[tone]}`}>{s.toFixed(0)}</span>
  );
}

export function ConfidenceBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge>unknown</Badge>;
  const tone: Tone = value === "high" ? "good" : value === "medium" ? "accent" : "warn";
  return <Badge tone={tone} title="How much evidence is behind this score">{value}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, Tone> = { new: "accent", tracking: "neutral", saturated: "bad", not_a_product: "neutral", merged: "neutral" };
  return <Badge tone={map[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas/60 p-6 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Flash({ flash }: { flash: { kind: "notice" | "error"; message: string } | null }) {
  if (!flash) return null;
  return (
    <p role="status" className={`mb-4 rounded-lg p-3 text-sm ${flash.kind === "error" ? "bg-bad-wash text-bad" : "bg-good-wash text-good"}`}>
      {flash.message}
    </p>
  );
}

export function Estimate({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <Badge tone="warn" title="AI estimate, not observed data or a supplier quote">estimate</Badge>
    </span>
  );
}

export function Unknown({ label = "Unknown" }: { label?: string }) {
  return <span className="text-muted italic">{label}</span>;
}

export function Thumb({ src, alt, size = 48 }: { src: string | null | undefined; alt: string; size?: number }) {
  if (!src) return <div style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-md bg-slate-100 text-[10px] text-muted">no image</div>;
  // External thumbnails (YouTube, store CDNs); next/image would need every host configured.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" referrerPolicy="no-referrer" style={{ width: size, height: size }} className="shrink-0 rounded-md object-cover" />;
}

export const btn = {
  primary: "inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-ink disabled:opacity-60",
  secondary: "inline-flex items-center justify-center rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-2 hover:border-accent/50 disabled:opacity-60",
  danger: "inline-flex items-center justify-center rounded-lg border border-bad/30 bg-white px-3 py-1.5 text-sm font-medium text-bad hover:bg-bad-wash disabled:opacity-60",
  small: "inline-flex items-center justify-center rounded-md border border-line bg-white px-2 py-1 text-xs font-medium text-ink-2 hover:border-accent/50",
};

export const input = "w-full rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-accent";
export const label = "mb-1 block text-xs font-medium text-ink-2";
