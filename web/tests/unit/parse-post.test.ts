import { describe, expect, it } from "vitest";
import { cleanPost, isLinkOnly, parsePost, readHits, readOffers, readPrice, readSizes, summaryLine } from "@/lib/import/parse-post";
import { readStamps, type MatchModel } from "@/lib/catalog-match";

// A slice of the real catalog (names, years, stamps and line aliases as seeded from data/bats.json and data/families.json).
const FREAK_ALIASES = ["freak", "super freak", "freak black", "freak whiteout", "freak fire", "freak ice", "freak splatter", "tunnel to towers", "freak30", "freak12", "freak lucky"];
const model = (id: string, brand: string, modelName: string, year: number, stamps: string[], lineName: string, aliases: string[]): MatchModel => ({ id, brand, modelName, year, stamps, lineName, aliases });
const CATALOG: MatchModel[] = [
  model("freak-black-26", "Miken", "Freak Black Maxload", 2026, ["USSSA"], "Freak", FREAK_ALIASES),
  model("freak-black-25", "Miken", "Freak Black Maxload", 2025, ["USSSA"], "Freak", FREAK_ALIASES),
  model("freak-max-26", "Miken", 'Freak Maxload 2-Piece 13.5"', 2026, ["USSSA", "NSA", "ISA"], "Freak", FREAK_ALIASES),
  model("freak30-26", "Miken", "Freak30 2-Piece Maxload", 2026, ["USSSA"], "Freak", FREAK_ALIASES),
  model("kp23-26", "Miken", 'KP23 2-Piece 12.5" Maxload', 2026, ["USSSA"], "KP23", ["kp23", "kp 23", "kyle pearson"]),
  model("tantrum-usssa-26", "Easton", "Tantrum 2-Piece Loaded", 2026, ["USSSA"], "Tantrum", ["tantrum", "motherload tantrum", "tantrum gold"]),
  model("tantrum-usa-25", "Easton", 'Tantrum 2-Piece 12.75" Loaded', 2025, ["USA"], "Tantrum", ["tantrum", "motherload tantrum", "tantrum gold"]),
  model("alpha-26", "Easton", "Alpha 2-Piece Loaded", 2026, ["USSSA"], "Alpha", ["easton alpha", "alpha loaded", "alpha 1 piece", "alpha 2 piece"]),
  model("thing-26", "Easton", "Thing 2-Piece Loaded", 2026, ["USSSA"], "Thing", ["easton thing"]),
  model("bedlam-xl-26", "Worth", "Bedlam XL", 2026, ["USSSA"], "Bedlam", ["bedlam"]),
  model("bedlam-xxl-26", "Worth", "Josh Riley Bedlam XXL", 2026, ["USSSA"], "Bedlam", ["bedlam"]),
  model("merciless-27", "DeMarini", "Merciless", 2027, ["USA"], "Mercy / Merciless", ["mercy", "merciless"]),
  model("flipper-27", "DeMarini", "Flipper", 2027, ["USA"], "Flipper", ["flipper"]),
  model("geny-26", "Louisville Slugger", 'Genesis Royal Geny 14" Endload', 2026, ["USSSA"], "Genesis", ["genesis", "geny", "royal geny", "iron man 5.0"]),
  model("rckless-26", "Marucci", 'Rckless Balanced 13.5"', 2026, ["USSSA", "NSA", "ISA"], "Rckless Resmondo", ["rckless", "reckless resmondo", "marucci resmondo"]),
];

const NOW = new Date("2026-11-03T12:00:00Z");
const parse = (text: string) => parsePost(text, CATALOG, NOW);

type Expect = {
  /** Catalog id when the model should be picked automatically, "candidates" when the seller should choose, "none" when nothing matches. */
  model?: string;
  candidateIds?: string[];
  cents?: number | null;
  weight?: number | null;
  length?: number | null;
  stamps?: string[] | null;
  hits?: number | null;
  offers?: boolean | null;
  multiple?: boolean;
  kind?: "empty" | "link_only" | "text";
};

