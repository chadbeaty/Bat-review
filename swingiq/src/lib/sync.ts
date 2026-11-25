"use client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricValue, SwingAnalysis } from "@/engine/types";
import { db } from "./store/db";
import type { Bat, Player, Session, SwingGoal, SwingRecord } from "./store/types";

/**
 * Two-way sync between this device and the player's account, so the same history shows up on every phone, tablet or
 * computer they sign in on.
 *
 * Push: hitters, bats, sessions and swings changed on this device (syncedAt null) go up with their full record in
 * `data`; a swing's tracked body points go to body_tracking once. Deletes go up as tombstones (soft deletes), so the
 * player's other devices remove the same thing. Video never leaves the phone that recorded it.
 *
 * Pull: everything of the player's that changed since this device last looked (by updated_at, one cursor per table)
 * comes down into IndexedDB. A record changed here and not yet uploaded wins over the cloud copy until it's pushed.
 *
 * Rows are keyed by the ids the devices generate (client_id), so running it twice never duplicates anything.
 */
export type SyncResult = { pushed: number; pulled: number; removed: number; foreign: boolean };

const ts = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString() : null);
const PAGE = 100;
/** Which account this device's records belong to. Another account signing in here only downloads its own. */
const OWNER_KEY = "cloud:owner";

// ------------------------------------------------------------------------------------------------- rows going up

/** The normalized rows (scores, metrics with their sources, phase events) the coach and progress views read. */
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
      note: sw.note?.slice(0, 1000) ?? null,
      data: swingData(sw),
      deleted_at: null,
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

/** A copy without the given keys. */
function omit<T extends object, K extends keyof T>(o: T, keys: K[]): Omit<T, K> {
  const out = { ...o };
  for (const k of keys) delete out[k];
  return out;
}

/** The swing record as another device needs it, minus what stays local (body points go separately, video never). */
export function swingData(sw: SwingRecord) {
  return omit(sw, ["pose", "syncedAt", "remoteId", "fromCloud", "clipFrames"]);
}
function playerData(p: Player, goals: SwingGoal[]) {
  return { ...omit(p, ["remoteId", "syncedAt"]), swingGoals: goals };
}
function batData(b: Bat) {
  return omit(b, ["photo", "remoteId", "syncedAt"]);
}
function sessionData(s: Session) {
  return omit(s, ["remoteId", "syncedAt"]);
}

/** Bat sizes outside the database's limits are kept on the device but sent as unknown. */
const within = (v: number | null, lo: number, hi: number) => (v !== null && v >= lo && v <= hi ? v : null);

async function one<T = unknown>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

// ------------------------------------------------------------------------------------------------------- push

async function pushTombstones(sb: SupabaseClient): Promise<number> {
  const stones = await db.tombstones();
  if (!stones.length) return 0;
  const now = new Date().toISOString();
  const done: string[] = [];
  for (const t of stones) {
    if (t.kind === "swing") {
      const rows = await one<{ id: string }[]>(sb.from("swing_analyses").update({ deleted_at: now, data: {} }).eq("client_id", t.id).select("id"));
      await dropSwingDetails(sb, rows.map((r) => r.id));
    } else if (t.kind === "session") {
      const rows = await one<{ id: string }[]>(sb.from("practice_sessions").update({ deleted_at: now, data: {} }).eq("client_id", t.id).select("id"));
      if (rows.length) {
        const swings = await one<{ id: string }[]>(
          sb.from("swing_analyses").update({ deleted_at: now, data: {} }).in("session_id", rows.map((r) => r.id)).select("id"),
        );
        await dropSwingDetails(sb, swings.map((r) => r.id));
      }
    } else if (t.kind === "bat") {
      await one(sb.from("player_bats").update({ deleted_at: now, data: {} }).eq("client_id", t.id).select("id"));
    } else {
      // The hitter stays as a tombstone so other devices remove it; everything under it is deleted for good.
      const rows = await one<{ id: string }[]>(sb.from("player_profiles").update({ deleted_at: now, data: {} }).eq("client_id", t.id).select("id"));
      for (const r of rows) {
        await one(sb.from("practice_sessions").delete().eq("player_id", r.id).select("id"));
        await one(sb.from("player_bats").delete().eq("player_id", r.id).select("id"));
      }
    }
    done.push(t.id);
  }
  await db.clearTombstones(done);
  return done.length;
}

async function dropSwingDetails(sb: SupabaseClient, swingIds: string[]) {
  if (!swingIds.length) return;
  for (const table of ["body_tracking", "swing_metrics", "swing_events", "spray_chart_events"]) {
    await one(sb.from(table).delete().in("swing_id", swingIds).select("swing_id"));
  }
}

