import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { isUuid } from "@/lib/listings";

// Counts a listing view. The listing page calls this once after it loads. A cookie remembers which listings
// this browser has already been counted for (12 hours), so refreshes don't inflate the number, and sellers
// viewing their own listing are never counted. views_count is writable only by the service role.

const COOKIE = "viewed_listings";
const MAX_REMEMBERED = 40;
const WINDOW_SECONDS = 12 * 60 * 60;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/listings/[id]/view">) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ counted: false }, { status: 400 });

  const seen = (request.cookies.get(COOKIE)?.value ?? "").split(".").filter(isUuid);
  if (seen.includes(id)) return NextResponse.json({ counted: false });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ counted: false });

  const { data: listing } = await admin.from("equipment_listings").select("seller_id, listing_status").eq("id", id).maybeSingle();
  if (!listing || listing.listing_status !== "active") return NextResponse.json({ counted: false });
  const user = await getCurrentUser();
  if (user?.id === listing.seller_id) return NextResponse.json({ counted: false });

  const { error } = await admin.rpc("increment_listing_views", { p_listing_id: id });
  const res = NextResponse.json({ counted: !error });
  res.cookies.set(COOKIE, [id, ...seen].slice(0, MAX_REMEMBERED).join("."), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    maxAge: WINDOW_SECONDS,
  });
  return res;
}
