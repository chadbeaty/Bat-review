import { NextResponse, type NextRequest } from "next/server";
import { applyNewsletterToken } from "@/lib/newsletter";

// The link in the "confirm your email" message.
export async function GET(request: NextRequest) {
  const outcome = await applyNewsletterToken(request.nextUrl.searchParams.get("token"), "confirm");
  const result = outcome === "already" ? "already-confirmed" : outcome;
  return NextResponse.redirect(new URL(`/newsletter?result=${result}`, request.nextUrl.origin), 303);
}
