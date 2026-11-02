import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MfaChallenge, MfaEnroll } from "@/components/MfaForms";
import { removeFactor } from "./actions";

export const metadata: Metadata = { title: "Sign-in security", robots: { index: false } };

const NOTICES: Record<string, string> = {
  enrolled: "Two-step sign-in is on. You'll enter a code from your app when you open sensitive areas.",
  removed: "The authenticator was removed.",
};
const ERRORS: Record<string, string> = {
  "verify-first": "Enter a code from your authenticator first, then you can remove it.",
  "remove-failed": "We couldn't remove that authenticator. Try again.",
};

export default async function SecurityPage({ searchParams }: PageProps<"/account/security">) {
  const supabase = await createClient();
  if (!supabase) redirect("/sign-in");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/sign-in?next=/account/security");

  const params = await searchParams;
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const requiredForAdmin = params.required === "admin";

  const [{ data: factors }, { data: aal }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
  const verified = factors?.totp ?? [];
  const atAal2 = aal?.currentLevel === "aal2";

  return (
    <div className="wrap grid max-w-3xl gap-6 py-10">
      <div className="grid gap-2">
        <p className="eyebrow">
          <Link href="/account" className="underline">
            Your account
          </Link>{" "}
          / Security
        </p>
        <h1 className="display text-5xl font-bold">Two-step sign-in</h1>
        <p className="text-ink-soft">
          Add an authenticator app so a stolen password isn&apos;t enough to get into your account. Staff must use it to open the admin area.
        </p>
      </div>

      {notice && (
        <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-danger">
          {error}
        </p>
      )}
      {requiredForAdmin && verified.length === 0 && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-warning">
          The admin area needs two-step sign-in. Set up an authenticator app below, then you&apos;ll go straight to the dashboard.
        </p>
      )}

      {verified.length === 0 ? (
        <section className="card grid gap-4 p-5">
          <h2 className="text-lg font-semibold">Set up an authenticator app</h2>
          <MfaEnroll next={requiredForAdmin ? "/admin" : undefined} />
        </section>
      ) : (
        <section className="card grid gap-4 p-5">
          <h2 className="text-lg font-semibold">Your authenticator</h2>
          <ul className="grid gap-3">
            {verified.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0">
                <div>
                  <p className="font-medium">{f.friendly_name || "Authenticator app"}</p>
                  <p className="text-sm text-ink-soft">Added {new Date(f.created_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</p>
                </div>
                {atAal2 && (
                  <form action={removeFactor}>
                    <input type="hidden" name="factorId" value={f.id} />
                    <button type="submit" className="btn btn-outline text-danger">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {atAal2 ? (
            <p className="text-sm text-ink-soft">
              This session is verified. If you remove your only authenticator, staff access to the admin area stops until you add a new one.
            </p>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm text-ink-soft">Enter a code from your app to verify this session and manage your authenticator.</p>
              <MfaChallenge next="/account/security" />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
