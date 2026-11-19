import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb, canConnect } from "./harness";

const reachable = await canConnect();
const d = reachable ? describe : describe.skip;

d("Gapper schema and Row Level Security", () => {
  const db = new TestDb();
  let a: { id: string };
  let b: { id: string };
  let coach: { id: string };
  let playerA: string;
  let sessionA: string;
  let swingA: string;

  beforeAll(async () => {
    await db.setup();
    a = await db.createUser();
    b = await db.createUser();
    coach = await db.createUser();
    const [p] = await db.as<{ id: string }>(a, "insert into player_profiles (owner_id, client_id, name, bats, height_in) values ($1, $2, 'Ann', 'R', 68) returning id", [a.id, randomUUID()]);
    playerA = p.id;
    const [s] = await db.as<{ id: string }>(a, "insert into practice_sessions (player_id, client_id, camera_view, started_at) values ($1, $2, 'side', now()) returning id", [playerA, randomUUID()]);
    sessionA = s.id;
    const [sw] = await db.as<{ id: string }>(
      a,
      "insert into swing_analyses (session_id, player_id, client_id, swing_number, recorded_at, camera_view, overall_score) values ($1, $2, $3, 1, now(), 'side', 78) returning id",
      [sessionA, playerA, randomUUID()],
    );
    swingA = sw.id;
    await db.as(a, "insert into swing_metrics (swing_id, metric_key, value, source, confidence) values ($1, 'headMovement', 3.2, 'cv_estimated', 0.7)", [swingA]);
  });

  afterAll(async () => {
    await db.teardown();
  });

  it("signup creates a users row and a free subscription", async () => {
    const [u] = await db.as<{ role: string }>(a, "select role from users where id = $1", [a.id]);
    expect(u.role).toBe("player");
    const [s] = await db.as<{ plan: string }>(a, "select plan from subscriptions where user_id = $1", [a.id]);
    expect(s.plan).toBe("free");
  });

  it("owners see their own data; other users and visitors see none of it", async () => {
    expect(await db.as(a, "select id from swing_analyses")).toHaveLength(1);
    expect(await db.as(b, "select id from player_profiles")).toHaveLength(0);
    expect(await db.as(b, "select id from practice_sessions")).toHaveLength(0);
    expect(await db.as(b, "select swing_id from swing_metrics")).toHaveLength(0);
    await expect(db.as("anon", "select id from swing_analyses")).rejects.toThrow(/permission denied/);
  });

  it("can't write into someone else's hitter", async () => {
    await expect(
      db.as(b, "insert into practice_sessions (player_id, client_id, camera_view, started_at) values ($1, $2, 'side', now())", [playerA, randomUUID()]),
    ).rejects.toThrow(/row-level security/);
    await expect(db.as(b, "insert into swing_metrics (swing_id, metric_key, value, source) values ($1, 'balance', 50, 'cv_estimated')", [swingA])).rejects.toThrow(/row-level security/);
    const upd = await db.as(b, "update player_profiles set name = 'Hacked' where id = $1 returning id", [playerA]);
    expect(upd).toHaveLength(0);
  });

  it("a swing must belong to a session of the same hitter", async () => {
    const [p2] = await db.as<{ id: string }>(a, "insert into player_profiles (owner_id, client_id, name, bats, height_in) values ($1, $2, 'Kid', 'L', 60) returning id", [a.id, randomUUID()]);
    await expect(
      db.as(a, "insert into swing_analyses (session_id, player_id, client_id, swing_number, recorded_at, camera_view) values ($1, $2, $3, 1, now(), 'side')", [sessionA, p2.id, randomUUID()]),
    ).rejects.toThrow(/row-level security/);
  });

  it("users can't change their own role or their subscription", async () => {
    await expect(db.as(a, "update users set role = 'admin' where id = $1", [a.id])).rejects.toThrow(/server/);
    const upd = await db.as(a, "update subscriptions set plan = 'elite' where user_id = $1 returning plan", [a.id]);
    expect(upd).toHaveLength(0);
  });

  it("coaches can read hitters on their team, but can't change them", async () => {
    const [team] = await db.as<{ id: string }>(coach, "insert into teams (owner_id, name) values ($1, 'Thursday Night') returning id", [coach.id]);
    await db.as(coach, "insert into team_members (team_id, user_id, role) values ($1, $2, 'coach')", [team.id, coach.id]);
    // The coach can't attach somebody else's hitter...
    await expect(
      db.as(coach, "insert into team_members (team_id, user_id, role, player_profile_id) values ($1, $2, 'player', $3)", [team.id, a.id, playerA]),
    ).rejects.toThrow(/row-level security/);
    // ...they invite the player, and the player links their own hitter.
    await db.as(coach, "insert into team_members (team_id, user_id, role) values ($1, $2, 'player')", [team.id, a.id]);
    expect(await db.as(coach, "select id from practice_sessions")).toHaveLength(0);
    await db.as(a, "update team_members set player_profile_id = $1 where team_id = $2 and user_id = $3", [playerA, team.id, a.id]);
    expect(await db.as(coach, "select id from practice_sessions where player_id = $1", [playerA])).toHaveLength(1);
    expect(await db.as(coach, "select swing_id from swing_metrics")).toHaveLength(1);
    const upd = await db.as(coach, "update swing_analyses set overall_score = 100 where id = $1 returning id", [swingA]);
    expect(upd).toHaveLength(0);
    // Another user still sees nothing.
    expect(await db.as(b, "select id from practice_sessions")).toHaveLength(0);
  });

  it("rolls metrics up into daily history", async () => {
    await db.as(a, "insert into swing_metrics (swing_id, metric_key, value, source, confidence) values ($1, 'balance', 82, 'cv_estimated', 0.6)", [swingA]);
    const rows = await db.as<{ metric_key: string; n: number; sum: number }>(a, "select metric_key, n, sum from metric_history where player_id = $1 order by metric_key", [playerA]);
    expect(rows.map((r) => r.metric_key)).toEqual(["balance", "headMovement"]);
    expect(Number(rows[0].sum)).toBe(82);
  });

  it("refuses a number on an unavailable metric", async () => {
    await expect(db.as(a, "insert into swing_metrics (swing_id, metric_key, value, source) values ($1, 'batSpeed', 60, 'unavailable')", [swingA])).rejects.toThrow(/check constraint/);
    await db.as(a, "insert into swing_metrics (swing_id, metric_key, value, source, reason) values ($1, 'batSpeed', null, 'unavailable', 'needs bat tracking')", [swingA]);
  });

  it("clip storage is private to each user's folder", async () => {
    await db.as(a, "insert into storage.objects (bucket_id, name) values ('swing-clips', $1)", [`${a.id}/${swingA}/clip.mp4`]);
    await expect(db.as(b, "insert into storage.objects (bucket_id, name) values ('swing-clips', $1)", [`${a.id}/x/clip.mp4`])).rejects.toThrow(/row-level security/);
    expect(await db.as(b, "select id from storage.objects")).toHaveLength(0);
    expect(await db.as(a, "select id from storage.objects")).toHaveLength(1);
  });

  it("owners can queue analysis jobs but only the server runs them", async () => {
    await db.as(a, "insert into analysis_jobs (swing_id, kind) values ($1, 'deep_pose')", [swingA]);
    await expect(db.as(a, "insert into analysis_jobs (swing_id, kind, status) values ($1, 'deep_pose', 'done')", [swingA])).rejects.toThrow(/row-level security/);
    expect(await db.as(a, "update analysis_jobs set status = 'done' returning id")).toHaveLength(0);
    await expect(db.as(a, "select claim_analysis_job('deep_pose')")).rejects.toThrow(/permission denied/);
    const [job] = await db.as<{ claim_analysis_job: string }>("service", "select (claim_analysis_job('deep_pose')).status as claim_analysis_job");
    expect(job.claim_analysis_job).toBe("running");
  });

  it("deleting a hitter removes everything under it", async () => {
    await db.as(a, "delete from player_profiles where id = $1", [playerA]);
    expect(await db.owner("select id from swing_analyses where id = $1", [swingA])).toHaveLength(0);
    expect(await db.owner("select * from swing_metrics where swing_id = $1", [swingA])).toHaveLength(0);
  });

  it("the drill library is public", async () => {
    const rows = await db.as("anon", "select slug from practice_drills");
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });
});
