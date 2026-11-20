"use client";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { JustHitHome } from "@/components/justhit/JustHitHome";
import { usePlayers } from "@/components/PlayerProvider";
import { Setup } from "@/components/Setup";
import { PageSkeleton } from "@/components/ui";
import { setHitterCookie } from "@/lib/hitterCookie";
import type { Player } from "@/lib/store/types";

/**
 * Where the scroll site's "Start swinging" lands: the Just Hit home (one big button to the camera, a small one to the
 * full setup). "?setup=full" is the full setup, also how a Just Hit guest fills in their whole profile (same hitter,
 * so their swings stay). A hitter who already exists goes straight to the app.
 */
export function StartClient() {
  const { ready, player, storageOk, savePlayer, updateSettings } = usePlayers();
  const full = useSearchParams().get("setup") === "full";
  const upgrading = full && !!player?.guest;

  useEffect(() => {
    if (!ready || !player || upgrading) return;
    setHitterCookie(true);
    // A full navigation, so "/" is fetched again with the cookie and serves the app instead of the site.
    window.location.replace("/");
  }, [ready, player, upgrading]);

  if (!ready || (player && !upgrading)) return <PageSkeleton />;
  if (!full) return <JustHitHome secondary="setup" />;

  const onSave = async (p: Player) => {
    await savePlayer(p);
    // Chose the full setup: open on the full app.
    await updateSettings({ appMode: "full" });
    setHitterCookie(true);
    window.location.replace("/");
  };
  return <Setup onSave={onSave} storageOk={storageOk} initial={upgrading && player ? { ...player, name: "" } : null} />;
}
