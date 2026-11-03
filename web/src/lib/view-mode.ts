import "server-only";
import { cookies } from "next/headers";
import { VIEW_COOKIE, parseView, type ViewMode } from "@/lib/view-mode-shared";

type Params = Record<string, string | string[] | undefined>;

/** The shopper's chosen layout: the ?view= link if present, else the remembered cookie, else the rack. */
export async function readViewMode(params: Params): Promise<{ view: ViewMode; explicit: boolean }> {
  const fromUrl = parseView(params.view);
  if (fromUrl) return { view: fromUrl, explicit: true };
  const jar = await cookies();
  return { view: parseView(jar.get(VIEW_COOKIE)?.value) ?? "rack", explicit: false };
}
