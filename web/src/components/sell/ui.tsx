"use client";

import { createContext, useContext } from "react";
import type { ActionResult } from "@/app/sell/actions";
import type { StepKey } from "@/lib/sell/listing";
import type { FeeRule } from "@/lib/fees";
import type { ListingSnapshot, SellCategory, SellManufacturer } from "@/lib/sell/server";

export type Wizard = {
  userId: string;
  categories: SellCategory[];
  manufacturers: SellManufacturer[];
  fee: FeeRule | null;
  snapshot: ListingSnapshot | null;
  setSnapshot: (s: ListingSnapshot) => void;
  goTo: (step: StepKey) => void;
  next: (from: StepKey) => StepKey;
  pending: boolean;
  errors: Record<string, string>;
  error: string | null;
  errorStep: StepKey | null;
  clearErrors: () => void;
  setError: (message: string | null) => void;
  /** Runs a save action, keeps the returned snapshot and moves on to `then` if it worked. */
  run: (action: () => Promise<ActionResult>, then?: StepKey) => Promise<ActionResult>;
  /** True once a listing is published (or removed/expired): saves change it in place. */
  published: boolean;
};

export const WizardContext = createContext<Wizard | null>(null);

export function useWizard(): Wizard {
  const w = useContext(WizardContext);
  if (!w) throw new Error("useWizard outside ListingWizard");
  return w;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="text-sm font-normal text-danger">
      {message}
    </span>
  );
}

export function inputClass(err?: string) {
  return `input ${err ? "border-danger" : ""}`;
}

export function StepHeader({ title, intro }: { title: string; intro?: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-2xl font-bold">{title}</h2>
      {intro && <div className="text-ink-soft">{intro}</div>}
    </div>
  );
}

export function StepActions({ back, label, disabled }: { back?: StepKey; label?: string; disabled?: boolean }) {
  const w = useWizard();
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
      <button type="submit" className="btn btn-primary" disabled={w.pending || disabled}>
        {w.pending ? "Saving…" : (label ?? (w.published ? "Save changes" : "Save and continue"))}
      </button>
      {back && (
        <button type="button" className="btn btn-outline" onClick={() => w.goTo(back)} disabled={w.pending}>
          Back
        </button>
      )}
    </div>
  );
}

export function ErrorBanner() {
  const w = useWizard();
  if (!w.error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
      <span>{w.error}</span>
    </div>
  );
}

/** Yes/no radio pair. Value is null until the seller answers. */
export function YesNo({
  name,
  legend,
  value,
  onChange,
  error,
}: {
  name: string;
  legend: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  error?: string;
}) {
  return (
    <fieldset className="grid gap-2" aria-describedby={error ? `e-${name}` : undefined}>
      <legend className="font-medium">{legend}</legend>
      <div className="flex gap-2">
        {[
          { v: false, label: "No" },
          { v: true, label: "Yes" },
        ].map((o) => (
          <label
            key={o.label}
            className={`flex min-w-20 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ${value === o.v ? "border-ink bg-paper" : "border-line-strong"}`}
          >
            <input type="radio" name={name} checked={value === o.v} onChange={() => onChange(o.v)} />
            {o.label}
          </label>
        ))}
      </div>
      <FieldError id={`e-${name}`} message={error} />
    </fieldset>
  );
}
