import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productBrief, type ProductBrief } from "@/lib/data/brief";
import { ALERT_LABELS, type AlertType } from "@/lib/engine/alerts";
import { sendEmail } from "@/lib/email/send";
import { alertEmail, digestEmail } from "@/lib/email/templates";
import { siteUrl } from "@/lib/env";
import type { Settings } from "@/lib/settings";
import { recordUsage } from "@/lib/jobs/lock";

// Sends pending alerts (one email per product, combining its new alerts) and the daily digest.

export async function recipients(db: SupabaseClient, kind: "alerts" | "digest"): Promise<string[]> {
  const col = kind === "alerts" ? "receives_alerts" : "receives_digest";
  const { data } = await db.from("users").select("email").eq(col, true);
  const list = (data ?? []).map((u) => String(u.email).toLowerCase());
  const owner = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!list.length && owner) list.push(owner);
  return [...new Set(list)];
}

export async function sendPendingAlerts(db: SupabaseClient): Promise<{ emails: number; alerts: number; notConfigured: boolean; failed: number }> {
  const { data: pending } = await db.from("product_alerts").select("id, product_id, alert_type, reason").eq("status", "pending").neq("alert_type", "daily_digest").order("created_at").limit(100);
  const result = { emails: 0, alerts: 0, notConfigured: false, failed: 0 };
  if (!pending?.length) return result;
  const to = await recipients(db, "alerts");
  const byProduct = new Map<string, typeof pending>();
  for (const a of pending) {
    const list = byProduct.get(a.product_id as string) ?? [];
    list.push(a);
    byProduct.set(a.product_id as string, list);
  }
  for (const [productId, alerts] of byProduct) {
    const brief = await productBrief(db, productId);
    const ids = alerts.map((a) => a.id as string);
    if (!brief) {
      await db.from("product_alerts").update({ status: "failed", error: "Product not found" }).in("id", ids);
      continue;
    }
    const email = alertEmail(brief, alerts.map((a) => ({ label: ALERT_LABELS[a.alert_type as AlertType] ?? a.alert_type, reason: String(a.reason ?? "") })), siteUrl);
    const sent = await sendEmail({ to, ...email, tags: [{ name: "kind", value: "alert" }] });
    if (sent.ok) {
      result.emails++;
      result.alerts += ids.length;
      await db.from("product_alerts").update({ status: "sent", sent_at: new Date().toISOString(), email_id: sent.id }).in("id", ids);
    } else if (sent.reason === "not_configured") {
      result.notConfigured = true;
      await db.from("product_alerts").update({ status: "not_configured", error: "Email is not configured (RESEND_API_KEY / ALERT_FROM_EMAIL)." }).in("id", ids);
    } else {
      result.failed++;
      await db.from("product_alerts").update({ status: "failed", error: sent.message?.slice(0, 500) ?? "Send failed" }).in("id", ids);
    }
  }
  if (result.emails) await recordUsage(db, "resend", "alert", result.emails);
  return result;
}

export async function topOpportunities(db: SupabaseClient, n: number): Promise<string[]> {
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data } = await db
    .from("products")
    .select("id")
    .in("status", ["new", "tracking"])
    .not("latest_score", "is", null)
    .gte("scored_at", since)
    .order("latest_score", { ascending: false })
    .limit(n);
  return (data ?? []).map((r) => r.id as string);
}

export async function sendDigest(db: SupabaseClient, settings: Settings, opts: { force?: boolean } = {}): Promise<{ status: string; products: number }> {
  if (!settings.digest.enabled && !opts.force) return { status: "disabled", products: 0 };
  const day = new Date().toISOString().slice(0, 10);
  const fingerprint = opts.force ? `digest:${day}:manual:${Date.now()}` : `digest:${day}`;
  let { data: row } = await db.from("product_alerts").insert({ alert_type: "daily_digest", fingerprint, reason: "Daily digest" }).select("id").single();
  if (!row) {
    // Already attempted today: only try again if it did not go out.
    const { data: existing } = await db.from("product_alerts").select("id, status").eq("alert_type", "daily_digest").eq("fingerprint", fingerprint).maybeSingle();
    if (!existing || existing.status === "sent") return { status: "already_sent_today", products: 0 };
    row = { id: existing.id };
  }
  const ids = await topOpportunities(db, settings.digest.top_n);
  const briefs = (await Promise.all(ids.map((id) => productBrief(db, id)))).filter((b): b is ProductBrief => Boolean(b));
  const email = digestEmail(briefs, siteUrl, day);
  const sent = await sendEmail({ to: await recipients(db, "digest"), ...email, tags: [{ name: "kind", value: "digest" }] });
  await db
    .from("product_alerts")
    .update(
      sent.ok
        ? { status: "sent", sent_at: new Date().toISOString(), email_id: sent.id, payload: { products: ids } }
        : { status: sent.reason === "not_configured" ? "not_configured" : "failed", error: sent.ok ? null : (sent.message ?? sent.reason), payload: { products: ids } },
    )
    .eq("id", row.id);
  if (sent.ok) await recordUsage(db, "resend", "digest", 1);
  return { status: sent.ok ? "sent" : sent.reason, products: briefs.length };
}
