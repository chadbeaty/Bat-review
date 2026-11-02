// Accepted offers at checkout: the rules that decide whether a buyer may pay an offer's price, the newsletter
// double opt-in flow, and that every cron route is scheduled. (The database re-checks the offer rules; see
// tests/db/payments.test.ts "accepted offers at checkout".)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkOfferForCheckout, requireCheckoutOffer, type OfferForCheckout } from "@/lib/payments/offer";
import { checkoutSessionParams } from "@/lib/payments/checkout";
import { PaymentsError } from "@/lib/payments/deps";
import { CONFIRM_RESEND_MINUTES, requestNewsletterSignup } from "@/lib/newsletter-signup";
import { providerFromEnv } from "@/lib/email/providers";
import type { RenderedEmail } from "@/lib/email/layout";

const now = new Date("2026-11-03T12:00:00Z");
const offer = (over: Partial<OfferForCheckout> = {}): OfferForCheckout => ({
  id: "offer-1",
  listing_id: "listing-1",
  buyer_id: "buyer-1",
  status: "accepted",
  amount_cents: 18000,
  expires_at: "2026-11-04T12:00:00Z",
  ...over,
});
const ctx = { buyerId: "buyer-1", listingId: "listing-1", now };

describe("checkOfferForCheckout", () => {
  it("returns the offer amount for the right buyer, listing and window", () => {
    expect(checkOfferForCheckout(offer(), ctx)).toEqual({ ok: true, amountCents: 18000 });
  });
  it("rejects the wrong buyer and the wrong listing as 'not found', revealing nothing", () => {
    expect(checkOfferForCheckout(offer(), { ...ctx, buyerId: "buyer-2" })).toMatchObject({ ok: false, code: "not_found" });
    expect(checkOfferForCheckout(offer(), { ...ctx, listingId: "listing-2" })).toMatchObject({ ok: false, code: "not_found" });
    expect(checkOfferForCheckout(null, ctx)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("rejects offers that are not accepted", () => {
    for (const status of ["pending", "rejected", "countered", "withdrawn", "completed"]) {
      expect(checkOfferForCheckout(offer({ status }), ctx)).toMatchObject({ ok: false, code: "not_accepted" });
    }
    expect(checkOfferForCheckout(offer({ status: "expired" }), ctx)).toMatchObject({ ok: false, code: "expired" });
  });
  it("rejects an accepted offer whose payment window has passed, to the millisecond", () => {
    expect(checkOfferForCheckout(offer({ expires_at: "2026-11-03T11:59:59.999Z" }), ctx)).toMatchObject({ ok: false, code: "expired" });
    expect(checkOfferForCheckout(offer({ expires_at: "2026-11-03T12:00:00.000Z" }), ctx)).toMatchObject({ ok: false, code: "expired" });
    expect(checkOfferForCheckout(offer({ expires_at: "2026-11-03T12:00:00.001Z" }), ctx)).toMatchObject({ ok: true });
  });
  it("never trusts a non-integer or zero amount", () => {
    expect(checkOfferForCheckout(offer({ amount_cents: 0 }), ctx).ok).toBe(false);
    expect(checkOfferForCheckout(offer({ amount_cents: 10.5 }), ctx).ok).toBe(false);
  });
});

describe("requireCheckoutOffer", () => {
  const dbReturning = (row: OfferForCheckout | null) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }) as never;
  it("returns the price to charge", async () => {
    expect(await requireCheckoutOffer(dbReturning(offer()), "offer-1", ctx)).toBe(18000);
  });
  it("throws a friendly PaymentsError for another buyer's or an expired offer", async () => {
    await expect(requireCheckoutOffer(dbReturning(offer()), "offer-1", { ...ctx, buyerId: "someone-else" })).rejects.toBeInstanceOf(PaymentsError);
    await expect(requireCheckoutOffer(dbReturning(offer({ expires_at: "2026-11-01T00:00:00Z" })), "offer-1", ctx)).rejects.toThrow(/payment window/);
  });
});

describe("Stripe Checkout Session for an offer", () => {
  it("charges the offer amount as the line item", () => {
    const params = checkoutSessionParams(
      "https://example.test",
      { orderId: "o1", orderNumber: "ORD-1", listingId: "l1", title: "Bat", itemCents: 18000, shippingCents: 1899, shippingLabel: "USPS", taxCents: 0, totalCents: 19899, buyerEmail: null },
      Date.now()
    );
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(18000);
    expect(() =>
      checkoutSessionParams("https://example.test", { orderId: "o1", orderNumber: "ORD-1", listingId: "l1", title: "Bat", itemCents: 18000, shippingCents: 1899, shippingLabel: "USPS", taxCents: 0, totalCents: 23899, buyerEmail: null })
    ).toThrow(/don't add up/);
  });
});

// A tiny in-memory stand-in for the two tables the sign-up touches.
function fakeDb(initial: { status?: string; token?: string; recentConfirm?: boolean } | null) {
  let sub = initial ? { id: "s1", status: initial.status ?? "pending", confirm_token: initial.token ?? "tok-old" } : null;
  const updates: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "newsletter_subscribers") {
        return {
          upsert: async (row: { email: string }) => {
            if (!sub) sub = { id: "s1", status: "pending", confirm_token: "tok-new" };
            void row;
            return { error: null };
          },
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sub, error: null }) }) }),
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            sub = { ...sub!, ...(patch as object) } as typeof sub;
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "email_deliveries") {
        const chain = { eq: () => chain, gte: () => chain, limit: async () => ({ data: initial?.recentConfirm ? [{ id: "d1" }] : [] }) };
        return { select: () => chain };
      }
      throw new Error(table);
    },
  };
  return { db: db as never, updates, get sub() { return sub; } };
}

