import type { Metadata } from "next";
import { BrowsePage } from "@/components/shop/BrowsePage";
import { browseTitle, readBrowseQuery } from "@/lib/browse";
import { readViewMode } from "@/lib/view-mode";
import { parseSearchParams, toQueryString } from "@/lib/search";
import { redirect } from "next/navigation";
import { getBatsOnlyMode } from "@/lib/launch";

const DESCRIPTION = "Search and filter every used slow-pitch listing by category, brand, price, condition and location.";

export async function generateMetadata({ searchParams }: PageProps<"/shop">): Promise<Metadata> {
  const query = parseSearchParams(await searchParams);
  return { title: browseTitle("Shop all equipment", query), description: DESCRIPTION, alternates: { canonical: "/shop" } };
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;
  // Bats only at launch: the all-equipment page is the bat marketplace until other categories are switched on.
  if (await getBatsOnlyMode()) redirect(`/bats${toQueryString(parseSearchParams(params))}`);
  const query = readBrowseQuery("/shop", params);
  const { view, explicit } = await readViewMode(params);
  return (
    <BrowsePage
      path="/shop"
      query={query}
      variant="all"
      view={view}
      explicitView={explicit}
      eyebrow="Shop"
      title="All equipment"
      intro="Used slow-pitch bats, gloves, bags, cleats and gear from players across the US. Every listing shows its condition score and damage answers."
    />
  );
}
