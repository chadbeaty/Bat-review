// Email templates. Each takes plain data and returns subject, HTML and text. Values are escaped by the layout.
// Transactional messages are about something the member did or asked for; marketing messages go only to
// newsletter subscribers and always carry an unsubscribe link.

import { brand } from "@/config/brand";
import { formatPrice } from "@/lib/format";
import { renderLayout, siteLink, type RenderedEmail } from "./layout";

type Base = { name?: string | null };
const hello = (name?: string | null) => (name ? `Hi ${name},` : "Hi,");

export function welcome(d: Base & { username: string }): RenderedEmail {
  return renderLayout({
    template: "welcome",
    category: "transactional",
    subject: `Welcome to ${brand.name}`,
    preheader: "Your account is ready.",
    heading: "Your account is ready",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `Your username is @${d.username}. You can now save bats, message sellers and list your own gear.` },
      { kind: "button", label: "Go to your account", href: siteLink("/account") },
      { kind: "note", text: "Pay only through the site. We will never ask you to pay a seller by app, wire or gift card." },
    ],
  });
}

export function listingPublished(d: Base & { title: string; priceCents: number; listingPath: string; expiresOn: string }): RenderedEmail {
  return renderLayout({
    template: "listing_published",
    category: "transactional",
    subject: `Your listing is live: ${d.title}`,
    preheader: "Buyers can see it now.",
    heading: "Your listing is live",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Item", d.title], ["Price", formatPrice(d.priceCents)], ["Live until", d.expiresOn]] },
      { kind: "button", label: "View your listing", href: siteLink(d.listingPath) },
      { kind: "note", text: "Keep the bat ready to ship. Once it sells, you'll buy a prepaid label from the order page." },
    ],
  });
}

export function purchaseConfirmation(
  d: Base & { orderNumber: string; title: string; itemCents: number; shippingCents: number; taxCents: number; totalCents: number; orderPath: string }
): RenderedEmail {
  return renderLayout({
    template: "purchase_confirmation",
    category: "transactional",
    subject: `Order ${d.orderNumber} confirmed`,
    preheader: "Thanks for your order. The seller has been told to ship it.",
    heading: "Thanks, your order is confirmed",
    blocks: [
      { kind: "p", text: hello(d.name) },
      {
        kind: "rows",
        rows: [
          ["Order", d.orderNumber],
          ["Item", d.title],
          ["Item price", formatPrice(d.itemCents)],
          ["Shipping", formatPrice(d.shippingCents)],
          ["Tax", formatPrice(d.taxCents)],
          ["Total paid", formatPrice(d.totalCents)],
        ],
      },
      { kind: "p", text: "The seller has been asked to ship. We'll email you the tracking number when the label is created." },
      { kind: "button", label: "View your order", href: siteLink(d.orderPath) },
    ],
  });
}

export function sellerOrderNotification(
  d: Base & { orderNumber: string; title: string; itemCents: number; commissionCents: number; orderPath: string; shipBy: string }
): RenderedEmail {
  return renderLayout({
    template: "seller_order",
    category: "transactional",
    subject: `You made a sale: ${d.title}`,
    preheader: `Ship by ${d.shipBy}.`,
    heading: "You made a sale",
    blocks: [
      { kind: "p", text: hello(d.name) },
      {
        kind: "rows",
        rows: [
          ["Order", d.orderNumber],
          ["Item", d.title],
          ["Sale price", formatPrice(d.itemCents)],
          ["Marketplace commission", `−${formatPrice(d.commissionCents)}`],
          ["Ship by", d.shipBy],
        ],
      },
      { kind: "p", text: "Buy the shipping label from the order page so tracking is attached to the order automatically." },
      { kind: "button", label: "Open the order", href: siteLink(d.orderPath) },
      { kind: "note", text: "Payment processing costs are shown on the order once the payment settles." },
    ],
  });
}

export function shippingLabelAvailable(d: Base & { orderNumber: string; carrier: string; service: string; orderPath: string }): RenderedEmail {
  return renderLayout({
    template: "label_available",
    category: "transactional",
    subject: `Shipping label ready for order ${d.orderNumber}`,
    preheader: "Print it and drop the package off.",
    heading: "Your shipping label is ready",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Order", d.orderNumber], ["Carrier", d.carrier], ["Service", d.service]] },
      { kind: "button", label: "Print the label", href: siteLink(d.orderPath) },
      { kind: "note", text: "Pack the bat so it can't move in the box, and photograph it before you seal the package." },
    ],
  });
}

