import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BrowsePage } from "@/components/shop/BrowsePage";
import { browseTitle, readBrowseQuery } from "@/lib/browse";
import { getCategories } from "@/lib/catalog";
import { getCategoryDetail } from "@/lib/listings";
import { parseSearchParams, toQueryString } from "@/lib/search";

async function findCategory(slug: string) {
  const detail = await getCategoryDetail(slug);
  if (detail) return detail;
  // Preview mode (no database): fall back to the built-in category list, without attribute filters.
  const basic = (await getCategories()).find((c) => c.slug === slug);
  return basic ? { id: basic.slug, slug: basic.slug, name: basic.name, description: basic.description, fields: [] } : null;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category } = await params;
  const match = await findCategory(category);
  if (!match) return { title: "Shop" };
  const query = parseSearchParams(await searchParams, { attributeKeys: match.fields.map((f) => f.key) });
  return {
    title: browseTitle(`Used ${match.name.toLowerCase()}`, query),
    description: `${match.description ?? match.name} Filter by brand, price, condition and location.`,
    alternates: { canonical: `/shop/${match.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/shop/[category]">) {
  const { category } = await params;
  const match = await findCategory(category);
  if (!match) notFound();
  const sp = await searchParams;
  // Bats have their own page with bat-specific filters.
  if (match.slug === "bats") permanentRedirect(`/bats${toQueryString(parseSearchParams(sp))}`);
  const path = `/shop/${match.slug}`;
  const query = readBrowseQuery(path, sp, match.fields.map((f) => f.key));
  return (
    <BrowsePage
      path={path}
      query={query}
      variant="category"
      category={match}
      eyebrow="Shop"
      title={match.name}
      intro={match.description ?? ""}
    />
  );
}
