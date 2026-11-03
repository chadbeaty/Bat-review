// Browser tests for the shop, search, listing pages, favorites and seller profiles.
// Each test makes its own members and listings with unique invented words, because other people's data
// may be in the same database. Everything created here is deleted afterwards.
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, createLiveListing, hasSupabase, productBySlug, serviceClient, signIn, type TestUser } from "./helpers";

test.skip(!hasSupabase(), "Needs the local Supabase stack");

const created: TestUser[] = [];

async function member(prefix: string) {
  const user = await createConfirmedUser(prefix);
  created.push(user);
  return user;
}

/** A made-up word no real listing contains, so searches only find this test's listings. */
function uniqueWord(length = 10): string {
  const letters = "bcdfghjklmnprstvz";
  const vowels = "aeiou";
  let w = "";
  for (let i = 0; i < length; i++) w += i % 2 ? vowels[Math.floor(Math.random() * vowels.length)] : letters[Math.floor(Math.random() * letters.length)];
  return w;
}

function results(page: Page) {
  return page.getByTestId("results").getByRole("link");
}

async function noSideways(page: Page, path: string) {
  await page.goto(path);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, path).toBeLessThanOrEqual(0);
}

test.afterAll(async () => {
  const db = serviceClient();
  for (const u of created) await db.auth.admin.deleteUser(u.id);
});

test.describe("search", () => {
  test("finds a new listing by a partial word and by a misspelling", async ({ page }) => {
    const seller = await member("srch");
    const word = uniqueWord(10);
    await createLiveListing(seller, { title: `Freak ${word} 26 oz gamer` });

    await page.goto(`/shop?q=${word.slice(0, 6)}`);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText(word);

    // Drop a letter near the end: a typo the trigram match should still catch.
    const typo = word.slice(0, 7) + word.slice(8);
    await page.goto(`/shop?q=${typo}`);
    await expect(results(page)).toHaveCount(1);

    // The header search box submits to the shop.
    await page.goto("/");
    await page.getByRole("searchbox").first().fill(word);
    await page.getByRole("searchbox").first().press("Enter");
    await expect(page).toHaveURL(new RegExp(`/shop\\?q=${word}`));
    await expect(results(page)).toHaveCount(1);
  });

  test("shows a helpful empty state with did-you-mean", async ({ page }) => {
    await page.goto("/shop?q=tantrm+qqzzxx&weight=26");
    const empty = page.getByTestId("no-results");
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("link", { name: /Without 26 oz/ })).toBeVisible();
    await expect(empty.getByText("Did you mean")).toBeVisible();
    await expect(empty.getByRole("link", { name: /tantrum/ }).first()).toBeVisible();
    await expect(empty.getByRole("link", { name: "Sign in to save this search" })).toBeVisible();
  });

  test("filters by weight, stamp and price narrow results, and sorting by price works", async ({ page }) => {
    const seller = await member("fltr");
    const word = uniqueWord(9);
    await createLiveListing(seller, { title: `${word} light 26 oz`, priceCents: 15000, attributes: { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 } });
    await createLiveListing(seller, { title: `${word} middle 27 oz`, priceCents: 25000, attributes: { weight_oz: 27, certification: ["USA"], weighting_type: "balanced", model_year: 2026 } });
    await createLiveListing(seller, { title: `${word} heavy 28 oz`, priceCents: 35000, attributes: { weight_oz: 28, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 } });

    await page.goto(`/bats?q=${word}`);
    await expect(results(page)).toHaveCount(3);

    // Filter with the form, the way a visitor would.
    await page.getByRole("checkbox", { name: /^26 oz/ }).check();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/weight=26/);
    await expect(page).not.toHaveURL(/min=&/);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText("light");

    await page.goto(`/bats?q=${word}&stamp=ASA`);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText("middle");

    await page.goto(`/bats?q=${word}&min=200&max=300`);
    await expect(results(page)).toHaveCount(1);
    await expect(results(page).first()).toContainText("middle");

    await page.goto(`/bats?q=${word}&load=end-loaded`);
    await expect(results(page)).toHaveCount(2);

    // Removing a filter chip widens the results again.
    await page.goto(`/bats?q=${word}&weight=26`);
    await page.getByRole("link", { name: "Remove filter: 26 oz" }).click();
    await expect(results(page)).toHaveCount(3);

    await page.goto(`/bats?q=${word}`);
    await page.getByRole("link", { name: "Lowest price" }).click();
    await expect(page).toHaveURL(/sort=price_asc/);
    await expect(results(page).nth(0)).toContainText("$150");
    await expect(results(page).nth(2)).toContainText("$350");
    await page.getByRole("link", { name: "Highest price" }).click();
    await expect(results(page).nth(0)).toContainText("$350");

    // Browse-by-weight chips on /bats link to the weight filter.
    await page.goto("/bats");
    await expect(page.getByRole("navigation", { name: "Browse by weight" }).getByRole("link", { name: "26 oz" })).toHaveAttribute("href", "/bats?weight=26");
    await expect(page.getByRole("link", { name: "Bat price guide" }).first()).toBeVisible();
  });

  test("category pages scope results, and the canonical URL has no filters", async ({ page, request }) => {
    const seller = await member("ctgy");
    const word = uniqueWord(9);
    await createLiveListing(seller, { title: `${word} bat for sale` });
    await page.goto(`/shop/gloves?q=${word}`);
    await expect(page.getByTestId("no-results")).toBeVisible();
    await page.goto(`/shop?q=${word}`);
    await expect(results(page)).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/shop$/);
    expect((await request.get("/shop/not-a-category")).status()).toBe(404);
  });
});

