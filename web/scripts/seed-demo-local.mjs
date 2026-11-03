// LOCAL ONLY. Seeds a few clearly-marked test bat listings (with generated placeholder photos) into the local
// Supabase stack so cards, the Rack and the gallery have something to show. Refuses to run against anything but localhost.
//   node scripts/seed-demo-local.mjs            # add the demo listings
//   node scripts/seed-demo-local.mjs --remove   # delete them again
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Refusing to seed a non-local database");
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MARK = "(TEST)";
const SELLER_EMAIL = "demo-seller@example.test";

async function sellerId() {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 200 });
  const found = list?.users.find((u) => u.email === SELLER_EMAIL);
  if (found) return found.id;
  const { data, error } = await db.auth.admin.createUser({ email: SELLER_EMAIL, password: "test-password-123", email_confirm: true, user_metadata: { username: "demo_seller" } });
  if (error) throw error;
  return data.user.id;
}

if (process.argv.includes("--remove")) {
  const { data } = await db.from("equipment_listings").select("id").like("title", `%${MARK}`);
  for (const l of data ?? []) await db.from("equipment_listings").delete().eq("id", l.id);
  console.log(`removed ${data?.length ?? 0}`);
  process.exit(0);
}

const SPECS = [
  { slug: "worth-amp-alloy-dual-2026", w: 26, len: 34, price: 18500, cond: 9, certs: ["USA", "USSSA"], offers: true, hoursAgo: 5, city: "Nashville", st: "TN", colors: ["#1d6e4b", "#121820"] },
  { slug: "miken-freak-ice-usssa-2026", w: 27, len: 34, price: 14900, cond: 8, certs: ["USSSA"], offers: false, hoursAgo: 30, city: "Dallas", st: "TX", colors: ["#2b6cb0", "#f7f5ef"] },
  { slug: "easton-hype-fire-2pc-usa-2026", w: 25.5, len: 34, price: 12000, cond: 7, certs: ["USA"], offers: true, hoursAgo: 120, city: "Tulsa", st: "OK", colors: ["#c0352b", "#121820"] },
  { slug: "demarini-kingpin-senior-2026", w: 28, len: 34, price: 8900, cond: 6, certs: ["SSUSA"], offers: false, hoursAgo: 200, city: "Columbus", st: "OH", colors: ["#4b2fa0", "#e4e6e1"] },
  { slug: "monsta-dna-usa-2026", w: 26, len: 33, price: 21000, cond: 10, certs: ["USA"], offers: true, hoursAgo: 240, city: "Tampa", st: "FL", colors: ["#ffd23f", "#121820"] },
  { slug: "easton-tantrum-1pc-loaded-usssa-2026", w: 27.5, len: 34, price: 9900, cond: 5, certs: ["USSSA"], offers: false, hoursAgo: 400, city: "Boise", st: "ID", colors: ["#121820", "#8e989e"] },
  { slug: "marucci-rckless-loaded-usssa-2026", w: 28, len: 34, price: 25000, cond: 9, certs: ["USSSA", "NSA"], offers: true, hoursAgo: 8, city: "Omaha", st: "NE", colors: ["#c0352b", "#f7f5ef"] },
  { slug: "combat-cr1-bradley-jones-1pc-usssa-2026", w: 26.5, len: 34, price: 15500, cond: 8, certs: ["USSSA"], offers: true, hoursAgo: 60, city: "Raleigh", st: "NC", colors: ["#121820", "#ffd23f"] },
];
const SLOTS = ["full", "barrel", "end_cap", "knob", "markings"];

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(colors, kind, label) {
  return page.evaluate(
    ([c, k, text]) => {
      const cv = document.createElement("canvas");
      cv.width = 800;
      cv.height = 600;
      const x = cv.getContext("2d");
      x.fillStyle = "#e9e7df";
      x.fillRect(0, 0, 800, 600);
      x.strokeStyle = "rgba(18,24,32,.08)";
      for (let i = 0; i < 800; i += 24) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 600); x.stroke(); }
      for (let i = 0; i < 600; i += 24) { x.beginPath(); x.moveTo(0, i); x.lineTo(800, i); x.stroke(); }
      const bat = (cx, cy, w, h, ang) => {
        x.save(); x.translate(cx, cy); x.rotate(ang);
        x.fillStyle = c[0]; x.fillRect(-w / 2, -h / 2, w * 0.6, h);
        x.fillStyle = c[1]; x.fillRect(-w / 2 + w * 0.6, -h * 0.8, w * 0.4, h * 1.6);
        x.fillStyle = "#111"; x.fillRect(-w / 2, -h * 0.35, w * 0.16, h * 0.7);
        x.restore();
      };
      if (k === "full") bat(400, 300, 700, 46, -0.32);
      else if (k === "barrel") bat(300, 320, 1100, 190, -0.12);
      else if (k === "end_cap") { x.fillStyle = c[1]; x.beginPath(); x.arc(400, 300, 190, 0, 7); x.fill(); x.fillStyle = "#111"; x.beginPath(); x.arc(400, 300, 70, 0, 7); x.fill(); }
      else if (k === "knob") { x.fillStyle = "#111"; x.beginPath(); x.arc(400, 300, 130, 0, 7); x.fill(); x.fillStyle = c[0]; x.fillRect(380, 0, 40, 200); }
      else { x.fillStyle = c[0]; x.fillRect(80, 200, 640, 200); x.fillStyle = "#fff"; x.font = "bold 64px sans-serif"; x.fillText("USSSA  USA", 140, 320); }
      x.fillStyle = "rgba(18,24,32,.75)"; x.font = "bold 22px monospace"; x.fillText(text, 24, 580);
      return cv.toDataURL("image/png").split(",")[1];
    },
    [colors, kind, label]
  ).then((b64) => Buffer.from(b64, "base64"));
}