export function trackingUpdate(d: Base & { orderNumber: string; status: string; detail?: string | null; trackingUrl?: string | null; orderPath: string }): RenderedEmail {
  return renderLayout({
    template: "tracking_update",
    category: "transactional",
    subject: `Order ${d.orderNumber}: ${d.status}`,
    preheader: d.detail ?? d.status,
    heading: `Tracking update: ${d.status}`,
    blocks: [
      { kind: "p", text: hello(d.name) },
      ...(d.detail ? [{ kind: "p" as const, text: d.detail }] : []),
      { kind: "button", label: "See tracking", href: siteLink(d.orderPath) },
    ],
  });
}

export function deliveryConfirmation(d: Base & { orderNumber: string; title: string; orderPath: string; issueDays: number }): RenderedEmail {
  return renderLayout({
    template: "delivered",
    category: "transactional",
    subject: `Delivered: ${d.title}`,
    preheader: "Check the item and let us know if anything is wrong.",
    heading: "Your order was delivered",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `Order ${d.orderNumber} shows as delivered. Check the item against the listing's condition and damage answers.` },
      { kind: "p", text: `If it isn't as described, open a problem report from the order page within ${d.issueDays} days.` },
      { kind: "button", label: "View the order", href: siteLink(d.orderPath) },
    ],
  });
}

export function offerReceived(d: Base & { title: string; amountCents: number; askingCents: number; expiresAt: string; offerPath: string }): RenderedEmail {
  return renderLayout({
    template: "offer_received",
    category: "transactional",
    subject: `New offer of ${formatPrice(d.amountCents)} on ${d.title}`,
    preheader: `It expires ${d.expiresAt}.`,
    heading: "You have a new offer",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Item", d.title], ["Your price", formatPrice(d.askingCents)], ["Offer", formatPrice(d.amountCents)], ["Expires", d.expiresAt]] },
      { kind: "button", label: "Accept, counter or decline", href: siteLink(d.offerPath) },
    ],
  });
}

export function offerAccepted(d: Base & { title: string; amountCents: number; checkoutPath: string; payBy: string }): RenderedEmail {
  return renderLayout({
    template: "offer_accepted",
    category: "transactional",
    subject: `Your offer on ${d.title} was accepted`,
    preheader: `Pay by ${d.payBy} to keep it.`,
    heading: "Your offer was accepted",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `The seller accepted ${formatPrice(d.amountCents)} for ${d.title}. The item is reserved for you until ${d.payBy}. Complete checkout by then to buy it.` },
      { kind: "button", label: "Go to checkout", href: siteLink(d.checkoutPath) },
    ],
  });
}

export function offerRejected(d: Base & { title: string; amountCents: number; listingPath: string }): RenderedEmail {
  return renderLayout({
    template: "offer_rejected",
    category: "transactional",
    subject: `Your offer on ${d.title} was declined`,
    preheader: "The listing may still be available.",
    heading: "Your offer was declined",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "p", text: `The seller declined your offer of ${formatPrice(d.amountCents)} for ${d.title}. You can make a new offer or buy it at the listed price.` },
      { kind: "button", label: "View the listing", href: siteLink(d.listingPath) },
    ],
  });
}

export function newMessage(d: Base & { fromUsername: string; listingTitle: string; preview: string; conversationPath: string }): RenderedEmail {
  const preview = d.preview.length > 200 ? d.preview.slice(0, 197) + "…" : d.preview;
  return renderLayout({
    template: "new_message",
    category: "transactional",
    subject: `New message from @${d.fromUsername} about ${d.listingTitle}`,
    preheader: preview,
    heading: `@${d.fromUsername} sent you a message`,
    blocks: [
      { kind: "p", text: `About: ${d.listingTitle}` },
      { kind: "note", text: `"${preview}"` },
      { kind: "button", label: "Reply on the site", href: siteLink(d.conversationPath) },
      { kind: "note", text: "Keep conversations and payment on the site. Off-site payments aren't covered if something goes wrong." },
    ],
  });
}

