// Browse layouts. "rack" is the chain-link fence of hanging bats (a card grid for gear that isn't a bat); "list" is the
// dense data-sheet. The choice lives in the URL (?view=) and is remembered in a cookie.

export const VIEW_COOKIE = "gb_view";
export type ViewMode = "rack" | "list";

export function parseView(v: unknown): ViewMode | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "rack" || s === "list" ? s : null;
}

/** Adds ?view= to a link when the visitor picked a layout in the URL, so paging and sorting keep it. */
export function withView(href: string, view: ViewMode | null): string {
  if (!view) return href;
  return href + (href.includes("?") ? "&" : "?") + `view=${view}`;
}
