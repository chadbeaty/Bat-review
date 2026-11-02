"use client";

import { useActionState, useState, useTransition } from "react";
import {
  startEnrollment,
  verifyChallenge,
  verifyEnrollment,
  type EnrollState,
  type VerifyState,
} from "@/app/account/security/actions";

function CodeField({ error }: { error?: string }) {
  return (
    <label className="field" htmlFor="mfa-code">
      <span>6-digit code</span>
      <input
        id="mfa-code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "mfa-error" : undefined}
        className={`input max-w-48 font-mono text-lg tracking-widest ${error ? "border-danger" : ""}`}
      />
      {error && (
        <span id="mfa-error" role="alert" className="text-sm font-normal text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

/** Set up an authenticator app: show the QR code and setup key, then confirm the first code. */
export function MfaEnroll({ next }: { next?: string }) {
  const [setup, setSetup] = useState<EnrollState | null>(null);
  const [starting, startTransition] = useTransition();
  const [state, verifyAction, verifying] = useActionState<VerifyState, FormData>(verifyEnrollment, {});

  if (!setup?.factorId) {
    return (
      <div className="grid gap-3">
        {setup?.error && (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {setup.error}
          </p>
        )}
        <p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={starting}
            onClick={() => startTransition(async () => setSetup(await startEnrollment()))}
          >
            {starting ? "Starting…" : "Set up an authenticator app"}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <ol className="grid list-decimal gap-2 pl-5 text-sm">
        <li>Open an authenticator app on your phone (for example 1Password, Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>Scan this QR code, or type the setup key instead.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {/* Supabase returns the QR code as an SVG data URI, so next/image adds nothing here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="rounded border border-line bg-white p-2" />
        <div className="grid min-w-0 gap-1">
          <span className="text-sm text-ink-soft">Setup key</span>
          <code data-testid="mfa-secret" className="break-all rounded bg-paper px-2 py-1 font-mono text-sm">
            {setup.secret}
          </code>
        </div>
      </div>
      <form action={verifyAction} className="grid gap-3">
        <input type="hidden" name="factorId" value={setup.factorId} />
        {next && <input type="hidden" name="next" value={next} />}
        <CodeField error={state.error} />
        <p>
          <button type="submit" className="btn btn-primary" disabled={verifying}>
            {verifying ? "Checking…" : "Confirm and turn on"}
          </button>
        </p>
      </form>
    </div>
  );
}

/** Enter a code from an authenticator that is already set up. */
export function MfaChallenge({ next, submitLabel = "Verify" }: { next: string; submitLabel?: string }) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyChallenge, {});
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="next" value={next} />
      <CodeField error={state.error} />
      <p>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : submitLabel}
        </button>
      </p>
    </form>
  );
}
