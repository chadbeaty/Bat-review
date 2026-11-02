// Polite HTTP: one request at a time, a pause between requests, and retries on rate limits.

export const USER_AGENT = process.env.AGGREGATOR_USER_AGENT || "web:barrel-talk-aggregator:v1.0 (slowpitch bat review aggregator)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createClient({ delayMs = 1000, retries = 3, log = () => {} } = {}) {
  let last = 0;
  async function request(url, init = {}, attempt = 0) {
    const wait = last + delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    try {
      res = await fetch(url, { ...init, headers: { "User-Agent": USER_AGENT, ...(init.headers || {}) } });
    } catch (err) {
      if (attempt < retries) {
        await sleep(2000 * 2 ** attempt);
        return request(url, init, attempt + 1);
      }
      throw err;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      const backoff = Math.max(retryAfter * 1000, 4000 * 2 ** attempt);
      log(`  ${res.status} from ${new URL(url).hostname}, waiting ${Math.round(backoff / 1000)}s`);
      await sleep(backoff);
      return request(url, init, attempt + 1);
    }
    return res;
  }
  return {
    request,
    async json(url, init) {
      const res = await request(url, init);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      return res.json();
    },
    async text(url, init) {
      const res = await request(url, init);
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      return res.text();
    },
  };
}
