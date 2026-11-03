import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { MatchModel } from "@/lib/catalog-match";

type Db = NonNullable<Awaited<ReturnType<typeof createClient>>>;

export type ImportCatalog = {
  models: MatchModel[];
  /** Product id to what the flow needs to start a draft for it. */
  meta: Map<string, { manufacturerId: string | null; certifications: string[] }>;
  /** Manufacturer name to id. */
  manufacturers: Map<string, string>;
};

type Row = {
  id: string;
  model_name: string;
  model_year: number | null;
  certification_association: string[] | null;
  manufacturer_id: string | null;
  manufacturers: { name: string } | null;
  product_lines: { name: string; aliases: string[] | null } | null;
};

/** Published catalog models for one category, in the shape the matcher reads. Runs as the signed-in seller (RLS applies). */
export async function loadImportCatalog(db: Db, categoryId: string): Promise<ImportCatalog> {
  const { data } = await db
    .from("products")
    .select("id, model_name, model_year, certification_association, manufacturer_id, manufacturers(name), product_lines(name, aliases)")
    .eq("catalog_status", "published")
    .eq("category_id", categoryId)
    .limit(2000);
  const models: MatchModel[] = [];
  const meta: ImportCatalog["meta"] = new Map();
  const manufacturers: ImportCatalog["manufacturers"] = new Map();
  for (const r of (data ?? []) as unknown as Row[]) {
    const brand = r.manufacturers?.name;
    if (!brand) continue;
    models.push({
      id: r.id,
      brand,
      modelName: r.model_name,
      year: r.model_year,
      stamps: r.certification_association ?? [],
      lineName: r.product_lines?.name ?? null,
      aliases: r.product_lines?.aliases ?? [],
    });
    meta.set(r.id, { manufacturerId: r.manufacturer_id, certifications: r.certification_association ?? [] });
    if (r.manufacturer_id) manufacturers.set(brand, r.manufacturer_id);
  }
  return { models, meta, manufacturers };
}
