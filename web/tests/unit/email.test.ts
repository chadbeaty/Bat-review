import { describe, expect, it, vi } from "vitest";
import * as t from "@/lib/email/templates";
import { cleanSubject, esc, siteLink, type RenderedEmail } from "@/lib/email/layout";
import { DevProvider, ResendProvider, fromHeader, maskEmail, providerFromEnv } from "@/lib/email/providers";
import { brand } from "@/config/brand";

const EVIL = `<script>alert("x")</script> & 'quotes'`;

const all: Record<string, () => RenderedEmail> = {
  welcome: () => t.welcome({ name: EVIL, username: "player_1" }),
  listing_published: () => t.listingPublished({ name: EVIL, title: EVIL, priceCents: 22000, listingPath: "/listings/abc", expiresOn: "Jan 30, 2027" }),
  purchase_confirmation: () =>
    t.purchaseConfirmation({ name: EVIL, orderNumber: "ORD-100001", title: EVIL, itemCents: 20000, shippingCents: 1500, taxCents: 0, totalCents: 21500, orderPath: "/orders/1" }),
  seller_order: () =>
    t.sellerOrderNotification({ name: EVIL, orderNumber: "ORD-100001", title: EVIL, itemCents: 20000, commissionCents: 1400, orderPath: "/seller/orders/1", shipBy: "Nov 5" }),
  label_available: () => t.shippingLabelAvailable({ name: EVIL, orderNumber: "ORD-1", carrier: EVIL, service: "Ground", orderPath: "/seller/orders/1" }),
  tracking_update: () => t.trackingUpdate({ name: EVIL, orderNumber: "ORD-1", status: "In transit", detail: EVIL, orderPath: "/orders/1" }),
  delivered: () => t.deliveryConfirmation({ name: EVIL, orderNumber: "ORD-1", title: EVIL, orderPath: "/orders/1", issueDays: 3 }),
  offer_received: () => t.offerReceived({ name: EVIL, title: EVIL, amountCents: 18000, askingCents: 22000, expiresAt: "Nov 4", offerPath: "/offers/1" }),
  offer_accepted: () => t.offerAccepted({ name: EVIL, title: EVIL, amountCents: 18000, checkoutPath: "/checkout/1", payBy: "Nov 4" }),
  offer_rejected: () => t.offerRejected({ name: EVIL, title: EVIL, amountCents: 18000, listingPath: "/listings/1" }),
  new_message: () => t.newMessage({ fromUsername: "seller_1", listingTitle: EVIL, preview: EVIL, conversationPath: "/messages/1" }),
  dispute_opened: () => t.disputeNotification({ name: EVIL, orderNumber: "ORD-1", disputeType: EVIL, role: "seller", respondBy: "Nov 8", disputePath: "/orders/1" }),
  refund_issued: () => t.refundNotification({ name: EVIL, orderNumber: "ORD-1", amountCents: 21500, reason: EVIL, orderPath: "/orders/1" }),
  review_request: () => t.reviewRequest({ name: EVIL, orderNumber: "ORD-1", otherUsername: "seller_1", role: "buyer", reviewPath: "/orders/1/review" }),
  price_drop: () => t.priceDropAlert({ name: EVIL, productName: EVIL, listingTitle: EVIL, oldCents: 25000, newCents: 21000, listingPath: "/listings/1" }),
  newsletter_confirm: () => t.newsletterConfirm({ token: "11111111-1111-4111-8111-111111111111" }),
  newsletter_issue: () =>
    t.newsletterIssue({ token: "22222222-2222-4222-8222-222222222222", subject: "New bats this week", heading: EVIL, paragraphs: [EVIL], cta: { label: "Shop", path: "/shop" } }),
};