const TABLE: { name: string; post: string; expect: Expect }[] = [
  {
    name: "tidy Facebook group post with everything",
    post: "Miken Freak Black Maxload 2026 USSSA 34/27. $150 obo. Used one season. Can pick up or ship.",
    expect: { model: "freak-black-26", cents: 15000, weight: 27, length: 34, stamps: ["USSSA"], offers: true },
  },
  {
    name: "abbreviated, no brand, no model year: 'Freak 23' is not a model in the catalog",
    post: "Freak 23 maxload 34/26 USSSA $150 obo",
    expect: { model: "candidates", cents: 15000, weight: 26, length: 34, stamps: ["USSSA"], offers: true },
  },
  {
    name: "emoji-heavy post with a phone number",
    post: "🔥🔥 SELLING 🔥🔥 2025 Easton Tantrum 2pc Loaded 💥 ASA/USA 34/28 ⚾ great shape, hit about 300 balls. 💰$120 shipped. PM me! (555) 123-4567",
    expect: { model: "tantrum-usa-25", cents: 12000, weight: 28, length: 34, stamps: ["USA"], hits: 300 },
  },
  {
    name: "firm price, negated damage words",
    post: "Worth Bedlam XL USSSA 34/28 - 175 firm. Broken in, no cracks no rattle.",
    expect: { model: "bedlam-xl-26", cents: 17500, weight: 28, length: 34, stamps: ["USSSA"], offers: false },
  },
  {
    name: "rattle mentioned, brand and nickname only",
    post: "DeMarini Mercy rattles a bit, selling cheap 90 obo 33/30",
    expect: { model: "candidates", candidateIds: ["merciless-27"], cents: 9000, weight: 30, length: 33, stamps: null, offers: true },
  },
  {
    name: "two bats in one post: warn and pick nothing",
    post: "Selling my Miken Freak Black Maxload and my Worth Bedlam XL, $140 and $120. Both 34/27.",
    expect: { multiple: true, model: "none", cents: null, weight: null, stamps: null },
  },
  {
    name: "two sizes of the same model: two bats",
    post: "Miken Freak Black Maxload 34/27 USSSA $150 and another one 34/28 $150",
    expect: { multiple: true, model: "none", cents: null },
  },
  {
    name: "'Mike Jo Larry' style nonsense with no bat in it",
    post: "Mike Jo Larry any1 want this?? lmk lol",
    expect: { model: "none", cents: null, weight: null, length: null, stamps: null, hits: null, offers: null },
  },
  {
    name: "name-drop that is not a bat ('worth' and 'standard' as plain words)",
    post: "Well worth it, the standard way to get a hit. Looking for a ride to the tournament Saturday.",
    expect: { model: "none", cents: null, stamps: null },
  },
  {
    name: "only a Facebook link",
    post: "https://www.facebook.com/groups/slowpitchgear/posts/10159876543210/",
    expect: { kind: "link_only", model: "none" },
  },
  { name: "empty", post: "   \n  ", expect: { kind: "empty", model: "none" } },
  {
    name: "signature series nickname with a dead spot, no brand",
    post: "KP23 maxload 2pc 34/27 USSSA $175. Dead spot near the end cap.",
    expect: { model: "kp23-26", cents: 17500, weight: 27, length: 34, stamps: ["USSSA"] },
  },
  {
    name: "swings, shipped price, lowercase",
    post: "easton alpha loaded 2pc usssa 34/27 200 shipped. broken in ~500 swings",
    expect: { model: "alpha-26", cents: 20000, weight: 27, length: 34, stamps: ["USSSA"], hits: 500 },
  },
  {
    name: "four stamps",
    post: "Marucci Rckless 13.5 balanced ASA/USSSA/NSA/ISA 34/27 $200 OBO",
    expect: { model: "rckless-26", cents: 20000, weight: 27, stamps: ["USSSA", "USA", "NSA", "ISA"], offers: true },
  },
  {
    name: "the seller is unsure about the stamp: leave it empty",
    post: "Miken Freak Black Maxload 34/27 I think it's USSSA but not sure. $140",
    expect: { model: "candidates", candidateIds: ["freak-black-26", "freak-black-25"], cents: 14000, weight: 27, stamps: null },
  },
  {
    name: "says dual stamp but doesn't say which",
    post: "Miken Freak Black Maxload dual stamp 34/27 2026 $140 obo",
    expect: { model: "freak-black-26", cents: 14000, stamps: null, offers: true },
  },
  {
    name: "original price and shipping cost are not the asking price",
    post: "Paid $300 new, asking $150 + $15 shipping. Louisville Slugger Genesis Royal Geny 34/26",
    expect: { model: "candidates", cents: 15000, weight: 26, length: 34 },
  },
  {
    name: "was/now prices with no clear asking price",
    post: "Price drop!! was $200 now $150, $130 for locals. Easton Thing loaded 34/27 usssa",
    expect: { model: "thing-26", cents: null, weight: 27, stamps: ["USSSA"] },
  },
  {
    name: "hyphenated size and bare-number price in lowercase",
    post: "bedlam xl 34-27 usssa 180 obo",
    expect: { model: "bedlam-xl-26", cents: 18000, weight: 27, length: 34, stamps: ["USSSA"], offers: true },
  },
  {
    name: "a date and Venmo in the text",
    post: "Bought this 10/26 at the tournament. 34/27 Miken Freak Black Maxload 2026 USSSA, Venmo $140",
    expect: { model: "freak-black-26", cents: 14000, weight: 27, length: 34, stamps: ["USSSA"] },
  },
  {
    name: "comma hit count and a more specific model name",
    post: "Used about 1,200 hits. Miken Freak30 2-piece maxload 34/28 USSSA 2026 - $165",
    expect: { model: "freak30-26", cents: 16500, weight: 28, length: 34, stamps: ["USSSA"], hits: 1200 },
  },
  {
    name: "Reddit-style tag with oz and inch",
    post: "[WTS] [US-TX] Worth Bedlam XL USSSA, 28oz 34 inch. $160 shipped OBO. Has about 250 hits on it.",
    expect: { model: "bedlam-xl-26", cents: 16000, weight: 28, length: 34, stamps: ["USSSA"], hits: 250, offers: true },
  },
  {
    name: "senior as a person, not a stamp",
    post: "Selling my old Flipper, I'm a senior now so time to retire it. 34/26 ASA $90",
    expect: { model: "candidates", candidateIds: ["flipper-27"], cents: 9000, weight: 26, stamps: ["USA"] },
  },
  {
    name: "Made in USA is not a stamp",
    post: "Easton Tantrum made in USA bat, 2026, 34/27, $130",
    expect: { model: "candidates", candidateIds: ["tantrum-usssa-26"], cents: 13000, stamps: null },
  },
];

