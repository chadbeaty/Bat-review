import Link from "next/link";

/** Shown when the database isn't connected yet (fresh deploy) — never fake content. */
export function NotConfigured() {
  return (
    <div className="wrap py-20">
      <div className="max-w-2xl border border-ink bg-paper-2/60 p-8">
        <p className="kicker mb-2 !text-red">Setup needed</p>
        <h1 className="headline text-4xl">The archive isn&apos;t connected yet.</h1>
        <p className="mt-4 text-lg text-ink-2">
          This site reads every investigation from its database. Add the Supabase settings described in the README
          (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY), redeploy, and the archive will appear here.
        </p>
      </div>
    </div>
  );
}

export function DemoNotice() {
  return (
    <div className="border-b border-ink bg-ink text-paper">
      <div className="wrap flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em]">
          Demonstration content: records marked “Demo only” are fictional and exist to show how the archive works.
        </p>
        <Link href="/about#demo" className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] underline underline-offset-2">Learn more</Link>
      </div>
    </div>
  );
}

/** Shown when the database can't be reached. The page is retried on the next revalidation. */
export function Unavailable() {
  return (
    <div className="wrap py-20">
      <div className="max-w-2xl border border-ink p-8">
        <p className="kicker mb-2 !text-red">Temporarily unavailable</p>
        <h1 className="headline text-4xl">The archive is catching its breath.</h1>
        <p className="mt-4 text-lg text-ink-2">We couldn&apos;t reach the database just now. Please try again in a minute.</p>
      </div>
    </div>
  );
}