const seller = await sellerId();
const { data: cat } = await db.from("product_categories").select("id").eq("slug", "bats").single();
for (const sp of SPECS) {
  const { data: product } = await db.from("products").select("id, product_name, manufacturer_id, model_year, manufacturers(name)").eq("slug", sp.slug).single();
  const title = `${product.product_name.replace(/^\d{4} /, `${product.model_year} `)} ${sp.w} oz ${MARK}`.slice(0, 120);
  const { data: l, error } = await db
    .from("equipment_listings")
    .insert({
      seller_id: seller, product_id: product.id, category_id: cat.id, manufacturer_id: product.manufacturer_id, title,
      description: "LOCAL TEST DATA. Not a real listing. Generated placeholder photos.",
      attributes: { weight_oz: sp.w, length_inches: sp.len, certification: sp.certs, weighting_type: "endload", construction_type: "two_piece", model_year: product.model_year, approx_hits: 40 + sp.cond * 30 },
      asking_price_cents: sp.price, accepts_offers: sp.offers, condition_score: sp.cond, condition_label: "Normal light wear",
      structural_disclosure: "no_known_damage", has_cracks: false, has_rattle: false, has_loose_end_cap: false, has_repairs: false, has_alterations: false, has_significant_damage: false,
      authenticity_declaration: true, ownership_declaration: true, shipping_weight_oz: 48, package_length_inches: 38, package_width_inches: 5, package_height_inches: 5,
      shipping_origin_postal_code: "37201", location_city: sp.city, location_state: sp.st,
    })
    .select("id")
    .single();
  if (error) throw error;
  for (const [i, kind] of SLOTS.entries()) {
    const buf = await png(sp.colors, kind, `TEST PHOTO · ${kind}`);
    const path = `${seller}/${l.id}/${kind}.png`;
    const up = await db.storage.from("listing-images").upload(path, buf, { contentType: "image/png", upsert: true });
    if (up.error) throw up.error;
    const url = db.storage.from("listing-images").getPublicUrl(path).data.publicUrl;
    await db.from("listing_images").insert({ listing_id: l.id, image_url: url, storage_path: path, image_type: kind, display_order: i * 20, alt_text: `${title}: ${kind}` });
    if (i === 0 && sp.hoursAgo > 100) await new Promise((r) => setTimeout(r, 0));
  }
  const published = new Date(Date.now() - sp.hoursAgo * 3600 * 1000).toISOString();
  const { error: pe } = await db.from("equipment_listings").update({ listing_status: "active" }).eq("id", l.id);
  if (pe) throw pe;
  await db.from("equipment_listings").update({ published_at: published }).eq("id", l.id);
  console.log("seeded", title);
}
await browser.close();
