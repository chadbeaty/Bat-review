// Built-in copy of the reference data in supabase/seed.sql, used before the database is connected.
// tests/unit/reference.test.ts fails if this drifts from the seed file.

export type Category = { slug: string; name: string; description: string; displayOrder: number };
export type Manufacturer = { slug: string; name: string };

export const categories: Category[] = [
  { slug: "bats", name: "Slow-pitch bats", description: "Used USSSA, USA (ASA), NSA, ISA and senior slow-pitch softball bats.", displayOrder: 1 },
  { slug: "gloves", name: "Gloves", description: "Fielding gloves and first base mitts.", displayOrder: 2 },
  { slug: "batting-gloves", name: "Batting gloves", description: "Batting gloves for slow-pitch hitters.", displayOrder: 3 },
  { slug: "bags", name: "Bat and equipment bags", description: "Backpacks, wheeled bags and bat bags.", displayOrder: 4 },
  { slug: "cleats", name: "Cleats and footwear", description: "Molded and metal cleats, turf shoes.", displayOrder: 5 },
  { slug: "protective", name: "Protective equipment", description: "Face masks, helmets, shin guards and other protection.", displayOrder: 6 },
  { slug: "apparel", name: "Apparel", description: "Jerseys, pants, hats and team gear.", displayOrder: 7 },
  { slug: "training", name: "Training equipment", description: "Tees, nets, training bats and practice gear.", displayOrder: 8 },
  { slug: "accessories", name: "Accessories", description: "Grips, end caps, bat warmers and everything else.", displayOrder: 9 },
];

export const manufacturers: Manufacturer[] = [
  { slug: "monsta", name: "Monsta" },
  { slug: "miken", name: "Miken" },
  { slug: "worth", name: "Worth" },
  { slug: "anarchy", name: "Anarchy" },
  { slug: "easton", name: "Easton" },
  { slug: "demarini", name: "DeMarini" },
  { slug: "louisville-slugger", name: "Louisville Slugger" },
  { slug: "dudley", name: "Dudley" },
  { slug: "suncoast", name: "Suncoast" },
  { slug: "juno", name: "Juno" },
  { slug: "mizuno", name: "Mizuno" },
  { slug: "rawlings", name: "Rawlings" },
  { slug: "victus", name: "Victus" },
  { slug: "axe", name: "Axe" },
  { slug: "marucci", name: "Marucci" },
  { slug: "combat", name: "Combat" },
  { slug: "anderson", name: "Anderson" },
  { slug: "boombah", name: "Boombah" },
  { slug: "short-porch", name: "Short Porch" },
  { slug: "other", name: "Other" },
];

/** Bat weights shown in "Browse by weight". */
export const batWeights = [25, 26, 27, 28];
