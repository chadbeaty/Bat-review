"use client";

import { useActionState } from "react";
import { fileOwnerReport, saveReviewAlerts, saveWatch, type ActionState } from "@/app/bats/actions";
import { BALL_TYPES, DURABILITY_OPTIONS, HIT_BUCKETS, POP_OPTIONS, STING_LABELS } from "@/lib/owner-reports";

function Status({ state }: { state: ActionState }) {
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium">
        {state.message}
      </p>
    );
  if (state.error)
    return (
      <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
        {state.error}
      </p>
    );
  return null;
}

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const msg = state.fieldErrors?.[name];
  return msg ? <span className="text-sm font-normal text-danger">{msg}</span> : null;
}

export function FirstSwingsForm({ productId, weights, intervalDays }: { productId: string; weights: number[]; intervalDays: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(fileOwnerReport, {});
  const weightOptions = weights.length ? weights : [25, 25.5, 26, 26.5, 27, 27.5, 28, 28.5, 29, 30];
  return (
    <form action={action} className="grid gap-4" aria-label="First Swings report">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field">
          Weight you swing
          <select name="weightOz" className="input" defaultValue="">
            <option value="">Not sure</option>
            {weightOptions.map((w) => (
              <option key={w} value={w}>
                {w} oz
              </option>
            ))}
          </select>
          <FieldError state={state} name="weightOz" />
        </label>
        <label className="field">
          Hits so far (roughly)
          <select name="hitsSoFar" className="input" required defaultValue="0">
            {HIT_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <FieldError state={state} name="hitsSoFar" />
        </label>
        <label className="field">
          Still breaking in?
          <select name="stillBreakingIn" className="input" defaultValue="not_sure">
            <option value="yes">Yes</option>
            <option value="no">No, it&apos;s broken in</option>
            <option value="not_sure">Not sure</option>
          </select>
        </label>
        <label className="field">
          Ball you mostly hit
          <select name="ballType" className="input" defaultValue="unknown">
            {BALL_TYPES.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Compared with your previous gamer
          <select name="popVsPreviousGamer" className="input" defaultValue="not_sure">
            {POP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Previous gamer (optional)
          <input name="previousGamer" className="input" maxLength={120} placeholder="e.g. 2025 Miken Freak Primo" />
          <FieldError state={state} name="previousGamer" />
        </label>
        <label className="field">
          Sting on mishits
          <select name="sting" className="input" defaultValue="">
            <option value="">Not sure</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}: {STING_LABELS[n]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Typical temperature (°F, optional)
          <input name="temperatureF" type="number" inputMode="numeric" min={-20} max={120} step={1} className="input" placeholder="e.g. 75" />
          <FieldError state={state} name="temperatureF" />
        </label>
        <label className="field">
          Sound (optional)
          <input name="sound" className="input" maxLength={40} placeholder="e.g. muted crack" />
        </label>
        <label className="field">
          Condition right now
          <select name="durabilityStatus" className="input" defaultValue="intact">
            {DURABILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Anything else owners should know (optional)
        <textarea name="notes" className="input min-h-24" maxLength={1000} />
        <FieldError state={state} name="notes" />
      </label>
      <p className="text-sm text-ink-soft">
        One check-in per bat every {intervalDays} days, so a report follows the bat over time. Reports can&apos;t be edited or deleted once
        published. Your username isn&apos;t shown; reports are labeled &quot;Owner&quot;, or &quot;Verified owner&quot; when you bought this model
        through a completed order here.
      </p>
      <Status state={state} />
      <div>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Publishing…" : "Publish my check-in"}
        </button>
      </div>
    </form>
  );
}

const ALERT_OPTIONS = [
  { value: "first_published_review", label: "When it gets its first published review" },
  { value: "early_reports_threshold", label: "When enough owners have reported (early reports)" },
  { value: "first_listing", label: "When one is listed for sale" },
];

export function ReviewAlertForm({ productId, current }: { productId: string; current: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReviewAlerts, {});
  return (
    <form action={action} className="grid gap-3" aria-label="Review alerts">
      <input type="hidden" name="productId" value={productId} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 font-semibold">Alert me</legend>
        {ALERT_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="notifyOn" value={o.value} defaultChecked={current.includes(o.value)} className="mt-0.5 size-4" />
            {o.label}
          </label>
        ))}
      </fieldset>
      <Status state={state} />
      <div>
        <button className="btn btn-outline" disabled={pending}>
          {pending ? "Saving…" : "Save alerts"}
        </button>
      </div>
    </form>
  );
}

export function WatchForm({ productId, watch }: { productId: string; watch: { targetPriceCents: number | null } | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveWatch, {});
  return (
    <div className="grid gap-3">
      <form action={action} className="grid gap-3" aria-label="Watchlist">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="intent" value="save" />
        <label className="field text-sm">
          Target price (optional, $)
          <input
            name="targetPrice"
            inputMode="decimal"
            className="input"
            placeholder="e.g. 180"
            defaultValue={watch?.targetPriceCents != null ? String(watch.targetPriceCents / 100) : ""}
          />
        </label>
        <div>
          <button className="btn btn-primary" disabled={pending}>
            {watch ? "Update watch" : "Add to watchlist"}
          </button>
        </div>
      </form>
      {watch && (
        <form action={action}>
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="intent" value="remove" />
          <button className="text-sm font-semibold underline" disabled={pending}>
            Remove from watchlist
          </button>
        </form>
      )}
      <Status state={state} />
    </div>
  );
}
