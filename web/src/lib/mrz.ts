// The passport's machine-readable line, built only from the listing's real fields (like the two lines at the bottom
// of a real passport). Each line is 44 characters of A-Z, 0-9 and "<" filler. Pure and unit-tested.

const WIDTH = 44;

function clean(v: string | number | null | undefined): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "<")
    .replace(/^<+|<+$/g, "");
}

function fit(s: string): string {
  return (s + "<".repeat(WIDTH)).slice(0, WIDTH);
}

export type MrzFields = {
  brand?: string | null;
  /** The model name or listing title. A leading brand name is dropped so it isn't repeated. */
  model?: string | null;
  listingId: string;
  modelYear?: number | null;
  lengthIn?: number | null;
  weightOz?: number | null;
  /** True for two-piece, false for one-piece, null when unknown. */
  twoPiece?: boolean | null;
  load?: "end" | "mid" | "balanced" | null;
  stamps?: string[];
  hits?: number | null;
};

export function buildMrz(f: MrzFields): [string, string] {
  const brand = clean(f.brand);
  let model = clean(f.model);
  if (brand && model.startsWith(brand)) model = model.slice(brand.length).replace(/^<+/, "");
  const size = [f.lengthIn ? clean(f.lengthIn) : "", f.weightOz ? clean(f.weightOz) : ""].filter(Boolean).join("<");
  const line1 = fit(`P<GB${brand.slice(0, 12)}<<${model}${size ? `<<${size}` : ""}`);
  const id = clean(f.listingId).slice(0, 6);
  const build = f.twoPiece == null ? "" : f.twoPiece ? "2PC" : "1PC";
  const load = f.load === "end" ? "END" : f.load === "mid" ? "MID" : f.load === "balanced" ? "BAL" : "";
  const stamps = clean((f.stamps ?? []).slice(0, 2).join(" "));
  const hits = f.hits != null ? `H${String(Math.round(f.hits)).padStart(4, "0")}` : "";
  const line2 = fit([id, f.modelYear ? String(f.modelYear) : "", build, load, stamps, hits].filter(Boolean).join("<"));
  return [line1, line2];
}
