import type { ProductBrief } from "@/lib/data/brief";

// Plain, readable alert and digest emails (HTML plus a text version). Estimates are labelled as estimates.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const date = (iso: string | null) => (iso ? new Date(iso).toUTCString().replace(/:\d\d GMT$/, " UTC") : "unknown");
const money = (n: number | null) => (n === null ? null : `$${Number(n).toFixed(2)}`);

export function priceText(b: ProductBrief): string {
  const lo = money(b.product.suggested_price_low);
  const hi = money(b.product.suggested_price_high);
  if (!lo) return "Not estimated yet";
  return `${lo}${hi && hi !== lo ? `–${hi}` : ""} (AI estimate)`;
}

export function competitionText(b: ProductBrief): string {
  if (!b.competition) return "Not analysed yet";
  return `${b.competition.creators ?? "?"} creator(s), ${b.competition.promoVideos ?? "?"} promotional video(s) seen in monitored sources (${b.competition.confidence} confidence; real market count unknown)`;
}

function productBlock(b: ProductBrief, siteUrl: string, why: string[]) {
  const url = `${siteUrl}/products/${b.product.slug}`;
  const rows: [string, string][] = [
    ["Opportunity score", b.product.latest_score !== null ? `${Number(b.product.latest_score).toFixed(0)}/100 (${b.product.latest_confidence ?? "low"} confidence)` : "Not scored"],
    ["Earliest known appearance", `${date(b.firstSeen.at)} on ${b.firstSeen.platform ?? "?"}${b.firstSeen.creator ? ` by ${b.firstSeen.creator}` : ""}`],
    ["Competition estimate", competitionText(b)],
    ["Suggested selling price", priceText(b)],
  ];
  const html = `
  <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 16px">
    <h2 style="margin:0 0 6px;font-size:18px"><a href="${esc(url)}" style="color:#0f172a">${esc(b.product.canonical_name)}</a></h2>
    ${why.length ? `<p style="margin:0 0 10px;color:#334155"><strong>Why it's interesting:</strong> ${why.map(esc).join(" ")}</p>` : ""}
    <table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#64748b">${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
    ${b.ideas.length ? `<p style="margin:10px 0 4px;font-weight:600">Video ideas</p><ol style="margin:0;padding-left:18px">${b.ideas.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>` : `<p style="margin:10px 0 0;color:#64748b">Video ideas not generated yet.</p>`}
    ${b.sources.length ? `<p style="margin:10px 0 4px;font-weight:600">Sources</p><ul style="margin:0;padding-left:18px">${b.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.label)}</a> · ${esc(date(s.at))}</li>`).join("")}</ul>` : ""}
  </div>`;
  const text = [
    b.product.canonical_name,
    why.length ? `Why: ${why.join(" ")}` : null,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    b.ideas.length ? `Video ideas:\n${b.ideas.map((i, n) => `  ${n + 1}. ${i}`).join("\n")}` : "Video ideas: not generated yet",
    b.sources.length ? `Sources:\n${b.sources.map((s) => `  - ${s.label}: ${s.url}`).join("\n")}` : null,
    `Details: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { html, text };
}

const shell = (title: string, body: string, siteUrl: string) => `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;padding:16px">
<h1 style="font-size:20px;margin:0 0 4px">${esc(title)}</h1>
<p style="color:#64748b;margin:0 0 16px;font-size:13px">Product Radar · facts link to their source; prices and costs are estimates.</p>
${body}
<p style="color:#94a3b8;font-size:12px">Change alert settings at <a href="${esc(siteUrl)}/admin/settings">${esc(siteUrl)}/admin/settings</a>.</p>
</body></html>`;

export function alertEmail(b: ProductBrief, reasons: { label: string; reason: string }[], siteUrl: string) {
  const why = reasons.map((r) => `${r.label}: ${r.reason}`);
  const block = productBlock(b, siteUrl, why);
  const title = `${reasons[0]?.label ?? "Alert"}: ${b.product.canonical_name}`;
  return { subject: `Product Radar · ${title}`.slice(0, 150), html: shell(title, block.html, siteUrl), text: `${title}\n\n${block.text}` };
}

export function digestEmail(briefs: ProductBrief[], siteUrl: string, dayLabel: string) {
  const title = `Top ${briefs.length} opportunities · ${dayLabel}`;
  if (!briefs.length) {
    const msg = "No products have been scored yet. Once creators are monitored and the AI key is set, the top opportunities appear here.";
    return { subject: `Product Radar · ${title}`, html: shell(title, `<p>${esc(msg)}</p>`, siteUrl), text: msg };
  }
  const blocks = briefs.map((b) => productBlock(b, siteUrl, b.product.ai_recommendation ? [b.product.ai_recommendation.slice(0, 300)] : []));
  return {
    subject: `Product Radar · ${title}`,
    html: shell(title, blocks.map((b) => b.html).join(""), siteUrl),
    text: `${title}\n\n${blocks.map((b) => b.text).join("\n\n---\n\n")}`,
  };
}