async function pushPlayer(sb: SupabaseClient, userId: string, p: Player): Promise<string> {
  if (p.remoteId && p.syncedAt) return p.remoteId;
  const row = await one<{ id: string }>(
    sb
      .from("player_profiles")
      .upsert(
        { owner_id: userId, client_id: p.id, name: p.name.slice(0, 40), bats: p.hand, height_in: p.heightIn, data: playerData(p, await db.goals(p.id)), deleted_at: null },
        { onConflict: "owner_id,client_id" },
      )
      .select("id")
      .single(),
  );
  await db.savePlayer({ ...p, remoteId: row.id, syncedAt: Date.now() }, { fromSync: true });
  return row.id;
}

async function pushBat(sb: SupabaseClient, rp: string, b: Bat): Promise<string> {
  if (b.remoteId && b.syncedAt) return b.remoteId;
  const row = await one<{ id: string }>(
    sb
      .from("player_bats")
      .upsert(
        {
          player_id: rp,
          client_id: b.id,
          brand: b.brand.slice(0, 40) || "Bat",
          model: b.model.slice(0, 60) || "Unknown",
          length_in: within(b.lengthIn, 24, 36),
          weight_oz: within(b.weightOz, 18, 34),
          certification: b.certification?.slice(0, 30) || null,
          data: batData(b),
          deleted_at: null,
        },
        { onConflict: "player_id,client_id" },
      )
      .select("id")
      .single(),
  );
  await db.saveBat({ ...b, remoteId: row.id, syncedAt: Date.now() }, { fromSync: true });
  return row.id;
}

async function pushSession(sb: SupabaseClient, rp: string, s: Session): Promise<string> {
  if (s.remoteId && s.syncedAt) return s.remoteId;
  const bat = s.batId ? await db.bat(s.batId) : undefined;
  const clamp = (v: number | null) => (v === null ? null : Math.max(0, Math.min(100, Math.round(v))));
  const row = await one<{ id: string }>(
    sb
      .from("practice_sessions")
      .upsert(
        {
          player_id: rp,
          client_id: s.id,
          camera_view: s.view,
          started_at: ts(s.startedAt),
          ended_at: ts(s.endedAt),
          swing_count: s.swingCount,
          avg_score: clamp(s.avgScore),
          best_score: clamp(s.bestScore),
          camera_fps: s.cameraFps ? Math.round(s.cameraFps) : null,
          pose_fps: s.poseFps ? Math.round(s.poseFps) : null,
          bat_id: bat?.remoteId ?? null,
          notes: s.notes?.slice(0, 2000) || null,
          data: sessionData(s),
          deleted_at: null,
        },
        { onConflict: "player_id,client_id" },
      )
      .select("id")
      .single(),
  );
  await db.saveSession({ ...s, remoteId: row.id, syncedAt: Date.now() }, { fromSync: true });
  return row.id;
}

async function pushSwing(sb: SupabaseClient, rs: string, rp: string, sw: SwingRecord) {
  const first = !sw.remoteId;
  const rows = swingRows(sw, rs, rp);
  const row = await one<{ id: string }>(sb.from("swing_analyses").upsert(rows.swing, { onConflict: "player_id,client_id" }).select("id").single());
  const sid = row.id;
  if (first) {
    if (rows.metrics.length) await one(sb.from("swing_metrics").upsert(rows.metrics.map((r) => ({ ...r, swing_id: sid })), { onConflict: "swing_id,metric_key" }).select("swing_id"));
    if (rows.events.length) await one(sb.from("swing_events").upsert(rows.events.map((r) => ({ ...r, swing_id: sid })), { onConflict: "swing_id,event" }).select("id"));
    // The tracked body points, so the other device can replay the swing (skipped if a long clip is unusually big).
    if (sw.pose?.length && JSON.stringify(sw.pose).length < 900_000) {
      await one(sb.from("body_tracking").upsert({ swing_id: sid, fps: sw.analysis.quality.poseFps || null, frames: sw.pose }, { onConflict: "swing_id" }).select("swing_id"));
    }
  }
  if (sw.tag?.direction || sw.tag?.type) {
    await one(
      sb
        .from("spray_chart_events")
        .upsert({ swing_id: sid, player_id: rp, direction: sw.tag.direction ?? null, hit_type: sw.tag.type ?? null, source: "manual" }, { onConflict: "swing_id" })
        .select("swing_id"),
    );
  } else if (!first) {
    await one(sb.from("spray_chart_events").delete().eq("swing_id", sid).select("swing_id"));
  }
  await db.saveSwing({ ...sw, remoteId: sid, syncedAt: Date.now() }, { fromSync: true });
}

