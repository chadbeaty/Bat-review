"use client";
import Link from "next/link";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "lg" };

const variants = {
  primary: "bg-optic text-optic-ink hover:bg-optic-2 font-bold",
  ghost: "border border-line text-chalk hover:border-chalk-3 hover:bg-night-3",
  danger: "border border-stitch/50 text-stitch hover:bg-stitch-wash",
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
        size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-11 px-4 text-[15px]"
      } ${variants[variant]} ${className}`}
    />
  );
}

export function ButtonLink({ href, variant = "primary", size = "md", className = "", children }: { href: string; variant?: "primary" | "ghost"; size?: "md" | "lg"; className?: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition active:scale-[0.98] ${size === "lg" ? "min-h-14 px-6 text-lg" : "min-h-11 px-4 text-[15px]"} ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4 pt-2">
      <div>
        <h1 className="display text-[2rem] leading-[1.05] text-chalk">{title}</h1>
        {sub && <p className="mt-1.5 text-[15px] text-chalk-2">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between">
      <h2 className="text-lg font-bold text-chalk">{children}</h2>
      {right}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <span>
        <span className="block text-[15px] text-chalk">{label}</span>
        {hint && <span className="mt-0.5 block text-[13px] text-chalk-3">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-night-4 transition peer-checked:bg-optic peer-focus-visible:outline-2 peer-focus-visible:outline-optic" />
        <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-chalk transition peer-checked:translate-x-5 peer-checked:bg-optic-ink" />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl border border-line bg-night-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-lg px-3 text-sm transition ${value === o.value ? "bg-chalk font-bold text-night" : "text-chalk-2 hover:text-chalk"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-night-2 ${className}`}>{children}</div>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-10 text-center">
      <p className="text-lg font-bold text-chalk">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-sm text-[15px] text-chalk-2">{children}</div>}
    </div>
  );
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
