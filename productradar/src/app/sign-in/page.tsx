import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";
import { safeNextPath } from "@/lib/auth/member";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "link-expired": "That sign-in link has expired or was already used. Request a new one.",
  "link-invalid": "That sign-in link isn't valid. Request a new one.",
  "not-configured": "The app isn't connected to its database yet. See the setup guide.",
  "no-access": "This account doesn't have access. Ask the owner to add you.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const error = sp.error ? ERRORS[sp.error] : null;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-white">PR</span>
          <div>
            <h1 className="text-base font-semibold">Product Radar</h1>
            <p className="text-xs text-muted">Early product signals for organic selling</p>
          </div>
        </div>
        {error && <p className="mb-4 rounded-lg bg-bad-wash p-3 text-sm text-bad">{error}</p>}
        <SignInForm next={safeNextPath(sp.next, "/")} />
      </div>
    </main>
  );
}
