import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/newsletter";

// One-click unsubscribe (RFC 8058): mail clients POST here from the List-Unsubscribe header.
export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const ok = await unsubscribe(id, token);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

// A plain visit shows the confirmation page instead of acting (link scanners must not unsubscribe people).
export async function GET(request: NextRequest) {
  const target = new URL("/newsletter/unsubscribe", request.nextUrl.origin);
  request.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v));
  return NextResponse.redirect(target);
}
