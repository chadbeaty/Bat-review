// "Paste your post": a seller pastes a Facebook-group-style post on the first step of the sell flow, the draft is
// pre-filled and highlighted, they edit it, and the rest of the flow (photos, price, shipping, disclosures, publish)
// works exactly as before. Needs the local Supabase stack, like the other selling tests.
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, hasSupabase, serviceClient, signIn, type TestUser } from "./helpers";

test.skip(!hasSupabase(), "needs the local Supabase stack");

const created: TestUser[] = [];
async function newSeller() {
  const user = await createConfirmedUser("importer");
  created.push(user);
  await serviceClient().from("profiles").update({ city: "Nashville", state: "TN" }).eq("id", user.id);
  return user;
}

test.afterAll(async () => {
  const db = serviceClient();
  for (const user of created.splice(0)) {
    const { data: photos } = await db.from("listing_images").select("storage_path, equipment_listings!inner(seller_id)").eq("equipment_listings.seller_id", user.id);
    const paths = (photos ?? []).map((p) => p.storage_path).filter((p): p is string => Boolean(p));
    if (paths.length) await db.storage.from("listing-images").remove(paths);
    await db.auth.admin.deleteUser(user.id);
  }
});

function testPng(width = 96, height = 64): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) row.set(Math.floor(x / 8) % 2 === 0 ? [30, 30, 30] : [230, 220, 40], 1 + x * 3);
    rows.push(row);
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

const continueButton = (page: Page) => page.getByRole("button", { name: /^(Continue|Save and continue)$/ });

const POST = `🔥🔥 FOR SALE 🔥🔥
2026 Miken Freak Black Maxload USSSA 34/27
$150 obo. Broken in, hit about 400 swings, no cracks no rattle.
Can ship. PM me or call (555) 123-4567 💰`;

async function openPaste(page: Page, text: string) {
  await page.goto("/sell/new");
  await page.getByRole("button", { name: /Already posted it somewhere/ }).click();
  await page.getByLabel("Your post").fill(text);
  await page.getByRole("button", { name: "Read my post" }).click();
}

