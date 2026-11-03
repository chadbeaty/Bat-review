import { describe, expect, it } from "vitest";
import {
  activeFilters,
  normalizeSearchText,
  normalizeStamp,
  normalizeWeighting,
  pageWindow,
  parseSearchParams,
  searchHref,
  searchRpcArgs,
  searchTerms,
  toQueryString,
} from "@/lib/search";

describe("search text normalization", () => {
  it("treats every spelling of end-loaded as one word", () => {
    for (const s of ["end load", "End-Loaded", "endloaded", "end loaded", "END_LOAD", "endload"]) {
      expect(normalizeSearchText(s)).toBe("endload");
    }
    expect(normalizeSearchText("mid-loaded")).toBe("midload");
  });

  it("maps ASA to the USA stamp", () => {
    expect(normalizeSearchText("ASA bat")).toBe("usa bat");
    expect(normalizeSearchText("Asa")).toBe("usa");
    // Only the whole word: "Nasa" or "asap" are left alone.
    expect(normalizeSearchText("nasa asap")).toBe("nasa asap");
  });

  it("normalizes one-piece and two-piece construction", () => {
    for (const s of ["1 piece", "one-piece", "One Piece", "1pc", "1-piece", "single piece", "one_piece"]) {
      expect(normalizeSearchText(s)).toBe("1pc");
    }
    for (const s of ["2 piece", "two-piece", "2pc", "2-Piece"]) expect(normalizeSearchText(s)).toBe("2pc");
  });

  it("drops punctuation but keeps decimal weights", () => {
    expect(normalizeSearchText('Miken "Freak" 26.5 oz!')).toBe("miken freak 26.5 oz");
  });

  it("splits into unique terms and caps their number", () => {
    expect(searchTerms("  Freak  freak END LOADED 26 ")).toEqual(["freak", "endload", "26"]);
    expect(searchTerms("a b c d e f g h i j k")).toHaveLength(8);
    expect(searchTerms("...")).toEqual([]);
    expect(searchTerms("2026 Easton Tantrum 1-Piece")).toEqual(["2026", "easton", "tantrum", "1pc"]);
  });
});

describe("parseSearchParams", () => {
  it("defaults to newest first, page 1, no filters", () => {
    const q = parseSearchParams({});
    expect(q).toMatchObject({ q: "", terms: [], sort: "newest", page: 1, brands: [], weights: [], stamps: [] });
    expect(searchRpcArgs(q)).toMatchObject({ p_terms: null, p_sort: "newest", p_limit: 24, p_offset: 0 });
  });

  it("reads repeated and comma-separated values", () => {
    const q = parseSearchParams(new URLSearchParams("weight=26&weight=27,28&stamp=usssa,ASA&load=end-loaded&load=balanced"));
    expect(q.weights).toEqual([26, 27, 28]);
    expect(q.stamps).toEqual(["USSSA", "USA"]);
    expect(q.loads).toEqual(["endload", "balanced"]);
  });

  it("turns dollar prices into cents and swaps a reversed range", () => {
    expect(parseSearchParams({ min: "150", max: "$300.50" })).toMatchObject({ minPriceCents: 15000, maxPriceCents: 30050 });
    expect(parseSearchParams({ min: "400", max: "100" })).toMatchObject({ minPriceCents: 10000, maxPriceCents: 40000 });
    expect(parseSearchParams({ min: "cheap" }).minPriceCents).toBeUndefined();
  });

  it("drops invalid values instead of failing", () => {
    const q = parseSearchParams({
      condition: "11",
      state: "ZZ",
      weight: ["abc", "99", "26.5"],
      year: ["1700", "2026"],
      sort: "random",
      page: "-3",
      brand: ["DROP TABLE", "miken"],
      model: "../etc",
      rating: "9",
      stamp: "XYZ",
    });
    expect(q).toMatchObject({ condition: undefined, state: undefined, weights: [26.5], years: [2026], sort: "newest", page: 1, brands: ["miken"] });
    expect(q.model).toBeUndefined();
    expect(q.rating).toBeUndefined();
    expect(q.stamps).toEqual([]);
  });

  it("accepts lowercase state codes, ratings and weights written with oz", () => {
    expect(parseSearchParams({ state: "tn", rating: "4.5", weight: "26oz" })).toMatchObject({ state: "TN", rating: 4.5, weights: [26] });
  });

  it("reads only the category attributes it is told about", () => {
    const q = parseSearchParams({ "a.throwing_hand": "left", "a.secret": "x" }, { attributeKeys: ["throwing_hand"] });
    expect(q.attrs).toEqual({ throwing_hand: ["left"] });
  });

  it("normalizes the free text into terms", () => {
    expect(parseSearchParams({ q: "Demarni  one piece" })).toMatchObject({ q: "Demarni one piece", terms: ["demarni", "1pc"] });
  });

  it("computes the page offset", () => {
    expect(searchRpcArgs(parseSearchParams({ page: "3" }))).toMatchObject({ p_offset: 48, p_limit: 24 });
  });
});

