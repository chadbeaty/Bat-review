// URL helpers shared by every page, so links to listings, sellers and bat models always agree.

export function listingPath(id: string): string {
  return `/listings/${id}`;
}

export function sellerPath(username: string): string {
  return `/sellers/${encodeURIComponent(username)}`;
}

/**
 * The model segment of a bat page URL: the product slug without its leading brand token and trailing year.
 * "miken-freak-black-maxload-usssa-2026" → "freak-black-maxload-usssa".
 */
export function modelSegment(productSlug: string, modelYear: number | null): string {
  let s = productSlug.replace(/^[a-z0-9]+-/, "");
  if (modelYear != null) s = s.replace(new RegExp(`-${modelYear}$`), "");
  return s;
}

/** /bats/<manufacturer>/<model>/<year>, as in the brief. */
export function batModelPath(p: { manufacturerSlug: string; productSlug: string; modelYear: number | null }): string {
  return `/bats/${p.manufacturerSlug}/${modelSegment(p.productSlug, p.modelYear)}/${p.modelYear ?? "unknown"}`;
}

/** The SQL LIKE pattern that finds a product from a bat page URL's model and year segments. */
export function productSlugPattern(model: string, year: string): string {
  return `%-${model.replace(/[%_]/g, "")}-${year.replace(/[^0-9]/g, "")}`;
}
