"use client";

import { StatefulForm } from "./StatefulForm";
import { makeOffer, respondToOffer } from "@/app/offers/actions";
import type { OfferAction } from "@/lib/trust/offers";

/** "Make an offer" on a listing page: amount and an optional message. */
export function MakeOfferForm({ listingId, askingLabel }: { listingId: string; askingLabel: string }) {
  return (
    <details className="rounded-lg border border-line p-3" data-testid="offer-details">
      <summary className="btn btn-outline cursor-pointer list-none justify-center">Make offer</summary>
      <StatefulForm action={makeOffer} className="mt-3 grid gap-3" label="Make an offer">
        <input type="hidden" name="listingId" value={listingId} />
        <label className="field" htmlFor={`offer-amount-${listingId}`}>
          <span>Your offer (USD)</span>
          <input id={`offer-amount-${listingId}`} name="amount" inputMode="decimal" autoComplete="off" required placeholder="150.00" className="input" />
          <span className="text-sm font-normal text-ink-soft">Must be below the asking price of {askingLabel}.</span>
        </label>
        <label className="field" htmlFor={`offer-message-${listingId}`}>
          <span>
            Message <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <textarea id={`offer-message-${listingId}`} name="message" rows={2} maxLength={500} className="input" />
        </label>
        <button type="submit" className="btn btn-primary justify-self-start">
          Send offer
        </button>
      </StatefulForm>
    </details>
  );
}

const LABELS: Record<OfferAction, string> = { accept: "Accept", reject: "Decline", counter: "Counter", withdraw: "Withdraw" };

/** The buttons a member can use on one offer: accept, decline, counter (with an amount) or withdraw. */
export function OfferActions({ offerId, actions }: { offerId: string; actions: OfferAction[] }) {
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {actions
        .filter((a) => a !== "counter")
        .map((a) => (
          <StatefulForm key={a} action={respondToOffer} className="grid gap-2" resetOnSuccess={false}>
            <input type="hidden" name="offerId" value={offerId} />
            <input type="hidden" name="action" value={a} />
            <button type="submit" className={a === "accept" ? "btn btn-primary" : "btn btn-outline"}>
              {LABELS[a]}
            </button>
          </StatefulForm>
        ))}
      {actions.includes("counter") && (
        <details className="w-full sm:w-auto">
          <summary className="btn btn-outline cursor-pointer list-none">Counter</summary>
          <StatefulForm action={respondToOffer} className="mt-2 grid gap-2">
            <input type="hidden" name="offerId" value={offerId} />
            <input type="hidden" name="action" value="counter" />
            <label className="field" htmlFor={`counter-amount-${offerId}`}>
              <span>Counteroffer (USD)</span>
              <input id={`counter-amount-${offerId}`} name="amount" inputMode="decimal" autoComplete="off" required placeholder="175.00" className="input" />
            </label>
            <label className="field" htmlFor={`counter-message-${offerId}`}>
              <span>
                Message <span className="font-normal text-ink-soft">(optional)</span>
              </span>
              <textarea id={`counter-message-${offerId}`} name="message" rows={2} maxLength={500} className="input" />
            </label>
            <button type="submit" className="btn btn-primary justify-self-start">
              Send counteroffer
            </button>
          </StatefulForm>
        </details>
      )}
    </div>
  );
}
