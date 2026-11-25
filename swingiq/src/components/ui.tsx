"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GapMark } from "./Logo";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet"; size?: "md" | "lg" };

const variants = {
  primary: "btn-label bg-optic text-optic-ink hover:bg-optic-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.45)]",
  ghost: "border border-line-2 text-chalk hover:border-clay/60 hover:bg-white/[0.03]",
  danger: "border border-stitch/50 text-stitch hover:bg-stitch-wash",
  quiet: "text-chalk-2 hover:text-chalk hover:bg-night-3",
};

const sizes = { md: "min-h-11 px-4 text-[14px]", lg: "min-h-14 px-6 text-[16px]" };

export function Button({ variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`press inline-flex items-center justify-center gap-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: { href: string; variant?: "primary" | "ghost" | "quiet"; size?: "md" | "lg"; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} {...rest} className={`press inline-flex items-center justify-center gap-2 rounded-lg ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export type Pillar = "record" | "analyze" | "improve";
const PILLARS: { key: Pillar; label: string }[] = [
  { key: "record", label: "Record" },
  { key: "analyze", label: "Analyze" },
  { key: "improve", label: "Improve" },
];

/**
 * Record. Analyze. Improve. The brand's three words, shown over a page title with the step this page belongs to lit.
 * The lime ball marks where you are in the loop.
 */
export function PillarStrip({ active, className = "" }: { active?: Pillar; className?: string }) {
  return (
    <ol className={`flex items-center gap-2 text-[12px] font-extrabold italic uppercase tracking-[0.06em] ${className}`} aria-label="Record, analyze, improve">
      {PILLARS.map((p, i) => (
        <li key={p.key} className="flex items-center gap-2" aria-current={active === p.key ? "step" : undefined}>
          {i > 0 && <span className="h-px w-3 bg-line-2" aria-hidden="true" />}
          <span className={`flex items-center gap-1.5 ${active === p.key ? "text-chalk" : "text-chalk-3/70"}`}>
            {active === p.key && <span className="h-2 w-2 rounded-full bg-optic" aria-hidden="true" />}
            {p.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Page header: black italic capitals, an optional line of context, an optional action, and which step it is. */
export function PageTitle({ title, sub, right, context, pillar }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; context?: React.ReactNode; pillar?: Pillar }) {
  return (
    <header className="mb-8 pt-3 md:mb-10">
      {pillar && <PillarStrip active={pillar} className="mb-4" />}
      {context && <div className="mb-2 text-[13px] text-chalk-3">{context}</div>}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display t-l text-chalk">{title}</h1>
          {sub && <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-chalk-2 md:text-[16px]">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/**
 * Section divider: the title, then the gap rule (four bars, three gaps, like the outfield in the logo) running out to
 * the edge, and an optional action at the end.
 */
export function SectionTitle({ children, right, id }: { children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-4 mt-12 flex items-center gap-3">
      <h2 id={id} className="title shrink-0 text-chalk">
        {children}
      </h2>
      <GapRule className="flex-1" />
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/** Four hairline bars with three gaps; the first gap holds the ball. A divider that says "outfield" quietly. */
export function GapRule({ className = "", ball = true }: { className?: string; ball?: boolean }) {
  return (
    <span className={`flex items-center gap-[5px] ${className}`} aria-hidden="true">
      <span className="h-px flex-[0.6] bg-line-2" />
      {ball ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-optic/80" /> : null}
      <span className="h-px flex-1 bg-line-2/80" />
      <span className="h-px flex-1 bg-line-2/60" />
      <span className="h-px flex-[1.4] bg-gradient-to-r from-line-2/40 to-transparent" />
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
      <span>
        <span className="block text-[15px] text-chalk">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-chalk-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full border border-line-2 bg-night-4 transition peer-checked:border-optic peer-checked:bg-optic peer-focus-visible:outline-2 peer-focus-visible:outline-optic" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-chalk shadow transition peer-checked:translate-x-5 peer-checked:bg-optic-ink" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-night-2 p-1 shadow-[inset_0_1px_3px_rgb(0_0_0/0.4)]">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`press relative min-h-10 flex-1 rounded-lg px-3 text-sm ${on ? "bg-night-4 font-semibold text-chalk shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-chalk-3 hover:text-chalk-2"}`}
          >
            {o.label}
            {on && <span className="absolute inset-x-1/3 bottom-1 h-0.5 rounded-full bg-optic" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A surface. `surface` is the graphite panel; `frame` is a hairline box for a chart or a picture of the swing; `stage`
 * is carbon with the alloy edge, for hero moments only. `boxed` adds the brushed-alloy top edge to a surface.
 */
export function Panel({
  children,
  className = "",
  boxed = false,
  variant = "surface",
  as: Tag = "div",
  ...rest
}: { children?: React.ReactNode; className?: string; boxed?: boolean; variant?: "surface" | "frame" | "stage"; as?: "div" | "section" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={`${variant} rounded-2xl ${boxed && variant === "surface" ? "boxed" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

/** Empty state: the Gap Mark in graphite with the lime ball, what goes here, and how to fill it. */
export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="stage relative overflow-hidden rounded-2xl px-5 pb-8 pt-7 text-center">
      <GapMark size={96} ink="var(--color-night-4)" accent="var(--color-optic)" className="mx-auto mb-5" />
      <p className="title text-chalk">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-chalk-2">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}

/** Something went wrong: says what happened in plain words and offers the way out. */
export function ErrorState({ title = "Something went wrong", children, action }: { title?: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="stage relative overflow-hidden rounded-2xl px-5 pb-7 pt-6">
      <span className="absolute inset-y-5 left-0 w-[3px] rounded-r bg-stitch" aria-hidden="true" />
      <p className="label text-stitch">Hold up</p>
      <p className="title mt-1.5 text-chalk">{title}</p>
      {children && <div className="mt-2 max-w-prose text-[15px] leading-relaxed text-chalk-2">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap gap-3">{action}</div>}
    </div>
  );
}

/** Shimmering placeholder while data loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skel ${className}`} aria-hidden="true" />;
}

export function PageSkeleton() {
  return (
    <div className="pt-3" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-40 rounded-md" />
      <Skeleton className="mt-4 h-11 w-56 rounded-lg" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full rounded-md" />
      <Skeleton className="mt-8 h-56 w-full rounded-2xl" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

export type SourceKind = "measured" | "estimate" | "slomo" | "sensor" | "none";

/**
 * Where a number came from, always shown with it. Solid = measured directly; hollow ring = estimated from body
 * tracking. Lime = measured from slo-mo video (with a ± range); alloy = typed in from the player's own radar or sensor.
 */
export const SOURCE_DOT: Record<SourceKind, { cls: string; label: string; short: string }> = {
  measured: { cls: "bg-chalk", label: "Measured", short: "Measured" },
  estimate: { cls: "border border-chalk-2", label: "Estimated from body tracking", short: "Estimated" },
  slomo: { cls: "bg-optic", label: "Measured from slo-mo video", short: "Slo-mo" },
  sensor: { cls: "bg-clay", label: "From your sensor or radar", short: "Sensor" },
  none: { cls: "border border-dashed border-line-2", label: "Not measured", short: "Not measured" },
};

/** A small labelled chip saying where a number came from. */
export function SourceTag({ kind, className = "" }: { kind: SourceKind; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-semibold text-chalk-3 ${className}`} title={SOURCE_DOT[kind].label}>
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE_DOT[kind].cls}`} aria-hidden="true" />
      {SOURCE_DOT[kind].short}
    </span>
  );
}

/** A headline number with its unit, ± range and where it came from. */
export function Stat({
  label,
  value,
  unit,
  pm,
  source,
  size = "md",
  note,
  tone = "chalk",
  align = false,
}: {
  align?: boolean;
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: string;
  pm?: number | null;
  source?: SourceKind;
  size?: "sm" | "md" | "lg" | "xl";
  note?: React.ReactNode;
  tone?: "chalk" | "optic" | "muted";
}) {
  const big = { sm: "text-2xl", md: "text-[2rem]", lg: "text-[2.6rem]", xl: "text-[3.4rem]" }[size];
  const color = tone === "optic" ? "text-optic" : tone === "muted" ? "text-chalk-3" : "text-chalk";
  return (
    <div className="min-w-0">
      <div className={`flex items-start gap-1.5 text-[13px] leading-tight text-chalk-3 ${align ? "min-h-[2.1rem]" : ""}`}>
        {source && <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SOURCE_DOT[source].cls}`} title={SOURCE_DOT[source].label} aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`num leading-none ${big} ${color}`}>{value}</span>
        {unit && <span className="text-[13px] text-chalk-3">{unit}</span>}
      </div>
      {pm !== undefined && pm !== null && <div className="mt-1 text-[12px] text-chalk-3">± {pm}</div>}
      {note && <div className="mt-1 text-[12px] text-chalk-3">{note}</div>}
    </div>
  );
}

export function SourceLegend({ kinds }: { kinds: SourceKind[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-chalk-3">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${SOURCE_DOT[k].cls}`} aria-hidden="true" />
          {SOURCE_DOT[k].label}
        </li>
      ))}
    </ul>
  );
}

/** A small "what's this?" button that opens a short explanation right where you are. */
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${label}?`}
        onClick={() => setOpen((o) => !o)}
        className="hit grid h-5 w-5 place-items-center rounded-full border border-line-2 text-[11px] text-chalk-3 hover:border-chalk-3 hover:text-chalk"
      >
        ?
      </button>
      {open && (
        <span id={id} role="note" className="animate-fade absolute left-1/2 top-7 z-30 w-64 -translate-x-1/2 rounded-xl border border-line-2 bg-night-3 p-3 text-left text-[13px] leading-relaxed text-chalk-2 shadow-2xl">
          {children}
        </span>
      )}
    </span>
  );
}

/** A horizontal meter (0–100). null shows hatching: not measured, never a fake zero. */
export function Meter({ value, compare, tone = "optic", label }: { value: number | null; compare?: number | null; tone?: "optic" | "clay" | "chalk"; label: string }) {
  const fill = tone === "optic" ? "bg-optic" : tone === "clay" ? "bg-clay" : "bg-chalk-2";
  return (
    <div className={`relative h-2 overflow-hidden rounded-full ${value === null ? "hatch bg-night-3" : "bg-night-4"}`} role="img" aria-label={value === null ? `${label}: not measured` : `${label}: ${Math.round(value)} of 100`}>
      {value !== null && <div className={`grow h-full rounded-full ${fill}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />}
      {compare !== undefined && compare !== null && (
        <div className="absolute top-0 h-full w-0.5 bg-clay" style={{ left: `calc(${Math.max(0, Math.min(100, compare))}% - 1px)` }} title={`Before: ${Math.round(compare)}`} />
      )}
    </div>
  );
}

/** A bottom sheet (dialog) that slides up; closes on Escape, the scrim, or its own close button. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("a,button")?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Rendered straight into <body>: a page's fade-in animation makes it the frame for "fixed" children in Safari, which
  // would pin the sheet to the bottom of a long page, off screen. In <body> it always sits on the screen, above the nav.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <button type="button" aria-label="Close" className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        className="animate-sheet relative max-h-[92dvh] w-full max-w-[34rem] overflow-y-auto rounded-t-2xl border border-line-2 bg-night-2 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.9)] md:rounded-2xl md:pb-5"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-2 md:hidden" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between">
          <h2 id={id} className="head text-[17px]">{title}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-chalk-3 hover:bg-night-3 hover:text-chalk" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Small rounded tag for state ("video", "★", "slo-mo"). */
export function Chip({ children, tone = "line" }: { children: React.ReactNode; tone?: "line" | "optic" | "clay" | "stitch" }) {
  const t = {
    line: "border-line-2 text-chalk-2",
    optic: "border-optic/40 text-optic",
    clay: "border-clay/40 text-clay",
    stitch: "border-stitch/40 text-stitch",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] ${t}`}>{children}</span>;
}

export function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
export function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
