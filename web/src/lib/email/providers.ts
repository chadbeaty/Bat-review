// Email providers. Resend is used when RESEND_API_KEY is set; otherwise the dev provider logs the message
// and reports it as not sent, so nothing pretends an email went out.

import { brand } from "@/config/brand";
import type { RenderedEmail } from "./layout";

export type SendResult = { provider: "resend" | "dev"; status: "sent" | "not_sent" | "failed"; id?: string; error?: string };

export interface EmailProvider {
  readonly name: "resend" | "dev";
  send(to: string, email: RenderedEmail): Promise<SendResult>;
}

export function fromHeader(): string {
  const name = brand.email.fromName.replace(/["<>\r\n]/g, "");
  return `${name} <${brand.email.fromAddress}>`;
}

export class ResendProvider implements EmailProvider {
  readonly name = "resend" as const;
  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch
  ) {}

  async send(to: string, email: RenderedEmail): Promise<SendResult> {
    const headers: Record<string, string> = {};
    if (email.unsubscribeUrl) {
      headers["List-Unsubscribe"] = `<${email.unsubscribeUrl}>`;
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromHeader(),
          to: [to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          reply_to: brand.email.supportAddress,
          headers,
          tags: [{ name: "template", value: email.template }],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { provider: this.name, status: "failed", error: body.message ?? `HTTP ${res.status}` };
      return { provider: this.name, status: "sent", id: body.id };
    } catch (err) {
      return { provider: this.name, status: "failed", error: err instanceof Error ? err.message : "Network error" };
    }
  }
}

export class DevProvider implements EmailProvider {
  readonly name = "dev" as const;
  constructor(private log: (line: string) => void = (line) => console.info(line)) {}

  async send(to: string, email: RenderedEmail): Promise<SendResult> {
    // Only the template and subject are logged, never the body (it can hold order details).
    this.log(`[email not sent: RESEND_API_KEY is not set] template=${email.template} to=${maskEmail(to)} subject="${email.subject}"`);
    return { provider: this.name, status: "not_sent" };
  }
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}

export function providerFromEnv(env: Record<string, string | undefined> = process.env): EmailProvider {
  return env.RESEND_API_KEY ? new ResendProvider(env.RESEND_API_KEY) : new DevProvider();
}
