// Likely off-platform payment terms in a message. A match never blocks the message; it files a report for
// moderators. Matching is deliberately specific to limit false alarms.

const RULES: { term: string; re: RegExp }[] = [
  { term: "Venmo", re: /\bvenmo\b/i },
  { term: "Zelle", re: /\bzelle\b/i },
  { term: "Cash App", re: /\bcash\s?app\b|\$cashtag|\bcashapp\b/i },
  {
    term: "PayPal friends and family",
    re: /\bpay\s?pal\b.{0,40}\b(f&f|ff|friends?\s*(and|&|n)\s*family)\b|\b(f&f|friends?\s*(and|&|n)\s*family)\b.{0,40}\bpay\s?pal\b/i,
  },
  { term: "PayPal", re: /\b(send|pay|paying|payment)\b.{0,30}\bpay\s?pal\b|\bpay\s?pal\b.{0,20}\b(me|instead|directly)\b/i },
  { term: "Wire transfer", re: /\bwire\s+(transfer|me|the|money|payment)\b|\bwestern\s+union\b|\bmoneygram\b/i },
  { term: "Gift cards or crypto", re: /\bgift\s?cards?\b|\bbitcoin\b|\bcrypto(currency)?\b/i },
  {
    term: "Pay outside the site",
    re: /\b(pay|payment|deal|buy|sell)\b.{0,25}\b(off\s?(the\s)?(site|platform)|outside\s+(of\s+)?(the\s)?(site|platform|app))\b|\boff[- ]platform\b/i,
  },
];

/** The names of off-platform payment terms found in the text (empty when none). */
export function detectOffPlatformPayment(text: string): string[] {
  const found: string[] = [];
  for (const r of RULES) if (r.re.test(text) && !found.includes(r.term)) found.push(r.term);
  return found;
}

export const OFF_PLATFORM_WARNING =
  "Keep payment on the site. Never pay or accept payment by Venmo, Zelle, Cash App, PayPal friends and family, wire or gift cards. Off-site payments aren't covered by buyer protection.";
