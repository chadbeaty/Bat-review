// Browse layouts. "grid" (the default) is the marketplace card grid; "rack" is the chain-link fence of hanging bats;
// "list" is the dense data-sheet. The choice lives in the URL (?view=) and is remembered in a cookie.

export const VIEW_COOKIE = "gb_view";
export type ViewMode = "grid" | "list" | "rack";
export const VIEW_MODES: ViewMode[] = ["grid", "list", "rack"];

export function parseView(v: unknown): ViewMode | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "grid" || s === "rack" || s === "list" ? s : null;
}

/** Adds ?view= to a link when the visitor picked a layout in the URL, so paging and sorting keep it. */
export function withView(href: string, view: ViewMode | null): string {
  if (!view) return href;
  return href + (href.includes("?") ? "&" : "?") + `view=${view}`;
}
