import { NextResponse, type NextRequest } from "next/server";
import { applyNewsletterToken } from "@/lib/newsletter";

// The unsubscribe link in every marketing email.
export async function GET(request: NextRequest) {
  const outcome = await applyNewsletterToken(request.nextUrl.searchParams.get("token"), "unsubscribe");
  const result = outcome === "already" ? "already-unsubscribed" : outcome;
  return NextResponse.redirect(new URL(`/newsletter?result=${result}`, request.nextUrl.origin), 303);
}

// One-click unsubscribe from the mail app (RFC 8058: List-Unsubscribe-Post).
export async function POST(request: NextRequest) {
  const outcome = await applyNewsletterToken(request.nextUrl.searchParams.get("token"), "unsubscribe");
  if (outcome === "invalid") return new Response("Unknown link", { status: 404 });
  if (outcome === "unavailable") return new Response("Try again later", { status: 503 });
  return new Response("Unsubscribed", { status: 200 });
}