describe("parsePost: realistic slow-pitch posts", () => {
  for (const row of TABLE) {
    it(row.name, () => {
      const p = parse(row.post);
      const e = row.expect;
      if (e.kind) expect(p.kind).toBe(e.kind);
      if (e.multiple !== undefined) expect(p.multiple).toBe(e.multiple);
      if (e.model === "none") expect(p.model.status).toBe("none");
      else if (e.model === "candidates") {
        expect(p.model.status).toBe("candidates");
        expect(p.model.matched).toBeNull();
        if (e.candidateIds) expect(p.model.candidates.map((c) => c.id)).toEqual(e.candidateIds);
      } else if (e.model) {
        expect(p.model.status).toBe("matched");
        expect(p.model.matched?.id).toBe(e.model);
      }
      if (e.cents !== undefined) expect(p.priceCents?.value ?? null).toBe(e.cents);
      if (e.weight !== undefined) expect(p.weightOz?.value ?? null).toBe(e.weight);
      if (e.length !== undefined) expect(p.lengthInches?.value ?? null).toBe(e.length);
      if (e.stamps !== undefined) expect(p.stamps?.value ?? null).toEqual(e.stamps);
      if (e.hits !== undefined) expect(p.hits?.value ?? null).toBe(e.hits);
      if (e.offers !== undefined) expect(p.acceptsOffers?.value ?? null).toBe(e.offers);
    });
  }

  it("covers at least fifteen varied posts", () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(15);
  });
});

