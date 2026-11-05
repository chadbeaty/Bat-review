// Copy-ready social posts for approved cases. No social APIs are assumed: editors copy the text and download
// the graphics. Every version keeps the link to the full case and the evidence classification, and the
// "transfer is not a sale"-style qualification for money cases, so context survives the share.

import { CASE_TYPE_LABELS, CONFIDENCE, type CaseType, type Confidence } from "@/lib/editorial";
import { requiredFootnote, templateForCaseType } from "@/lib/social/card";

export type CopyInput = {
  title: string;
  socialHeadline: string | null;
  socialPost: string | null;
  summary: string | null;
  caseType: CaseType;
  confidence: Confidence | null;
  personName: string;
  url: string;
  quote: string | null;
  isDemo: boolean;
};

export type PlatformCopy = { platform: string; text: string; limit: number | null; note: string };

function fit(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function platformCopy(c: CopyInput): PlatformCopy[] {
  const headline = c.socialHeadline || c.title;
  const body = c.socialPost || c.summary || c.title;
  const evidence = c.confidence ? `Evidence: ${CONFIDENCE[c.confidence].label}.` : "";
  const qualifier = requiredFootnote(templateForCaseType(c.caseType)) ?? "";
  const demo = c.isDemo ? "[DEMO — fictional example] " : "";
  const label = CASE_TYPE_LABELS[c.caseType];
  const quote = c.quote ? `“${fit(c.quote, 180)}”` : "";

  const xBase = `${demo}${fit(body, 200)}`;
  return [
    { platform: "X", limit: 280, note: "Link counts as 23 characters.", text: `${fit(xBase, 280 - 25 - 1)}\n${c.url}` },
    { platform: "Facebook", limit: null, note: "Link preview uses the case's share image.", text: `${demo}${headline}\n\n${body}\n\n${evidence} ${qualifier}\n\nFull record and sources: ${c.url}`.trim() },
    { platform: "Instagram", limit: 2200, note: "Use the square graphic. Links aren't clickable: point to the link in bio.", text: `${demo}${label.toUpperCase()}: ${headline}\n\n${quote ? `${quote} — ${c.personName}\n\n` : ""}${body}\n\n${evidence} ${qualifier}\n\nSources and full timeline at the link in our bio.` },
    { platform: "TikTok / YouTube Shorts", limit: 2200, note: "Use the vertical (story) graphic as the cover. Script: read the quote, then the outcome, then the caveat.", text: `${demo}${headline}\n\nScript:\n1. What they said: ${quote || "(quote)"}\n2. What happened: ${fit(c.summary ?? body, 220)}\n3. The caveat: ${qualifier}\n\nSources: ${c.url}` },
    { platform: "Newsletter blurb", limit: null, note: "For the weekly digest.", text: `${demo}${headline} — ${c.summary ?? body} ${c.url}` },
  ];
}

/** The weekly roundup post, built from published cases only. */
export function weeklyRoundupCopy(items: { title: string; url: string }[], siteUrl: string): string {
  const lines = items.slice(0, 5).map((i, n) => `${n + 1}. ${i.title}`);
  return `This week on Aged Takes:\n\n${lines.join("\n")}\n\nEvery claim links to its source: ${siteUrl}/cases`;
}