test.describe("listing page", () => {
  test("shows price, condition, damage disclosures, specs, seller, and checkout closed", async ({ page }) => {
    const seller = await member("lstg");
    const id = await createLiveListing(seller, { title: "Disclosure test Freak 26 oz", priceCents: 19900 });
    await serviceClient()
      .from("equipment_listings")
      .update({ structural_disclosure: "damage_disclosed", has_rattle: true, damage_disclosure: "Faint rattle near the end cap.", cosmetic_wear: "Scuffs on the barrel." })
      .eq("id", id);

    await page.goto(`/listings/${id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Disclosure test Freak 26 oz");
    await expect(page.getByText("$199").first()).toBeVisible();
    await expect(page.getByText("Condition 8/10 Normal light wear").first()).toBeVisible();

    // Bat Passport renders for bat listings linked to a catalog product (if this listing is one).
    const passport = page.getByTestId("bat-passport");
    if (await passport.count()) {
      await expect(passport.getByRole("heading", { name: "Bat Passport" })).toBeVisible();
      await expect(passport).toContainText(/\d of 4/);
      await expect(passport.locator("[data-check]")).toHaveCount(4);
    }

    const disclosure = page.getByTestId("damage-disclosure");
    await expect(disclosure.getByRole("heading", { name: "Seller disclosed damage" })).toBeVisible();
    for (const q of ["Cracks", "Loose end cap", "Repairs", "Significant damage"]) {
      await expect(disclosure.locator("div", { has: page.getByText(q, { exact: true }) }).getByText("No")).toBeVisible();
    }
    await expect(disclosure.locator("div", { has: page.getByText("Rattle", { exact: true }) }).getByText("Yes")).toBeVisible();
    await expect(disclosure.getByText("Faint rattle near the end cap.")).toBeVisible();
    await expect(disclosure.getByText("Scuffs on the barrel.")).toBeVisible();

    await expect(page.getByTestId("listing-specs")).toContainText("26 oz");
    await expect(page.getByTestId("listing-specs")).toContainText("End-loaded");
    await expect(page.getByTestId("listing-specs")).toContainText("USSSA");
    await expect(page.getByText("Nashville, TN").first()).toBeVisible();
    await expect(page.getByText("37201")).toHaveCount(0);

    const actions = page.getByTestId("listing-actions");
    await expect(actions.getByRole("button", { name: /Buy now/ })).toBeDisabled();
    // Offers and messages work even while checkout is closed (signed-out visitors get sign-in links).
    await expect(actions.getByText("Make offer", { exact: true })).toBeVisible();
    await expect(actions.getByText("Message seller", { exact: true })).toBeVisible();
    await expect(actions.getByText("Checkout opens soon")).toBeVisible();

    const card = page.getByTestId("seller-card");
    await expect(card).toContainText(`@${seller.username}`);
    await expect(card).toContainText("Not a verified seller yet");
    await expect(card).toContainText("Identity not verified");
    await expect(card).toContainText("No reviews yet");

    const model = await productBySlug("miken-freak-black-maxload-usssa-2026");
    expect(model.id).toBeTruthy();
    await expect(page.getByRole("link", { name: /About the 2026 Miken Freak Black Maxload/ })).toHaveAttribute("href", "/bats/miken/freak-black-maxload-usssa/2026");

    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.offers.price).toBe("199.00");
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /placehold\.co/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/listings/${id}$`));
  });

  test("gallery photos change with the keyboard", async ({ page }) => {
    const seller = await member("glry");
    const id = await createLiveListing(seller, { title: "Gallery test Freak 26 oz" });
    await serviceClient().from("listing_images").insert({ listing_id: id, image_url: "https://placehold.co/800x600/png?text=Barrel", image_type: "barrel", display_order: 1 });
    await page.goto(`/listings/${id}`);
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await tabs.first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(tabs.nth(1)).toBeFocused();
    await expect(page.locator("figure img")).toHaveAttribute("src", /Barrel/);
  });

  test("sold listings show their status and can't be bought", async ({ page }) => {
    const seller = await member("sold");
    const id = await createLiveListing(seller, { title: "Sold test Freak 26 oz" });
    await serviceClient().from("equipment_listings").update({ listing_status: "sold" }).eq("id", id);
    await page.goto(`/listings/${id}`);
    await expect(page.getByTestId("listing-actions")).toContainText("This item has sold.");
    await expect(page.getByRole("button", { name: /Buy now/ })).toHaveCount(0);
    const jsonLd = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(jsonLd.offers).toBeUndefined();
  });

  test("a draft listing is 404 to visitors and other members, but its seller can preview it", async ({ page, request }) => {
    const seller = await member("drft");
    const product = await productBySlug("miken-freak-black-maxload-usssa-2026");
    const { data } = await serviceClient()
      .from("equipment_listings")
      .insert({ seller_id: seller.id, product_id: product.id, category_id: product.category_id, title: "Draft test listing", asking_price_cents: 10000 })
      .select("id")
      .single();
    const id = data!.id as string;
    expect((await request.get(`/listings/${id}`)).status()).toBe(404);
    expect((await request.get("/listings/not-a-uuid")).status()).toBe(404);

    await signIn(page, seller, `/listings/${id}`);
    await expect(page.getByText("Only you can see it.")).toBeVisible();
  });

  test("counts one view per visitor, not every refresh", async ({ page }) => {
    const seller = await member("view");
    const id = await createLiveListing(seller, { title: "View count test Freak" });
    const views = async () => ((await serviceClient().from("equipment_listings").select("views_count").eq("id", id).single()).data!.views_count as number);
    await page.goto(`/listings/${id}`);
    await expect.poll(views).toBe(1);
    for (let i = 0; i < 2; i++) {
      const counted = page.waitForResponse((r) => r.url().endsWith(`/api/listings/${id}/view`));
      await page.reload();
      expect(await (await counted).json()).toEqual({ counted: false });
    }
    expect(await views()).toBe(1);
  });

  test("signed-in members can report a listing", async ({ page }) => {
    const seller = await member("rpts");
    const reporter = await member("rptr");
    const id = await createLiveListing(seller, { title: "Report test Freak 26 oz" });
    await signIn(page, reporter, `/listings/${id}`);
    await page.getByText("Report this listing").click();
    await page.getByLabel("Reason").selectOption("misrepresented");
    await page.getByLabel(/Details/).fill("Photos look like a different bat.");
    await page.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByText("Our moderators will review this listing.")).toBeVisible();
    const { data } = await serviceClient().from("reports").select("reason, details").eq("entity_id", id);
    expect(data).toEqual([{ reason: "misrepresented", details: "Photos look like a different bat." }]);
  });
});

