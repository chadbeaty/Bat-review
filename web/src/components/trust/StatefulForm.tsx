"use client";

import { useActionState, useEffect, useRef } from "react";

export type FormState = { ok?: string; error?: string; nonce?: number } | null;
export type FormAction = (prev: FormState, form: FormData) => Promise<FormState>;

/** A form that shows the server action's result message in place, and clears itself after a success. */
export function StatefulForm({
  action,
  children,
  className = "grid gap-3",
  resetOnSuccess = true,
  label,
}: {
  action: FormAction;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  label?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state && state.ok !== undefined && !state.error && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={run} className={className} aria-label={label} aria-busy={pending}>
      {children}
      {state?.error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          {state.ok}
        </p>
      )}
    </form>
  );
}
