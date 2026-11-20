"use client";
import Link from "next/link";
import { useEffect } from "react";
import { LockupH } from "../Logo";
import { usePlayers } from "../PlayerProvider";
import { Softball } from "../Softball";
import { loadPose } from "@/live/pose";

/**
 * Just Hit home: one big button straight to the camera, and a small way into the full setup. The fast lane in front
 * of the app; nothing behind it changes. While the hitter reads the button, the body tracker loads, so the camera is
 * ready by the time they've propped up the phone.
 */
export function JustHitHome({ secondary }: { secondary: "setup" | "full-app" }) {
  const { player, settings, updateSettings } = usePlayers();

  useEffect(() => {
    const warm = () => loadPose(settings.modelQuality).catch(() => {});
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(warm);
    else setTimeout(warm, 300);
  }, [settings.modelQuality]);

  return (
    <div className="turf flex min-h-dvh flex-col overflow-x-clip px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-[30rem] items-center justify-between">
        <LockupH height={26} />
        {player && (
          <Link href="/swings" className="rounded-lg px-2 py-2 text-[14px] text-chalk-2 hover:text-chalk">
            My swings
          </Link>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[30rem] flex-1 flex-col justify-center py-10">
        <Link
          href="/hit"
          className="cut press group flex aspect-[5/4] w-full flex-col justify-between rounded-[1.6rem] bg-optic p-6 text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-optic-2"
          style={{ ["--cut" as string]: "34px" }}
        >
          <Softball size={56} className="drop-shadow-[0_6px_10px_rgb(16_24_39/0.25)]" />
          <span>
            <span className="display slant block text-[3.4rem] leading-[0.9]">Just Hit</span>
            <span className="mt-3 block text-[15px] font-semibold opacity-75">No sign-up. The camera opens now.</span>
          </span>
        </Link>
        <p className="mt-5 text-center text-[14px] text-chalk-3">Side view, about 10 feet back. One swing, one fix.</p>
      </div>

      <div className="mx-auto w-full max-w-[30rem]">
        {secondary === "setup" ? (
          <Link href="/start?setup=full" className="press flex min-h-12 items-center justify-center rounded-xl border border-line-2 text-[15px] text-chalk hover:border-chalk-3 hover:bg-night-3">
            Full setup
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => updateSettings({ appMode: "full" })}
            className="press flex min-h-12 w-full items-center justify-center rounded-xl border border-line-2 text-[15px] text-chalk hover:border-chalk-3 hover:bg-night-3"
          >
            Full app
          </button>
        )}
      </div>
    </div>
  );
}