async function push(sb: SupabaseClient, userId: string): Promise<number> {
  let n = await pushTombstones(sb);
  for (const p of await db.players()) {
    const dirtyPlayer = !p.remoteId || !p.syncedAt;
    const rp = await pushPlayer(sb, userId, p);
    if (dirtyPlayer) n++;
    for (const b of await db.bats(p.id)) {
      if (!b.remoteId || !b.syncedAt) {
        await pushBat(sb, rp, b);
        n++;
      }
    }
    for (const s of await db.sessions(p.id)) {
      const swings = await db.swingsInSession(s.id);
      if (!swings.length && s.swingCount === 0) continue;
      const pending = swings.filter((sw) => !sw.remoteId || !sw.syncedAt);
      if (!pending.length && s.remoteId && s.syncedAt) continue;
      const rs = await pushSession(sb, rp, s);
      for (const sw of pending) {
        await pushSwing(sb, rs, rp, sw);
        n++;
      }
    }
  }
  return n;
}

// ------------------------------------------------------------------------------------------------------- pull

type Remote = { id: string; client_id: string; data: Record<string, unknown>; deleted_at: string | null; updated_at: string };

/** Everything in `table` changed after this device's cursor, page by page; moves the cursor as it goes. */
async function changedSince<T extends Remote>(
  sb: SupabaseClient,
  userId: string,
  table: string,
  columns: string,
  scope: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]>,
  apply: (rows: T[]) => Promise<void>,
) {
  const key = `cloud:pull:${userId}:${table}`;
  let since = (await db.kvGet<string>(key)) ?? "1970-01-01T00:00:00Z";
  for (;;) {
    const rows = await one<T[]>(scope(sb.from(table).select(columns)).gt("updated_at", since).order("updated_at", { ascending: true }).limit(PAGE));
    if (!rows.length) break;
    await apply(rows);
    since = rows[rows.length - 1].updated_at;
    await db.kvSet(key, since);
    if (rows.length < PAGE) break;
  }
}