describe("newsletter double opt-in", () => {
  it("stores a pending subscriber and sends a confirmation email with the confirm link, nothing else", async () => {
    const sent: { to: string; email: RenderedEmail }[] = [];
    const f = fakeDb(null);
    const outcome = await requestNewsletterSignup("fan@example.com", "homepage", { db: f.db, send: async (to, email) => void sent.push({ to, email }) });
    expect(outcome).toBe("confirmation_sent");
    expect(f.sub?.status).toBe("pending");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("fan@example.com");
    expect(sent[0].email.template).toBe("newsletter_confirm");
    expect(sent[0].email.html).toContain("/newsletter/confirm?token=tok-new");
  });
  it("does not email an address that is already confirmed", async () => {
    const send = vi.fn();
    const outcome = await requestNewsletterSignup("fan@example.com", "homepage", { db: fakeDb({ status: "subscribed" }).db, send });
    expect(outcome).toBe("already_subscribed");
    expect(send).not.toHaveBeenCalled();
  });
  it(`does not resend within ${CONFIRM_RESEND_MINUTES} minutes`, async () => {
    const send = vi.fn();
    expect(await requestNewsletterSignup("fan@example.com", "homepage", { db: fakeDb({ recentConfirm: true }).db, send })).toBe("throttled");
    expect(send).not.toHaveBeenCalled();
  });
  it("restarts an unsubscribed address as pending with a fresh token", async () => {
    const sent: RenderedEmail[] = [];
    const f = fakeDb({ status: "unsubscribed", token: "tok-old" });
    const outcome = await requestNewsletterSignup("fan@example.com", "homepage", { db: f.db, send: async (_to, e) => void sent.push(e), newToken: () => "tok-fresh" });
    expect(outcome).toBe("confirmation_sent");
    expect(f.updates[0]).toMatchObject({ status: "pending", confirm_token: "tok-fresh" });
    expect(sent[0].html).toContain("token=tok-fresh");
    expect(sent[0].html).not.toContain("tok-old");
  });
});

describe("email without RESEND_API_KEY", () => {
  it("uses the dev provider, which logs and reports not_sent instead of failing", async () => {
    const provider = providerFromEnv({});
    expect(provider.name).toBe("dev");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const result = await provider.send("a@example.com", { template: "x", category: "transactional", subject: "s", html: "<p>h</p>", text: "t" } as RenderedEmail);
    expect(result).toEqual({ provider: "dev", status: "not_sent" });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe("scheduled jobs", () => {
  it("schedules every route under src/app/api/cron in vercel.json", () => {
    const root = join(__dirname, "..", "..");
    const routes = readdirSync(join(root, "src", "app", "api", "cron"), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `/api/cron/${d.name}`)
      .sort();
    const crons = (JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")).crons as { path: string; schedule: string }[]).map((c) => c.path).sort();
    expect(routes.length).toBeGreaterThanOrEqual(2);
    expect(crons).toEqual(routes);
  });
  it("protects each cron route with CRON_SECRET", () => {
    const root = join(__dirname, "..", "..", "src", "app", "api", "cron");
    for (const dir of readdirSync(root)) {
      const source = readFileSync(join(root, dir, "route.ts"), "utf8");
      expect(source, dir).toMatch(/CRON_SECRET|cronAuthorized/);
      expect(source, dir).toMatch(/401/);
    }
  });
});
