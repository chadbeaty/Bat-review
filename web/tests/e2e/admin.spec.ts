// Admin area, two-step sign-in, content pages and newsletter links. Needs the local Supabase stack
// (with TOTP MFA enabled) and a production build. Everything created here is deleted afterwards.
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, serviceClient, signIn, type TestUser } from "./helpers";

// --- RFC 6238 TOTP (SHA-1, 30-second steps, 6 digits), so the test can act as an authenticator app ---
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of input.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const currentStep = () => Math.floor(Date.now() / 30_000);

/** A code from a time step that hasn't been used yet (a code can't be used twice). */
async function freshCode(secret: string, usedSteps: Set<number>): Promise<string> {
  while (usedSteps.has(currentStep()) || Date.now() % 30_000 > 27_000) await new Promise((r) => setTimeout(r, 500));
  const step = currentStep();
  usedSteps.add(step);
  return totp(secret, step);
}

test.describe("admin area", () => {
  test.skip(!hasSupabase(), "Needs the local Supabase stack");
  test.describe.configure({ mode: "serial" });

  const db = serviceClient();
  const created: TestUser[] = [];
  const usedSteps = new Set<number>();
  let admin: TestUser;
  let secret = "";
  let context: BrowserContext;
  let page: Page;
  let feeName = "";

  const user = async (prefix: string) => {
    const u = await createConfirmedUser(prefix);
    created.push(u);
    return u;
  };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    admin = await user("admin");
    await db.from("user_roles").insert({ user_id: admin.id, role: "admin" });
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context?.close();
    if (feeName) await db.from("fee_configuration").delete().eq("fee_name", feeName);
    for (const u of created) await db.auth.admin.deleteUser(u.id);
  });

  test("members who aren't staff get a 404 at /admin", async ({ page: memberPage }) => {
    const member = await user("member");
    await signIn(memberPage, member);
    const res = await memberPage.goto("/admin");
    expect(res?.status()).toBe(404);
    await expect(memberPage.getByRole("heading", { name: "That page isn't here" })).toBeVisible();
    expect((await memberPage.request.get("/admin/exports/users")).status()).toBe(404);
  });

  test("an admin without two-step sign-in is sent to set it up, then reaches the dashboard", async () => {
    await signIn(page, admin, "/admin");
    await expect(page).toHaveURL(/\/account\/security\?required=admin/);
    await expect(page.getByText("The admin area needs two-step sign-in")).toBeVisible();
    await page.getByRole("button", { name: "Set up an authenticator app" }).click();
    secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
    expect(secret).toMatch(/^[A-Z2-7]+=*$/);
    await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
    await page.getByLabel("6-digit code").fill("000000");
    await page.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("didn't match");
    await page.getByLabel("6-digit code").fill(await freshCode(secret, usedSteps));
    await page.getByRole("button", { name: "Confirm and turn on" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(page.getByText("Registered members")).toBeVisible();
  });

  test("a new session must enter a code before opening the admin area", async ({ browser }) => {
    // A fresh authenticator code can take up to one 30-second step to become available.
    test.setTimeout(90_000);
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await signIn(p, admin, "/admin/fees");
    await expect(p).toHaveURL(/\/admin\/mfa/);
    await p.getByLabel("6-digit code").fill(await freshCode(secret, usedSteps));
    await p.getByRole("button", { name: "Verify and continue" }).click();
    await expect(p).toHaveURL(/\/admin\/fees$/);
    await expect(p.getByRole("heading", { name: "Fees" })).toBeVisible();
    await ctx.close();
  });

  test("suspending a member is recorded in the audit log", async () => {
    const member = await user("suspendme");
    await page.goto(`/admin/users/${member.id}`);
    await page.getByLabel("Reason (recorded in the audit log)").fill("Spam listings");
    await page.getByRole("button", { name: "Suspend member" }).click();
    await expect(page.getByRole("status")).toContainText("Member suspended");
    const { data } = await db.from("profiles").select("account_status").eq("id", member.id).single();
    expect(data?.account_status).toBe("suspended");

    await page.goto(`/admin/audit?actor=${admin.username}&action=user.suspended`);
    const row = page.getByRole("row", { name: new RegExp(member.id) });
    await expect(row).toContainText("user.suspended");
    await expect(row).toContainText(`@${admin.username}`);
  });

  test("a new fee version appears in the fee history", async () => {
    feeName = `e2e_fee_${randomUUID().slice(0, 8)}`;
    await page.goto("/admin/fees");
    await expect(page.getByText("Worked example: a $200 sale")).toBeVisible();
    await page.getByLabel("Fee", { exact: true }).fill(feeName);
    await page.getByLabel("Type").selectOption("fixed_cents");
    await page.getByLabel("Value (percent, or dollars for fixed)").fill("1.25");
    await page.getByLabel("Description").fill("Created by an automated test");
    await page.getByRole("button", { name: "Create version" }).click();
    await expect(page.getByRole("status")).toContainText("is now in force");
    const row = page.getByRole("row", { name: new RegExp(feeName) });
    await expect(row).toContainText("$1.25");
    await expect(row).toContainText("In force");
  });

  test("settings are validated before they are saved", async () => {
    const { data } = await db.from("site_settings").select("value").eq("key", "offer_expiry_hours").single();
    const current = String(data?.value ?? 48);
    await page.goto("/admin/settings");
    const form = page.getByRole("form", { name: "Offers expire after" });
    await form.getByRole("textbox").fill("abc");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("main [role=alert]")).toContainText("Enter a whole number from 1 to 720");
    await page.getByRole("form", { name: "Offers expire after" }).getByRole("textbox").fill(current);
    await page.getByRole("form", { name: "Offers expire after" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("Offers expire after: saved.");
  });

  test("removing a listing needs a reason and notifies the seller", async () => {
    const seller = await user("seller");
    const title = `E2E removal test ${randomUUID().slice(0, 6)} bat`;
    const listingId = await createLiveListing(seller, { title });
    await page.goto(`/admin/listings?id=${listingId}`);
    await page.getByRole("link", { name: "Remove…" }).click();
    await expect(page.getByText(`Remove “${title}”?`)).toBeVisible();
    await page.getByLabel("Reason the seller will see").fill("Photos don't show the actual bat");
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect(page.getByRole("status")).toContainText("Listing removed");

    const { data: listing } = await db.from("equipment_listings").select("listing_status").eq("id", listingId).single();
    expect(listing?.listing_status).toBe("removed");
    const { data: notes } = await db.from("notifications").select("notification_type, message").eq("user_id", seller.id);
    expect(notes).toHaveLength(1);
    expect(notes![0].notification_type).toBe("listing_removed");
    expect(notes![0].message).toContain("Photos don't show the actual bat");
  });

  test("CSV exports download with the right header", async () => {
    await page.goto("/admin/exports");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download fees.csv" }).click()]);
    expect(download.suggestedFilename()).toMatch(/^fees-\d{4}-\d{2}-\d{2}\.csv$/);
    const res = await page.request.get("/admin/exports/users");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    const text = (await res.text()).replace(/^﻿/, "");
    expect(text.split("\r\n")[0]).toBe("Member id,Username,Display name,Email,Status,Seller verified,Joined");
    expect(text).toContain(admin.username);
  });

  test("admin tables don't widen the page on a phone", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ["/admin", "/admin/users", "/admin/fees", "/admin/audit", "/admin/listings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("content pages", () => {
  const legal = ["/terms", "/privacy", "/shipping-policy", "/returns-policy", "/buyer-protection"];
  const other = ["/how-it-works", "/seller-guide", "/about", "/contact", "/faq"];

  test("legal drafts carry the attorney-review notice", async ({ page }) => {
    for (const path of legal) {
      await page.goto(path);
      await expect(page.getByRole("note"), path).toContainText("Draft for review by a qualified attorney before launch. Not legal advice.");
      await expect(page.getByText("Coming in")).toHaveCount(0);
    }
  });

  test("content pages are real pages with their own titles, and fit a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [...other, ...legal]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByText("Coming in")).toHaveCount(0);
      expect(await page.title()).not.toBe("");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("fee figures come from the database, never escrow language", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText(/commission of 7% of the item price/)).toBeVisible();
    await expect(page.getByText("We don't hold payments in escrow.")).toBeVisible();
  });

  test("the contact page shows the support email to visitors", async ({ page }) => {
    await page.goto("/contact");
    await expect(page.getByRole("link", { name: "support@gamerbat.com" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).last()).toBeVisible();
  });

  test("the homepage has Organization and WebSite structured data with a search action", async ({ page }) => {
    await page.goto("/");
    const json = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(json!);
    expect(data.map((d: { "@type": string }) => d["@type"])).toEqual(["Organization", "WebSite"]);
    expect(data[1].potentialAction.target.urlTemplate).toContain("/shop?q={search_term_string}");
  });
});

test.describe("members and email links", () => {
  test.skip(!hasSupabase(), "Needs the local Supabase stack");

  test("a signed-in member can send a support message", async ({ page }) => {
    const db = serviceClient();
    const member = await createConfirmedUser("contact");
    try {
      await signIn(page, member, "/contact");
      await page.getByLabel("Topic").selectOption("account");
      await page.getByLabel("Subject").fill("Question about my account");
      await page.getByLabel("Message").fill("How do I change my username?");
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.getByRole("status")).toContainText("your message was sent");
      const { data } = await db.from("support_messages").select("subject").eq("user_id", member.id);
      expect(data).toEqual([{ subject: "Question about my account" }]);
    } finally {
      await db.auth.admin.deleteUser(member.id);
    }
  });

  test("newsletter confirm and unsubscribe links update the subscriber", async ({ page }) => {
    const db = serviceClient();
    const email = `news-${randomUUID().slice(0, 8)}@example.com`;
    const { data: sub } = await db.from("newsletter_subscribers").insert({ email, source: "e2e" }).select("id, confirm_token").single();
    try {
      await page.goto(`/newsletter/confirm?token=${sub!.confirm_token}`);
      await expect(page.getByRole("heading", { name: "You're subscribed" })).toBeVisible();
      await page.goto(`/newsletter/unsubscribe?token=${sub!.confirm_token}`);
      await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
      const { data } = await db.from("newsletter_subscribers").select("status").eq("id", sub!.id).single();
      expect(data?.status).toBe("unsubscribed");
      await page.goto("/newsletter/unsubscribe?token=not-a-token");
      await expect(page.getByRole("heading", { name: "That link doesn't work" })).toBeVisible();
    } finally {
      await db.from("newsletter_subscribers").delete().eq("id", sub!.id);
    }
  });
});
