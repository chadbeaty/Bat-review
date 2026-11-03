import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { allowedTransitions, canTransition, CASE_STATUSES, CONFIDENCE, EDITOR_ONLY_TARGETS } from "@/lib/editorial";
import { checklistComplete, checklistProgress, LEGAL_CHECKLIST } from "@/lib/editorial/legal";
import { accuracyRate, accuracySentence, excludedSentence, normalizeStats } from "@/lib/editorial/scoring";
import { atLeast, areasFor, ADMIN_AREAS } from "@/lib/auth/roles";
import { Markdown } from "@/components/Markdown";
import { slugify, formatMoney } from "@/lib/format";

describe("workflow", () => {
  it("follows the main pipeline in order", () => {
    const path = ["discovered", "researching", "evidence_gathering", "draft_ready", "needs_review", "approved", "published"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });
  it("can only reach Published from Approved (or back from Disputed)", () => {
    const into = CASE_STATUSES.filter((s) => s !== "published" && allowedTransitions(s).includes("published"));
    expect(into.sort()).toEqual(["approved", "disputed"]);
  });
  it("keeps approval and publishing editor-only", () => {
    expect(EDITOR_ONLY_TARGETS).toEqual(["approved", "published"]);
  });
  it("never lets unconfirmed evidence be published as fact", () => {
    expect(CONFIDENCE.unconfirmed.publishable).toBe(false);
  });
});

describe("legal checklist", () => {
  it("is complete only when every item is ticked", () => {
    const all = Object.fromEntries(LEGAL_CHECKLIST.map((i) => [i.key, true]));
    expect(checklistComplete(all)).toBe(true);
    expect(checklistComplete({ ...all, transfers_not_called_sales: false })).toBe(false);
    expect(checklistProgress({ quotes_verbatim_and_sourced: true })).toEqual({ done: 1, total: LEGAL_CHECKLIST.length });
  });
});

describe("scoring", () => {
  it("always shows the denominator and never counts open predictions as wrong", () => {
    const s = normalizeStats({ predictions_resolved: 12, predictions_correct: 7, predictions_partial: 1, predictions_open: 3 });
    expect(accuracySentence(s)).toBe("7 correct out of 12 resolved predictions, 1 partially correct.");
    expect(excludedSentence(s)).toBe("Not counted: 3 open.");
  });
  it("reports no rate (not 0%) when nothing is resolved", () => {
    const s = normalizeStats({ predictions_open: 2 });
    expect(accuracyRate(s)).toBeNull();
    expect(accuracySentence(s)).toBe("No resolved predictions yet (2 open).");
  });
});

describe("roles", () => {
  it("ranks researcher < editor < admin", () => {
    expect(atLeast("editor", "researcher")).toBe(true);
    expect(atLeast("researcher", "editor")).toBe(false);
    expect(atLeast("reader", "researcher")).toBe(false);
    expect(atLeast(null, "researcher")).toBe(false);
  });
  it("hides admin-only areas from researchers and editors", () => {
    expect(areasFor("researcher").some((a) => a.href === "/admin/audit")).toBe(false);
    expect(areasFor("editor").some((a) => a.href === "/admin/settings")).toBe(false);
    expect(areasFor("admin")).toHaveLength(ADMIN_AREAS.length);
  });
  it("covers all seventeen newsroom sections", () => {
    expect(ADMIN_AREAS).toHaveLength(17);
  });
});

describe("article rendering", () => {
  it("renders the Markdown subset without ever injecting raw HTML", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: '## Heading\n\nA **bold** claim with a [link](https://example.com).\n\n<script>alert(1)</script>\n\n- one\n- two' }));
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
  it("does not turn javascript: links into anchors", () => {
    const html = renderToStaticMarkup(createElement(Markdown, { source: "[x](javascript:alert(1))" }));
    expect(html).not.toContain("<a");
  });
});

describe("formatting", () => {
  it("makes clean slugs", () => {
    expect(slugify("“Not one. Not ever.” — Dex’s wallet moved!")).toBe("not-one-not-ever-dexs-wallet-moved");
  });
  it("formats money", () => {
    expect(formatMoney(212.4)).toBe("$212.40");
    expect(formatMoney(100000)).toBe("$100,000");
  });
});
