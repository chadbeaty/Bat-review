// Shared email layout: branded HTML and a plain-text version of every message. Every value that comes
// from members or the database must pass through esc() (HTML) before it goes into the HTML body.

import { brand } from "@/config/brand";

export type EmailCategory = "transactional" | "marketing";

export type RenderedEmail = {
  template: string;
  category: EmailCategory;
  subject: string;
  html: string;
  text: string;
  /** Marketing email only: the one-click unsubscribe URL (also sent as the List-Unsubscribe header). */
  unsubscribeUrl?: string;
};

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Subjects are plain text, but line breaks would let a value add mail headers, so they are removed. */
export function cleanSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
}

/** An absolute link on this site. Only site paths are accepted, so a template can't link elsewhere. */
export function siteLink(path: string, base = brand.siteUrl): string {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return base.replace(/\/$/, "") + safe;
}

export type Block =
  | { kind: "p"; text: string }
  | { kind: "rows"; rows: [string, string][] }
  | { kind: "button"; label: string; href: string }
  | { kind: "note"; text: string };

/** Builds the HTML and text versions from simple blocks, escaping every value. */
export function renderLayout(opts: {
  template: string;
  category: EmailCategory;
  subject: string;
  preheader: string;
  heading: string;
  blocks: Block[];
  unsubscribeUrl?: string;
}): RenderedEmail {
  const c = brand.colors;
  const htmlBlocks = opts.blocks
    .map((b) => {
      switch (b.kind) {
        case "p":
          return `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${c.ink}">${esc(b.text)}</p>`;
        case "note":
          return `<p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:${c.inkSoft}">${esc(b.text)}</p>`;
        case "rows":
          return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px">${b.rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:6px 0;border-bottom:1px solid ${c.line};font-size:14px;color:${c.inkSoft}">${esc(k)}</td><td style="padding:6px 0;border-bottom:1px solid ${c.line};font-size:14px;color:${c.ink};text-align:right">${esc(v)}</td></tr>`
            )
            .join("")}</table>`;
        case "button":
          return `<p style="margin:8px 0 24px"><a href="${esc(b.href)}" style="display:inline-block;background:${c.ink};color:${c.surface};padding:12px 20px;border-radius:6px;font-weight:600;text-decoration:none">${esc(b.label)}</a></p>`;
      }
    })
    .join("\n");

  const footerLines = [
    opts.category === "marketing"
      ? "You're getting this because you joined our email list."
      : "You're getting this because of activity on your account.",
    `${brand.legalEntity}`,
  ];
  const unsubscribeHtml = opts.unsubscribeUrl
    ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:${c.inkSoft}">Unsubscribe</a>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.subject)}</title></head>
<body style="margin:0;padding:0;background:${c.paper};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" style="width:100%;border-collapse:collapse;background:${c.paper}"><tr><td style="padding:24px 12px">
<table role="presentation" style="max-width:560px;margin:0 auto;border-collapse:collapse;background:${c.surface};border:1px solid ${c.line};border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:4px solid ${c.accent};font-size:20px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:${c.ink}">${esc(brand.name)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${c.ink}">${esc(opts.heading)}</h1>
${htmlBlocks}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${c.line};font-size:12px;line-height:1.5;color:${c.inkSoft}">${footerLines.map(esc).join("<br>")}<br>Questions? Write to <a href="mailto:${esc(brand.email.supportAddress)}" style="color:${c.inkSoft}">${esc(brand.email.supportAddress)}</a>${unsubscribeHtml}</td></tr>
</table></td></tr></table></body></html>`;

  const textBlocks = opts.blocks.map((b) => {
    switch (b.kind) {
      case "p":
      case "note":
        return b.text;
      case "rows":
        return b.rows.map(([k, v]) => `${k}: ${v}`).join("\n");
      case "button":
        return `${b.label}: ${b.href}`;
    }
  });
  const text = [
    brand.name.toUpperCase(),
    "",
    opts.heading,
    "",
    ...textBlocks.flatMap((t) => [t, ""]),
    "--",
    ...footerLines,
    `Questions? Write to ${brand.email.supportAddress}`,
    ...(opts.unsubscribeUrl ? [`Unsubscribe: ${opts.unsubscribeUrl}`] : []),
  ].join("\n");

  return {
    template: opts.template,
    category: opts.category,
    subject: cleanSubject(opts.subject),
    html,
    text,
    unsubscribeUrl: opts.unsubscribeUrl,
  };
}
