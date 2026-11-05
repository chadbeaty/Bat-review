import Link from "next/link";
import type { ReactNode } from "react";
import { CASE_STATUS_LABELS, PIPELINE, type CaseStatus } from "@/lib/editorial";

export function AdminHeader({ title, kicker, children, actions }: { title: string; kicker?: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-double border-ink pb-4">
      <div className="min-w-0">
        {kicker && <p className="kicker mb-1 !text-red">{kicker}</p>}
        <h1 className="headline text-3xl sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-3xl text-ink-2">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Flash({ flash }: { flash: { kind: "notice" | "error"; message: string } | null }) {
  if (!flash) return null;
  return (
    <p role={flash.kind === "error" ? "alert" : "status"} className={`mb-5 border px-4 py-3 ${flash.kind === "error" ? "border-red bg-red-wash text-red-ink" : "border-well bg-well-wash text-well"}`}>
      {flash.message}
    </p>
  );
}

export function Panel({ title, children, note, tone = "default", id }: { title: string; children: ReactNode; note?: ReactNode; tone?: "default" | "warn" | "ink"; id?: string }) {
  const toneCls = tone === "warn" ? "border-amber bg-amber-wash/40" : tone === "ink" ? "border-ink bg-paper-2/50" : "border-rule bg-[#fbf8f2]";
  return (
    <section id={id} className={`border p-5 ${toneCls}`}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-2">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.12em]">{title}</h2>
        {note && <span className="meta">{note}</span>}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, name, defaultValue, type = "text", required, help, placeholder, rows, maxLength, readOnly }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; required?: boolean; help?: string; placeholder?: string; rows?: number; maxLength?: number; readOnly?: boolean;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}{required ? " *" : ""}</label>
      {rows ? (
        <textarea id={id} name={name} rows={rows} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} maxLength={maxLength} readOnly={readOnly} className="field font-[family-name:var(--font-serif)]" />
      ) : (
        <input id={id} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} maxLength={maxLength} readOnly={readOnly} className="field" />
      )}
      {help && <p className="meta mt-1">{help}</p>}
    </div>
  );
}

export function SelectField({ label, name, options, defaultValue, required, empty, help }: {
  label: string; name: string; options: readonly (readonly [string, string])[]; defaultValue?: string | null; required?: boolean; empty?: string; help?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={`f-${name}`}>{label}{required ? " *" : ""}</label>
      <select id={`f-${name}`} name={name} defaultValue={defaultValue ?? ""} required={required} className="field">
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {help && <p className="meta mt-1">{help}</p>}
    </div>
  );
}

export function Check({ label, name, defaultChecked, help }: { label: string; name: string; defaultChecked?: boolean; help?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 accent-[var(--color-ink)]" />
      <span>
        <span className="text-ink">{label}</span>
        {help && <span className="meta block">{help}</span>}
      </span>
    </label>
  );
}

export function Return({ to }: { to: string }) {
  return <input type="hidden" name="return" value={to} />;
}

export function Submit({ children, tone = "ink", small }: { children: ReactNode; tone?: "ink" | "ghost" | "red"; small?: boolean }) {
  return <button type="submit" className={`btn ${tone === "ghost" ? "btn-ghost" : tone === "red" ? "btn-red" : ""} ${small ? "btn-sm" : ""}`}>{children}</button>;
}

const STATUS_TONE: Partial<Record<CaseStatus, string>> = {
  published: "bg-ink text-paper",
  approved: "bg-well-wash text-well border-well",
  needs_review: "bg-amber-wash text-amber border-amber",
  draft_ready: "bg-amber-wash text-amber border-amber",
  rejected: "bg-paper-3 text-muted",
  archived: "bg-paper-3 text-muted",
  disputed: "bg-red-wash text-red-ink border-red",
  needs_more_evidence: "bg-red-wash text-red-ink border-red",
};

export function StatusPill({ status }: { status: string }) {
  const tone = STATUS_TONE[status as CaseStatus] ?? "bg-paper-2 text-ink-2";
  return <span className={`inline-block whitespace-nowrap border border-transparent px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] ${tone}`}>{CASE_STATUS_LABELS[status as CaseStatus] ?? status.replace(/_/g, " ")}</span>;
}

export function Pipeline({ status }: { status: CaseStatus }) {
  const idx = PIPELINE.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Workflow progress">
      {PIPELINE.map((s, i) => (
        <li key={s} className={`border px-2 py-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] ${i === idx ? "border-ink bg-ink text-paper" : i < idx && idx >= 0 ? "border-ink text-ink" : "border-rule text-muted"}`}>
          {CASE_STATUS_LABELS[s]}
        </li>
      ))}
      {idx < 0 && <li className="border border-red bg-red-wash px-2 py-1 font-mono text-[0.625rem] uppercase text-red-ink">{CASE_STATUS_LABELS[status]}</li>}
    </ol>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto border border-rule bg-[#fbf8f2]">
      <table className="w-full min-w-[44rem] border-collapse text-left text-[0.95rem]">
        <thead><tr className="border-b border-ink">{head.map((h) => <th key={h} className="kicker whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>{hasRows ? children : <tr><td colSpan={head.length} className="px-3 py-8 text-center text-ink-2">{empty ?? "Nothing here yet."}</td></tr>}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, mono, className = "" }: { children: ReactNode; mono?: boolean; className?: string }) {
  return <td className={`border-b border-rule px-3 py-2 align-top ${mono ? "font-mono text-xs" : ""} ${className}`}>{children}</td>;
}

export function Stat({ label, value, href, tone }: { label: string; value: ReactNode; href?: string; tone?: "warn" }) {
  const body = (
    <div className={`border p-4 ${tone === "warn" ? "border-amber bg-amber-wash/50" : "border-rule bg-[#fbf8f2]"} ${href ? "hover:border-ink" : ""}`}>
      <p className="kicker">{label}</p>
      <p className="headline mt-1 text-3xl">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function AiBadge() {
  return <span className="inline-block border border-amber bg-amber-wash px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-[0.1em] text-amber" title="Created or drafted by the AI research engine. It cannot be published without human review.">AI-generated</span>;
}

export function FilterLinks({ base, param, current, options }: { base: string; param: string; current?: string; options: readonly (readonly [string, string])[] }) {
  const href = (v?: string) => (v ? `${base}?${param}=${v}` : base);
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5">
      <Link href={href()} className={`btn btn-sm ${current ? "btn-ghost" : ""}`}>All</Link>
      {options.map(([v, l]) => <Link key={v} href={href(v)} className={`btn btn-sm ${current === v ? "" : "btn-ghost"}`}>{l}</Link>)}
    </nav>
  );
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
export const sp1 = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
