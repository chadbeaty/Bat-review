import "server-only";
import { cache } from "react";
import { getSetting } from "@/lib/settings";

/** The category that stays visible while launch is bats-only. */
export const LAUNCH_CATEGORY = "bats";

/**
 * True while only bats are shown (site setting `bats_only_mode`, default on). The owner switches it off in
 * Admin > Settings to bring the other categories back. All other category data and code stay in place.
 */
export const getBatsOnlyMode = cache(async (): Promise<boolean> => {
  const v = await getSetting<unknown>("bats_only_mode", true);
  return v !== false;
});

/** True when this category slug may be shown to visitors right now. */
export async function isCategoryVisible(slug: string | null | undefined): Promise<boolean> {
  if (!slug) return true;
  return !(await getBatsOnlyMode()) || slug === LAUNCH_CATEGORY;
}

/** Filters any list of categories down to the visible ones. */
export async function visibleCategories<T extends { slug: string }>(list: T[]): Promise<T[]> {
  return (await getBatsOnlyMode()) ? list.filter((c) => c.slug === LAUNCH_CATEGORY) : list;
}
