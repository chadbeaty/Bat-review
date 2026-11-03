import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaEnroll } from "@/components/MfaForms";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/links";

export const metadata: Metadata = { title: "Two-step verification", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SecurityPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!supabase || !data.user) redirect("/sign-in?next=/account/security");
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null, "/admin");
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");

  return (
    <div className="wrap max-w-2xl py-14">
      <p className="kicker mb-2 !text-red">Account security</p>
      <h1 className="headline text-4xl">Two-step verification</h1>
      {sp.welcome && <p className="mt-4 border border-well bg-well-wash px-3 py-2 text-well">You are now the newsroom&apos;s first admin. Set up two-step verification to open the newsroom.</p>}
      {sp.required && !sp.welcome && <p className="mt-4 border border-amber bg-amber-wash px-3 py-2 text-amber">The newsroom requires two-step verification. Set up an authenticator app to continue.</p>}
      {sp.notice === "enrolled" && <p className="mt-4 border border-well bg-well-wash px-3 py-2 text-well">Two-step verification is on.</p>}
      <p className="mt-4 text-ink-2">An authenticator app adds a 6-digit code to each newsroom session, so a stolen email link alone can&apos;t publish anything.</p>
      <div className="mt-8 border border-ink p-6">
        {verified.length > 0 ? (
          <>
            <p className="font-semibold">Authenticator set up: {verified.map((f) => f.friendly_name).join(", ")}</p>
            <a href={`/admin/mfa?next=${encodeURIComponent(next)}`} className="btn mt-4">Continue to the newsroom</a>
          </>
        ) : (
          <MfaEnroll next={sp.required ? next : undefined} />
        )}
      </div>
    </div>
  );
}
