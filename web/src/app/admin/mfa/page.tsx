import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { checkStaff } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { MfaChallenge } from "@/components/MfaForms";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Verify it's you", robots: { index: false } };

export default async function AdminMfaPage({ searchParams }: PageProps<"/admin/mfa">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined, "/admin");
  const target = next.startsWith("/admin") && !next.startsWith("/admin/mfa") ? next : "/admin";

  const check = await checkStaff("any", { requireMfa: false });
  if (!check.ok) {
    if (check.reason === "signed_out") redirect(`/sign-in?next=${encodeURIComponent("/admin/mfa")}`);
    notFound();
  }
  const supabase = (await createClient())!;
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect(target);
  if (aal?.nextLevel !== "aal2") redirect("/account/security?required=admin");

  return (
    <div className="wrap grid place-items-center py-12 md:py-20">
      <div className="card grid w-full max-w-md gap-5 p-6 md:p-8">
        <div className="grid gap-2">
          <p className="eyebrow">Admin</p>
          <h1 className="display text-4xl font-bold">Verify it&apos;s you</h1>
          <p className="text-ink-soft">Enter the 6-digit code from your authenticator app to open the admin area.</p>
        </div>
        <MfaChallenge next={target} submitLabel="Verify and continue" />
      </div>
    </div>
  );
}
