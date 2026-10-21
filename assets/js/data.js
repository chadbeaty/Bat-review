// Loads the catalog, family notes and aggregated community data, and derives the fields the views use.

export const STAMPS = {
  USSSA: { label: "USSSA", long: "USSSA (240 stamp)" },
  USA: { label: "USA", long: "USA Softball (formerly ASA)" },
  NSA: { label: "NSA", long: "NSA" },
  ISA: { label: "ISA", long: "ISA" },
  SSUSA: { label: "SSUSA", long: "Senior Softball USA" },
};

export const LEAGUES = [
  { id: "USSSA", name: "USSSA", hint: "Most tournament and many rec leagues" },
  { id: "USA", name: "USA / ASA", hint: "USA Softball, church and city leagues" },
  { id: "SSUSA", name: "Senior", hint: "SSUSA senior leagues, 50+" },
  { id: "NSA", name: "NSA", hint: "Bats stamped NSA" },
  { id: "ISA", name: "ISA", hint: "Bats stamped ISA" },
];

export const BUILD = { "1pc": "1-piece", "2pc": "2-piece" };
export const MATERIAL = { composite: "Composite", alloy: "Alloy", "wood-composite": "Wood composite", hybrid: "Hybrid" };
export const LOAD = { balanced: "Balanced", endload: "End-loaded", heavy: "Heavy end-load" };

export const TOPICS = {
  pop: "Pop & distance",
  durability: "Durability",
  breakIn: "Break-in",
  feel: "Feel & sting",
  sound: "Sound",
  value: "Value",
};

const DEFAULT_WEIGHTS = { USSSA: [25, 26, 27, 28], USA: [26, 27, 28], SSUSA: [25, 26, 27, 28] };

export const MIN_MENTIONS_FOR_SCORE = 5;

async function getJSON(url, fallback) {
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch {
    return fallback;
  }
}

export async function loadData() {
  const [catalog, fam, community] = await Promise.all([
    getJSON("data/bats.json", { bats: [] }),
    getJSON("data/families.json", { families: [] }),
    getJSON("data/community.json", { generatedAt: null, families: {} }),
  ]);

  const families = new Map(fam.families.map((f) => [f.id, f]));
  const pulse = community.families || {};

  const bats = catalog.bats.map((b) => {
    const family = families.get(b.family) || null;
    const talk = pulse[b.family] || null;
    const stamps = b.stamps || [];
    const dual = stamps.includes("USA") && stamps.includes("USSSA");
    const weights = b.weights || DEFAULT_WEIGHTS[stamps[0]] || [26, 27, 28];
    const effectivePrice = b.salePrice ?? b.price ?? null;
    return {
      ...b,
      name: `${b.brand} ${b.model}`,
      familyInfo: family,
      talk,
      dual,
      weights,
      effectivePrice,
      score: talk && talk.mentions >= MIN_MENTIONS_FOR_SCORE ? talk.score : null,
      mentions: talk ? talk.mentions : 0,
      searchText: [b.brand, b.model, b.year, family?.name, ...(family?.aliases || []), ...stamps, b.sku, BUILD[b.build], MATERIAL[b.material], LOAD[b.load], b.loadName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    };
  });

  return {
    bats,
    byId: new Map(bats.map((b) => [b.id, b])),
    families,
    community,
    catalogNote: catalog.note,
    catalogUpdated: catalog.updated,
    familiesNote: fam.note,
  };
}

export function hasStamp(bat, league) {
  return bat.stamps.includes(league);
}