describe("normalizers", () => {
  it("stamps", () => {
    expect(normalizeStamp("asa")).toBe("USA");
    expect(normalizeStamp("ssusa")).toBe("SSUSA");
    expect(normalizeStamp("abc")).toBeNull();
  });
  it("weighting", () => {
    expect(normalizeWeighting("End Loaded")).toBe("endload");
    expect(normalizeWeighting("loaded")).toBe("endload");
    expect(normalizeWeighting("Balanced")).toBe("balanced");
    expect(normalizeWeighting("heavy")).toBeNull();
  });
});

describe("URLs", () => {
  it("round-trips a query through the URL", () => {
    const original = parseSearchParams(
      new URLSearchParams("q=freak&brand=miken&weight=26&stamp=USSSA&load=endload&year=2026&min=100&max=250&condition=8&state=TN&rating=4&sort=price_asc&page=2")
    );
    const again = parseSearchParams(new URLSearchParams(toQueryString(original).slice(1)));
    expect(again).toEqual(original);
  });

  it("leaves out defaults so the plain page has a clean URL", () => {
    expect(toQueryString(parseSearchParams({ sort: "newest", page: "1" }))).toBe("");
  });

  it("resets to page 1 when a filter changes, but not when paging", () => {
    const q = parseSearchParams({ q: "freak", page: "3" });
    expect(searchHref("/bats", q, { weights: [26] })).toBe("/bats?q=freak&weight=26");
    expect(searchHref("/bats", q, { page: 4 })).toBe("/bats?q=freak&page=4");
    expect(searchHref("/bats", q, { sort: "price_desc" })).toBe("/bats?q=freak&sort=price_desc");
  });

  it("lists active filters with a link that removes each one", () => {
    const q = parseSearchParams({ q: "freak", weight: ["26", "27"], max: "200", brand: "miken" });
    const filters = activeFilters(q, { brands: { miken: "Miken" } });
    expect(filters.map((f) => f.label)).toEqual(["“freak”", "Miken", "Up to $200", "26 oz", "27 oz"]);
    const without26 = filters.find((f) => f.label === "26 oz")!;
    expect(searchHref("/bats", q, without26.remove)).toBe("/bats?q=freak&brand=miken&max=200&weight=27");
    const withoutText = filters[0];
    expect(searchHref("/bats", q, withoutText.remove)).toBe("/bats?brand=miken&max=200&weight=26&weight=27");
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("collapses long ranges around the current page", () => {
    expect(pageWindow(6, 20)).toEqual([1, null, 5, 6, 7, null, 20]);
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 20]);
  });
});

describe("launch filters (length, newly listed, offers, dual stamp)", () => {
  it("parses, rebuilds and sends them to the database", () => {
    const q = parseSearchParams({ minlen: "33", maxlen: "34.5", new: "1", offers: "1", dual: "1" });
    expect(q).toMatchObject({ minLength: 33, maxLength: 34.5, fresh: true, offers: true, dual: true });
    expect(toQueryString(q)).toBe("?minlen=33&maxlen=34.5&new=1&dual=1&offers=1");
    expect(searchRpcArgs(q)).toMatchObject({ p_min_length: 33, p_max_length: 34.5, p_new_days: 7, p_accepts_offers: true, p_dual_stamp: true });
    expect(activeFilters(q).map((f) => f.key)).toEqual(expect.arrayContaining(["length", "fresh", "offers", "dual"]));
  });
  it("drops junk and swaps a reversed range", () => {
    expect(parseSearchParams({ minlen: "abc", maxlen: "99", new: "0" })).toMatchObject({ minLength: undefined, maxLength: undefined, fresh: undefined });
    expect(parseSearchParams({ minlen: "35", maxlen: "33" })).toMatchObject({ minLength: 33, maxLength: 35 });
  });
});
