import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { processShippoWebhook, tokenMatches } from "@/lib/shipping/webhook";

// Shippo tracking webhook. Register it in Shippo as https://<site>/api/webhooks/shippo?token=<SHIPPO_WEBHOOK_SECRET>
// (Shippo doesn't sign request bodies). The token may also be sent in an x-shippo-webhook-token header.

export async function POST(request: NextRequest) {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Shipping webhooks are not configured" }, { status: 503 });
  const given = request.nextUrl.searchParams.get("token") ?? request.headers.get("x-shippo-webhook-token");
  if (!tokenMatches(given, secret)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  const result = await processShippoWebhook({ db, mail: (to, email) => sendEmail(to, email) }, await request.text());
  return NextResponse.json(result.body, { status: result.status });
}
