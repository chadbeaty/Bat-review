import "server-only";
import type { Staff } from "@/lib/auth/staff";

/** Estimated AI spend since the start of today (UTC), read through the staff member's session. */
export async function spendToday(staff: Staff): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await staff.db.from("ai_runs").select("estimated_cost").gte("created_at", start.toISOString()).limit(5000);
  return (data ?? []).reduce((sum, r) => sum + Number(r.estimated_cost ?? 0), 0);
}

/** People for select boxes. */
export async function peopleOptions(staff: Staff): Promise<[string, string][]> {
  const { data } = await staff.db.from("people").select("id, name, status").order("name").limit(1000);
  return (data ?? []).map((p) => [p.id, p.status === "active" ? p.name : `${p.name} (${p.status.replace("_", " ")})`]);
}

export async function sourceOptions(staff: Staff, limit = 300): Promise<[string, string][]> {
  const { data } = await staff.db.from("evidence_sources").select("id, title, publisher, published_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((s) => [s.id, `${s.title}${s.publisher ? ` — ${s.publisher}` : ""}${s.published_at ? ` (${String(s.published_at).slice(0, 10)})` : ""}`.slice(0, 140)]);
}
