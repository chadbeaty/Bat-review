"use client";

import { useActionState } from "react";
import { joinNewsletter, type NewsletterState } from "@/app/newsletter-actions";

export function NewsletterForm() {
  const [state, action, pending] = useActionState<NewsletterState, FormData>(joinNewsletter, {});
  if (state.ok) {
    return (
      <p role="status" className="font-medium">
        Almost there: check your inbox for a message from us and click the link to confirm. You won&apos;t get updates until you do.
      </p>
    );
  }
  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email
        </label>
        <input id="newsletter-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="input sm:max-w-sm" />
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Get updates"}
        </button>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <p className="text-xs text-ink-soft">New-listing alerts and bat price trends. Unsubscribe any time.</p>
    </form>
  );
}
