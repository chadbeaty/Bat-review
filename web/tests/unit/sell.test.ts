import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  attributesSchema,
  coerceAttributes,
  defaultAttributes,
  formatAttribute,
  optionLabel,
  parseAttributeSchema,
  parseRequiredPhotos,
  prefillFromProduct,
} from "@/lib/sell/attributes";
import {
  detailsSchema,
  disclosuresSchema,
  isOwnListingPhotoPath,
  mapListingError,
  missingForPublish,
  parseDollars,
  photoProblem,
  priceSchema,
  shippingSchema,
  startListingSchema,
  suggestTitle,
  type ListingRecord,
} from "@/lib/sell/listing";
import { profileSchema } from "@/lib/validation/profile";

// The real bat schema and photo checklist from the seed, so the tests break if the seed and code drift.
const seed = readFileSync(join(__dirname, "..", "..", "supabase", "seed.sql"), "utf8");
const batBlock = seed.slice(seed.indexOf("('Slow-pitch bats'"), seed.indexOf("('Gloves'"));
const jsonArrays = [...batBlock.matchAll(/'(\[[\s\S]*?\])'::jsonb/g)].map((m) => JSON.parse(m[1]));
const batFields = parseAttributeSchema(jsonArrays[0]);
const batPhotos = parseRequiredPhotos(jsonArrays[1]);

