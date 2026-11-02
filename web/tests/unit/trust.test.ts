import { describe, expect, it } from "vitest";
import {
  allowedActions,
  checkoutPathForOffer,
  effectiveStatus,
  expiryFrom,
  parseDollarsToCents,
  timeLeft,
  validateOfferAmount,
  type OfferLike,
} from "@/lib/trust/offers";
import { detectOffPlatformPayment } from "@/lib/trust/flags";
import { friendlyDbError } from "@/lib/trust/errors";
import { validEvidencePaths } from "@/lib/trust/disputes";
import * as trustTemplates from "@/lib/email/trust-templates";

const now = new Date("2026-11-03T12:00:00Z");
const offer = (over: Partial<OfferLike> = {}): OfferLike => ({
  status: "pending",
  madeBy: "buyer",
  buyerId: "buyer",
  sellerId: "seller",
  expiresAt: new Date(now.getTime() + 3_600_000),
  ...over,
});

describe("offer state machine", () => {
  it("lets the seller accept, decline or counter a buyer's pending offer", () => {
    expect(allowedActions(offer(), "seller", now)).toEqual(["accept", "reject", "counter"]);
  });
  it("lets the maker only withdraw", () => {
    expect(allowedActions(offer(), "buyer", now)).toEqual(["withdraw"]);
  });
  it("lets the buyer respond to the seller's counter", () => {
    expect(allowedActions(offer({ madeBy: "seller" }), "buyer", now)).toEqual(["accept", "reject", "counter"]);
    expect(allowedActions(offer({ madeBy: "seller" }), "seller", now)).toEqual(["withdraw"]);
  });
  it("allows nothing for strangers or finished offers", () => {
    expect(allowedActions(offer(), "stranger", now)).toEqual([]);
    for (const status of ["rejected", "countered", "expired", "withdrawn", "completed"] as const) {
      expect(allowedActions(offer({ status }), "seller", now)).toEqual([]);
    }
  });
  it("lets either member back out of an accepted offer, which releases the reservation", () => {
    expect(allowedActions(offer({ status: "accepted" }), "seller", now)).toEqual(["withdraw"]);
    expect(allowedActions(offer({ status: "accepted" }), "buyer", now)).toEqual(["withdraw"]);
    expect(allowedActions(offer({ status: "accepted" }), "stranger", now)).toEqual([]);
    expect(allowedActions(offer({ status: "accepted", expiresAt: new Date(now.getTime() - 1) }), "buyer", now)).toEqual([]);
  });
});

