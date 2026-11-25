"use client";
import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/ui";

/**
 * When a screen crashes: say so in plain words and offer a way out. Swings are saved on the phone as they're recorded,
 * so a crash here never loses them.
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.warn("Gapper screen error:", error.message);
  }, [error]);
  return (
    <div className="pt-6 md:pt-10">
      <ErrorState
        title="This screen hit a snag"
        action={
          <>
            <button
              type="button"
              onClick={reset}
              className="btn-label press inline-flex min-h-12 items-center rounded-lg bg-optic px-5 text-[15px] text-optic-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.45)] hover:bg-optic-2"
            >
              Try again
            </button>
            <Link href="/" className="press inline-flex min-h-12 items-center rounded-lg border border-line-2 px-5 text-[15px] text-chalk hover:bg-white/[0.03]">
              Back home
            </Link>
          </>
        }
      >
        Something went wrong while drawing it. Your swings are saved on this phone and are safe. Try again, and if it keeps
        happening, head back home.
      </ErrorState>
    </div>
  );
}