describe("attribute form from attribute_schema", () => {
  it("reads every bat field from the seed", () => {
    expect(batFields.map((f) => f.key)).toEqual([
      "weight_oz",
      "certification",
      "weighting_type",
      "construction_type",
      "barrel_length_inches",
      "length_inches",
      "model_year",
      "approx_hits",
    ]);
    expect(batFields.find((f) => f.key === "certification")).toMatchObject({ type: "multiselect", required: true });
    expect(batFields.find((f) => f.key === "construction_type")?.required).toBe(false);
  });

  it("accepts an optional whole-number hit count from 0 to 10,000 and shows its help", () => {
    const hits = batFields.find((f) => f.key === "approx_hits")!;
    expect(hits).toMatchObject({ type: "number", required: false, label: "About how many hits?", min: 0, max: 10000 });
    expect(hits.help).toContain("150–200 hits");
    const schema = attributesSchema(batFields);
    const base = { weight_oz: "26", certification: ["USSSA"], weighting_type: "endload", model_year: "2026" };
    expect(schema.safeParse(coerceAttributes(batFields, base)).success).toBe(true);
    expect(schema.safeParse(coerceAttributes(batFields, { ...base, approx_hits: "400" })).data).toMatchObject({ approx_hits: 400 });
    expect(schema.safeParse(coerceAttributes(batFields, { ...base, approx_hits: "0" })).success).toBe(true);
    expect(schema.safeParse(coerceAttributes(batFields, { ...base, approx_hits: "10001" })).success).toBe(false);
    expect(schema.safeParse(coerceAttributes(batFields, { ...base, approx_hits: "-5" })).success).toBe(false);
    expect(schema.safeParse(coerceAttributes(batFields, { ...base, approx_hits: "12.5" })).success).toBe(false);
  });

  it("reads the bat photo checklist", () => {
    expect(batPhotos.map((p) => p.type)).toEqual(["full", "barrel", "end_cap", "knob", "markings", "damage"]);
    expect(batPhotos.find((p) => p.type === "damage")?.optional).toBe(true);
    expect(batPhotos.find((p) => p.type === "full")?.optional).toBe(false);
  });

  it("skips malformed fields instead of failing", () => {
    const fields = parseAttributeSchema([{ key: "ok", label: "OK", type: "text" }, { key: "Bad Key", label: "x", type: "text" }, { label: "no key" }, "junk"]);
    expect(fields.map((f) => f.key)).toEqual(["ok"]);
    expect(parseAttributeSchema(null)).toEqual([]);
  });

  it("uses schema defaults for a new listing", () => {
    expect(defaultAttributes(batFields)).toEqual({ length_inches: 34 });
  });

  it("validates values against the schema", () => {
    const schema = attributesSchema(batFields);
    const good = coerceAttributes(batFields, {
      weight_oz: "26",
      certification: ["USSSA", "USA"],
      weighting_type: "endload",
      construction_type: "",
      barrel_length_inches: "12.5",
      length_inches: "34",
      model_year: "2026",
    });
    expect(good).toEqual({ weight_oz: 26, certification: ["USSSA", "USA"], weighting_type: "endload", barrel_length_inches: 12.5, length_inches: 34, model_year: 2026 });
    expect(schema.safeParse(good).success).toBe(true);

    const bad = schema.safeParse(coerceAttributes(batFields, { weight_oz: "24", certification: [], weighting_type: "heavy", model_year: "1970" }));
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["weight_oz", "certification", "weighting_type", "model_year"]));
  });

  it("works for a category with only text fields", () => {
    const fields = parseAttributeSchema([{ key: "item_type", label: "Item", type: "text", required: true }]);
    const schema = attributesSchema(fields);
    expect(schema.safeParse(coerceAttributes(fields, { item_type: "  Bat grip " })).data).toEqual({ item_type: "Bat grip" });
    expect(schema.safeParse(coerceAttributes(fields, { item_type: "" })).success).toBe(false);
  });

  it("labels options for people", () => {
    expect(optionLabel("one_piece")).toBe("One-piece");
    expect(optionLabel("endload")).toBe("End-loaded");
    expect(optionLabel("USSSA")).toBe("USSSA");
    expect(optionLabel("first_base")).toBe("First base");
    expect(optionLabel(26.5)).toBe("26.5");
    expect(formatAttribute(batFields[0], 26)).toBe("26 oz");
    expect(formatAttribute(batFields[1], ["USSSA", "USA"])).toBe("USSSA, USA");
    expect(formatAttribute(batFields[1], [])).toBeNull();
  });

  it("prefills from catalog specs, keeping unknowns empty", () => {
    const prefill = prefillFromProduct(batFields, {
      model_year: 2026,
      certification_association: ["USSSA"],
      product_specifications: { construction: "2pc", weighting: "endload", barrel_length_inches: 12.5 },
      bat_specifications: [
        { weight_oz: null, length_inches: "34.0", barrel_length_inches: "12.50", weighting_type: "unknown", construction_type: "unknown" },
      ],
    });
    expect(prefill).toEqual({
      model_year: 2026,
      certification: ["USSSA"],
      weighting_type: "endload",
      construction_type: "two_piece",
      barrel_length_inches: 12.5,
      length_inches: 34,
    });
  });

  it("prefills weight only when the model has a single listed weight", () => {
    const one = prefillFromProduct(batFields, {
      model_year: 2025,
      certification_association: [],
      product_specifications: {},
      bat_specifications: [{ weight_oz: 26, length_inches: 34, barrel_length_inches: null, weighting_type: "balanced", construction_type: "one_piece" }],
    });
    expect(one).toMatchObject({ weight_oz: 26, weighting_type: "balanced", construction_type: "one_piece" });
    expect(one.certification).toBeUndefined();
    const many = prefillFromProduct(batFields, {
      model_year: 2025,
      certification_association: ["Bogus"],
      product_specifications: {},
      bat_specifications: [26, 27].map((w) => ({ weight_oz: w, length_inches: 34, barrel_length_inches: null, weighting_type: "balanced", construction_type: "one_piece" })),
    });
    expect(many.weight_oz).toBeUndefined();
    expect(many.certification).toBeUndefined(); // not one of the schema's options
  });
});

describe("title suggestion", () => {
  it("builds year, brand, model, stamp and weight without repeats", () => {
    expect(suggestTitle({ modelYear: 2026, brand: "Miken", model: "2026 Miken Freak Black Maxload", stamps: ["USSSA"], weightOz: 26 })).toBe(
      "2026 Miken Freak Black Maxload USSSA 26 oz"
    );
    expect(suggestTitle({ modelYear: 2024, brand: "Easton", model: "Ghost Advanced", weightOz: 27.5 })).toBe("2024 Easton Ghost Advanced 27.5 oz");
    expect(suggestTitle({ brand: "Worth", model: "EST USSSA", stamps: ["USSSA", "Other"] })).toBe("Worth EST USSSA");
  });

  it("leaves out the Other brand and falls back to the category", () => {
    expect(suggestTitle({ brand: "Other", model: "Bag" })).toBe("Bag");
    expect(suggestTitle({ brand: "Other", model: "X", fallback: "Accessories" })).toBe("X Accessories");
  });

  it("stays within 120 characters", () => {
    expect(suggestTitle({ model: "word ".repeat(40) }).length).toBeLessThanOrEqual(120);
  });
});

