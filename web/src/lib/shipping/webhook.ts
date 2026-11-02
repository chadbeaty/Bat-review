// Shippo tracking webhooks (track_updated). Shippo doesn't sign webhook bodies, so the endpoint URL carries a
// long random token (SHIPPO_WEBHOOK_SECRET), compared in constant time. Each tracking event is stored once
// (shipping_events.provider_event_id is unique), so repeated deliveries change nothing.

import { timingSafeEqual } from "node:crypto";
import * as templates from "@/lib/email/templates";
import { emailMember, purchasePath, type Deps } from "@/lib/payments/deps";
import { parseTrack } from "./shippo";
import type { TrackingEvent } from "./types";

export function tokenMatches(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!given || !secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ShippoWebhookResult = { status: number; body: Record<string, unknown> };

export async function processShippoWebhook(deps: Pick<Deps, "db" | "mail">, rawBody: string): Promise<ShippoWebhookResult> {
  const { db } = deps;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  if (body.event !== "track_updated") return { status: 200, body: { ignored: true } };

  let update;
  try {
    update = parseTrack(body.data, body.test === true);
  } catch {
    return { status: 400, body: { error: "Invalid tracking data" } };
  }

  const { data: shipment } = await db
    .from("shipping_shipments")
    .select("id, order_id, buyer_id, is_test")
    .eq("tracking_number", update.trackingNumber)
    .eq("is_return", false)
    .neq("shipment_status", "cancelled")
    .maybeSingle();
  if (!shipment) return { status: 200, body: { ignored: true, reason: "unknown tracking number" } };
  // Shippo test-mode events never touch real shipments.
  if (update.test && !shipment.is_test) return { status: 200, body: { ignored: true, reason: "test event for a live shipment" } };

  const events = dedupe([...update.history, ...(update.current ? [update.current] : [])]).sort(
    (a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime()
  );
  const eventKey = update.current?.eventId ?? events.at(-1)?.eventId ?? `shippo:${update.trackingNumber}:${Date.now()}`;
  await db
    .from("webhook_events")
    .upsert(
      { provider: "shippo", event_id: eventKey, event_type: "track_updated", payload: body, status: "processed", processed_at: new Date().toISOString() },
      { onConflict: "provider,event_id", ignoreDuplicates: true }
    );

  let shipped = false;
  let delivered = false;
  let changed = 0;
  for (const ev of events) {
    const { data, error } = await db.rpc("shipping_record_event", {
      p_shipment: shipment.id,
      p_event_id: ev.eventId,
      p_status: ev.status,
      p_description: ev.description,
      p_event_at: ev.at,
      p_location: ev.location,
    });
    if (error) return { status: 500, body: { error: "Could not record tracking" } };
    const r = data as { duplicate: boolean; order_changed?: boolean; order_status?: string };
    if (!r.duplicate) changed += 1;
    if (r.order_changed && r.order_status === "shipped") shipped = true;
    if (r.order_changed && r.order_status === "delivered") delivered = true;
  }

  if (shipped || delivered) {
    const { data: o } = await db.from("orders").select("id, order_number, buyer_id, order_items(product_title_snapshot)").eq("id", shipment.order_id).single();
    const { data: setting } = await db.from("site_settings").select("value").eq("key", "inspection_window_days").maybeSingle();
    const days = typeof setting?.value === "number" ? setting.value : 2;
    if (o && delivered) {
      const title = (o.order_items as { product_title_snapshot: string }[])[0]?.product_title_snapshot ?? "your item";
      await emailMember(deps, o.buyer_id, (m) => templates.deliveryConfirmation({ name: m.name, orderNumber: o.order_number, title, orderPath: purchasePath(o.id), issueDays: days }));
    } else if (o && shipped) {
      await emailMember(deps, o.buyer_id, (m) =>
        templates.trackingUpdate({ name: m.name, orderNumber: o.order_number, status: "On its way", detail: update.current?.description ?? null, orderPath: purchasePath(o.id) })
      );
    }
  }
  return { status: 200, body: { received: true, changed, shipped, delivered } };
}

function dedupe(events: TrackingEvent[]): TrackingEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.eventId) ? false : (seen.add(e.eventId), true)));
}
