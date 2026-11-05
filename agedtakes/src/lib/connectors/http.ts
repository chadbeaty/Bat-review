import { siteUrl } from "@/lib/env";

// Polite HTTP for connectors: identifies itself, times out, caps response size, honours robots.txt for generic
// web pages, and never sends credentials to third-party sites. It does not get around paywalls or logins:
// a 401/402/403 response is treated as "not available", not retried with tricks.

export const USER_AGENT = `AgedTakesResearchBot/1.0 (+${siteUrl}/about)`;
const MAX_BYTES = 5 * 1024 * 1024;

export class SourceUnavailable extends Error {}

export async function getText(url: string, opts: { fetch?: typeof fetch; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<string> {
  const f = opts.fetch ?? fetch;
  const res = await f(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    redirect: "follow",
  });
  if ([401, 402, 403, 451].includes(res.status)) throw new SourceUnavailable(`${new URL(url).hostname} requires access we don't have (HTTP ${res.status}); skipped.`);
  if (res.status === 429) throw new Error(`Rate limited by ${new URL(url).hostname}; will retry later.`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new SourceUnavailable("Response too large");
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

export async function getJson<T>(url: string, opts: Parameters<typeof getText>[1] = {}): Promise<T> {
  return JSON.parse(await getText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } })) as T;
}

export async function getBytes(url: string, opts: { fetch?: typeof fetch; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Buffer> {
  const f = opts.fetch ?? fetch;
  const res = await f(url, { headers: { "User-Agent": USER_AGENT, ...opts.headers }, signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Minimal robots.txt check for our user agent and "*": returns false if the path is disallowed. */
export function robotsAllows(robotsTxt: string, path: string, agent = "AgedTakesResearchBot"): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(m[2].toLowerCase());
    } else if (current) current.rules.push({ allow: key === "allow", path: m[2] });
  }
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const group = specific ?? groups.find((g) => g.agents.includes("*"));
  if (!group) return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of group.rules) {
    if (!r.path) continue;
    if (path.startsWith(r.path) && (!best || r.path.length > best.len)) best = { allow: r.allow, len: r.path.length };
  }
  return best ? best.allow : true;
}

export async function allowedByRobots(url: string, f: typeof fetch = fetch): Promise<boolean> {
  const u = new URL(url);
  try {
    const txt = await getText(`${u.origin}/robots.txt`, { fetch: f, timeoutMs: 8000 });
    return robotsAllows(txt, u.pathname + u.search);
  } catch {
    return true; // No robots.txt (or unreachable): the default is allowed.
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Converts HTML to readable plain text (scripts, styles and navigation removed). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}
