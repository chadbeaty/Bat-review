import type { Metadata } from "next";
import { getManufacturers } from "@/lib/catalog";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Manufacturers",
  description: "Slow-pitch softball equipment manufacturers in the catalog.",
  alternates: { canonical: "/manufacturers" },
};

export default async function ManufacturersPage() {
  const manufacturers = await getManufacturers();
  return (
    <div className="wrap grid gap-6 py-12">
      <div className="grid gap-2">
        <p className="eyebrow">Directory</p>
        <h1 className="display text-5xl font-bold">Manufacturers</h1>
        <p className="max-w-2xl text-ink-soft">
          Brands in the {brand.name} catalog. Manufacturer pages with every model and its used listings arrive with the bat database.
          Names identify products only; {brand.name} isn&apos;t affiliated with or endorsed by any manufacturer.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {manufacturers.map((m) => (
          <li key={m.slug} id={m.slug} className="card scroll-mt-28 p-4 font-semibold">
            {m.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
