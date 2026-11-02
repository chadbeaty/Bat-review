// Selling: the listing flow, drafts, photo upload, publish errors, the seller dashboard, profile settings and
// catalog requests. Needs the local Supabase stack (auth, storage, database) and a production build.
import { crc32, deflateSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, productBySlug, serviceClient, signIn, type TestUser } from "./helpers";

test.skip(!hasSupabase(), "needs the local Supabase stack");

// Members created here are deleted afterwards (with their listings, photos and requests), so the shared
// database doesn't fill up with live test listings that other pages would show.
const created: TestUser[] = [];
async function newMember(prefix: string) {
  const user = await createConfirmedUser(prefix);
  created.push(user);
  return user;
}

test.afterAll(async () => {
  const db = serviceClient();
  for (const user of created.splice(0)) {
    const { data: photos } = await db.from("listing_images").select("storage_path, equipment_listings!inner(seller_id)").eq("equipment_listings.seller_id", user.id);
    const paths = (photos ?? []).map((p) => p.storage_path).filter((p): p is string => Boolean(p));
    if (paths.length) await db.storage.from("listing-images").remove(paths);
    const { data: avatars } = await db.storage.from("avatars").list(user.id);
    if (avatars?.length) await db.storage.from("avatars").remove(avatars.map((a) => `${user.id}/${a.name}`));
    await db.auth.admin.deleteUser(user.id);
  }
});

/** A real PNG (a striped test card) built in memory, so uploads go through decoding and resizing. */
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
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const on = Math.floor(x / 8) % 2 === 0;
      row.set(on ? [30, 30, 30] : [230, 220, 40], 1 + x * 3);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const continueButton = (page: Page) => page.getByRole("button", { name: /^(Continue|Save and continue)$/ });

/** Steps 1–3 for a 2026 Miken Freak Black Maxload (USSSA), which creates the draft. */
async function startBatDraft(page: Page) {
  await page.goto("/sell/new");
  await page.getByLabel(/^Slow-pitch bats/).check();
  await continueButton(page).click();
  await page.getByLabel("Miken", { exact: true }).check();
  await continueButton(page).click();
  await page.getByLabel("Search models").fill("freak black maxload");
  await page.getByRole("radio", { name: /2026 Miken Freak Black Maxload\s*USSSA/ }).first().check();
  await continueButton(page).click();
  await expect(page.getByRole("heading", { name: "Item details" })).toBeVisible();
  await expect(page).toHaveURL(/\/sell\/new\?listing=[0-9a-f-]{36}&step=details/);
  return new URL(page.url()).searchParams.get("listing")!;
}

async function onlyListing(user: TestUser) {
  const { data } = await serviceClient()
    .from("equipment_listings")
    .select("id, title, listing_status, asking_price_cents, attributes, product_id, location_city, location_state, has_rattle, shipping_weight_oz, package_length_inches")
    .eq("seller_id", user.id);
  expect(data).toHaveLength(1);
  return data![0];
}

