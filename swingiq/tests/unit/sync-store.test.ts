import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/store/db";
import { swingData } from "@/lib/sync";
import type { Player, Session, SwingRecord } from "@/lib/store/types";

// The on-device half of sync: what counts as "changed since the last upload", and deletes that must reach the
// player's other devices.
const player: Player = { id: "p1", name: "Ann", hand: "R", heightIn: 68, createdAt: 1 };
const session: Session = { id: "s1", playerId: "p1", view: "side", startedAt: 1, endedAt: 2, swingCount: 1, bestScore: 70, avgScore: 70, cameraFps: 30, poseFps: 30, batId: null, notes: "" };
const swing = {
  id: "w1",
  sessionId: "s1",
  playerId: "p1",
  n: 1,
  at: 1,
  view: "side",
  hand: "R",
  analysis: { cue: { id: "x", text: "t" } },
  pose: [{ t: 0, lm: null }],
  frameSize: { width: 640, height: 360 },
  clipFrames: 40,
} as unknown as SwingRecord;

describe("sync bookkeeping on the device", () => {
  it("a save from the app marks the record changed; a save from the sync doesn't", async () => {
    await db.savePlayer({ ...player, syncedAt: 5, remoteId: "r1" });
    expect((await db.player("p1"))?.syncedAt).toBeNull();
    await db.savePlayer({ ...player, syncedAt: 5, remoteId: "r1" }, { fromSync: true });
    expect((await db.player("p1"))?.syncedAt).toBe(5);
  });

  it("saving swing goals marks their hitter changed, so the goals sync with it", async () => {
    await db.savePlayer({ ...player, syncedAt: 5 }, { fromSync: true });
    await db.saveGoals("p1", []);
    expect((await db.player("p1"))?.syncedAt).toBeNull();
  });

  it("deleting a swing leaves a tombstone for the other devices; a delete that came from the cloud doesn't", async () => {
    await db.saveSession(session);
    await db.saveSwing(swing);
    await db.deleteSwing("w1");
    expect((await db.tombstones()).map((t) => [t.kind, t.id])).toEqual([["swing", "w1"]]);
    await db.clearTombstones(["w1"]);
    await db.saveSwing(swing);
    await db.deleteSwing("w1", { fromSync: true });
    expect(await db.tombstones()).toEqual([]);
  });

  it("deleting a hitter leaves one tombstone that covers everything under it", async () => {
    await db.saveSession(session);
    await db.saveSwing(swing);
    await db.deletePlayer("p1");
    expect((await db.tombstones()).map((t) => [t.kind, t.id])).toEqual([["player", "p1"]]);
    expect(await db.swing("w1")).toBeUndefined();
    expect(await db.session("s1")).toBeUndefined();
  });

  it("the cloud copy of a swing leaves out its body points (sent once, separately) and anything only this device has", () => {
    const d = swingData({ ...swing, syncedAt: 9, remoteId: "r", fromCloud: true });
    expect(d).not.toHaveProperty("pose");
    expect(d).not.toHaveProperty("clipFrames");
    expect(d).not.toHaveProperty("syncedAt");
    expect(d).not.toHaveProperty("remoteId");
    expect(d).not.toHaveProperty("fromCloud");
    expect(d).toMatchObject({ id: "w1", sessionId: "s1", playerId: "p1", n: 1 });
  });
});
