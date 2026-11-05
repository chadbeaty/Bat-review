import type { Metadata } from "next";
import Link from "next/link";
import { confirmAction } from "../actions";
import { BRAND } from "@/lib/seo";

export const metadata: Metadata = { title: "Confirm your subscription", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

const RESULTS: Record<string, { title: string; body: string }> = {
  confirmed: { title: "You're subscribed.", body: `Welcome to ${BRAND.newsletter}. Your first issue arrives with the next weekly digest.` },
  expired: { title: "That link has expired.", body: "Confirmation links last 7 days. Sign up again and we'll send a fresh one." },
  invalid: { title: "That link didn't work.", body: "It may have been used already or copied incompletely. Sign up again to get a new link." },
};

export default async function ConfirmPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const result = typeof sp.result === "string" ? RESULTS[sp.result] : undefined;
  const id = typeof sp.id === "string" ? sp.id : "";
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <div className="wrap max-w-xl py-20 text-center">
      <p className="kicker mb-3 !text-red">{BRAND.newsletter}</p>
      {result ? (
        <>
          <h1 className="headline text-4xl">{result.title}</h1>
          <p className="mt-4 text-lg text-ink-2">{result.body}</p>
          <Link href="/cases" className="btn mt-8">Read the latest investigations</Link>
        </>
      ) : (
        <>
          <h1 className="headline text-4xl">Confirm your subscription</h1>
          <p className="mt-4 text-lg text-ink-2">One click and you&apos;re in.</p>
          <form action={confirmAction} className="mt-8">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-red" type="submit">Yes, subscribe me</button>
          </form>
        </>
      )}
    </div>
  );
}
