"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setHitterCookie } from "@/lib/hitterCookie";
import { db } from "@/lib/store/db";
import { DEFAULT_SETTINGS, type Player, type Settings } from "@/lib/store/types";

type Ctx = {
  ready: boolean;
  /** False when this browser can't store data (private mode on some browsers). */
  storageOk: boolean;
  players: Player[];
  player: Player | null;
  settings: Settings;
  savePlayer: (p: Player) => Promise<void>;
  removePlayer: (id: string) => Promise<void>;
  setActive: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  refresh: () => Promise<void>;
};

const PlayerCtx = createContext<Ctx | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const refresh = useCallback(async () => {
    try {
      const [ps, s] = await Promise.all([db.players(), db.settings()]);
      setPlayers(ps);
      setSettings(s);
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Initial load from IndexedDB; setState happens after the async read resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Ask the browser not to evict swing data under storage pressure.
    navigator.storage?.persist?.().catch(() => {});
  }, [refresh]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await db.saveSettings(patch));
  }, []);

  const savePlayer = useCallback(
    async (p: Player) => {
      await db.savePlayer(p);
      const s = await db.settings();
      if (!s.activePlayerId) await db.saveSettings({ activePlayerId: p.id });
      await refresh();
    },
    [refresh],
  );

  const removePlayer = useCallback(
    async (id: string) => {
      await db.deletePlayer(id);
      const s = await db.settings();
      if (s.activePlayerId === id) {
        const rest = (await db.players()).filter((p) => p.id !== id);
        await db.saveSettings({ activePlayerId: rest[0]?.id ?? null });
      }
      await refresh();
    },
    [refresh],
  );

  const setActive = useCallback(async (id: string) => updateSettings({ activePlayerId: id }), [updateSettings]);

  const player = useMemo(
    () => players.find((p) => p.id === settings.activePlayerId) ?? players[0] ?? null,
    [players, settings.activePlayerId],
  );

  // Keep the "has a hitter" cookie in step with the device, so "/" serves the app to hitters and the site to everyone else.
  useEffect(() => {
    if (ready && storageOk) setHitterCookie(players.length > 0);
  }, [ready, storageOk, players.length]);

  const value = useMemo(
    () => ({ ready, storageOk, players, player, settings, savePlayer, removePlayer, setActive, updateSettings, refresh }),
    [ready, storageOk, players, player, settings, savePlayer, removePlayer, setActive, updateSettings, refresh],
  );
  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export function usePlayers() {
  const c = useContext(PlayerCtx);
  if (!c) throw new Error("usePlayers must be used inside PlayerProvider");
  return c;
}
