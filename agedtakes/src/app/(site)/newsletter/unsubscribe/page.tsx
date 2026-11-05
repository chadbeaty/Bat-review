import type { Metadata } from "next";
import { unsubscribeAction } from "../actions";
import { BRAND } from "@/lib/seo";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function UnsubscribePage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : "";
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <div className="wrap max-w-xl py-20 text-center">
      <p className="kicker mb-3 !text-red">{BRAND.newsletter}</p>
      {sp.result === "done" ? (
        <>
          <h1 className="headline text-4xl">You&apos;ve been unsubscribed.</h1>
          <p className="mt-4 text-lg text-ink-2">You won&apos;t receive any more emails from us. The archive stays open.</p>
        </>
      ) : sp.result === "invalid" ? (
        <>
          <h1 className="headline text-4xl">We couldn&apos;t process that link.</h1>
          <p className="mt-4 text-lg text-ink-2">Use the unsubscribe link from your most recent email, or reply to any email and we&apos;ll remove you.</p>
        </>
      ) : (
        <>
          <h1 className="headline text-4xl">Unsubscribe?</h1>
          <p className="mt-4 text-lg text-ink-2">You&apos;ll stop receiving {BRAND.newsletter} and investigation alerts.</p>
          <form action={unsubscribeAction} className="mt-8">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="token" value={token} />
            <button className="btn" type="submit">Unsubscribe me</button>
          </form>
        </>
      )}
    </div>
  );
}
