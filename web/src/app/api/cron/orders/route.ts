import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized, paymentsDeps } from "@/lib/payments/server";
import { runOrdersCron } from "@/lib/payments/completion";

// Scheduled job (vercel.json): releases expired checkout holds and completes orders whose inspection window
// has passed, paying the seller. Protected by `Authorization: Bearer <CRON_SECRET>`; safe to run repeatedly.

async function run(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!cronAuthorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const deps = paymentsDeps();
  if (!deps) return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  const summary = await runOrdersCron(deps);
  return NextResponse.json(summary);
}

export const GET = run;
export const POST = run;
