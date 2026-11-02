import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { signUp, signInWithGoogle } from "../actions";
import { googleAuthEnabled } from "@/lib/env";
import { MIN_PASSWORD } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create an account"
      intro={
        <>
          One account to buy and sell. Already a member?{" "}
          <Link href="/sign-in" className="font-semibold text-ink underline">
            Sign in
          </Link>
        </>
      }
    >
      <AuthForm
        action={signUp}
        submitLabel="Create account"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters.` },
          { name: "username", label: "Username", autoComplete: "username", optional: true, hint: "Shown on your listings. Letters, numbers and underscores." },
          { name: "displayName", label: "Name", autoComplete: "name", optional: true },
        ]}
      >
        <label className="flex items-start gap-2 text-sm" htmlFor="f-terms">
          <input id="f-terms" name="terms" type="checkbox" className="mt-1 h-4 w-4 accent-ink" />
          <span>
            I agree to the{" "}
            <Link href="/terms" className="underline">
              terms of service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
      </AuthForm>
      {googleAuthEnabled && (
        <form action={signInWithGoogle}>
          <button type="submit" className="btn btn-outline w-full">
            Continue with Google
          </button>
        </form>
      )}
    </AuthShell>
  );
}
