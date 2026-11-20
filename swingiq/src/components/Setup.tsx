"use client";
import Link from "next/link";
import type { Player } from "@/lib/store/types";
import { SITE } from "@/brand/site";
import { SportTag } from "./brand";
import { LockupH } from "./Logo";
import { PlayerForm } from "./PlayerForm";

/** First-run setup: the only screen between the scroll site and the app. No app chrome; it owns the viewport. */
export function Setup({ onSave, storageOk }: { onSave: (p: Player) => Promise<void> | void; storageOk: boolean }) {
  return (
    <div className="turf min-h-dvh overflow-x-clip">
      <div className="mx-auto flex w-full max-w-[64rem] items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] md:px-10">
        {/* A full page load on purpose: "/" is the scroll site for visitors without a hitter (a rewrite), not a client route. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" aria-label="Gapper home" className="flex items-center gap-3">
          <LockupH height={28} />
          <SportTag className="hidden sm:inline-flex" />
        </a>
        <Link href="/how-it-works" className="rounded-lg px-3 py-2 text-[14px] text-chalk-2 hover:text-chalk">How it measures</Link>
      </div>
      <div className="mx-auto grid w-full max-w-[64rem] gap-10 px-5 py-12 md:grid-cols-[1fr_1.1fr] md:items-start md:px-10 md:py-20">
        <div>
          <h1 className="display slant text-[2.6rem] leading-[0.95] md:text-[3.6rem]">
            Step in<span className="text-optic">.</span>
          </h1>
          <p className="mt-4 max-w-sm text-[16px] leading-relaxed text-chalk-2">
            Set up your hitter and record your first slow-pitch swing. Takes a minute. Everything stays on this phone; no account, no sign-up.
          </p>
          <p className="mt-6 max-w-sm text-[15px] font-semibold leading-snug text-chalk">{SITE.positioning}</p>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-chalk-3">
            Timed to the arc, coached for the slow-pitch swing: land the front foot about 0.2 s before contact, stay back, let it travel. Camera estimates show how sure they are.{" "}
            <Link href="/how-it-works" className="text-chalk-2 underline">
              Here&apos;s the honest version.
            </Link>
          </p>
        </div>
        <div className="surface boxed cut rounded-2xl p-5 md:p-6">
          {!storageOk && (
            <p className="mb-4 rounded-xl border border-amber/40 bg-amber-wash px-4 py-3 text-sm text-chalk">
              This browser is blocking storage (private mode?). Swings won&apos;t be saved.
            </p>
          )}
          <h2 className="head text-[19px]">Set up your hitter</h2>
          <p className="mb-5 mt-1 text-[14px] text-chalk-3">Name, which side you hit from, and your height (it turns pixels into inches).</p>
          <PlayerForm onSave={onSave} submitLabel="Let's hit" />
        </div>
      </div>
    </div>
  );
}
