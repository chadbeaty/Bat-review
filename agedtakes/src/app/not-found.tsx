import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <main id="main" className="wrap flex flex-1 flex-col items-center justify-center py-24 text-center">
      <Link href="/" aria-label="Aged Takes home"><Wordmark size="md" /></Link>
      <p className="kicker mt-10 !text-red">404 · Not in the archive</p>
      <h1 className="headline mt-3 text-5xl">This page hasn&apos;t aged at all.</h1>
      <p className="mt-4 max-w-md text-lg text-ink-2">It doesn&apos;t exist — or it isn&apos;t published. Try searching the archive.</p>
      <form action="/search" role="search" className="mt-8 flex w-full max-w-md">
        <label htmlFor="nf-q" className="sr-only">Search</label>
        <input id="nf-q" name="q" type="search" className="field" placeholder="Search people and predictions" />
        <button className="btn" type="submit">Search</button>
      </form>
    </main>
  );
}
