// Polite HTTP for connectors: identifies itself, times out, caps response size, retries transient failures
// with backoff, and never tries to get around access controls. A 401/402/403/451 means "not available to us".

export const USER_AGENT = "ProductRadarBot/1.0 (+private research tool)";
const MAX_BYTES = 3 * 1024 * 1024;

export class SourceUnavailable extends Error {}
export class RateLimited extends Error {}

export type FetchLike = typeof fetch;

type Opts = { fetch?: FetchLike; headers?: Record<string, string>; timeoutMs?: number; retries?: number; sleep?: (ms: number) => Promise<void> };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function getText(url: string, opts: Opts = {}): Promise<string> {
  const f = opts.fetch ?? fetch;
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await f(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "*/*", ...opts.headers },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        redirect: "follow",
      });
      const host = new URL(url).hostname;
      if ([401, 402, 403, 451].includes(res.status)) throw new SourceUnavailable(`${host} refused access (HTTP ${res.status}).`);
      if (res.status === 404) throw new SourceUnavailable(`${host} returned 404 (not found).`);
      if (res.status === 429) throw new RateLimited(`Rate limited by ${host}.`);
      if (res.status >= 500) throw new Error(`HTTP ${res.status} from ${host}`);
      if (!res.ok) throw new SourceUnavailable(`HTTP ${res.status} from ${host}`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_BYTES) throw new SourceUnavailable("Response too large");
      const text = await res.text();
      return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
    } catch (err) {
      lastError = err;
      if (err instanceof SourceUnavailable || attempt === retries) break;
      await sleep(500 * 2 ** attempt + Math.floor(Math.random() * 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function getJson<T>(url: string, opts: Opts = {}): Promise<T> {
  return JSON.parse(await getText(url, { ...opts, headers: { Accept: "application/json", ...opts.headers } })) as T;
}

/** Minimal robots.txt check for our user agent and "*": returns false if the path is disallowed. */
export function robotsAllows(robotsTxt: string, path: string, agent = "ProductRadarBot"): boolean {
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
