import "server-only";
import { redirect } from "next/navigation";
import { parseSearchParams, toQueryString, type SearchQuery } from "@/lib/search";

type Params = Record<string, string | string[] | undefined>;

/**
 * Parses a browse page's query parameters. A GET filter form submits empty fields ("?min=&max="), so a URL
 * with empty values is redirected to its clean equivalent, keeping shared links short and consistent.
 */
export function readBrowseQuery(path: string, params: Params, attributeKeys: string[] = []): SearchQuery {
  const query = parseSearchParams(params, { attributeKeys });
  const hasEmpty = Object.values(params).some((v) => v === "" || (Array.isArray(v) && v.some((x) => x === "")));
  if (hasEmpty) redirect(path + toQueryString(query));
  return query;
}

/** A page title that reflects the search, while the canonical URL stays the bare page. */
export function browseTitle(base: string, query: SearchQuery): string {
  const parts = [query.q ? `“${query.q}”` : null, query.page > 1 ? `page ${query.page}` : null].filter(Boolean);
  return parts.length ? `${base}: ${parts.join(", ")}` : base;
}
