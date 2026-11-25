import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

// Sign in on more than one device: full records in `data`, soft deletes, incremental pulls by updated_at, and
// "delete my account" without the server's secret key.
const reachable = await canConnect();
const d = reachable ? describe : describe.skip;

d("Cloud sync across devices", () => {
  const db = new TestDb();
  let a: { id: string };
  let b: { id: string };
  let player: string;
  let session: string;
  let swing: string;
  const swingClient = randomUUID();

  beforeAll(async () => {
    await db.setup();
    a = await db.createUser();
    b = await db.createUser();
    const [p] = await db.as<{ id: string }>(
      a,
      "insert into player_profiles (owner_id, client_id, name, bats, height_in, data) values ($1, $2, 'Ann', 'R', 68, $3) returning id",
      [a.id, randomUUID(), { level: "tournament", positions: ["SS"] }],
    );
    player = p.id;
    const [s] = await db.as<{ id: string }>(
      a,
      "insert into practice_sessions (player_id, client_id, camera_view, started_at, data) values ($1, $2, 'side', now(), $3) returning id",
      [player, randomUUID(), { kind: "video" }],
    );
    session = s.id;
    const [sw] = await db.as<{ id: string }>(
      a,
      "insert into swing_analyses (session_id, player_id, client_id, swing_number, recorded_at, camera_view, data) values ($1, $2, $3, 1, now(), 'side', $4) returning id",
      [session, player, swingClient, { n: 1, analysis: { cue: { id: "handDrop" } } }],
    );
    swing = sw.id;
    await db.as(a, "insert into body_tracking (swing_id, frames) values ($1, $2)", [swing, JSON.stringify([{ t: 0, lm: null }])]);
  });

  afterAll(async () => {
    await db.teardown();
  });

  it("keeps the full on-device record so another device can rebuild it", async () => {
    const [row] = await db.as<{ data: { analysis: { cue: { id: string } } } }>(a, "select data from swing_analyses where client_id = $1", [swingClient]);
    expect(row.data.analysis.cue.id).toBe("handDrop");
    const [p] = await db.as<{ data: { level: string } }>(a, "select data from player_profiles where id = $1", [player]);
    expect(p.data.level).toBe("tournament");
    expect(await db.as(a, "select swing_id from body_tracking where swing_id = $1", [swing])).toHaveLength(1);
  });

  it("other users can't read or change it", async () => {
    expect(await db.as(b, "select data from swing_analyses")).toHaveLength(0);
    expect(await db.as(b, "select frames from body_tracking")).toHaveLength(0);
    expect(await db.as(b, "update swing_analyses set deleted_at = now() where client_id = $1 returning id", [swingClient])).toHaveLength(0);
  });

  it("every write moves updated_at, so a pull since the last sync finds it", async () => {
    const [before] = await db.as<{ updated_at: Date }>(a, "select updated_at from swing_analyses where id = $1", [swing]);
    await db.owner("select pg_sleep(0.01)");
    await db.as(a, "update swing_analyses set note = 'felt good' where id = $1", [swing]);
    const changed = await db.as(a, "select id from swing_analyses where player_id = $1 and updated_at > $2", [player, before.updated_at]);
    expect(changed).toHaveLength(1);
  });

  it("a delete on one device is a soft delete the others can see", async () => {
    const [row] = await db.as<{ deleted_at: Date | null }>(
      a,
      "update swing_analyses set deleted_at = now(), data = '{}'::jsonb where client_id = $1 returning deleted_at",
      [swingClient],
    );
    expect(row.deleted_at).not.toBeNull();
    const [seen] = await db.as<{ deleted_at: Date | null }>(a, "select deleted_at from swing_analyses where client_id = $1", [swingClient]);
    expect(seen.deleted_at).not.toBeNull();
  });

  it("refuses an oversized record", async () => {
    // Random digits don't compress, so this is well past the 16 KB session limit even after Postgres compresses it.
    const big = { pad: Array.from({ length: 4000 }, () => Math.random()).join() };
    await expect(db.as(a, "update practice_sessions set data = $1 where id = $2", [JSON.stringify(big), session])).rejects.toThrow(/practice_sessions_data_size/);
  });

  it("visitors can't delete an account; a signed-in player deletes only their own, with everything under it", async () => {
    await expect(db.as("anon", "select delete_my_account()")).rejects.toThrow(/permission denied/);
    await db.as(b, "select delete_my_account()");
    expect(await db.owner("select id from auth.users where id = $1", [b.id])).toHaveLength(0);
    expect(await db.owner("select id from auth.users where id = $1", [a.id])).toHaveLength(1);
    await db.as(a, "select delete_my_account()");
    expect(await db.owner("select id from auth.users where id = $1", [a.id])).toHaveLength(0);
    expect(await db.owner("select id from player_profiles where id = $1", [player])).toHaveLength(0);
    expect(await db.owner("select swing_id from body_tracking where swing_id = $1", [swing])).toHaveLength(0);
  });
});
