"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricValue, SwingAnalysis } from "@/engine/types";
import { db } from "./store/db";
import type { Player, Session, SwingRecord } from "./store/types";

/**
 * Backs up a hitter's summaries to the cloud: hitters, bats, sessions, swing results, metrics (with their sources),
 * phase events and hit tags. Rows are keyed by the phone's own ids (client_id), so running it twice never duplicates.
 * Video and raw pose stay on the phone.
 */
export type SyncResult = { players: number; sessions: number; swings: number };

const ts = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);

export function swingRows(sw: SwingRecord, remoteSessionId: string, remotePlayerId: string) {
  const a: SwingAnalysis = sw.analysis;
  const rel = (t: number | null) => (t === null ? null : Math.round(t - a.phases.contact));
  return {
    swing: {
      session_id: remoteSessionId,
      player_id: remotePlayerId,
      client_id: sw.id,
      swing_number: sw.n,
      recorded_at: ts(sw.at),
      camera_view: sw.view,
      overall_score: a.score.overall,
      score: a.score,
      cue_id: a.cue.id,
      cue_text: a.cue.text.slice(0, 300),
      phases: { ...a.phases, relative: { load: rel(a.phases.loadStart), stride: rel(a.phases.strideStart), launch: rel(a.phases.launch), finish: rel(a.phases.finish) } },
      quality: a.quality,
      note: sw.note ?? null,
    },
    metrics: (Object.values(a.metrics) as MetricValue[]).map((m) => ({
      metric_key: m.key,
      value: m.source === "unavailable" ? null : m.value,
      text_value: m.text?.slice(0, 200) ?? null,
      source: m.source,
      confidence: Math.max(0, Math.min(1, m.confidence)),
      reason: m.reason?.slice(0, 300) ?? null,
    })),
    events: (
      [
        ["stance", a.phases.stanceStart],
        ["load", a.phases.loadStart],
        ["stride", a.phases.strideStart],
        ["foot_plant", a.phases.footPlant],
        ["launch", a.phases.launch],
        ["contact", a.phases.contact],
        ["finish", a.phases.finish],
      ] as const
    )
      .filter(([, t]) => t !== null)
      .map(([event, t]) => ({ event, t_ms: rel(t as number)!, source: event === "contact" && a.phases.contactSource === "audio" ? "audio" : "pose" })),
  };
}

async function upsertPlayer(sb: SupabaseClient, userId: string, p: Player): Promise<string> {
  const { data, error } = await sb
    .from("player_profiles")
    .upsert({ owner_id: userId, client_id: p.id, name: p.name, bats: p.hand, height_in: p.heightIn }, { onConflict: "owner_id,client_id" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function upsertSession(sb: SupabaseClient, remotePlayer: string, s: Session, batIds: Map<string, string>): Promise<string> {
  const { data, error } = await sb
    .from("practice_sessions")
    .upsert(
      {
        player_id: remotePlayer,
        client_id: s.id,
        camera_view: s.view,
        started_at: ts(s.startedAt),
        ended_at: ts(s.endedAt),
        swing_count: s.swingCount,
        avg_score: s.avgScore,
        best_score: s.bestScore,
        camera_fps: s.cameraFps || null,
        pose_fps: s.poseFps || null,
        bat_id: s.batId ? (batIds.get(s.batId) ?? null) : null,
        notes: s.notes || null,
      },
      { onConflict: "player_id,client_id" },
    )
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function syncAll(sb: SupabaseClient): Promise<SyncResult> {
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Sign in first.");
  const out: SyncResult = { players: 0, sessions: 0, swings: 0 };
  for (const p of await db.players()) {
    const rp = await upsertPlayer(sb, user.id, p);
    if (p.remoteId !== rp) await db.savePlayer({ ...p, remoteId: rp });
    out.players++;

    const batIds = new Map<string, string>();
    for (const b of await db.bats(p.id)) {
      const { data, error } = await sb
        .from("player_bats")
        .upsert(
          { player_id: rp, client_id: b.id, brand: b.brand, model: b.model, length_in: b.lengthIn, weight_oz: b.weightOz, certification: b.certification },
          { onConflict: "player_id,client_id" },
        )
        .select("id")
        .single();
      if (error) throw error;
      batIds.set(b.id, data.id as string);
    }

    for (const s of await db.sessions(p.id)) {
      if (s.swingCount === 0) continue;
      const rs = await upsertSession(sb, rp, s, batIds);
      out.sessions++;
      for (const sw of await db.swingsInSession(s.id)) {
        if (sw.syncedAt) continue;
        const rows = swingRows(sw, rs, rp);
        const { data, error } = await sb.from("swing_analyses").upsert(rows.swing, { onConflict: "player_id,client_id" }).select("id").single();
        if (error) throw error;
        const sid = data.id as string;
        const m = await sb.from("swing_metrics").upsert(rows.metrics.map((r) => ({ ...r, swing_id: sid })), { onConflict: "swing_id,metric_key" });
        if (m.error) throw m.error;
        const e = await sb.from("swing_events").upsert(rows.events.map((r) => ({ ...r, swing_id: sid })), { onConflict: "swing_id,event" });
        if (e.error) throw e.error;
        if (sw.tag?.direction || sw.tag?.type) {
          const t = await sb
            .from("spray_chart_events")
            .upsert({ swing_id: sid, player_id: rp, direction: sw.tag.direction ?? null, hit_type: sw.tag.type ?? null, source: "manual" }, { onConflict: "swing_id" });
          if (t.error) throw t.error;
        }
        await db.saveSwing({ ...sw, syncedAt: Date.now() });
        out.swings++;
      }
    }
  }
  if (out.swings) await sb.from("usage_records").insert({ user_id: user.id, kind: "swing", quantity: out.swings });
  return out;
}
