import Link from "next/link";
import { GapMark as LogoMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="stage relative mt-6 overflow-hidden rounded-2xl px-6 pb-10 pt-10 text-center md:mt-10">
      <LogoMark size={96} ink="var(--color-night-4)" accent="var(--color-optic)" className="mx-auto" />
      <h1 className="display t-xl mt-7">Foul ball.</h1>
      <p className="mx-auto mt-3 max-w-sm text-[16px] text-chalk-2">That page landed out of play. It may have moved, or the link is off by a letter.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Link href="/" className="btn-label press inline-flex min-h-12 items-center rounded-lg bg-optic px-5 text-[15px] text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-optic-2">
          Back home
        </Link>
        <Link href="/swings" className="press inline-flex min-h-12 items-center rounded-lg border border-line-2 px-5 text-[15px] text-chalk hover:bg-white/[0.03]">
          My swings
        </Link>
      </div>
    </div>
  );
}
