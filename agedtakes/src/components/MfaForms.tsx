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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  if (!text) return null;
  return (
    <button type="button" className="link mt-2 text-sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* clipboard blocked: the key is still selectable */ }
    }}>
      {copied ? "Copied ✓" : "Copy setup key"}
    </button>
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
        <li>Install an authenticator app if you don&rsquo;t have one (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>
          <strong>On this phone:</strong> tap the button below to add the account to your app. <strong>On a computer:</strong> scan
          the QR code with your phone. Either way, you can also type the setup key into the app by hand.
        </li>
        <li>Come back here and enter the 6-digit code the app shows.</li>
      </ol>
      {setup.uri && (
        <a href={setup.uri} className="btn">Add to my authenticator app</a>
      )}
      <div className="flex flex-wrap items-start gap-5">
        {/* Supabase returns the QR code as an SVG data URI. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="border border-rule bg-white p-2" />
        <div className="min-w-0">
          <p className="kicker">Setup key</p>
          <code className="mt-1 block break-all bg-paper-2 px-2 py-1 font-mono text-sm">{setup.secret}</code>
          <CopyButton text={setup.secret ?? ""} />
          <p className="meta mt-2 max-w-xs">Typing it by hand? In the app choose &ldquo;Enter a setup key&rdquo;, use any name (e.g. Aged Takes) and keep &ldquo;Time based&rdquo; selected.</p>
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