describe("listing step validation", () => {
  const ids = { categoryId: "3f1c2a4e-1111-4222-8333-444455556666", manufacturerId: "3f1c2a4e-1111-4222-8333-444455556667" };

  it("needs a catalog model or a catalog request", () => {
    expect(startListingSchema.safeParse({ ...ids, productId: null, request: null }).success).toBe(false);
    expect(startListingSchema.safeParse({ ...ids, productId: "3f1c2a4e-1111-4222-8333-444455556668", request: null }).success).toBe(true);
    expect(startListingSchema.safeParse({ ...ids, productId: null, request: { modelName: "Freak 23", modelYear: 2023 } }).success).toBe(true);
    expect(startListingSchema.safeParse({ ...ids, productId: null, request: { modelName: "x", modelYear: null } }).success).toBe(false);
  });

  it("parses dollars to cents", () => {
    expect(parseDollars("200")).toBe(20000);
    expect(parseDollars("$1,249.99")).toBe(124999);
    expect(parseDollars("19.5")).toBe(1950);
    expect(parseDollars("12.345")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(priceSchema.safeParse({ price: "0.50", acceptsOffers: true }).success).toBe(false);
    expect(priceSchema.safeParse({ price: "30000", acceptsOffers: true }).success).toBe(false);
    expect(priceSchema.parse({ price: "180", acceptsOffers: false })).toEqual({ price: 18000, acceptsOffers: false });
  });

  it("checks package size and a 5-digit ZIP", () => {
    expect(shippingSchema.safeParse({ weightLb: 3, lengthIn: 36, widthIn: 5, heightIn: 5, postalCode: "37201" }).success).toBe(true);
    expect(shippingSchema.safeParse({ weightLb: 3, lengthIn: 120, widthIn: 5, heightIn: 5, postalCode: "37201" }).success).toBe(false);
    expect(shippingSchema.safeParse({ weightLb: 3, lengthIn: 36, widthIn: 5, heightIn: 5, postalCode: "3720" }).success).toBe(false);
    expect(shippingSchema.safeParse({ lengthIn: 36, widthIn: 5, heightIn: 5, postalCode: "37201" }).success).toBe(false);
  });

  it("requires a condition score and a real title", () => {
    expect(detailsSchema.safeParse({ title: "2026 Miken Freak", conditionScore: 8, attributes: {} }).success).toBe(true);
    expect(detailsSchema.safeParse({ title: "Bat", conditionScore: 8, attributes: {} }).success).toBe(false);
    expect(detailsSchema.safeParse({ title: "2026 Miken Freak", attributes: {} }).success).toBe(false);
  });

  const clean = {
    structuralDisclosure: "no_known_damage",
    hasCracks: false,
    hasRattle: false,
    hasLooseEndCap: false,
    hasRepairs: false,
    hasAlterations: false,
    hasSignificantDamage: false,
    ownership: true,
    authenticity: true,
  };

  it("requires every damage question and both declarations", () => {
    expect(disclosuresSchema.safeParse(clean).success).toBe(true);
    const missing = disclosuresSchema.safeParse({ ...clean, hasRattle: undefined });
    expect(missing.error?.issues[0]).toMatchObject({ path: ["hasRattle"], message: "Answer yes or no" });
    expect(disclosuresSchema.safeParse({ ...clean, ownership: false }).success).toBe(false);
    expect(disclosuresSchema.safeParse({ ...clean, authenticity: undefined }).success).toBe(false);
  });

  it("requires damage to be disclosed and described when reported", () => {
    const r = disclosuresSchema.safeParse({ ...clean, hasCracks: true });
    const paths = r.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(["structuralDisclosure", "damageDisclosure"]);
    expect(
      disclosuresSchema.safeParse({ ...clean, hasCracks: true, structuralDisclosure: "damage_disclosed", damageDisclosure: "Hairline crack near the taper" }).success
    ).toBe(true);
  });
});

describe("photos", () => {
  it("accepts JPG, PNG, WEBP and HEIC up to 10 MB", () => {
    expect(photoProblem({ name: "a.jpg", type: "image/jpeg", size: 1000 })).toBeNull();
    expect(photoProblem({ name: "a.heic", type: "", size: 1000 })).toBeNull();
    expect(photoProblem({ name: "a.gif", type: "image/gif", size: 1000 })).toMatch(/JPG, PNG, WEBP, HEIC/);
    expect(photoProblem({ name: "a.png", type: "image/png", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(photoProblem({ name: "a.png", type: "image/png", size: 0 })).toMatch(/empty/);
  });

  it("only accepts paths in the seller's own listing folder", () => {
    const u = "11111111-1111-4111-8111-111111111111";
    const l = "22222222-2222-4222-8222-222222222222";
    expect(isOwnListingPhotoPath(`${u}/${l}/abc.jpg`, u, l)).toBe(true);
    expect(isOwnListingPhotoPath(`${u}/${l}/../x.jpg`, u, l)).toBe(false);
    expect(isOwnListingPhotoPath(`${u}/${l}/a/b.jpg`, u, l)).toBe(false);
    expect(isOwnListingPhotoPath(`${l}/${u}/abc.jpg`, u, l)).toBe(false);
  });
});

describe("publish errors and readiness", () => {
  it("maps database publishing rules to the step that fixes them", () => {
    expect(mapListingError("Answer every damage question before publishing")).toMatchObject({ step: "disclosures" });
    expect(mapListingError("Add at least one photo before publishing")).toMatchObject({ step: "photos" });
    expect(mapListingError("Add package weight, size and ship-from ZIP code before publishing")).toMatchObject({ step: "shipping" });
    expect(mapListingError("Set an asking price before publishing")).toMatchObject({ step: "price" });
    expect(mapListingError("Choose a cosmetic condition before publishing")).toMatchObject({ step: "details" });
    expect(mapListingError("Confirm ownership and authenticity before publishing")).toMatchObject({ step: "disclosures" });
    expect(mapListingError("something unexpected")).toMatchObject({ step: null });
  });

  it("lists what's missing", () => {
    const draft = {
      condition_score: null,
      asking_price_cents: null,
      shipping_weight_oz: null,
      package_length_inches: null,
      package_width_inches: null,
      package_height_inches: null,
      has_cracks: null,
      has_rattle: null,
      has_loose_end_cap: null,
      has_repairs: null,
      has_alterations: null,
      has_significant_damage: null,
      ownership_declaration: false,
      authenticity_declaration: false,
    } as unknown as ListingRecord;
    expect(missingForPublish(draft, { photoCount: 0, hasShipFrom: false, attributesValid: false }).map((m) => m.step)).toEqual([
      "details",
      "photos",
      "price",
      "shipping",
      "disclosures",
    ]);
    const ready = {
      ...draft,
      condition_score: 8,
      asking_price_cents: 20000,
      shipping_weight_oz: 48,
      package_length_inches: 36,
      package_width_inches: 5,
      package_height_inches: 5,
      has_cracks: false,
      has_rattle: false,
      has_loose_end_cap: false,
      has_repairs: false,
      has_alterations: false,
      has_significant_damage: false,
      ownership_declaration: true,
      authenticity_declaration: true,
    } as ListingRecord;
    expect(missingForPublish(ready, { photoCount: 1, hasShipFrom: true, attributesValid: true })).toEqual([]);
  });
});

describe("profile validation", () => {
  const base = { username: "slugger_22", displayName: "", bio: "", city: "", state: "", postalCode: "" };
  it("accepts a valid profile and normalizes empties to null", () => {
    expect(profileSchema.parse({ ...base, state: "tn", city: " Nashville " })).toEqual({
      username: "slugger_22",
      displayName: null,
      bio: null,
      city: "Nashville",
      state: "TN",
      postalCode: null,
    });
  });
  it("rejects bad usernames, states and ZIPs", () => {
    expect(profileSchema.safeParse({ ...base, username: "ab" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, username: "has space" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, state: "Tenn" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, postalCode: "1234" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, postalCode: "37201-1234" }).success).toBe(true);
  });
});
