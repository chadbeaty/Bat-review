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
