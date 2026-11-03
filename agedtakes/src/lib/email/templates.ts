// Email templates: plain, readable HTML with inline styles (email clients ignore stylesheets) and a text version.
// Every marketing email includes an unsubscribe link and the List-Unsubscribe headers for one-click removal.

import { BRAND } from "@/lib/seo";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type Rendered = { subject: string; html: string; text: string; headers?: Record<string, string> };

function layout(opts: { preheader: string; body: string; unsubscribeUrl?: string; footerNote?: string }): string {
  const unsub = opts.unsubscribeUrl
    ? `<p style="margin:16px 0 0">You're receiving this because you subscribed to ${escapeHtml(BRAND.newsletter)}. <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#6b655b">Unsubscribe</a>.</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f0e6;color:#15130f;font-family:Georgia,'Times New Roman',serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td style="border-bottom:3px double #15130f;padding-bottom:12px">
<span style="font-size:26px;font-weight:900;letter-spacing:-0.5px">AGED <span style="color:#b0261a;border:3px solid #b0261a;padding:0 4px">TAKES</span></span>
<div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:2px;color:#6b655b;margin-top:8px;text-transform:uppercase">${escapeHtml(BRAND.tagline)}</div>
</td></tr>
<tr><td style="padding:24px 0;font-size:17px;line-height:1.6">${opts.body}</td></tr>
<tr><td style="border-top:1px solid #cdc3b0;padding-top:16px;font-family:Menlo,monospace;font-size:11px;line-height:1.6;color:#6b655b">
${opts.footerNote ? `<p style="margin:0">${opts.footerNote}</p>` : ""}${unsub}
</td></tr></table></td></tr></table></body></html>`;
}

function listUnsubscribe(url: string, oneClickUrl: string): Record<string, string> {
  return { "List-Unsubscribe": `<${oneClickUrl}>, <${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

export function confirmationEmail(opts: { confirmUrl: string }): Rendered {
  return {
    subject: `Confirm your subscription to ${BRAND.newsletter}`,
    html: layout({
      preheader: "One click to confirm. If you didn't ask for this, ignore it.",
      body: `<p style="margin:0 0 16px">Please confirm that you want to receive <strong>${escapeHtml(BRAND.newsletter)}</strong> — ${escapeHtml(BRAND.newsletterTagline.toLowerCase())}</p>
<p style="margin:24px 0"><a href="${escapeHtml(opts.confirmUrl)}" style="background:#15130f;color:#f5f0e6;padding:12px 18px;text-decoration:none;font-family:Menlo,monospace;font-size:13px;letter-spacing:1px;text-transform:uppercase">Confirm subscription</a></p>
<p style="margin:0;color:#37332c;font-size:15px">If you didn't sign up, ignore this email and you won't hear from us again. The link expires in 7 days.</p>`,
      footerNote: "We never send marketing email without confirmed consent.",
    }),
    text: `Confirm your subscription to ${BRAND.newsletter}:\n${opts.confirmUrl}\n\nIf you didn't sign up, ignore this email. The link expires in 7 days.`,
  };
}

export function welcomeEmail(opts: { siteUrl: string; unsubscribeUrl: string; oneClickUrl: string }): Rendered {
  return {
    subject: `You're subscribed to ${BRAND.newsletter}`,
    html: layout({
      preheader: "The receipts arrive weekly.",
      body: `<p style="margin:0 0 16px">You're in. Once a week we send the investigations that published, the predictions that resolved, and every correction we made.</p>
<p style="margin:0 0 16px">Every claim we report links to its original source. Read how we decide what counts as evidence in our <a href="${escapeHtml(opts.siteUrl)}/methodology" style="color:#8c1d13">methodology</a>.</p>
<p style="margin:0"><a href="${escapeHtml(opts.siteUrl)}/cases" style="color:#8c1d13">Read the latest investigations →</a></p>`,
      unsubscribeUrl: opts.unsubscribeUrl,
    }),
    text: `You're subscribed to ${BRAND.newsletter}.\n\nRead the latest: ${opts.siteUrl}/cases\nMethodology: ${opts.siteUrl}/methodology\n\nUnsubscribe: ${opts.unsubscribeUrl}`,
    headers: listUnsubscribe(opts.unsubscribeUrl, opts.oneClickUrl),
  };
}

export type DigestCase = { title: string; url: string; summary: string; personName: string; label: string; isDemo: boolean };

export function digestEmail(opts: { subject: string; intro: string | null; cases: DigestCase[]; siteUrl: string; unsubscribeUrl: string; oneClickUrl: string }): Rendered {
  const items = opts.cases
    .map((c) => `<tr><td style="padding:16px 0;border-top:1px solid #cdc3b0">
<div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#b0261a">${escapeHtml(c.label)}${c.isDemo ? " · DEMO ONLY" : ""}</div>
<a href="${escapeHtml(c.url)}" style="color:#15130f;text-decoration:none;font-size:21px;font-weight:700;line-height:1.25;display:block;margin:6px 0">${escapeHtml(c.title)}</a>
<div style="font-size:15px;color:#37332c">${escapeHtml(c.summary)}</div>
<div style="font-family:Menlo,monospace;font-size:11px;color:#6b655b;margin-top:6px">${escapeHtml(c.personName)} · <a href="${escapeHtml(c.url)}" style="color:#6b655b">Read the evidence</a></div>
</td></tr>`)
    .join("");
  const text = opts.cases.map((c) => `${c.label.toUpperCase()}${c.isDemo ? " (DEMO ONLY)" : ""}\n${c.title}\n${c.summary}\n${c.url}`).join("\n\n");
  return {
    subject: opts.subject,
    html: layout({
      preheader: opts.cases[0]?.title ?? BRAND.newsletterTagline,
      body: `<p style="margin:0 0 8px;font-family:Menlo,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b655b">${escapeHtml(BRAND.newsletter)}</p>
${opts.intro ? `<p style="margin:0 0 16px">${escapeHtml(opts.intro)}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>
<p style="margin:16px 0 0;font-size:14px"><a href="${escapeHtml(opts.siteUrl)}/corrections" style="color:#8c1d13">This week's corrections</a> · <a href="${escapeHtml(opts.siteUrl)}/predictions" style="color:#8c1d13">Prediction scoreboard</a></p>`,
      unsubscribeUrl: opts.unsubscribeUrl,
      footerNote: "Sponsors, when present, are labeled and never influence our conclusions.",
    }),
    text: `${BRAND.newsletter}\n\n${opts.intro ? opts.intro + "\n\n" : ""}${text}\n\nUnsubscribe: ${opts.unsubscribeUrl}`,
    headers: listUnsubscribe(opts.unsubscribeUrl, opts.oneClickUrl),
  };
}
