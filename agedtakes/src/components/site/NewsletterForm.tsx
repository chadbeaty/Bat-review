"use client";

import { useActionState } from "react";
import { subscribeAction, type FormState } from "@/app/(site)/actions";

const initial: FormState = { status: "idle", message: "" };

export function NewsletterForm({ source = "website", compact = false }: { source?: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(subscribeAction, initial);
  if (state.status === "ok") {
    return (
      <div role="status" className="border border-ink bg-paper px-4 py-4">
        <p className="headline text-xl">Almost there.</p>
        <p className="mt-1 text-ink-2">{state.message}</p>
        {state.devLink && (
          <p className="meta mt-2">
            Development only (email not configured): <a className="link" href={state.devLink}>confirm here</a>
          </p>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="source" value={source} />
      <div className="hidden" aria-hidden>
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-2 sm:flex-row"}>
        <label htmlFor={`nl-email-${source}`} className="sr-only">Email address</label>
        <input id={`nl-email-${source}`} name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={state.values?.email ?? ""} className="field sm:flex-1" />
        <button type="submit" className="btn btn-red" disabled={pending}>{pending ? "Sending…" : "Subscribe"}</button>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="consent" required className="mt-1 accent-[var(--color-red)]" />
        <span>Send me The Weekly Aged Takes and alerts when new investigations publish. Unsubscribe anytime. We confirm by email first.</span>
      </label>
      {state.status === "error" && <p role="alert" className="text-sm text-red-ink">{state.message}</p>}
    </form>
  );
}