test("pastes a post, pre-fills and highlights the draft, lets the seller edit, and publishes as usual", async ({ page }) => {
  const seller = await newSeller();
  await signIn(page, seller, "/sell/new");

  // The normal first step is untouched: the paste box is collapsed and the category choice is right there.
  await expect(page.getByRole("button", { name: /Already posted it somewhere/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel(/^Slow-pitch bats/)).toBeVisible();

  await page.getByRole("button", { name: /Already posted it somewhere/ }).click();
  await page.getByLabel("Your post").fill(POST);
  await page.getByRole("button", { name: "Read my post" }).click();

  // What we found, with a count, highlights, and what was left for the seller.
  await expect(page.getByTestId("import-summary")).toHaveText("We filled 8 fields. Check the highlighted ones.");
  const fields = page.getByTestId("import-fields");
  await expect(fields).toContainText("2026 Miken Freak Black Maxload");
  await expect(fields).toContainText("27 oz");
  await expect(fields).toContainText("34 in");
  await expect(fields).toContainText("USSSA");
  await expect(fields).toContainText("$150");
  await expect(fields).toContainText("Yes (obo)");
  await expect(fields).toContainText("about 400");
  await expect(page.getByTestId("import-notes")).toContainText("Choose the condition score yourself");

  await page.getByTestId("import-apply").click();

  // Step 4 opens pre-filled. Nothing has been saved or published by the import itself.
  await expect(page.getByRole("heading", { name: "Item details" })).toBeVisible();
  await expect(page).toHaveURL(/\/sell\/new\?listing=[0-9a-f-]{36}&step=details/);
  const listingId = new URL(page.url()).searchParams.get("listing")!;
  await expect(page.getByTestId("import-banner")).toBeVisible();
  await expect(page.getByLabel("Weight (oz)")).toHaveValue("27");
  await expect(page.locator("#attr-length_inches")).toHaveValue("34");
  await expect(page.getByLabel(/About how many hits/)).toHaveValue("400");
  await expect(page.getByRole("checkbox", { name: "USSSA" })).toBeChecked();
  await expect(page.getByTestId("from-post-weight_oz")).toContainText("27");
  await expect(page.getByTestId("from-post-approx_hits")).toContainText("400");
  await expect(page.getByLabel("Title")).toHaveValue("2026 Miken Freak Black Maxload USSSA 27 oz");
  // The description is the post with the phone number, the ask to PM, and emoji removed.
  const description = await page.getByLabel(/^Description/).inputValue();
  expect(description).toContain("hit about 400 swings");
  expect(description.trim()).toMatch(/Can ship\.$/);
  expect(description).not.toMatch(/555|PM me|🔥|💰/);
  await expect(page.getByTestId("import-description-note")).toBeVisible();
  const draftBefore = await serviceClient().from("equipment_listings").select("listing_status, asking_price_cents, condition_score").eq("id", listingId).single();
  expect(draftBefore.data).toMatchObject({ listing_status: "draft", asking_price_cents: null, condition_score: null });

  // The seller edits: the weight was actually 26, and picks a condition (which the import never guesses).
  await page.getByLabel("Weight (oz)").selectOption("26");
  await expect(page.getByLabel("Title")).toHaveValue("2026 Miken Freak Black Maxload USSSA 26 oz");
  await page.getByLabel("Cosmetic condition").selectOption("8");
  await continueButton(page).click();

  // Photos work like any listing.
  await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
  await page.getByTestId("slot-input-full").setInputFiles({ name: "full-bat.png", mimeType: "image/png", buffer: testPng() });
  await expect(page.locator('[data-slot="full"]')).toHaveAttribute("data-filled", "true");
  await continueButton(page).click();

  // The price and offers come from the post, highlighted; the seller changes the price.
  await expect(page.getByLabel("Price (USD)")).toHaveValue("150");
  await expect(page.getByLabel("Accept offers from buyers")).toBeChecked();
  await expect(page.getByTestId("import-price-note")).toContainText("Your post said $150");
  await page.getByLabel("Price (USD)").fill("160");
  await continueButton(page).click();

  await page.getByRole("button", { name: "Use standard bat box" }).click();
  await page.getByLabel("Ship-from ZIP code").fill("37201");
  await continueButton(page).click();

  await expect(page.getByRole("heading", { name: "Condition and damage disclosure" })).toBeVisible();
  for (const group of await page.getByRole("group").filter({ has: page.getByRole("radio", { name: "Yes", exact: true }) }).all()) {
    await group.getByRole("radio", { name: "No", exact: true }).check();
  }
  await page.getByLabel("No known structural damage").check();
  await page.getByLabel("I own this item and have the right to sell it.").check();
  await page.getByLabel(/This item is authentic/).check();
  await continueButton(page).click();

  await page.getByRole("button", { name: "Looks good, continue" }).click();
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByRole("heading", { name: "Your listing is live" })).toBeVisible();

  const { data } = await serviceClient().from("equipment_listings").select("listing_status, asking_price_cents, accepts_offers, title, attributes, description").eq("id", listingId).single();
  expect(data).toMatchObject({ listing_status: "active", asking_price_cents: 16000, accepts_offers: true, title: "2026 Miken Freak Black Maxload USSSA 26 oz" });
  expect(data!.attributes).toMatchObject({ weight_oz: 26, length_inches: 34, approx_hits: 400, certification: ["USSSA"] });
  expect(data!.description).not.toMatch(/555|PM me/);
});

test("asks the seller to pick when the post fits more than one model, and never guesses", async ({ page }) => {
  const seller = await newSeller();
  await signIn(page, seller, "/sell/new");
  await openPaste(page, "Miken Freak USSSA 34/27 $140 obo");
  await expect(page.getByTestId("import-candidates")).toBeVisible();
  await expect(page.getByTestId("import-candidates").getByRole("radio").first()).not.toBeChecked();
  await expect(page.getByTestId("import-empty")).toContainText("Pick yours below");
  await expect(page.getByTestId("import-fields")).not.toContainText("Model");
  // Choosing "None of these" continues at the model step with the brand already selected.
  await page.getByLabel(/None of these/).check();
  await page.getByTestId("import-apply").click();
  await expect(page.getByRole("heading", { name: /Which Miken model/ })).toBeVisible();
  expect((await serviceClient().from("equipment_listings").select("id").eq("seller_id", seller.id)).data).toHaveLength(0);
});

test("a pasted link is explained, not opened", async ({ page }) => {
  const seller = await newSeller();
  await signIn(page, seller, "/sell/new");
  await openPaste(page, "https://www.facebook.com/groups/slowpitchbats/posts/10159876543210/");
  await expect(page.getByTestId("import-warning")).toContainText("can't open");
  await expect(page.getByTestId("import-warning")).toContainText("copy the words");
  await expect(page.getByTestId("import-apply")).toHaveCount(0);
});

test("a post about several bats fills nothing and says why", async ({ page }) => {
  const seller = await newSeller();
  await signIn(page, seller, "/sell/new");
  await openPaste(page, "Selling my Miken Freak Black Maxload and my Worth Bedlam XL. $140 and $120. Both 34/27.");
  await expect(page.getByTestId("import-warning")).toContainText("more than one bat");
  await expect(page.getByTestId("import-fields")).toHaveCount(0);
  await expect(page.getByTestId("import-apply")).toHaveCount(0);
  // The normal flow is still right there.
  await expect(page.getByLabel(/^Slow-pitch bats/)).toBeVisible();
});