describe("email templates", () => {
  for (const [name, render] of Object.entries(all)) {
    it(`renders ${name} with escaped values, branding and a text version`, () => {
      const email = render();
      expect(email.template).toBe(name);
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.html).toContain(brand.name);
      expect(email.html).toContain(brand.colors.accent);
      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain(`"x"`);
      if (email.html.includes("alert")) expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;");
      expect(email.text).toContain(brand.email.supportAddress);
      expect(email.text).not.toMatch(/<\/?(p|td|table|a)\b/);
    });
  }

  it("covers every template the marketplace needs", () => {
    expect(Object.keys(all)).toHaveLength(17);
  });

  it("separates transactional from marketing, and only marketing has an unsubscribe link", () => {
    for (const [name, render] of Object.entries(all)) {
      const email = render();
      if (name === "newsletter_issue") {
        expect(email.category).toBe("marketing");
        expect(email.unsubscribeUrl).toBe(`${brand.siteUrl}/newsletter/unsubscribe?token=22222222-2222-4222-8222-222222222222`);
        expect(email.html).toContain("Unsubscribe");
        expect(email.text).toContain("Unsubscribe: ");
      } else {
        expect(email.category).toBe("transactional");
        expect(email.unsubscribeUrl).toBeUndefined();
      }
    }
  });

  it("links only to this site", () => {
    expect(siteLink("/orders/1", "https://example.org/")).toBe("https://example.org/orders/1");
    expect(siteLink("https://evil.test", "https://example.org")).toBe("https://example.org/");
    expect(siteLink("//evil.test", "https://example.org")).toBe("https://example.org/");
  });

  it("escapes HTML and strips line breaks from subjects", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(cleanSubject("Hello\r\nBcc: someone@evil.test")).toBe("Hello Bcc: someone@evil.test");
    expect(t.offerRejected({ title: "Bat\nBcc: x@y.z", amountCents: 100, listingPath: "/" }).subject).not.toContain("\n");
  });

  it("formats money in the templates", () => {
    const email = all.seller_order();
    expect(email.text).toContain("Sale price: $200");
    expect(email.text).toContain("Marketplace commission: −$14");
  });
});

describe("email providers", () => {
  const email = t.welcome({ username: "player_1" });

  it("uses the dev provider when no Resend key is set, and reports not sent", async () => {
    const lines: string[] = [];
    const dev = new DevProvider((l) => lines.push(l));
    expect(await dev.send("player@example.com", email)).toEqual({ provider: "dev", status: "not_sent" });
    expect(lines[0]).toContain("not sent");
    expect(lines[0]).toContain("p***@example.com");
    expect(lines[0]).not.toContain(email.html);
    expect(providerFromEnv({}).name).toBe("dev");
    expect(providerFromEnv({ RESEND_API_KEY: "re_test" }).name).toBe("resend");
  });

  it("calls Resend's API with the key, both bodies and unsubscribe headers for marketing", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "msg_123" }), { status: 200 }));
    const resend = new ResendProvider("re_test_key", fetchMock as unknown as typeof fetch);
    const marketing = all.newsletter_issue();
    expect(await resend.send("fan@example.com", marketing)).toEqual({ provider: "resend", status: "sent", id: "msg_123" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body));
    expect(body.to).toEqual(["fan@example.com"]);
    expect(body.from).toBe(fromHeader());
    expect(body.html).toBe(marketing.html);
    expect(body.text).toBe(marketing.text);
    expect(body.headers["List-Unsubscribe"]).toBe(`<${marketing.unsubscribeUrl}>`);
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("reports Resend failures without throwing", async () => {
    const failing = new ResendProvider("k", (async () => new Response(JSON.stringify({ message: "Domain not verified" }), { status: 403 })) as unknown as typeof fetch);
    expect(await failing.send("a@example.com", email)).toEqual({ provider: "resend", status: "failed", error: "Domain not verified" });
    const offline = new ResendProvider("k", (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch);
    expect((await offline.send("a@example.com", email)).status).toBe("failed");
  });

  it("masks addresses in logs", () => {
    expect(maskEmail("someone@example.com")).toBe("s***@example.com");
    expect(maskEmail("bad")).toBe("***");
  });
});
