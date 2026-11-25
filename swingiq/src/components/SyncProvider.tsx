"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { cloudEnabled, supabase } from "@/lib/supabase/client";
import { CHANGED } from "@/lib/store/db";
import { syncAll, type SyncResult } from "@/lib/sync";
import { usePlayers } from "./PlayerProvider";

/**
 * Keeps a signed-in device in step with the player's account. Syncs when they sign in, when the app opens or comes
 * back to the front, when the connection returns, and a few seconds after anything is saved or deleted. Never during a
 * live session (the camera and the pose model get the phone to themselves); it catches up when the session ends.
 */
export const SYNCED = "gapper:synced";

type Status = "off" | "signed-out" | "idle" | "syncing" | "error";
type Ctx = {
  status: Status;
  user: User | null | undefined;
  lastSyncAt: number | null;
  last: SyncResult | null;
  error: string | null;
  syncNow: () => Promise<SyncResult | null>;
};

const SyncCtx = createContext<Ctx | null>(null);
const AFTER_SAVE_MS = 5000;
const MIN_GAP_MS = 30_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { refresh } = usePlayers();
  const path = usePathname();
  const [user, setUser] = useState<User | null | undefined>(cloudEnabled ? undefined : null);
  const [status, setStatus] = useState<Status>(cloudEnabled ? "signed-out" : "off");
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [last, setLast] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef<Promise<SyncResult | null> | null>(null);
  const again = useRef(false);
  const lastRun = useRef(0);
  const onLive = useRef(false);
  const signedIn = useRef(false);

  useEffect(() => {
    onLive.current = path === "/live";
  }, [path]);

  const syncNow = useCallback(async (): Promise<SyncResult | null> => {
    const sb = supabase();
    if (!sb) return null;
    if (running.current) {
      again.current = true;
      return running.current;
    }
    const run = (async () => {
      setStatus("syncing");
      try {
        let r: SyncResult;
        do {
          again.current = false;
          r = await syncAll(sb);
          if (r.pulled || r.removed) {
            await refresh();
            window.dispatchEvent(new Event(SYNCED));
          }
        } while (again.current);
        setLast(r);
        setLastSyncAt(Date.now());
        setError(null);
        setStatus("idle");
        return r;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync didn't finish.");
        setStatus("error");
        return null;
      } finally {
        lastRun.current = Date.now();
        running.current = null;
      }
    })();
    running.current = run;
    return run;
  }, [refresh]);

  /** Automatic syncs: skipped while signed out, during a live session, or right after the last one. */
  const auto = useCallback(
    (force = false) => {
      if (!signedIn.current || onLive.current) return;
      if (!force && Date.now() - lastRun.current < MIN_GAP_MS) return;
      void syncNow();
    },
    [syncNow],
  );

  // Who's signed in. The first event (INITIAL_SESSION) also covers "the app just opened".
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      signedIn.current = !!u;
      setUser(u);
      if (!u) {
        setStatus("signed-out");
        return;
      }
      setStatus((s) => (s === "signed-out" || s === "off" ? "idle" : s));
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setTimeout(() => auto(event === "INITIAL_SESSION"), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [auto]);

  // A few seconds after a save or delete, upload it.
  useEffect(() => {
    if (!cloudEnabled) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(() => auto(true), AFTER_SAVE_MS);
    };
    window.addEventListener(CHANGED, onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener(CHANGED, onChange);
    };
  }, [auto]);

  // Back to the front, back online, or out of a live session: catch up.
  useEffect(() => {
    if (!cloudEnabled) return;
    const onVisible = () => document.visibilityState === "visible" && auto();
    const onOnline = () => auto(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [auto]);
  useEffect(() => {
    if (path !== "/live") auto();
  }, [path, auto]);

  const value = useMemo(() => ({ status, user, lastSyncAt, last, error, syncNow }), [status, user, lastSyncAt, last, error, syncNow]);
  return <SyncCtx.Provider value={value}>{children}</SyncCtx.Provider>;
}

export function useSync() {
  const c = useContext(SyncCtx);
  if (!c) throw new Error("useSync must be used inside SyncProvider");
  return c;
}
