"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "quiet"; size?: "md" | "lg" };

const variants = {
  primary:
    "bg-optic text-optic-ink font-bold shadow-[inset_0_1px_0_rgb(255_255_255/0.45),0_10px_28px_-14px_rgb(183_243_74/0.22)] hover:bg-optic-2",
  ghost: "border border-line-2 text-chalk hover:border-chalk-3 hover:bg-night-3",
  danger: "border border-stitch/50 text-stitch hover:bg-stitch-wash",
  quiet: "text-chalk-2 hover:text-chalk hover:bg-night-3",
};

const sizes = { md: "min-h-11 px-4 text-[15px]", lg: "min-h-14 px-6 text-[17px]" };

export function Button({ variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`press inline-flex items-center justify-center gap-2 rounded-xl disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${variants[variant]} ${className}`}
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
    <Link href={href} {...rest} className={`press inline-flex items-center justify-center gap-2 rounded-xl ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/** Page header: a big wide title, an optional line of context, an optional action. */
export function PageTitle({ title, sub, right, context }: { title: string; sub?: React.ReactNode; right?: React.ReactNode; context?: React.ReactNode }) {
  return (
    <header className="mb-7 pt-3">
      {context && <div className="mb-2 text-[13px] text-chalk-3">{context}</div>}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="display text-[2.15rem] leading-[1.02] text-chalk md:text-[2.6rem]">{title}</h1>
          {sub && <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-chalk-2">{sub}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}

/** Section divider: title, a chalk line running out to the edge, optional action at the end. */
export function SectionTitle({ children, right, id }: { children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-3 mt-10 flex items-center gap-3">
      <h2 id={id} className="head shrink-0 text-[17px] text-chalk">
        {children}
      </h2>
      <span className="h-px flex-1 bg-gradient-to-r from-line-2 to-transparent" aria-hidden="true" />
      {right && <div className="shrink-0">{right}</div>}
    </div>
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

/** A raised surface. `boxed` adds batter's-box corner ticks for modules that carry a headline number. */
export function Panel({ children, className = "", boxed = false, as: Tag = "div", ...rest }: { children?: React.ReactNode; className?: string; boxed?: boolean; as?: "div" | "section" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag {...rest} className={`surface rounded-2xl ${boxed ? "boxed" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

/** Empty state: a little chalk drawing of the field, what goes here, and how to fill it. */
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="boxed relative overflow-hidden rounded-2xl border border-line bg-night-2/60 px-5 pb-8 pt-6 text-center">
      <svg viewBox="0 0 200 70" className="mx-auto mb-4 h-14 w-auto" aria-hidden="true">
        <path d="M100 66 L40 18 M100 66 L160 18" stroke="var(--color-line-2)" strokeWidth="1.2" />
        <path d="M40 18 Q100 -14 160 18" fill="none" stroke="var(--color-line-2)" strokeWidth="1.2" strokeDasharray="2 4" />
        <path d="M100 66 L118 50 L100 34 L82 50 Z" fill="none" stroke="var(--color-chalk-3)" strokeWidth="1.2" />
        <path d="M20 56 Q60 -6 98 56" fill="none" stroke="var(--color-optic)" strokeWidth="1.4" strokeDasharray="1 5" strokeLinecap="round" />
        <circle cx="98" cy="56" r="3.2" fill="var(--color-optic)" />
      </svg>
      <p className="head text-[18px] text-chalk">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-chalk-2">{children}</div>}
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
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-3 h-4 w-64" />
      <Skeleton className="mt-8 h-44 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
      <Skeleton className="mt-4 h-20 w-full rounded-2xl" />
    </div>
  );
}

export type SourceKind = "measured" | "estimate" | "slomo" | "sensor" | "none";

const SOURCE_DOT: Record<SourceKind, { cls: string; label: string }> = {
  measured: { cls: "bg-chalk", label: "Measured" },
  estimate: { cls: "border border-chalk-2", label: "Camera estimate" },
  slomo: { cls: "bg-optic", label: "From slo-mo video" },
  sensor: { cls: "bg-clay", label: "From your sensor or radar" },
  none: { cls: "border border-line-2", label: "Not measured" },
};

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
        className="grid h-5 w-5 place-items-center rounded-full border border-line-2 text-[11px] text-chalk-3 hover:border-chalk-3 hover:text-chalk"
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <button type="button" aria-label="Close" className="animate-fade absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panel}
        className="animate-sheet relative w-full max-w-[34rem] rounded-t-2xl border border-line-2 bg-night-2 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_-20px_rgb(0_0_0/0.9)] md:rounded-2xl md:pb-5"
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
    </div>
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
