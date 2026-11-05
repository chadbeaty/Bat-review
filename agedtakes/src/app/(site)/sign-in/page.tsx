import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import { safeNextPath } from "@/lib/auth/links";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;
const ERRORS: Record<string, string> = {
  "link-expired": "That sign-in link has expired or was already used. Request a new one.",
  "link-invalid": "That sign-in link wasn't valid. Request a new one.",
  "not-configured": "Sign-in isn't set up yet.",
};

export default async function SignInPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/account");
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : null;
  return (
    <div className="wrap max-w-md py-16">
      <p className="kicker mb-2 !text-red">Readers and newsroom</p>
      <h1 className="headline mb-3 text-4xl">Sign in</h1>
      <p className="mb-6 text-ink-2">We&apos;ll email you a one-time link — no password. Readers can follow people; staff sign in here to reach the newsroom.</p>
      {error && <p role="alert" className="mb-4 border border-red px-3 py-2 text-red-ink">{error}</p>}
      <SignInForm next={next} />
    </div>
  );
}