test.describe("favorites", () => {
  test("signed-out visitors are sent to sign in and back", async ({ page }) => {
    const seller = await member("favo");
    const id = await createLiveListing(seller, { title: "Favorite signed-out Freak" });
    await page.goto(`/listings/${id}`);
    await page.getByRole("link", { name: "Save" }).click();
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Flistings%2F${id}`));
  });

  test("a member saves and unsaves a listing", async ({ page }) => {
    const seller = await member("favs");
    const buyer = await member("favb");
    const id = await createLiveListing(seller, { title: "Favorite toggle Freak 27 oz" });
    await signIn(page, buyer, `/listings/${id}`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");

    await page.goto("/account/favorites");
    await expect(page.getByTestId("favorites")).toContainText("Favorite toggle Freak 27 oz");
    await page.getByRole("button", { name: "Saved" }).click();
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
  });

  test("a member saves a search", async ({ page }) => {
    const buyer = await member("svsr");
    await signIn(page, buyer, "/bats?q=zzqqxxvv&weight=26");
    await page.getByRole("button", { name: "Save this search" }).click();
    await expect(page.getByText("Search saved.")).toBeVisible();
    const { data } = await serviceClient().from("saved_searches").select("query").eq("user_id", buyer.id);
    expect(data).toEqual([{ query: { path: "/bats", params: "?q=zzqqxxvv&weight=26" } }]);
  });

  test("the favorites page needs sign-in", async ({ page }) => {
    await page.goto("/account/favorites");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Ffavorites/);
  });
});

test.describe("seller profile", () => {
  test("shows the seller, their stats and their active listing", async ({ page, request }) => {
    const seller = await member("prof");
    await createLiveListing(seller, { title: "Profile test Freak 26 oz" });
    await page.goto(`/sellers/${seller.username}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(`@${seller.username}`).first()).toBeVisible();
    await expect(page.getByText(/Member since/).first()).toBeVisible();
    await expect(page.getByTestId("seller-stats")).toContainText("Completed sales");
    await expect(page.getByRole("link", { name: /Profile test Freak 26 oz/ })).toBeVisible();
    await expect(page.getByText("No reviews yet")).toBeVisible();
    expect((await request.get("/sellers/nobody_here_123")).status()).toBe(404);
  });
});

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shop, bats and listing pages have no sideways scrolling", async ({ page }) => {
    const seller = await member("mobl");
    const id = await createLiveListing(seller, { title: "Mobile layout test 2026 Miken Freak Black Maxload USSSA 26 oz endload" });
    await noSideways(page, "/shop");
    await noSideways(page, "/bats");
    await noSideways(page, "/bats?q=zzqqxx&weight=26&stamp=USA");
    await noSideways(page, `/listings/${id}`);
    await noSideways(page, `/sellers/${seller.username}`);

    // Filters are behind a button on phones.
    await page.goto("/bats");
    await expect(page.getByRole("button", { name: "Apply filters" })).toBeHidden();
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("button", { name: "Apply filters" })).toBeVisible();
  });
});

