import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComingSoon } from "@/components/ComingSoon";
import { getCategories } from "@/lib/catalog";

export async function generateMetadata({ params }: PageProps<"/shop/[category]">): Promise<Metadata> {
  const { category } = await params;
  const match = (await getCategories()).find((c) => c.slug === category);
  return { title: match?.name ?? "Shop" };
}

export default async function CategoryPage({ params }: PageProps<"/shop/[category]">) {
  const { category } = await params;
  const match = (await getCategories()).find((c) => c.slug === category);
  if (!match) notFound();
  return <ComingSoon title={match.name} phase="Phase 2" description={`${match.description} Listings with category-specific filters open in the next release.`} />;
}