async function pull(sb: SupabaseClient, userId: string): Promise<{ pulled: number; removed: number }> {
  let pulled = 0;
  let removed = 0;
  const now = Date.now();

  type PlayerRow = Remote & { name: string; bats: "R" | "L"; height_in: number; created_at: string };
  await changedSince<PlayerRow>(sb, userId, "player_profiles", "id, client_id, name, bats, height_in, data, deleted_at, updated_at, created_at", (q) => q.eq("owner_id", userId), async (rows) => {
    for (const r of rows) {
      const local = await db.player(r.client_id);
      if (r.deleted_at) {
        if (local) {
          await db.deletePlayer(r.client_id, { fromSync: true });
          removed++;
        }
        continue;
      }
      if (local && !local.syncedAt) continue; // changed here and not uploaded yet: this device's copy wins
      const { swingGoals, ...data } = r.data as Partial<Player> & { swingGoals?: SwingGoal[] };
      await db.savePlayer(
        {
          ...data,
          id: r.client_id,
          name: r.name,
          hand: r.bats,
          heightIn: Number(r.height_in),
          createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.parse(r.created_at),
          remoteId: r.id,
          syncedAt: now,
        },
        { fromSync: true },
      );
      if (Array.isArray(swingGoals)) await db.saveGoals(r.client_id, swingGoals, { fromSync: true });
      pulled++;
    }
  });

  // Everything else hangs off the player's own hitters (never a team member's).
  const mine = await one<{ id: string; client_id: string }[]>(sb.from("player_profiles").select("id, client_id").eq("owner_id", userId).is("deleted_at", null));
  if (!mine.length) return { pulled, removed };
  const ids = mine.map((m) => m.id);
  const localPlayer = new Map(mine.map((m) => [m.id, m.client_id]));
  const inMine = (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => q.in("player_id", ids);

  type ChildRow = Remote & { player_id: string };
  await changedSince<ChildRow>(sb, userId, "player_bats", "id, client_id, player_id, data, deleted_at, updated_at", inMine, async (rows) => {
    for (const r of rows) {
      const local = await db.bat(r.client_id);
      if (r.deleted_at) {
        if (local) {
          await db.deleteBat(r.client_id, { fromSync: true });
          removed++;
        }
        continue;
      }
      if (local && !local.syncedAt) continue;
      const data = r.data as Partial<Bat>;
      await db.saveBat(
        {
          brand: "",
          model: "",
          lengthIn: null,
          weightOz: null,
          certification: "",
          createdAt: now,
          ...data,
          id: r.client_id,
          playerId: localPlayer.get(r.player_id) ?? data.playerId ?? "",
          photo: local?.photo ?? null,
          remoteId: r.id,
          syncedAt: now,
        },
        { fromSync: true },
      );
      pulled++;
    }
  });

  await changedSince<ChildRow>(sb, userId, "practice_sessions", "id, client_id, player_id, data, deleted_at, updated_at", inMine, async (rows) => {
    for (const r of rows) {
      const local = await db.session(r.client_id);
      if (r.deleted_at) {
        if (local) {
          await db.deleteSession(r.client_id, { fromSync: true });
          removed++;
        }
        continue;
      }
      if (local && !local.syncedAt) continue;
      const data = r.data as Partial<Session>;
      if (!data.startedAt) continue; // an older backup without the full record: nothing to rebuild from
      await db.saveSession({ ...(data as Session), id: r.client_id, playerId: localPlayer.get(r.player_id) ?? data.playerId!, remoteId: r.id, syncedAt: now }, { fromSync: true });
      pulled++;
    }
  });

  await changedSince<ChildRow>(sb, userId, "swing_analyses", "id, client_id, player_id, data, deleted_at, updated_at", inMine, async (rows) => {
    const fresh: { r: ChildRow; data: Partial<SwingRecord> }[] = [];
    for (const r of rows) {
      const local = await db.swing(r.client_id);
      if (r.deleted_at) {
        if (local) {
          await db.deleteSwing(r.client_id, { fromSync: true });
          removed++;
        }
        continue;
      }
      if (local && !local.syncedAt) continue;
      const data = r.data as Partial<SwingRecord>;
      if (!data.analysis) continue;
      if (local) {
        await db.saveSwing({ ...(data as SwingRecord), id: r.client_id, playerId: local.playerId, pose: local.pose, clipFrames: local.clipFrames, fromCloud: local.fromCloud, remoteId: r.id, syncedAt: now }, { fromSync: true });
        pulled++;
      } else fresh.push({ r, data });
    }
    // New to this device: bring the tracked body points too, so the swing replays as a skeleton.
    const frames = new Map<string, SwingRecord["pose"]>();
    if (fresh.length) {
      const body = await one<{ swing_id: string; frames: SwingRecord["pose"] }[]>(sb.from("body_tracking").select("swing_id, frames").in("swing_id", fresh.map((f) => f.r.id)));
      for (const b of body) frames.set(b.swing_id, b.frames);
    }
    for (const { r, data } of fresh) {
      await db.saveSwing(
        {
          ...(data as SwingRecord),
          id: r.client_id,
          playerId: localPlayer.get(r.player_id) ?? data.playerId!,
          pose: frames.get(r.id) ?? [],
          clipFrames: 0,
          fromCloud: true,
          remoteId: r.id,
          syncedAt: now,
        },
        { fromSync: true },
      );
      pulled++;
    }
  });

  return { pulled, removed };
}

// ------------------------------------------------------------------------------------------------------- both

/**
 * One full sync: deletes and changes up, then everything new down. If this device's records already belong to a
 * different account (someone else signed in here before), nothing is uploaded: the new account only downloads its own.
 */
export async function syncAll(sb: SupabaseClient): Promise<SyncResult> {
  const { data: auth } = await sb.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("Sign in first.");
  const owner = await db.kvGet<string>(OWNER_KEY);
  const foreign = !!owner && owner !== user.id;
  let pushed = 0;
  if (!foreign) {
    if (!owner) await db.kvSet(OWNER_KEY, user.id);
    pushed = await push(sb, user.id);
  }
  const { pulled, removed } = await pull(sb, user.id);
  if (pushed) await sb.from("usage_records").insert({ user_id: user.id, kind: "swing", quantity: pushed });
  return { pushed, pulled, removed, foreign };
}

/**
 * After the account is deleted: this device's records no longer belong to any account, so a future sign-in uploads
 * them fresh (every record is marked changed and loses its cloud id).
 */
export async function forgetCloud(userId: string) {
  await db.kvSet(OWNER_KEY, null);
  for (const table of ["player_profiles", "player_bats", "practice_sessions", "swing_analyses"]) await db.kvSet(`cloud:pull:${userId}:${table}`, null);
  await db.clearTombstones((await db.tombstones()).map((t) => t.id));
  for (const p of await db.players()) {
    await db.savePlayer({ ...p, remoteId: null, syncedAt: null }, { fromSync: true });
    for (const b of await db.bats(p.id)) await db.saveBat({ ...b, remoteId: null, syncedAt: null }, { fromSync: true });
    for (const s of await db.sessions(p.id)) {
      await db.saveSession({ ...s, remoteId: null, syncedAt: null }, { fromSync: true });
      for (const sw of await db.swingsInSession(s.id)) await db.saveSwing({ ...sw, remoteId: null, syncedAt: null }, { fromSync: true });
    }
  }
}
