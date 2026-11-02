import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { AuthShell } from "@/components/AuthShell";
import { updatePassword } from "../actions";
import { getCurrentUser } from "@/lib/supabase/server";
import { MIN_PASSWORD } from "@/lib/validation/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <AuthShell title="Link expired" intro="Password reset links work once and expire after an hour.">
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Send a new link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <AuthForm
        action={updatePassword}
        submitLabel="Save new password"
        fields={[
          { name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: `At least ${MIN_PASSWORD} characters.` },
          { name: "confirm", label: "Type it again", type: "password", autoComplete: "new-password" },
        ]}
      />
    </AuthShell>
  );
}