test.describe("listing flow", () => {
  test("lists a bat from catalog model to live listing, with a real photo upload", async ({ page }) => {
    const seller = await newMember("seller");
    await serviceClient().from("profiles").update({ city: "Nashville", state: "TN" }).eq("id", seller.id);
    await signIn(page, seller, "/sell/new");
    const listingId = await startBatDraft(page);

    // Step 4: catalog specs are prefilled; the seller confirms and adds weight and condition.
    await expect(page.getByLabel("USSSA")).toBeChecked();
    await expect(page.getByLabel("Model year")).toHaveValue("2026");
    await page.getByLabel("Weight (oz)").selectOption("26");
    await expect(page.getByLabel("Title")).toHaveValue("2026 Miken Freak Black Maxload USSSA 26 oz");
    await page.getByLabel("Cosmetic condition").selectOption("8");
    await continueButton(page).click();

    // Step 5: photo upload straight to Storage from the browser.
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
    await page.locator("#photo-input").setInputFiles({ name: "full-bat.png", mimeType: "image/png", buffer: testPng() });
    const photos = page.getByRole("list", { name: "Your photos" }).locator("li");
    await expect(photos).toHaveCount(1);
    await expect(photos.first().getByLabel(/Photo 1 \(cover\)/)).toHaveValue("full");
    await page.locator("#photo-input").setInputFiles({ name: "barrel.png", mimeType: "image/png", buffer: testPng(64, 96) });
    await expect(photos).toHaveCount(2);
    await expect(photos.nth(1).getByRole("combobox")).toHaveValue("barrel");
    // Reorder: the barrel shot becomes the cover.
    await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
    await expect(photos.first().getByRole("combobox")).toHaveValue("barrel");
    await continueButton(page).click();

    // Step 6: live commission preview from fee_configuration.
    const { data: fee } = await serviceClient().rpc("current_fee", { name: "seller_commission" }).single<{ fee_value: number }>();
    const commissionCents = Math.round((20000 * Number(fee!.fee_value)) / 100);
    const commission = commissionCents % 100 === 0 ? String(commissionCents / 100) : (commissionCents / 100).toFixed(2);
    await page.getByLabel("Price (USD)").fill("200");
    await expect(page.getByText("You receive before payment processing")).toBeVisible();
    await expect(page.getByText(`−$${commission}`, { exact: true })).toBeVisible();
    await expect(page.getByText("No verified sales for this model yet.")).toBeVisible();
    await continueButton(page).click();

    // Step 7: standard bat box preset and ship-from ZIP.
    await page.getByRole("button", { name: "Use standard bat box" }).click();
    await expect(page.getByLabel("Length (in)")).toHaveValue("36");
    await page.getByLabel("Ship-from ZIP code").fill("37201");
    await continueButton(page).click();

    // Step 8: disclosures.
    await expect(page.getByRole("heading", { name: "Condition and damage disclosure" })).toBeVisible();
    for (const group of await page.getByRole("group").filter({ has: page.getByRole("radio", { name: "Yes" }) }).all()) {
      await group.getByRole("radio", { name: "No" }).check();
    }
    await page.getByLabel("No known structural damage").check();
    await page.getByLabel("I own this item and have the right to sell it.").check();
    await page.getByLabel(/This item is authentic/).check();
    await continueButton(page).click();

    // Step 9: preview shows what buyers see.
    const preview = page.getByRole("article", { name: "Listing preview" });
    await expect(preview.getByRole("heading", { name: "2026 Miken Freak Black Maxload USSSA 26 oz" })).toBeVisible();
    await expect(preview.getByText("$200", { exact: true })).toBeVisible();
    await expect(preview.getByText("8/10 · Normal light wear")).toBeVisible();
    await expect(preview.getByText("Ships from Nashville, TN")).toBeVisible();
    await page.getByRole("button", { name: "Looks good, continue" }).click();

    // Step 10: publish.
    await expect(page.getByText("Everything's in place.")).toBeVisible();
    await page.getByRole("button", { name: "Publish listing" }).click();
    await expect(page.getByRole("heading", { name: "Your listing is live" })).toBeVisible();
    await expect(page.getByRole("link", { name: "View listing" })).toHaveAttribute("href", `/listings/${listingId}`);

    const listing = await onlyListing(seller);
    expect(listing).toMatchObject({
      id: listingId,
      listing_status: "active",
      asking_price_cents: 20000,
      title: "2026 Miken Freak Black Maxload USSSA 26 oz",
      location_city: "Nashville",
      location_state: "TN",
    });
    expect(listing.attributes).toMatchObject({ weight_oz: 26, certification: ["USSSA"], model_year: 2026 });
    const product = await productBySlug("miken-freak-black-maxload-usssa-2026");
    expect(listing.product_id).toBe(product.id);
    const { data: images } = await serviceClient().from("listing_images").select("storage_path, image_type, display_order").eq("listing_id", listingId).order("display_order");
    expect(images!.map((i) => i.image_type)).toEqual(["barrel", "full"]);
    for (const img of images!) expect(img.storage_path).toMatch(new RegExp(`^${seller.id}/${listingId}/[0-9a-f]{32}\\.jpg$`));
    const { data: zip } = await serviceClient().from("equipment_listings").select("shipping_origin_postal_code").eq("id", listingId).single();
    expect(zip!.shipping_origin_postal_code).toBe("37201");

    // The photo is publicly readable from Storage.
    const { data: file } = await serviceClient().storage.from("listing-images").download(images![0].storage_path!);
    expect(file!.type).toBe("image/jpeg");
  });

  test("rejects a file that isn't a photo before uploading", async ({ page }) => {
    const seller = await newMember("seller");
    await signIn(page, seller, "/sell/new");
    const id = await startBatDraft(page);
    await page.goto(`/sell/new?listing=${id}&step=photos`);
    await page.locator("#photo-input").setInputFiles({ name: "notes.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(page.getByRole("alert").filter({ hasText: "notes.gif" })).toContainText("notes.gif: use a JPG, PNG, WEBP, HEIC photo");
    await expect(page.getByRole("list", { name: "Your photos" })).toHaveCount(0);
  });

  test("saves a draft and resumes it from the dashboard", async ({ page }) => {
    const seller = await newMember("seller");
    await signIn(page, seller, "/sell/new");
    const id = await startBatDraft(page);
    await page.getByLabel("Weight (oz)").selectOption("27");
    await page.getByLabel("Cosmetic condition").selectOption("9");
    await page.getByLabel("Title").fill("Freak Black Maxload, barely used");
    await continueButton(page).click();
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();

    await page.goto("/seller");
    await expect(page.getByRole("link", { name: /1\s*Drafts/ })).toBeVisible();
    await page.goto("/seller/listings");
    const row = page.locator(`[data-listing-id="${id}"]`);
    await expect(row).toContainText("Freak Black Maxload, barely used");
    await expect(row).toContainText("No price yet");
    await row.getByRole("link", { name: "Resume draft" }).click();
    await expect(page).toHaveURL(new RegExp(`/sell/new\\?listing=${id}`));
    await expect(page.getByLabel("Title")).toHaveValue("Freak Black Maxload, barely used");
    await expect(page.getByLabel("Weight (oz)")).toHaveValue("27");
    await expect(page.getByLabel("Cosmetic condition")).toHaveValue("9");

    // Delete the draft.
    await page.goto("/seller/listings");
    page.once("dialog", (d) => d.accept());
    await page.locator(`[data-listing-id="${id}"]`).getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(`[data-listing-id="${id}"]`)).toHaveCount(0);
    const { data } = await serviceClient().from("equipment_listings").select("id").eq("id", id);
    expect(data).toHaveLength(0);
  });

  test("explains a publish error when a damage question is unanswered", async ({ page }) => {
    const seller = await newMember("seller");
    const id = await createLiveListing(seller, { title: "Publish error test bat 26 oz" });
    // Turn it back into a draft with one damage question unanswered.
    await serviceClient().from("equipment_listings").update({ listing_status: "draft", has_rattle: null }).eq("id", id);
    await signIn(page, seller, `/sell/new?listing=${id}&step=publish`);

    await expect(page.getByRole("button", { name: "Damage questions and declarations" })).toBeVisible();
    await page.getByRole("button", { name: "Publish listing" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Answer" })).toContainText("Answer every damage question with yes or no.");
    await page.getByRole("button", { name: "Go to Disclosures" }).click();
    await expect(page.getByRole("heading", { name: "Condition and damage disclosure" })).toBeVisible();

    // Saving without the answer is caught on the form too.
    await page.getByLabel("I own this item and have the right to sell it.").check();
    await continueButton(page).click();
    await expect(page.getByRole("group", { name: "Does it rattle when shaken?" })).toContainText("Answer yes or no");
    await page.getByRole("group", { name: "Does it rattle when shaken?" }).getByRole("radio", { name: "No" }).check();
    await continueButton(page).click();
    await page.getByRole("button", { name: "Looks good, continue" }).click();
    await page.getByRole("button", { name: "Publish listing" }).click();
    await expect(page.getByRole("heading", { name: "Your listing is live" })).toBeVisible();
    expect((await onlyListing(seller)).listing_status).toBe("active");
  });

  test("files a catalog request when the model isn't listed", async ({ page }) => {
    const seller = await newMember("seller");
    await signIn(page, seller, "/sell/new");
    await page.getByLabel(/^Slow-pitch bats/).check();
    await continueButton(page).click();
    await page.getByLabel("Miken", { exact: true }).check();
    await continueButton(page).click();
    await page.getByRole("button", { name: "My model isn't listed" }).click();
    const model = `Prototype ${Date.now().toString(36)}`;
    await page.getByLabel("Model name").fill(model);
    await page.getByLabel(/Model year/).fill("2027");
    await continueButton(page).click();
    await expect(page.getByRole("heading", { name: "Item details" })).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue(`2027 Miken ${model}`);
    await expect(page.getByLabel("Model year")).toHaveValue("2027");

    const listing = await onlyListing(seller);
    expect(listing.product_id).toBeNull();
    const { data: requests } = await serviceClient().from("product_submissions").select("model_name, model_year, status, details").eq("submitted_by", seller.id);
    expect(requests).toEqual([{ model_name: model, model_year: 2027, status: "pending", details: { listing_id: listing.id } }]);

    await page.goto("/account/catalog-requests");
    await expect(page.getByText(`2027 Miken ${model}`)).toBeVisible();
    await expect(page.getByText("Waiting for review.")).toBeVisible();
  });
});

test.describe("managing listings", () => {
  test("edits the price of a live listing", async ({ page }) => {
    const seller = await newMember("seller");
    const id = await createLiveListing(seller, { title: "Price edit test bat 26 oz", priceCents: 22000 });
    await signIn(page, seller, "/seller/listings?tab=active");
    await page.locator(`[data-listing-id="${id}"]`).getByRole("link", { name: "Edit" }).click();
    await expect(page.getByText("This listing is live. Changes are saved straight to it.")).toBeVisible();
    await page.getByRole("button", { name: /Price/ }).click();
    await expect(page.getByLabel("Price (USD)")).toHaveValue("220");
    await page.getByLabel("Price (USD)").fill("185.50");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await expect.poll(async () => (await onlyListing(seller)).asking_price_cents).toBe(18550);
    expect((await onlyListing(seller)).listing_status).toBe("active");
    // Steps 1–3 are locked once a listing is live.
    await expect(page.getByRole("button", { name: /Category/ })).toBeDisabled();
  });

  test("removes a live listing and shows it under removed", async ({ page }) => {
    const seller = await newMember("seller");
    const id = await createLiveListing(seller, { title: "Remove test bat 26 oz" });
    await signIn(page, seller, "/seller/listings?tab=active");
    page.once("dialog", (d) => d.accept());
    await page.locator(`[data-listing-id="${id}"]`).getByRole("button", { name: "Remove" }).click();
    await expect(page.locator(`[data-listing-id="${id}"]`)).toHaveCount(0);
    expect((await onlyListing(seller)).listing_status).toBe("removed");
    await page.getByRole("link", { name: /Removed and expired/ }).click();
    await expect(page.locator(`[data-listing-id="${id}"]`)).toContainText("Removed");
  });

  test("shows a sold listing read-only", async ({ page }) => {
    const seller = await newMember("seller");
    const id = await createLiveListing(seller, { title: "Sold test bat 26 oz" });
    await serviceClient().from("equipment_listings").update({ listing_status: "sold" }).eq("id", id);
    await signIn(page, seller, `/seller/listings/${id}/edit`);
    await expect(page.getByText("This listing is sold, so it can't be changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  });
});

test.describe("profile settings", () => {
  test("edits the profile, rejects a taken username and uploads an avatar", async ({ page }) => {
    const taken = await newMember("taken");
    const member = await newMember("member");
    await signIn(page, member, "/account");
    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();

    await page.getByLabel("Username").fill(taken.username.toUpperCase());
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("That username is taken. Try another.")).toBeVisible();

    const fresh = `pro_${Date.now().toString(36)}`;
    await page.getByLabel("Username").fill(fresh);
    await page.getByLabel(/Display name/).fill("Pat Slugger");
    await page.getByLabel(/^City/).fill("Knoxville");
    await page.getByLabel(/^State/).fill("tn");
    await page.getByLabel(/ZIP code/).fill("37902");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
    await expect(page.getByLabel(/^State/)).toHaveValue("tn");

    await page.getByLabel(/^State/).fill("T1");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Use the 2-letter state code")).toBeVisible();

    await page.locator("#avatar-input").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: testPng(80, 80) });
    await expect(page.getByText("Photo updated.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Your profile photo" })).toBeVisible();

    const { data } = await serviceClient().from("profiles").select("username, display_name, city, state, postal_code, profile_photo_url").eq("id", member.id).single();
    expect(data).toMatchObject({ username: fresh, display_name: "Pat Slugger", city: "Knoxville", state: "TN", postal_code: "37902" });
    expect(data!.profile_photo_url).toContain(`/avatars/${member.id}/`);
  });
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  const noOverflow = async (page: Page) => {
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  };

  test("the sell page fits a phone", async ({ page }) => {
    await page.goto("/sell");
    await expect(page.getByRole("heading", { level: 1, name: "Sell your gear" })).toBeVisible();
    await expect(page.getByText("Example: a bat sells for $200")).toBeVisible();
    await noOverflow(page);
    await expect(page.getByRole("link", { name: "Start a listing" }).first()).toHaveAttribute("href", "/sign-in?next=/sell/new");
  });

  test("every step of the listing flow fits a phone", async ({ page }) => {
    const seller = await newMember("seller");
    await signIn(page, seller, "/sell/new");
    await noOverflow(page);
    const id = await startBatDraft(page);
    for (const step of ["details", "photos", "price", "shipping", "disclosures", "preview", "publish"]) {
      await page.goto(`/sell/new?listing=${id}&step=${step}`);
      await expect(page.getByRole("button", { name: new RegExp(step, "i") }).first()).toHaveAttribute("aria-current", "step");
      await noOverflow(page);
    }
  });
});
