"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation/auth";

export type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  optional?: boolean;
};

/** Shared form for the sign-in, sign-up and password screens. Errors come back from the server action. */
export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden = {},
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
  hidden?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {state.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}
      {fields.map((f) => {
        const err = state.fieldErrors?.[f.name];
        return (
          <label key={f.name} className="field" htmlFor={`f-${f.name}`}>
            <span>
              {f.label}
              {f.optional && <span className="font-normal text-ink-soft"> (optional)</span>}
            </span>
            <input
              id={`f-${f.name}`}
              name={f.name}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              defaultValue={state.values?.[f.name] ?? ""}
              aria-invalid={Boolean(err)}
              aria-describedby={err ? `e-${f.name}` : f.hint ? `h-${f.name}` : undefined}
              className={`input ${err ? "border-danger" : ""}`}
            />
            {f.hint && !err && (
              <span id={`h-${f.name}`} className="text-sm font-normal text-ink-soft">
                {f.hint}
              </span>
            )}
            {err && (
              <span id={`e-${f.name}`} className="text-sm font-normal text-danger">
                {err}
              </span>
            )}
          </label>
        );
      })}
      {children}
      {state.fieldErrors?.terms && <p className="text-sm text-danger">{state.fieldErrors.terms}</p>}
      <button type="submit" className="btn btn-primary w-full py-3" disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </button>
    </form>
  );
}
