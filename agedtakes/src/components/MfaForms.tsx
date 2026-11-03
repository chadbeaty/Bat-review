"use client";

import { useActionState, useState, useTransition } from "react";
import { startEnrollment, verifyChallenge, verifyEnrollment, type EnrollState, type VerifyState } from "@/app/(site)/account/security/actions";

function CodeField({ error }: { error?: string }) {
  return (
    <div>
      <label className="label" htmlFor="mfa-code">6-digit code</label>
      <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required
        aria-invalid={Boolean(error)} className="field !w-44 font-mono text-lg tracking-[0.3em]" />
      {error && <p role="alert" className="mt-2 text-sm text-red-ink">{error}</p>}
    </div>
  );
}

/** Set up an authenticator app: show the QR code and setup key, then confirm the first code. */
export function MfaEnroll({ next }: { next?: string }) {
  const [setup, setSetup] = useState<EnrollState | null>(null);
  const [starting, start] = useTransition();
  const [state, verifyAction, verifying] = useActionState<VerifyState, FormData>(verifyEnrollment, {});

  if (!setup?.factorId) {
    return (
      <div className="space-y-3">
        {setup?.error && <p role="alert" className="text-red-ink">{setup.error}</p>}
        <button type="button" className="btn" disabled={starting} onClick={() => start(async () => setSetup(await startEnrollment()))}>
          {starting ? "Starting…" : "Set up an authenticator app"}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-ink-2">
        <li>Open an authenticator app (1Password, Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Scan this QR code, or type the setup key.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {/* Supabase returns the QR code as an SVG data URI. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="border border-rule bg-white p-2" />
        <div className="min-w-0">
          <p className="kicker">Setup key</p>
          <code className="mt-1 block break-all bg-paper-2 px-2 py-1 font-mono text-sm">{setup.secret}</code>
        </div>
      </div>
      <form action={verifyAction} className="space-y-3">
        <input type="hidden" name="factorId" value={setup.factorId} />
        {next && <input type="hidden" name="next" value={next} />}
        <CodeField error={state.error} />
        <button type="submit" className="btn" disabled={verifying}>{verifying ? "Checking…" : "Confirm and turn on"}</button>
      </form>
    </div>
  );
}

export function MfaChallenge({ next }: { next: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyChallenge, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      <CodeField error={state.error} />
      <button type="submit" className="btn" disabled={pending}>{pending ? "Checking…" : "Verify"}</button>
    </form>
  );
}
