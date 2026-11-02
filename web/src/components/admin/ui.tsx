import Link from "next/link";

/** Page heading for admin screens. */
export function AdminTitle({ title, intro, children }: { title: string; intro?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="display text-4xl font-bold">{title}</h1>
        {intro && <p className="max-w-3xl text-sm text-ink-soft">{intro}</p>}
      </div>
      {children}
    </div>
  );
}

export function Flash({ flash }: { flash: { kind: "notice" | "error"; message: string } | null }) {
  if (!flash) return null;
  return flash.kind === "error" ? (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      {flash.message}
    </p>
  ) : (
    <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
      {flash.message}
    </p>
  );
}

/** A table that scrolls inside its own box on small screens instead of widening the page. */
export function Table({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="card max-w-full overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:bg-paper [&_th]:px-3 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-soft">
        {children}
      </table>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-5 text-sm text-ink-soft">{children}</p>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card grid content-start gap-1 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="font-mono text-2xl font-medium">{value}</p>
      {hint && <p className="text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "bad" | "warn" }) {
  const tones = {
    neutral: "border-line-strong text-ink-soft",
    good: "border-success/40 text-success",
    bad: "border-danger/40 text-danger",
    warn: "border-warning/40 text-warning",
  };
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

/** Previous/next links that keep the current filters. */
export function Pager({ basePath, params, page, hasMore }: { basePath: string; params: Record<string, string>; page: number; hasMore: boolean }) {
  const href = (p: number) => {
    const q = new URLSearchParams({ ...params, page: String(p) });
    return `${basePath}?${q.toString()}`;
  };
  if (page <= 1 && !hasMore) return null;
  return (
    <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn btn-outline">
          Previous
        </Link>
      ) : null}
      <span className="text-ink-soft">Page {page}</span>
      {hasMore ? (
        <Link href={href(page + 1)} className="btn btn-outline">
          Next
        </Link>
      ) : null}
    </nav>
  );
}

/** Hidden field that tells an action which page to return to. */
export function ReturnTo({ path }: { path: string }) {
  return <input type="hidden" name="return" value={path} />;
}

export function SubmitButton({ children, tone = "primary", className = "" }: { children: React.ReactNode; tone?: "primary" | "outline" | "danger"; className?: string }) {
  const cls = tone === "primary" ? "btn btn-primary" : tone === "danger" ? "btn border-danger bg-danger text-white hover:brightness-95" : "btn btn-outline";
  return (
    <button type="submit" className={`${cls} px-3 py-1.5 text-sm ${className}`}>
      {children}
    </button>
  );
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}

/** Reads a single string search param. */
export function param(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return typeof v === "string" ? v : "";
}

export function pageNumber(params: Record<string, string | string[] | undefined>): number {
  const n = Number(param(params, "page"));
  return Number.isInteger(n) && n > 0 && n < 10000 ? n : 1;
}
