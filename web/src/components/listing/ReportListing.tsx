"use client";

import { useActionState } from "react";
import { reportListing, type ReportState } from "@/app/listings/actions";

const REASONS: [string, string][] = [
  ["misrepresented", "Condition or damage isn't as described"],
  ["counterfeit", "Counterfeit or altered equipment"],
  ["stolen", "Possibly stolen"],
  ["prohibited", "Not allowed on the marketplace"],
  ["off_platform_payment", "Seller asks to pay outside the site"],
  ["spam", "Spam or duplicate"],
  ["other", "Something else"],
];

/** "Report this listing" for signed-in members. Reports go to the moderation queue. */
export function ReportListing({ listingId }: { listingId: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(reportListing, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-ink-soft underline">Report this listing</summary>
      {state.ok ? (
        <p role="status" className="mt-3 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-success">
          Thanks. Our moderators will review this listing.
        </p>
      ) : (
        <form action={action} className="mt-3 grid gap-3">
          <input type="hidden" name="listingId" value={listingId} />
          <label className="field" htmlFor="report-reason">
            <span>Reason</span>
            <select id="report-reason" name="reason" className="input" required defaultValue="">
              <option value="" disabled>
                Choose a reason
              </option>
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor="report-details">
            <span>
              Details <span className="font-normal text-ink-soft">(optional)</span>
            </span>
            <textarea id="report-details" name="details" rows={3} maxLength={2000} className="input" />
          </label>
          {state.error && (
            <p role="alert" className="text-danger">
              {state.error}
            </p>
          )}
          <button type="submit" className="btn btn-outline justify-self-start" disabled={pending}>
            {pending ? "Sending…" : "Send report"}
          </button>
        </form>
      )}
    </details>
  );
}
