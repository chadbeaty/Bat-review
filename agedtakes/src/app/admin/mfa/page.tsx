import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { MfaChallenge } from "@/components/MfaForms";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/links";

export const metadata: Metadata = { title: "Verify it's you", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminMfaPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/admin");
  const supabase = await createClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!supabase || !data.user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(next);
  if (aal?.nextLevel !== "aal2") redirect(`/account/security?required=1&next=${encodeURIComponent(next)}`);
  return (
    <main id="main" className="wrap max-w-md py-20">
      <Link href="/"><Wordmark size="sm" /></Link>
      <h1 className="headline mt-8 text-4xl">Verify it&apos;s you</h1>
      <p className="mt-3 text-ink-2">Enter the code from your authenticator app to open the newsroom.</p>
      <div className="mt-6"><MfaChallenge next={next} /></div>
    </main>
  );
}
