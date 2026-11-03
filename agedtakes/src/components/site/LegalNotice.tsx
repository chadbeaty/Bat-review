/** Shown on the legal templates until an attorney has reviewed them. Remove once reviewed. */
export function LegalNotice() {
  if (process.env.NEXT_PUBLIC_LEGAL_REVIEWED === "true") return null;
  return (
    <p className="mb-8 border border-amber bg-amber-wash px-4 py-3 font-mono text-xs leading-relaxed text-amber">
      Template — requires review by a qualified attorney before production launch. It is a starting point, not legal advice, and may not reflect
      the laws that apply to you (for example GDPR, CCPA or CAN-SPAM requirements).
    </p>
  );
}
