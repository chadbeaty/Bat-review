"use client";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-2xl border border-red bg-red-wash p-6 text-red-ink">
      <p className="font-mono text-xs uppercase">Newsroom error</p>
      <p className="mt-2">This screen failed to load. Nothing was changed.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <button type="button" className="btn btn-sm mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
