import { describe, expect, it } from "vitest";
import { confirmationEmail, digestEmail, escapeHtml, welcomeEmail } from "@/lib/email/templates";
import { sendBatch, sendEmail } from "@/lib/email/send";
import { platformCopy } from "@/lib/social/copy";
import { requiredFootnote, templateForCaseType } from "@/lib/social/card";
import { submissionSchema } from "@/lib/validation/public";
import { caseSchema, monitoredSourceSchema, parseOrThrow, ValidationError } from "@/lib/validation/admin";
import { checkBearer } from "@/lib/security";
import { unsubscribeToken } from "@/lib/newsletter";

describe("emails", () => {
  it("escapes content and includes one-click unsubscribe headers on marketing email", () => {
    const e = digestEmail({ subject: "S", intro: "<b>hi</b>", cases: [{ title: "A <script>", url: "https://x.test/c", summary: "s", personName: "P", label: "Aged poorly", isDemo: true }], siteUrl: "https://x.test", unsubscribeUrl: "https://x.test/u", oneClickUrl: "https://x.test/api/u" });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("DEMO ONLY");
    expect(e.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(e.text).toContain("Unsubscribe: https://x.test/u");
    expect(welcomeEmail({ siteUrl: "https://x.test", unsubscribeUrl: "u", oneClickUrl: "o" }).headers?.["List-Unsubscribe"]).toContain("<o>");
  });
  it("confirmation email carries the confirm link and no marketing", () => {
    const e = confirmationEmail({ confirmUrl: "https://x.test/confirm?id=1&token=abc" });
    expect(e.html).toContain("https://x.test/confirm?id=1&amp;token=abc");
    expect(e.headers).toBeUndefined();
  });
  it("escapes HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
  it("does nothing (and says so) without Resend credentials", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail({ to: "a@b.test", subject: "s", html: "h", text: "t" })).toEqual({ ok: false, reason: "not_configured" });
    expect((await sendBatch([{ to: "a@b.test", subject: "s", html: "h", text: "t" }])).notConfigured).toBe(true);
  });
  it("sends batches of 100 through Resend", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.NEWSLETTER_FROM_EMAIL = "Aged Takes <news@x.test>";
    const bodies: unknown[][] = [];
    const fake = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const emails = Array.from({ length: 250 }, (_, i) => ({ to: `u${i}@x.test`, subject: "s", html: "h", text: "t" }));
    const r = await sendBatch(emails, fake);
    expect(r.sent).toBe(250);
    expect(bodies.map((b) => b.length)).toEqual([100, 100, 50]);
    delete process.env.RESEND_API_KEY;
  });
});

describe("newsletter tokens", () => {
  it("derives a stable unsubscribe token per subscriber", () => {
    process.env.NEWSLETTER_SECRET = "test-secret";
    expect(unsubscribeToken("a")).toBe(unsubscribeToken("a"));
    expect(unsubscribeToken("a")).not.toBe(unsubscribeToken("b"));
  });
});

describe("social copy", () => {
  const input = { title: "T", socialHeadline: null, socialPost: "A".repeat(400), summary: "S", caseType: "never_sell" as const, confidence: "verified" as const, personName: "P", url: "https://x.test/cases/t", quote: "I will never sell", isDemo: false };
  it("keeps the link and the qualification on every platform", () => {
    for (const p of platformCopy(input)) {
      if (p.platform !== "Instagram") expect(p.text).toContain(input.url);
      if (p.limit) expect(p.text.length).toBeLessThanOrEqual(p.limit);
    }
    expect(platformCopy(input).find((p) => p.platform === "Facebook")?.text).toContain("not, by itself, a sale");
  });
  it("labels demo content", () => {
    expect(platformCopy({ ...input, isDemo: true })[0].text).toContain("DEMO");
  });
  it("maps case types to templates that carry required caveats", () => {
    expect(templateForCaseType("did_they_sell")).toBe("did_they_sell");
    expect(requiredFootnote("did_they_sell")).toMatch(/not, by itself, a sale/);
  });
});

describe("validation", () => {
  const base = { person_name: "Dex", statement_text: "I will never sell", source_url: "https://example.com/x" };
  it("accepts a valid submission and splits supporting links", () => {
    const r = submissionSchema.parse({ ...base, supporting_urls: "https://a.test/1\nhttps://b.test/2" });
    expect(r.supporting_urls).toEqual(["https://a.test/1", "https://b.test/2"]);
  });
  it("rejects non-http links, bad emails and the honeypot", () => {
    expect(submissionSchema.safeParse({ ...base, source_url: "javascript:alert(1)" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, submitter_email: "nope" }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, website: "spam" }).success).toBe(false);
  });
  it("requires lowercase slugs and valid enums for cases", () => {
    expect(() => parseOrThrow(caseSchema, { title: "A good title", slug: "Bad Slug", person_id: crypto.randomUUID(), case_type: "other", is_sponsored: false })).toThrow(ValidationError);
    expect(() => parseOrThrow(caseSchema, { title: "A good title", slug: "good-slug", person_id: crypto.randomUUID(), case_type: "liar", is_sponsored: false })).toThrow(/case type/);
  });
  it("rejects invalid connector configuration JSON", () => {
    expect(monitoredSourceSchema.safeParse({ connector: "rss", label: "Feed", config: "{not json", enabled: true }).success).toBe(false);
  });
});

describe("cron protection", () => {
  it("accepts only the exact bearer secret", () => {
    expect(checkBearer("Bearer a-long-cron-secret-123", "a-long-cron-secret-123")).toBe(true);
    expect(checkBearer("Bearer wrong", "a-long-cron-secret-123")).toBe(false);
    expect(checkBearer(null, "a-long-cron-secret-123")).toBe(false);
    expect(checkBearer("Bearer short", "short")).toBe(false);
    expect(checkBearer("Bearer ", undefined)).toBe(false);
  });
});
