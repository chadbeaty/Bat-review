"use client";
import { useEffect } from "react";
import { usePlayers } from "@/components/PlayerProvider";
import { Setup } from "@/components/Setup";
import { PageSkeleton } from "@/components/ui";
import { setHitterCookie } from "@/lib/hitterCookie";
import type { Player } from "@/lib/store/types";

/** Where the scroll site's "Start swinging" lands. A hitter who already exists goes straight to the app. */
export function StartClient() {
  const { ready, player, storageOk, savePlayer } = usePlayers();

  useEffect(() => {
    if (!ready || !player) return;
    setHitterCookie(true);
    // A full navigation, so "/" is fetched again with the cookie and serves the app instead of the site.
    window.location.replace("/");
  }, [ready, player]);

  if (!ready || player) return <PageSkeleton />;

  const onSave = async (p: Player) => {
    await savePlayer(p);
    setHitterCookie(true);
    window.location.replace("/");
  };
  return <Setup onSave={onSave} storageOk={storageOk} />;
}
