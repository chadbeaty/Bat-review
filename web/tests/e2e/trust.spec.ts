// Messaging, offers, reviews, disputes, notifications and the admin disputes screen. Needs the local Supabase
// stack and a production build. Everything created here is deleted afterwards.
import { createHmac } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, serviceClient, signIn, type TestUser } from "./helpers";

// A 1x1 PNG, used as dispute evidence.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("trust: messages, offers, reviews, disputes, notifications", () => {
  test.skip(!hasSupabase(), "Needs the local Supabase stack");
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  const db = serviceClient();
  const users: TestUser[] = [];
  const orderIds: string[] = [];
  let seller: TestUser;
  let buyer: TestUser;
  let buyer2: TestUser;
  let admin: TestUser;
  let listingId: string;
  let orderListingId: string;
  let orderId: string;
  let disputeId = "";
  let buyerCtx: BrowserContext;
  let sellerCtx: BrowserContext;
  let buyerPage: Page;
  let sellerPage: Page;
  let convoUrl = "";

  const newUser = async (prefix: string) => {
    const u = await createConfirmedUser(prefix);
    users.push(u);
    return u;
  };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    seller = await newUser("tseller");
    buyer = await newUser("tbuyer");
    buyer2 = await newUser("tbuyer2");
    admin = await newUser("tadmin");
    await db.from("user_roles").insert({ user_id: admin.id, role: "admin" });
    listingId = await createLiveListing(seller, { title: "Trust test offer bat 26 oz", priceCents: 20000 });
    orderListingId = await createLiveListing(seller, { title: "Trust test sold bat 26 oz", priceCents: 18000 });
    const { data: order, error } = await db
      .from("orders")
      .insert({ buyer_id: buyer.id, seller_id: seller.id, order_status: "completed", subtotal_cents: 18000, total_amount_cents: 18000, completed_at: new Date().toISOString() })
      .select("id")
      .single();
    if (error || !order) throw error ?? new Error("order failed");
    orderId = order.id;
    orderIds.push(orderId);
    await db.from("order_items").insert({ order_id: orderId, listing_id: orderListingId, seller_id: seller.id, product_title_snapshot: "Trust test sold bat 26 oz", unit_price_cents: 18000 });
    buyerCtx = await browser.newContext();
    sellerCtx = await browser.newContext();
    buyerPage = await buyerCtx.newPage();
    sellerPage = await sellerCtx.newPage();
    await signIn(buyerPage, buyer);
    await signIn(sellerPage, seller);
  });

  test.afterAll(async () => {
    await buyerCtx?.close();
    await sellerCtx?.close();
    if (disputeId) {
      for (const u of users) {
        const { data } = await db.storage.from("dispute-evidence").list(`${u.id}/${disputeId}`);
        if (data?.length) await db.storage.from("dispute-evidence").remove(data.map((f) => `${u.id}/${disputeId}/${f.name}`));
      }
    }
    // Orders (and their items, cases and reviews) must go before the members they reference.
    if (orderIds.length) await db.from("orders").delete().in("id", orderIds);
    for (const u of users) await db.auth.admin.deleteUser(u.id);
  });

  test("a buyer messages the seller and the seller replies, with no emails shown", async () => {
    await buyerPage.goto(`/listings/${listingId}`);
    await buyerPage.getByRole("button", { name: "Message seller" }).click();
    await expect(buyerPage).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);
    convoUrl = buyerPage.url();
    await expect(buyerPage.getByTestId("payment-warning")).toContainText("Venmo");
    await buyerPage.getByLabel("Your message").fill("Is the barrel still in good shape?");
    await buyerPage.getByRole("button", { name: "Send message" }).click();
    await expect(buyerPage.getByTestId("thread")).toContainText("Is the barrel still in good shape?");

    await sellerPage.goto("/messages");
    const row = sellerPage.getByTestId("conversation-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("1 new");
    await expect(row).toContainText("Trust test offer bat");
    await expect(row).toContainText(`@${buyer.username}`);
    await row.click();
    await expect(sellerPage.getByTestId("thread")).toContainText("Is the barrel still in good shape?");
    await sellerPage.getByLabel("Your message").fill("Yes, it is like new.");
    await sellerPage.getByRole("button", { name: "Send message" }).click();
    await expect(sellerPage.getByTestId("thread")).toContainText("Yes, it is like new.");
    expect(await sellerPage.content()).not.toContain(buyer.email);

    await buyerPage.goto(convoUrl);
    await expect(buyerPage.getByTestId("thread")).toContainText("Yes, it is like new.");
    expect(await buyerPage.content()).not.toContain(seller.email);
  });

  test("a message with off-platform payment terms is sent and flagged for moderators", async () => {
    await buyerPage.goto(convoUrl);
    await buyerPage.getByLabel("Your message").fill("Could you take Venmo instead?");
    await buyerPage.getByRole("button", { name: "Send message" }).click();
    await expect(buyerPage.getByTestId("thread")).toContainText("Could you take Venmo instead?");
    await expect
      .poll(async () => {
        const { data } = await db.from("reports").select("id, source, reason").eq("reporter_id", buyer.id).eq("reason", "off_platform_payment");
        return data?.length ?? 0;
      })
      .toBe(1);
    const { data } = await db.from("reports").select("source, entity_type, details").eq("reporter_id", buyer.id).single();
    expect(data).toMatchObject({ source: "auto", entity_type: "message" });
    expect(data?.details).toContain("Venmo");
  });

  test("the seller can report a conversation", async () => {
    await sellerPage.goto(convoUrl);
    await sellerPage.getByText("Report this conversation").click();
    await sellerPage.getByLabel("Reason").selectOption("off_platform_payment");
    await sellerPage.getByRole("button", { name: "Send report" }).click();
    await expect(sellerPage.getByText("Our moderators will review this conversation")).toBeVisible();
  });

  test("a blocked member cannot message, and cannot start a conversation", async () => {
    await sellerPage.goto(convoUrl);
    await sellerPage.getByRole("button", { name: `Block @${buyer.username}` }).click();
    await expect(sellerPage.getByText("Member blocked")).toBeVisible();

    await buyerPage.goto(convoUrl);
    await buyerPage.getByLabel("Your message").fill("Hello? Still there?");
    await buyerPage.getByRole("button", { name: "Send message" }).click();
    await expect(buyerPage.getByRole("alert").filter({ hasText: "not accepting messages" })).toBeVisible();

    // A different blocked buyer cannot open a conversation at all.
    await db.from("user_blocks").insert({ blocker_id: seller.id, blocked_id: buyer2.id });
    const ctx = await buyerCtx.browser()!.newContext();
    const p = await ctx.newPage();
    await signIn(p, buyer2);
    await p.goto(`/listings/${listingId}`);
    await p.getByRole("button", { name: "Message seller" }).click();
    await expect(p).toHaveURL(new RegExp(`/listings/${listingId}`));
    expect(p.url()).not.toContain("/messages/");
    await ctx.close();
    await db.from("user_blocks").delete().eq("blocker_id", seller.id);
  });

  test("offer, counter, accept: checkout link appears and the other pending offer is declined", async () => {
    // buyer (already signed in) and buyer2 each make an offer
    await buyerPage.goto(`/listings/${listingId}`);
    await buyerPage.getByTestId("offer-details").locator("summary").click();
    await buyerPage.getByLabel("Your offer (USD)").fill("20000");
    await buyerPage.getByRole("button", { name: "Send offer" }).click();
    await expect(buyerPage.getByRole("alert").filter({ hasText: "below the asking price" })).toBeVisible();
    await buyerPage.getByLabel("Your offer (USD)").fill("150");
    await buyerPage.getByLabel("Message").fill("Can you do $150?");
    await buyerPage.getByRole("button", { name: "Send offer" }).click();
    await expect(buyerPage.getByRole("status").filter({ hasText: "Offer of $150 sent" })).toBeVisible();

    const ctx2 = await buyerCtx.browser()!.newContext();
    const p2 = await ctx2.newPage();
    await signIn(p2, buyer2);
    await p2.goto(`/listings/${listingId}`);
    await p2.getByTestId("offer-details").locator("summary").click();
    await p2.getByLabel("Your offer (USD)").fill("140");
    await p2.getByRole("button", { name: "Send offer" }).click();
    await expect(p2.getByRole("status").filter({ hasText: "Offer of $140 sent" })).toBeVisible();

    // seller sees both and counters the first
    await sellerPage.goto("/account/offers");
    const received = sellerPage.getByTestId("offers-received").getByTestId("offer-card");
    await expect(received).toHaveCount(2);
    const first = received.filter({ hasText: "$150" });
    await first.getByText("Counter", { exact: true }).click();
    await first.getByLabel("Counteroffer (USD)").fill("170");
    await first.getByRole("button", { name: "Send counteroffer" }).click();
    await expect(sellerPage.getByTestId("offers-received").getByTestId("offer-card").filter({ hasText: "$150" })).toHaveAttribute("data-status", "countered");

    // buyer accepts the counter and gets the checkout link
    await buyerPage.goto("/account/offers");
    const counter = buyerPage.getByTestId("offers-made").getByTestId("offer-card").filter({ hasText: "$170" });
    await expect(counter).toHaveAttribute("data-status", "pending");
    await counter.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(buyerPage.getByTestId("offers-made").getByTestId("offer-card").filter({ hasText: "$170" })).toHaveAttribute("data-status", "accepted");
    const link = buyerPage.getByTestId("checkout-link");
    await expect(link).toContainText("Check out at $170");
    const { data: accepted } = await db.from("offers").select("id").eq("listing_id", listingId).eq("status", "accepted").single();
    await expect(link).toHaveAttribute("href", `/checkout/${listingId}?offer=${accepted!.id}`);

    // buyer2's pending offer was declined automatically, and they were told
    await p2.goto("/account/offers");
    await expect(p2.getByTestId("offer-card").filter({ hasText: "$140" })).toHaveAttribute("data-status", "rejected");
    await p2.goto("/account/notifications");
    await expect(p2.getByTestId("notifications")).toContainText("was declined");

    // notifications: badge, mark one read, mark all read
    await expect(p2.getByTestId("unread-badge").first()).toBeVisible();
    await p2.getByRole("button", { name: "Mark as read" }).first().click();
    await expect(p2.getByTestId("unread-summary")).toContainText("all caught up");
    await expect(p2.getByTestId("notifications").locator('[data-read="false"]')).toHaveCount(0);
    await ctx2.close();

    // the seller was told about both offers and the acceptance
    await sellerPage.goto("/account/notifications");
    await expect(sellerPage.getByTestId("notifications")).toContainText("New offer of $150");
    await expect(sellerPage.getByTestId("notifications")).toContainText("accepted your counteroffer");
    await expect(sellerPage.getByTestId("unread-badge").first()).toBeVisible();
    await sellerPage.getByRole("button", { name: "Mark all as read" }).click();
    await expect(sellerPage.getByTestId("unread-summary")).toContainText("all caught up");
    await expect(sellerPage.getByTestId("unread-badge")).toHaveCount(0);
  });

  test("a buyer reviews a completed order, and the seller responds", async () => {
    await buyerPage.goto(`/reviews/new?order=${orderId}`);
    await buyerPage.getByLabel("5 stars").check();
    await buyerPage.getByLabel(/Your review/).fill("Fast shipping, exactly as described.");
    await buyerPage.getByRole("button", { name: "Post review" }).click();
    await expect(buyerPage.getByTestId("existing-review")).toContainText("You already reviewed this order");

    await sellerPage.goto(`/sellers/${seller.username}`);
    await expect(sellerPage.getByText("Fast shipping, exactly as described.")).toBeVisible();
    await expect(sellerPage.getByTestId("seller-stats")).toContainText("5.0 / 5");
    await expect(sellerPage.getByTestId("seller-stats")).toContainText("Account age");
    await sellerPage.getByText("Respond publicly").click();
    await sellerPage.getByLabel("Your response").fill("Thanks, enjoy the bat!");
    await sellerPage.getByRole("button", { name: "Post response" }).click();
    await sellerPage.reload();
    await expect(sellerPage.getByText("Thanks, enjoy the bat!")).toBeVisible();

    // the seller can also review the buyer; the buyer is notified
    await sellerPage.goto(`/reviews/new?order=${orderId}`);
    await sellerPage.getByLabel("4 stars").check();
    await sellerPage.getByRole("button", { name: "Post review" }).click();
    await expect(sellerPage.getByTestId("existing-review")).toBeVisible();
    await buyerPage.goto("/account/notifications");
    await expect(buyerPage.getByTestId("notifications")).toContainText("4-star review");

    // a non-party cannot open the review page
    const ctx = await buyerCtx.browser()!.newContext();
    const p = await ctx.newPage();
    await signIn(p, buyer2);
    expect((await p.goto(`/reviews/new?order=${orderId}`))?.status()).toBe(404);
    await ctx.close();
  });

  test("a buyer opens a dispute with a photo, the seller replies, and an admin resolves it", async () => {
    test.setTimeout(150_000);
    await buyerPage.goto(`/disputes/new?order=${orderId}`);
    await buyerPage.getByLabel("What went wrong?").selectOption("not_as_described");
    await buyerPage.getByLabel("Describe what happened").fill("The end cap is loose and there is a dent near the knob.");
    await buyerPage.locator("#dispute-evidence").setInputFiles({ name: "dent.png", mimeType: "image/png", buffer: PNG });
    await expect(buyerPage.getByText("1 file attached")).toBeVisible();
    await buyerPage.getByRole("button", { name: "Open case" }).click();
    await expect(buyerPage).toHaveURL(/\/disputes\/[0-9a-f-]{36}$/);
    disputeId = buyerPage.url().split("/").pop()!;
    await expect(buyerPage.getByTestId("dispute-status")).toHaveText("Open");
    const evidence = buyerPage.getByTestId("evidence").getByRole("link");
    await expect(evidence).toHaveCount(1);
    const href = await evidence.getAttribute("href");
    expect(href).toContain("/storage/v1/object/sign/dispute-evidence/");
    expect((await buyerPage.request.get(href!)).status()).toBe(200);
    // the unsigned URL is not public
    const { data: row } = await db.from("disputes").select("evidence_urls").eq("id", disputeId).single();
    expect((await buyerPage.request.get(`/storage/v1/object/public/dispute-evidence/${row!.evidence_urls[0]}`)).status()).not.toBe(200);

    // seller is notified and replies
    await sellerPage.goto("/account/notifications");
    await expect(sellerPage.getByTestId("notifications")).toContainText("A problem was reported");
    await sellerPage.goto(`/disputes/${disputeId}`);
    await expect(sellerPage.getByTestId("evidence").getByRole("link")).toHaveCount(1);
    await sellerPage.getByLabel("Add a message").fill("It shipped in perfect condition; I have photos.");
    await sellerPage.getByRole("button", { name: "Send", exact: true }).click();
    await expect(sellerPage.getByTestId("dispute-thread")).toContainText("I have photos");

    // a stranger cannot see the case
    const ctx = await buyerCtx.browser()!.newContext();
    const p = await ctx.newPage();
    await signIn(p, buyer2);
    expect((await p.goto(`/disputes/${disputeId}`))?.status()).toBe(404);
    await ctx.close();

    // admin: two-step sign-in, then resolve
    const actx = await buyerCtx.browser()!.newContext();
    const ap = await actx.newPage();
    await signIn(ap, admin, "/admin/disputes");
    await expect(ap).toHaveURL(/\/account\/security\?required=admin/);
    await ap.getByRole("button", { name: "Set up an authenticator app" }).click();
    const secret = (await ap.getByTestId("mfa-secret").textContent())!.trim();
    while (Date.now() % 30_000 > 27_000) await new Promise((r) => setTimeout(r, 500));
    await ap.getByLabel("6-digit code").fill(totp(secret));
    await ap.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(ap).toHaveURL(/\/admin$/);
    await ap.goto("/admin/disputes");
    await expect(ap.getByRole("heading", { name: "Disputes" })).toBeVisible();
    await ap.getByRole("link", { name: "Open case" }).first().click();
    await expect(ap.getByText("The end cap is loose")).toBeVisible();
    await expect(ap.getByTestId("evidence").getByRole("link")).toHaveCount(1);
    await expect(ap.getByRole("link", { name: "Refunds" }).first()).toBeVisible();
    await ap.getByLabel("Message to both members").fill("We are looking at the photos.");
    await ap.getByRole("button", { name: "Send message" }).click();
    await expect(ap.getByText("Message sent to both members")).toBeVisible();
    // closing needs a resolution
    await ap.getByLabel("Status").selectOption("resolved_buyer");
    await ap.getByRole("button", { name: "Save case" }).click();
    await expect(ap.getByText("Write a resolution before closing")).toBeVisible();
    await ap.getByLabel("Status").selectOption("resolved_buyer");
    await ap.getByLabel(/Internal notes/).fill("Photos show a dent.");
    await ap.getByLabel(/Resolution/).fill("Decided for the buyer. Support will refund the order separately.");
    await ap.getByRole("button", { name: "Save case" }).click();
    await expect(ap.getByText(/Case updated to/)).toBeVisible();
    await actx.close();

    await buyerPage.goto(`/disputes/${disputeId}`);
    await expect(buyerPage.getByTestId("dispute-status")).toHaveText("Resolved for the buyer");
    await expect(buyerPage.getByTestId("resolution")).toContainText("Decided for the buyer");
    await expect(buyerPage.getByText("We are looking at the photos.")).toBeVisible();
    await expect(buyerPage.getByText("This case is closed")).toBeVisible();
    const { data: audit } = await db.from("audit_logs").select("action, actor_user_id").eq("entity_id", disputeId);
    expect(audit?.map((a) => a.action)).toEqual(expect.arrayContaining(["dispute.message", "dispute.resolved_buyer"]));
    expect(audit?.every((a) => a.actor_user_id === admin.id)).toBe(true);
    // resolving never moved money
    const { data: order } = await db.from("orders").select("refunded_amount_cents").eq("id", orderId).single();
    expect(order?.refunded_amount_cents).toBe(0);
  });

  test("messages and offers pages fit a phone screen", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await signIn(p, seller);
    for (const path of ["/messages", `${convoUrl.replace(/^https?:\/\/[^/]+/, "")}`, "/account/offers", "/account/notifications"]) {
      await p.goto(path);
      await expect(p.locator("main h1, h1").first()).toBeVisible();
      await noHorizontalScroll(p);
    }
    await ctx.close();
  });
});