export function disputeNotification(d: Base & { orderNumber: string; disputeType: string; role: "buyer" | "seller"; respondBy: string; disputePath: string }): RenderedEmail {
  return renderLayout({
    template: "dispute_opened",
    category: "transactional",
    subject: `A problem was reported on order ${d.orderNumber}`,
    preheader: `Respond by ${d.respondBy}.`,
    heading: "A problem was reported on an order",
    blocks: [
      { kind: "p", text: hello(d.name) },
      {
        kind: "p",
        text:
          d.role === "seller"
            ? `The buyer reported "${d.disputeType}" on order ${d.orderNumber}. Respond with your side and any photos by ${d.respondBy}.`
            : `We received your report of "${d.disputeType}" on order ${d.orderNumber}. The seller has until ${d.respondBy} to respond.`,
      },
      { kind: "button", label: "View the case", href: siteLink(d.disputePath) },
    ],
  });
}

export function refundNotification(d: Base & { orderNumber: string; amountCents: number; reason: string; orderPath: string }): RenderedEmail {
  return renderLayout({
    template: "refund_issued",
    category: "transactional",
    subject: `Refund of ${formatPrice(d.amountCents)} for order ${d.orderNumber}`,
    preheader: "It goes back to your original payment method.",
    heading: "A refund was issued",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Order", d.orderNumber], ["Refund", formatPrice(d.amountCents)], ["Reason", d.reason]] },
      { kind: "p", text: "Refunds go back to the card used to pay. Your bank decides how long it takes to show, usually 5 to 10 business days." },
      { kind: "button", label: "View the order", href: siteLink(d.orderPath) },
    ],
  });
}

export function reviewRequest(d: Base & { orderNumber: string; otherUsername: string; role: "buyer" | "seller"; reviewPath: string }): RenderedEmail {
  return renderLayout({
    template: "review_request",
    category: "transactional",
    subject: `How did order ${d.orderNumber} go?`,
    preheader: `Leave a review for @${d.otherUsername}.`,
    heading: `Review @${d.otherUsername}`,
    blocks: [
      { kind: "p", text: hello(d.name) },
      {
        kind: "p",
        text: `Order ${d.orderNumber} is complete. A short review of the ${d.role === "buyer" ? "seller" : "buyer"} helps other players buy with confidence.`,
      },
      { kind: "button", label: "Leave a review", href: siteLink(d.reviewPath) },
    ],
  });
}

export function priceDropAlert(d: Base & { productName: string; listingTitle: string; oldCents: number; newCents: number; listingPath: string }): RenderedEmail {
  return renderLayout({
    template: "price_drop",
    category: "transactional",
    subject: `Price drop: ${d.listingTitle} is now ${formatPrice(d.newCents)}`,
    preheader: `Down from ${formatPrice(d.oldCents)}.`,
    heading: "A bat on your watchlist dropped in price",
    blocks: [
      { kind: "p", text: hello(d.name) },
      { kind: "rows", rows: [["Model", d.productName], ["Listing", d.listingTitle], ["Was", formatPrice(d.oldCents)], ["Now", formatPrice(d.newCents)]] },
      { kind: "button", label: "View the listing", href: siteLink(d.listingPath) },
      { kind: "note", text: "You asked for alerts on this model. Remove it from your watchlist to stop them." },
    ],
  });
}

/** Asks a new subscriber to confirm (double opt-in). Sent once, because they asked to join. */
export function newsletterConfirm(d: { token: string }): RenderedEmail {
  return renderLayout({
    template: "newsletter_confirm",
    category: "transactional",
    subject: `Confirm your ${brand.name} updates`,
    preheader: "One click to confirm.",
    heading: "Confirm your email",
    blocks: [
      { kind: "p", text: "Someone (we hope you) asked to get marketplace updates at this address." },
      { kind: "button", label: "Yes, send me updates", href: siteLink(`/newsletter/confirm?token=${encodeURIComponent(d.token)}`) },
      { kind: "note", text: "If this wasn't you, ignore this email and you won't hear from us." },
    ],
  });
}

/** A marketing email to newsletter subscribers. Always carries an unsubscribe link from the subscriber's token. */
export function newsletterIssue(d: { token: string; subject: string; heading: string; paragraphs: string[]; cta?: { label: string; path: string } }): RenderedEmail {
  const unsubscribeUrl = siteLink(`/newsletter/unsubscribe?token=${encodeURIComponent(d.token)}`);
  return renderLayout({
    template: "newsletter_issue",
    category: "marketing",
    subject: d.subject,
    preheader: d.paragraphs[0] ?? d.heading,
    heading: d.heading,
    blocks: [
      ...d.paragraphs.map((text) => ({ kind: "p" as const, text })),
      ...(d.cta ? [{ kind: "button" as const, label: d.cta.label, href: siteLink(d.cta.path) }] : []),
    ],
    unsubscribeUrl,
  });
}
