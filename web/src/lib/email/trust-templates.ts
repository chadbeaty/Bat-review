// Transactional emails for offers, reviews and disputes that the base template set doesn't cover.
// Same rules as templates.ts: plain data in, escaped HTML and text out.

import { formatPrice } from "@/lib/format";
import { renderLayout, siteLink, type RenderedEmail } from "./layout";

type Base = { name?: string | null };
const hello = (name?: string | null) => (name ? `Hi ${name},` : "Hi,");

export function offerCountered(d: Base & { title: string; amountCents: number; fromUsername: string; offerPath: string; expiresAt: string }): RenderedEmail {
  return renderLayout({
    template: "offer_countered",
    category: "transactional",
    subject: `@${d.fromUsername} made a counteroffer on ${d.title}`,
    preheader: `Counteroffer: ${formatPrice(d.amountCents)}. Expires ${d.expiresAt}.`,
    heading: "You received a counteroffer",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Item", d.title], ["Counteroffer", formatPrice(d.amountCents)], ["Expires", d.expiresAt]] },
      { kind: "button", label: "Accept, counter or decline", href: siteLink(d.offerPath) },
    ],
  });
}

export function reviewReceived(d: Base & { fromUsername: string; rating: number; reviewsPath: string }): RenderedEmail {
  return renderLayout({
    template: "review_received",
    category: "transactional",
    subject: `@${d.fromUsername} left you a ${d.rating}-star review`,
    preheader: "You can respond to it on your profile.",
    heading: "You received a review",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `@${d.fromUsername} rated you ${d.rating} out of 5. You can add a public response from your profile.` },
      { kind: "button", label: "See your reviews", href: siteLink(d.reviewsPath) },
    ],
  });
}

export function disputeUpdated(d: Base & { orderNumber: string; summary: string; disputePath: string }): RenderedEmail {
  return renderLayout({
    template: "dispute_updated",
    category: "transactional",
    subject: `Update on the case for order ${d.orderNumber}`,
    preheader: d.summary,
    heading: "Your case was updated",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: d.summary },
      { kind: "button", label: "View the case", href: siteLink(d.disputePath) },
    ],
  });
}

/** To the seller when the buyer accepts their counteroffer. */
export function counterAccepted(d: Base & { title: string; amountCents: number; fromUsername: string; payBy: string }): RenderedEmail {
  return renderLayout({
    template: "counter_accepted",
    category: "transactional",
    subject: `@${d.fromUsername} accepted your counteroffer on ${d.title}`,
    preheader: `The item is reserved for them until ${d.payBy}.`,
    heading: "Your counteroffer was accepted",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `@${d.fromUsername} accepted ${formatPrice(d.amountCents)} for ${d.title}. The item is reserved for them until ${d.payBy} while they check out. Please don't sell it elsewhere.` },
      { kind: "button", label: "View the offer", href: siteLink("/account/offers") },
    ],
  });
}

/** To both members when an accepted or pending offer runs out of time. */
export function offerExpired(d: Base & { title: string; amountCents: number; listingPath: string }): RenderedEmail {
  return renderLayout({
    template: "offer_expired",
    category: "transactional",
    subject: `The offer on ${d.title} expired`,
    preheader: "The item is available again.",
    heading: "An offer expired",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `The offer of ${formatPrice(d.amountCents)} on ${d.title} ran out of time. If it had been accepted, the reservation has ended and anyone can buy the item again.` },
      { kind: "button", label: "View the listing", href: siteLink(d.listingPath) },
    ],
  });
}