describe("offer expiry", () => {
  it("reads open offers past their time as expired", () => {
    expect(effectiveStatus({ status: "pending", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("expired");
    expect(effectiveStatus({ status: "accepted", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("expired");
    expect(effectiveStatus({ status: "pending", expiresAt: new Date(now.getTime() + 1) }, now)).toBe("pending");
    expect(effectiveStatus({ status: "rejected", expiresAt: new Date(now.getTime() - 1) }, now)).toBe("rejected");
  });
  it("blocks actions on an offer that has expired but not yet been swept", () => {
    expect(allowedActions(offer({ expiresAt: new Date(now.getTime() - 1) }), "seller", now)).toEqual([]);
  });
  it("computes expiry from the setting, with a safe default", () => {
    expect(expiryFrom(now, 24).toISOString()).toBe("2026-11-04T12:00:00.000Z");
    expect(expiryFrom(now, 0).toISOString()).toBe("2026-11-05T12:00:00.000Z");
    expect(expiryFrom(now, Number.NaN).toISOString()).toBe("2026-11-05T12:00:00.000Z");
  });
  it("formats time left", () => {
    expect(timeLeft(new Date(now.getTime() + 30 * 60_000), now)).toBe("30 min");
    expect(timeLeft(new Date(now.getTime() + 5 * 3_600_000), now)).toBe("5 h");
    expect(timeLeft(new Date(now.getTime() + 74 * 3_600_000), now)).toBe("3 d 2 h");
    expect(timeLeft(new Date(now.getTime() - 1), now)).toBeNull();
  });
});

describe("offer amounts", () => {
  it("parses dollar amounts", () => {
    expect(parseDollarsToCents("150")).toBe(15000);
    expect(parseDollarsToCents("$1,250.50")).toBe(125050);
    expect(parseDollarsToCents("12.5")).toBe(1250);
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("abc")).toBeNull();
    expect(parseDollarsToCents("-5")).toBeNull();
    expect(parseDollarsToCents("1.234")).toBeNull();
  });
  it("requires an amount below the asking price", () => {
    expect(validateOfferAmount(15000, 20000)).toBeNull();
    expect(validateOfferAmount(20000, 20000)).toMatch(/below the asking price/);
    expect(validateOfferAmount(50, 20000)).toMatch(/at least/);
  });
  it("builds the checkout link", () => {
    expect(checkoutPathForOffer("L", "O")).toBe("/checkout/L?offer=O");
  });
});

describe("off-platform payment detection", () => {
  it.each([
    ["Can you send it by Venmo?", "Venmo"],
    ["I only take zelle", "Zelle"],
    ["my cashapp is $bob", "Cash App"],
    ["Pay me on PayPal friends and family please", "PayPal friends and family"],
    ["paypal F&F works", "PayPal friends and family"],
    ["I can wire money today", "Wire transfer"],
    ["we can do the deal off platform", "Pay outside the site"],
    ["send me a gift card", "Gift cards or crypto"],
  ])("flags %s", (text, term) => {
    expect(detectOffPlatformPayment(text)).toContain(term);
  });
  it.each(["Is the bat still available?", "I will pay with the card at checkout", "What is the barrel wall thickness?", "Shipping to Texas?", "It has a wired grip knob"])(
    "does not flag %s",
    (text) => {
      expect(detectOffPlatformPayment(text)).toEqual([]);
    }
  );
});

describe("friendly database errors", () => {
  it("explains rate limits, blocks and duplicates", () => {
    expect(friendlyDbError({ code: "54000", message: "You are sending messages too quickly. Wait a minute and try again." })).toMatch(/too quickly/);
    expect(friendlyDbError({ code: "42501", message: "This member is not accepting messages from you" })).toBe("This member is not accepting messages from you.");
    expect(friendlyDbError({ code: "42501", message: 'new row violates row-level security policy for table "offers"' })).toMatch(/blocked you/);
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "offers_one_open_per_buyer"' })).toMatch(/already have an open offer/);
    expect(friendlyDbError({ code: "XX000", message: "internal detail" })).toBe("Something went wrong. Please try again.");
  });
});

describe("dispute evidence paths", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const dispute = "22222222-2222-4222-8222-222222222222";
  it("accepts files in the member's own dispute folder", () => {
    expect(validEvidencePaths([`${user}/${dispute}/1-123.jpg`], user, dispute)).toEqual([`${user}/${dispute}/1-123.jpg`]);
    expect(validEvidencePaths([], user, dispute)).toEqual([]);
  });
  it("rejects other folders, traversal, odd characters and too many files", () => {
    expect(validEvidencePaths([`someone-else/${dispute}/1.jpg`], user, dispute)).toBeNull();
    expect(validEvidencePaths([`${user}/${dispute}/../x.jpg`], user, dispute)).toBeNull();
    expect(validEvidencePaths([`${user}/${dispute}/a b.jpg`], user, dispute)).toBeNull();
    expect(validEvidencePaths(Array(5).fill(`${user}/${dispute}/1.jpg`), user, dispute)).toBeNull();
    expect(validEvidencePaths("nope", user, dispute)).toBeNull();
  });
});

describe("trust email templates", () => {
  it("escapes member text and links to the site", () => {
    const mail = trustTemplates.offerCountered({ name: "A", title: "<b>Bat</b>", amountCents: 12000, fromUsername: "bob", offerPath: "/account/offers", expiresAt: "soon" });
    expect(mail.category).toBe("transactional");
    expect(mail.html).not.toContain("<b>Bat</b>");
    expect(mail.html).toContain("/account/offers");
    expect(mail.text).toContain("$120");
    expect(trustTemplates.reviewReceived({ fromUsername: "bob", rating: 5, reviewsPath: "/sellers/x" }).subject).toContain("5-star");
    expect(trustTemplates.disputeUpdated({ orderNumber: "ORD-1", summary: "Closed.", disputePath: "/disputes/x" }).category).toBe("transactional");
  });
  it("renders the counter-accepted and offer-expired emails with escaped text", () => {
    const accepted = trustTemplates.counterAccepted({ title: "<i>Bat</i>", amountCents: 15000, fromUsername: "bob", payBy: "Nov 5" });
    expect(accepted.template).toBe("counter_accepted");
    expect(accepted.html).not.toContain("<i>Bat</i>");
    expect(accepted.text).toContain("reserved for them");
    const expired = trustTemplates.offerExpired({ title: "Bat", amountCents: 15000, listingPath: "/listings/x" });
    expect(expired.template).toBe("offer_expired");
    expect(expired.html).toContain("/listings/x");
  });
});
