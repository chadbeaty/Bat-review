"use client";

import Link from "next/link";

export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="wrap py-20">
      <div className="max-w-2xl border border-ink p-8">
        <p className="kicker mb-2 !text-red">Something went wrong</p>
        <h1 className="headline text-4xl">This page didn&apos;t load.</h1>
        <p className="mt-4 text-lg text-ink-2">The archive may be briefly unavailable. Nothing you did caused this.</p>
        <div className="mt-6 flex gap-2">
          <button type="button" className="btn" onClick={reset}>Try again</button>
          <Link href="/" className="btn btn-ghost">Home</Link>
        </div>
      </div>
    </div>
  );
}
