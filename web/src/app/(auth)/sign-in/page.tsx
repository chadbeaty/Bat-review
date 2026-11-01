import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { signIn, signInWithGoogle } from "../actions";
import { googleAuthEnabled } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

const NOTICES: Record<string, string> = {
  confirmed: "Your email is confirmed. Sign in to continue.",
};
const ERRORS: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Sign in, or request a new link.",
  "link-invalid": "That link isn't valid. Sign in, or request a new link.",
  google: "Google sign-in didn't complete. Try again or use your email.",
  "not-configured": "Accounts aren't available yet.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : undefined);
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined;
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  return (
    <AuthShell
      title="Sign in"
      intro={
        <>
          New here?{" "}
          <Link href="/sign-up" className="font-semibold text-ink underline">
            Create an account
          </Link>
        </>
      }
    >
      {notice && <p className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">{notice}</p>}
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        hidden={{ next }}
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
      />
      <p className="text-sm">
        <Link href="/forgot-password" className="underline">
          Forgot your password?
        </Link>
      </p>
      {googleAuthEnabled && (
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="btn btn-outline w-full">
            Continue with Google
          </button>
        </form>
      )}
    </AuthShell>
  );
}
