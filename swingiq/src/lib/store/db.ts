import { DEFAULT_SETTINGS, type Bat, type ClipRecord, type Player, type Session, type Settings, type SwingGoal, type SwingRecord } from "./types";

/**
 * On-device storage (IndexedDB). Everything a player records lives here first and works with no account.
 * When the player signs in, summaries sync to Supabase (see lib/sync.ts); clips stay on the phone unless backed up.
 */
const DB_NAME = "swingiq";
const VERSION = 1;

type StoreName = "players" | "sessions" | "swings" | "clips" | "bats" | "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("players", { keyPath: "id" });
      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("playerId", "playerId");
      const swings = db.createObjectStore("swings", { keyPath: "id" });
      swings.createIndex("sessionId", "sessionId");
      swings.createIndex("playerId", "playerId");
      db.createObjectStore("clips", { keyPath: "swingId" });
      const bats = db.createObjectStore("bats", { keyPath: "id" });
      bats.createIndex("playerId", "playerId");
      db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let result: T;
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

const getAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
const byIndex = <T>(store: StoreName, index: string, key: string) =>
  tx<T[]>(store, "readonly", (s) => s.index(index).getAll(key) as IDBRequest<T[]>);
const get = <T>(store: StoreName, key: string) => tx<T | undefined>(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
const put = <T>(store: StoreName, value: T) => tx<IDBValidKey>(store, "readwrite", (s) => s.put(value));
const del = (store: StoreName, key: string) => tx<undefined>(store, "readwrite", (s) => s.delete(key));

export function uid(): string {
  return crypto.randomUUID();
}

export const db = {
  // Players
  players: () => getAll<Player>("players").then((ps) => ps.sort((a, b) => a.createdAt - b.createdAt)),
  player: (id: string) => get<Player>("players", id),
  savePlayer: (p: Player) => put("players", p),
  async deletePlayer(id: string) {
    for (const s of await this.sessions(id)) await this.deleteSession(s.id);
    for (const b of await byIndex<Bat>("bats", "playerId", id)) await del("bats", b.id);
    await del("players", id);
  },

  // Bats
  bats: (playerId: string) => byIndex<Bat>("bats", "playerId", playerId).then((bs) => bs.sort((a, b) => a.createdAt - b.createdAt)),
  saveBat: (b: Bat) => put("bats", b),
  deleteBat: (id: string) => del("bats", id),

  // Sessions
  sessions: (playerId: string) => byIndex<Session>("sessions", "playerId", playerId).then((ss) => ss.sort((a, b) => b.startedAt - a.startedAt)),
  session: (id: string) => get<Session>("sessions", id),
  saveSession: (s: Session) => put("sessions", s),
  async deleteSession(id: string) {
    for (const sw of await this.swingsInSession(id)) await this.deleteSwing(sw.id);
    await del("sessions", id);
  },

  // Swings
  swingsInSession: (sessionId: string) => byIndex<SwingRecord>("swings", "sessionId", sessionId).then((xs) => xs.sort((a, b) => a.n - b.n)),
  swingsForPlayer: (playerId: string) => byIndex<SwingRecord>("swings", "playerId", playerId).then((xs) => xs.sort((a, b) => b.at - a.at)),
  swing: (id: string) => get<SwingRecord>("swings", id),
  saveSwing: (s: SwingRecord) => put("swings", s),
  async deleteSwing(id: string) {
    await del("clips", id);
    await del("swings", id);
  },

  // Clips
  clip: (swingId: string) => get<ClipRecord>("clips", swingId),
  saveClip: (c: ClipRecord) => put("clips", c),
  deleteClip: (swingId: string) => del("clips", swingId),

  // Swing goals ("500 swings this week"), one list per hitter, kept in the key-value store.
  goals: (playerId: string) => get<SwingGoal[]>("kv", `goals:${playerId}`).then((g) => g ?? []).catch(() => [] as SwingGoal[]),
  saveGoals: (playerId: string, goals: SwingGoal[]) => tx("kv", "readwrite", (s) => s.put(goals, `goals:${playerId}`)),

  // Settings
  async settings(): Promise<Settings> {
    const s = await get<Partial<Settings>>("kv", "settings" as string).catch(() => undefined);
    return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  },
  async saveSettings(patch: Partial<Settings>) {
    const cur = await this.settings();
    const next = { ...cur, ...patch };
    await tx("kv", "readwrite", (s) => s.put(next, "settings"));
    return next;
  },

  /** Deletes everything on this device. */
  async wipe() {
    const d = await open();
    d.close();
    dbPromise = null;
    await new Promise<void>((res, rej) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
      r.onblocked = () => res();
    });
  },

  /** Rough storage use, for the Profile screen. */
  async usage(): Promise<{ usedMB: number; quotaMB: number } | null> {
    if (!navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usedMB: (e.usage ?? 0) / 1e6, quotaMB: (e.quota ?? 0) / 1e6 };
  },
};

/** Rounds pose data before storing: 4 decimals is sub-pixel at phone resolutions and halves the size. */
export function compactPose<T extends { t: number; lm: { x: number; y: number; z: number; v: number }[] | null; world?: unknown }>(frames: T[]) {
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  return frames.map((f) => ({
    t: Math.round(f.t * 10) / 10,
    lm: f.lm ? f.lm.map((p) => ({ x: r(p.x), y: r(p.y), z: r(p.z), v: Math.round(p.v * 100) / 100 })) : null,
    world: Array.isArray(f.world)
      ? (f.world as { x: number; y: number; z: number; v: number }[]).map((p) => ({ x: r(p.x), y: r(p.y), z: r(p.z), v: Math.round(p.v * 100) / 100 }))
      : null,
  }));
}
