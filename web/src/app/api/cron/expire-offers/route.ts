import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expireOffers } from "@/lib/trust/offers-server";

// Scheduler hook: GET/POST with `Authorization: Bearer $CRON_SECRET`. Idempotent, so retries are harmless.
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expired = await expireOffers();
  return NextResponse.json({ expired });
}

export const GET = handle;
export const POST = handle;
