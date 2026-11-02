import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const { email } = await searchParams;
  return (
    <AuthShell title="Check your email">
      <div className="grid gap-3">
        <p>
          We sent a confirmation link to <strong>{typeof email === "string" ? email : "your email address"}</strong>. Open it to finish
          creating your account.
        </p>
        <p className="text-sm text-ink-soft">
          The link expires in one hour. Nothing there? Check your spam folder, or{" "}
          <Link href="/sign-up" className="underline">
            sign up again
          </Link>{" "}
          with the right address.
        </p>
      </div>
    </AuthShell>
  );
}