test.describe("the rack and the life meter", () => {
  test("shows a real listing on the rack, switches to the list view and remembers it", async ({ page }) => {
    const seller = await member("rack");
    const word = uniqueWord(9);
    await createLiveListing(seller, { title: `Rack ${word} 26 oz`, attributes: { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", construction_type: "two_piece", barrel_length_inches: 13, length_inches: 34, model_year: 2026 } });
    await page.goto(`/bats?q=${word.slice(0, 6)}`);
    await expect(page.locator(".fence .hang")).toHaveCount(1);
    await expect(page.locator(".hang .htag")).toContainText("$220");
    await page.getByRole("link", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    await expect(page.locator(".sheet-row")).toHaveCount(1);
    // The choice is remembered without the URL parameter.
    await page.goto(`/bats?q=${word.slice(0, 6)}`);
    await expect(page.locator(".sheet-row")).toHaveCount(1);
    await page.getByRole("link", { name: "Rack", exact: true }).click();
    await expect(page.locator(".fence .hang")).toHaveCount(1);
  });

  test("the listing page places the seller's hit count on the life meter, or says none was given", async ({ page }) => {
    const seller = await member("life");
    const attrs = { weight_oz: 26, certification: ["USSSA"], weighting_type: "endload", model_year: 2026 };
    const withHits = await createLiveListing(seller, { title: "Life meter with hits 26 oz", attributes: { ...attrs, approx_hits: 400 } });
    const without = await createLiveListing(seller, { title: "Life meter without hits 26 oz", attributes: attrs });
    await page.goto(`/listings/${withHits}`);
    await expect(page.getByTestId("life-meter")).toContainText("Seller reports about 400 hits");
    await expect(page.getByTestId("life-meter").getByRole("meter")).toHaveAttribute("aria-valuenow", "400");
    await page.goto(`/listings/${without}`);
    await expect(page.getByTestId("life-meter")).toContainText("Seller didn't give a hit count");
  });
});