describe("never guessing", () => {
  it("leaves the stamp empty and says why when it is hedged, unnamed, or missing", () => {
    const hedged = parse("Miken Freak Black Maxload 34/27 I think it's USSSA but not sure. $140");
    expect(hedged.stamps).toBeNull();
    expect(hedged.flags.find((f) => f.key === "certification")?.message).toMatch(/unsure/);
    const dual = parse("Miken Freak Black Maxload dual stamp 34/27 2026 $140");
    expect(dual.flags.find((f) => f.key === "certification")?.message).toMatch(/dual-stamp/);
    const none = parse("Miken Freak Black Maxload 34/27 2026 $140");
    expect(none.flags.find((f) => f.key === "certification")?.message).toMatch(/doesn't name a stamp/);
  });

  it("returns candidates, not a pick, when the post fits several models", () => {
    const p = parse("Miken Freak Black Maxload 34/27 USSSA $140");
    expect(p.model.status).toBe("candidates");
    expect(p.model.candidates.map((c) => c.id).sort()).toEqual(["freak-black-25", "freak-black-26"]);
    expect(p.fields.some((f) => f.key === "model")).toBe(false);
    expect(p.flags.some((f) => f.key === "model")).toBe(true);
  });

  it("does not take a model from a bare everyday word without bat talk or a brand", () => {
    expect(parse("The Mercy rule ended the game early, we lost again.").model.status).toBe("none");
    expect(parse("That flipper at the pool was fun to ride on.").model.status).toBe("none");
  });

  it("does not match the wrong stamp's model: a USA stamp rules out the USSSA-only Tantrum", () => {
    const p = parse("Easton Tantrum 2pc loaded ASA only 34/27 $120");
    expect(p.model.matched?.id).toBe("tantrum-usa-25");
  });

  it("does not fill anything when the post is about several bats", () => {
    const p = parse("Bats for sale: Miken Freak Black Maxload 34/27 $140, Easton Tantrum Loaded 34/26 $110");
    expect(p.multiple).toBe(true);
    expect(p.fields).toEqual([]);
    expect(p.description).toBe("");
    expect(p.warnings[0]).toMatch(/more than one bat/);
  });

  it("flags a weight it cannot settle instead of choosing", () => {
    const p = parse("Easton Thing loaded 34/27 usssa, also comes in 28oz if you want. $110");
    expect(p.weightOz).toBeNull();
    expect(p.warnings.join(" ")).toMatch(/more than one weight/);
  });
});

describe("links", () => {
  it("explains that we can't open a pasted link", () => {
    const p = parse("https://www.facebook.com/groups/12345/permalink/67890/");
    expect(p.kind).toBe("link_only");
    expect(p.warnings[0]).toMatch(/can't open/);
    expect(p.warnings[0]).toMatch(/copy the words/);
    expect(isLinkOnly("fb.me/abc123")).toBe(true);
    expect(isLinkOnly("Miken Freak 34/27 $140 https://fb.me/abc123")).toBe(false);
  });
});

describe("price", () => {
  const price = (t: string) => readPrice(t).found?.value;
  it("reads the common ways sellers write it", () => {
    expect(price("asking $180")).toBe(18000);
    expect(price("$180")).toBe(18000);
    expect(price("180$")).toBe(18000);
    expect(price("180 obo")).toBe(18000);
    expect(price("180 firm")).toBe(18000);
    expect(price("180 shipped")).toBe(18000);
    expect(price("price: 180")).toBe(18000);
    expect(price("$2,400 for the pair")).toBeUndefined(); // above the range for one bat
    expect(price("$149.99")).toBe(14999);
  });
  it("ignores sizes, hit counts, dates and years", () => {
    expect(price("34/27 2026 400 swings 26oz")).toBeUndefined();
    expect(price("Bought in 2024 for 400 swings")).toBeUndefined();
    expect(price("34/26 obo")).toBeUndefined();
  });
  it("skips shipping costs and the price paid", () => {
    expect(price("$150 and $15 shipping")).toBe(15000);
    expect(price("retails for $350, mine is $140")).toBe(14000);
    expect(price("I paid $300 for it, $20 off if you pick up, $150 obo")).toBe(15000);
  });
  it("warns when it cannot tell which price is the asking price", () => {
    const r = readPrice("$150 or $130");
    expect(r.found).toBeNull();
    expect(r.warning).toMatch(/more than one price/);
  });
});

describe("offers", () => {
  it("reads obo and firm", () => {
    expect(readOffers("150 obo")?.value).toBe(true);
    expect(readOffers("$150 or best offer")?.value).toBe(true);
    expect(readOffers("make me an offer")?.value).toBe(true);
    expect(readOffers("price is firm, no lowballs")?.value).toBe(false);
    expect(readOffers("$150 not firm")?.value).toBe(true);
    expect(readOffers("no obo")?.value).toBe(false);
    expect(readOffers("34/27 usssa")).toBeNull();
  });
});

describe("size", () => {
  it("reads length/weight pairs and loose oz or inch values", () => {
    expect(readSizes("34/27").pairs[0]).toMatchObject({ length: 34, weight: 27 });
    expect(readSizes('34" / 26 oz').pairs[0]).toMatchObject({ length: 34, weight: 26 });
    expect(readSizes("34-26").pairs[0]).toMatchObject({ length: 34, weight: 26 });
    expect(readSizes("26.5 oz").weights[0].value).toBe(26.5);
    expect(readSizes("34 inch").lengths[0].value).toBe(34);
  });
  it("does not read dates, scores or prices as sizes", () => {
    expect(readSizes("10/26").pairs).toEqual([]);
    expect(readSizes("score was 15/12").pairs).toEqual([]);
    expect(readSizes("$135/27").pairs).toEqual([]);
    expect(readSizes("12.5 inch barrel").lengths).toEqual([]);
  });
});

describe("hits", () => {
  it("reads counts with their unit and ignores ceilings", () => {
    expect(readHits("~400 swings")?.value).toBe(400);
    expect(readHits("300 hits")?.value).toBe(300);
    expect(readHits("about 1,500 hits")?.value).toBe(1500);
    expect(readHits("2k swings")?.value).toBe(2000);
    expect(readHits("under 100 hits")).toBeNull();
    expect(readHits("used one season")).toBeNull();
    expect(readHits("hit about 250 balls")?.value).toBe(250);
  });
  it("keeps 'used one season' as a note, not a number", () => {
    const p = parse("Miken Freak Black Maxload 2026 USSSA 34/27 $150. Used one season, babied it.");
    expect(p.hits).toBeNull();
    expect(p.usage).toMatch(/used one season/i);
  });
});

describe("stamps", () => {
  it("reads the stamps named", () => {
    expect(readStamps("USSSA").stamps).toEqual(["USSSA"]);
    expect(readStamps("ASA / USSSA").stamps).toEqual(["USSSA", "USA"]);
    expect(readStamps("NSA ISA USSSA").stamps).toEqual(["USSSA", "NSA", "ISA"]);
    expect(readStamps("senior ssusa").stamps).toEqual(["SSUSA"]);
    expect(readStamps("not USSSA, ASA only").stamps).toEqual(["USA"]);
    expect(readStamps("not USSSA, ASA only").denied).toEqual(["USSSA"]);
    expect(readStamps("USA Baseball and Team USA").stamps).toEqual([]);
  });
  it("only fills 'senior' when it is plainly the bat's stamp", () => {
    expect(parse("Worth Bedlam XL senior bat approved 34/27 $100").stamps?.value).toEqual(["SSUSA"]);
    expect(parse("Worth Bedlam XL, I'm a senior player. 34/27 $100").stamps).toBeNull();
  });
});

describe("condition and damage", () => {
  it("reads condition words and negations", () => {
    const p = parse("Worth Bedlam XL 2026 broken in, like new, no cracks. No rattle. Hot bat. $150");
    expect(p.conditionWords).toEqual(expect.arrayContaining(["broken in", "like new", "hot"]));
    expect(p.damage.cracks).toBe("no");
    expect(p.damage.rattle).toBe("no");
  });
  it("notes cracks, rattles and dead spots that are stated", () => {
    const p = parse("Worth Bedlam XL cracked at the end cap and it rattles, dead spot too. $60");
    expect(p.damage).toMatchObject({ cracks: "yes", rattle: "yes", dead: "yes" });
  });
  it("notes a rolled or shaved bat", () => {
    expect(parse("Worth Bedlam XL rolled and shaved, $80").damage.modified).toBe("yes");
  });
});

describe("shipping", () => {
  it("reads ship and local hints", () => {
    expect(parse("Worth Bedlam XL $150 shipped").shipping).toEqual({ mode: "ships", included: true });
    expect(parse("Worth Bedlam XL $150 local pickup only").shipping.mode).toBe("local");
    expect(parse("Worth Bedlam XL $150 pick up in Dallas or I'll ship it").shipping.mode).toBe("both");
    expect(parse("Worth Bedlam XL $150 plus shipping").shipping.mode).toBe("ships");
    expect(parse("Worth Bedlam XL $150").shipping.mode).toBeNull();
  });
});

describe("description", () => {
  it("removes links, phone numbers, emails, emoji and asks to message or pay off the site", () => {
    const c = cleanPost("🔥 Freak Black Maxload 34/27 🔥\nCall (555) 123-4567 or email bob@example.com. See https://fb.me/xyz\nPM me, Venmo ready. Great bat!");
    expect(c.description).not.toMatch(/555|@|http|fb\.me|🔥|PM me|Venmo/i);
    expect(c.description).toMatch(/Freak Black Maxload 34\/27/);
    expect(c.description).toMatch(/Great bat/);
    expect(c.notes).toEqual(expect.arrayContaining(["links", "email addresses", "phone numbers", "messaging and off-site payment asks"]));
  });
});

describe("summary", () => {
  it("counts the fields filled", () => {
    const p = parse("Miken Freak Black Maxload 2026 USSSA 34/27. $150 obo. ~400 swings. Great bat, no problems at all.");
    expect(p.fields.map((f) => f.key).sort()).toEqual(["accepts_offers", "approx_hits", "certification", "description", "length_inches", "model", "price", "weight_oz"]);
    expect(summaryLine(p)).toBe("We filled 8 fields. Check the highlighted ones.");
  });
  it("is honest when nothing was found", () => {
    expect(summaryLine(parse("Mike Jo Larry any1 want this?? lmk lol"))).toMatch(/couldn't read any listing details/);
  });
});
