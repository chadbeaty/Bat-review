import { inflateRawSync } from "node:zlib";
import type { FetchedItem, SourceConnector } from "./types";
import { getBytes, getJson, getText, htmlToText, allowedByRobots, SourceUnavailable } from "./http";

// Official-record and platform connectors: SEC EDGAR, U.S. House financial disclosures, U.S. Senate (manual),
// YouTube Data API, and individual public web pages.

// ---------------------------------------------------------------------------------------------- SEC EDGAR
type EdgarSubmissions = {
  name?: string;
  filings?: { recent?: { accessionNumber: string[]; form: string[]; filingDate: string[]; primaryDocument: string[]; primaryDocDescription?: string[] } };
};

export function edgarItems(cik: string, data: EdgarSubmissions, forms: string[], limit = 25): FetchedItem[] {
  const r = data.filings?.recent;
  if (!r) return [];
  const cikNum = String(Number(cik));
  const out: FetchedItem[] = [];
  for (let i = 0; i < r.accessionNumber.length && out.length < limit; i++) {
    if (forms.length && !forms.includes(r.form[i])) continue;
    const acc = r.accessionNumber[i];
    const folder = acc.replace(/-/g, "");
    out.push({
      externalId: acc,
      url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${folder}/${r.primaryDocument[i]}`,
      title: `${data.name ?? "Filer"} — Form ${r.form[i]} filed ${r.filingDate[i]}${r.primaryDocDescription?.[i] ? ` (${r.primaryDocDescription[i]})` : ""}`,
      author: data.name ?? null,
      publishedAt: `${r.filingDate[i]}T00:00:00Z`,
      contentText: null,
      metadata: { form: r.form[i], cik: cikNum, accession: acc, index: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${folder}/` },
    });
  }
  return out;
}

export const secEdgarConnector: SourceConnector = {
  id: "sec_edgar",
  label: "SEC EDGAR filings",
  description: "New filings (e.g. Form 4 insider transactions, 13F holdings, 8-K) for a company or individual filer, by CIK.",
  requiresEnv: ["SEC_USER_AGENT"],
  exampleConfig: { cik: "0001067983", forms: ["4", "13F-HR", "8-K"] },
  terms: "Uses SEC's public data API with a declared User-Agent and stays well under SEC's 10 requests/second fair-access limit.",
  async fetchItems(config, ctx) {
    const ua = ctx.env.SEC_USER_AGENT;
    if (!ua) return { status: "skipped", reason: "SEC_USER_AGENT is not set (SEC requires a contact email in the User-Agent)." };
    const cik = String(config.cik ?? "").replace(/\D/g, "");
    if (!cik) return { status: "error", message: "Set config.cik to the filer's CIK number." };
    const forms = Array.isArray(config.forms) ? config.forms.map(String) : [];
    const data = await getJson<EdgarSubmissions>(`https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`, { fetch: ctx.fetch, headers: { "User-Agent": ua } });
    return { status: "ok", items: edgarItems(cik, data, forms, Number(config.limit ?? 25)) };
  },
};

// ------------------------------------------------------------------------------- U.S. House disclosures
/** Reads one file from a ZIP archive (central directory + deflate), enough for the House's annual index. */
export function readZipEntry(zip: Buffer, predicate: (name: string) => boolean): Buffer | null {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (predicate(name)) {
      const lNameLen = zip.readUInt16LE(localOffset + 26);
      const lExtraLen = zip.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

export type HouseFiling = { prefix: string; last: string; first: string; suffix: string; filingType: string; stateDst: string; year: string; filingDate: string; docId: string };

export function parseHouseIndex(xml: string): HouseFiling[] {
  const get = (b: string, t: string) => (b.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1] ?? "").trim();
  return (xml.match(/<Member>[\s\S]*?<\/Member>/g) ?? []).map((b) => ({
    prefix: get(b, "Prefix"), last: get(b, "Last"), first: get(b, "First"), suffix: get(b, "Suffix"),
    filingType: get(b, "FilingType"), stateDst: get(b, "StateDst"), year: get(b, "Year"), filingDate: get(b, "FilingDate"), docId: get(b, "DocID"),
  }));
}

export function houseItems(filings: HouseFiling[], names: string[], year: number): FetchedItem[] {
  const wanted = names.map((n) => n.toLowerCase().split(/\s+/)).filter((p) => p.length >= 2);
  return filings
    .filter((f) => f.filingType === "P") // Periodic Transaction Reports
    .filter((f) => !wanted.length || wanted.some((parts) => parts[parts.length - 1] === f.last.toLowerCase() && parts[0] === f.first.toLowerCase().split(/\s+/)[0]))
    .map((f) => {
      const [m, d, y] = f.filingDate.split("/");
      return {
        externalId: `house-ptr-${f.docId}`,
        url: `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${f.docId}.pdf`,
        title: `Periodic Transaction Report — ${[f.prefix, f.first, f.last, f.suffix].filter(Boolean).join(" ")} (${f.stateDst}), filed ${f.filingDate}`,
        author: `${f.first} ${f.last}`,
        publishedAt: y && m && d ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toISOString() : null,
        contentText: null,
        metadata: { docId: f.docId, stateDst: f.stateDst, note: "PDF filing; transactions must be transcribed and verified by an editor. Owner codes: SP = spouse, JT = joint, DC = dependent child." },
      };
    });
}

export const houseConnector: SourceConnector = {
  id: "house_disclosures",
  label: "U.S. House financial disclosures",
  description: "Periodic Transaction Reports (PTRs) from the Clerk of the House annual index, filtered to tracked members.",
  requiresEnv: [],
  exampleConfig: { year: 2026, names: ["First Last"] },
  terms: "Public records published by the Clerk of the House. Downloads the official annual index once per run.",
  async fetchItems(config, ctx) {
    const year = Number(config.year ?? ctx.now.getUTCFullYear());
    const names = Array.isArray(config.names) && config.names.length ? config.names.map(String) : ctx.trackedNames;
    const zip = await getBytes(`https://disclosures-clerk.house.gov/public_disc/financial-pdfs/${year}FD.zip`, { fetch: ctx.fetch, timeoutMs: 60_000 });
    const xml = readZipEntry(zip, (n) => n.toLowerCase().endsWith(".xml"));
    if (!xml) return { status: "error", message: "Couldn't read the House disclosure index." };
    return { status: "ok", items: houseItems(parseHouseIndex(xml.toString("utf8")), names, year) };
  },
};

// ------------------------------------------------------------------------------- U.S. Senate disclosures
export const senateConnector: SourceConnector = {
  id: "senate_disclosures",
  label: "U.S. Senate financial disclosures (manual)",
  description: "The Senate eFD site requires each visitor to accept its terms in a browser session. To respect that, this connector does not scrape it: an editor searches efdsearch.senate.gov, then adds report links as Evidence or a Manual URL source.",
  requiresEnv: [],
  exampleConfig: {},
  terms: "Automated access would require bypassing the site's terms-acceptance step, which Aged Takes does not do.",
  async fetchItems() {
    return { status: "skipped", reason: "Senate disclosures are added manually (see connector description)." };
  },
};

// ---------------------------------------------------------------------------------------------- YouTube
type YtPlaylist = { items?: { snippet: { title: string; description: string; publishedAt: string; channelTitle: string; resourceId: { videoId: string } } }[] };

export const youtubeConnector: SourceConnector = {
  id: "youtube",
  label: "YouTube channel (Data API)",
  description: "New uploads from a public channel: title, description and date. Transcripts are not available through the public API; editors add verified transcripts as source snapshots.",
  requiresEnv: ["YOUTUBE_API_KEY"],
  exampleConfig: { channelId: "UCxxxxxxxxxxxxxxxxxxxxxx" },
  terms: "Official YouTube Data API v3 within its quota (each run uses ~2 units).",
  async fetchItems(config, ctx) {
    const key = ctx.env.YOUTUBE_API_KEY;
    if (!key) return { status: "skipped", reason: "YOUTUBE_API_KEY is not set." };
    const channelId = String(config.channelId ?? "");
    if (!/^UC[\w-]{20,}$/.test(channelId)) return { status: "error", message: "Set config.channelId (starts with UC)." };
    const uploads = `UU${channelId.slice(2)}`;
    const data = await getJson<YtPlaylist>(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${Math.min(Number(config.limit ?? 15), 50)}&playlistId=${uploads}&key=${encodeURIComponent(key)}`, { fetch: ctx.fetch });
    return {
      status: "ok",
      items: (data.items ?? []).map((i) => ({
        externalId: `yt-${i.snippet.resourceId.videoId}`,
        url: `https://www.youtube.com/watch?v=${i.snippet.resourceId.videoId}`,
        title: i.snippet.title,
        author: i.snippet.channelTitle,
        publishedAt: i.snippet.publishedAt,
        contentText: `${i.snippet.title}\n\n${i.snippet.description}`,
        metadata: { videoId: i.snippet.resourceId.videoId, note: "Description only. Quotes from the video itself must be verified against the video and a transcript." },
      })),
    };
  },
};

// ------------------------------------------------------------------------------------------- Manual URL
export const manualUrlConnector: SourceConnector = {
  id: "manual_url",
  label: "Public web page",
  description: "Fetches one public page (an official statement, interview transcript or public newsletter post) as text.",
  requiresEnv: [],
  exampleConfig: { url: "https://example.com/press/statement" },
  terms: "Public pages only; respects robots.txt; pages that need a login or subscription are skipped, never bypassed.",
  async fetchItems(config, ctx) {
    const url = typeof config.url === "string" ? config.url : "";
    if (!/^https?:\/\//.test(url)) return { status: "error", message: "Set config.url." };
    if (!(await allowedByRobots(url, ctx.fetch))) return { status: "skipped", reason: "robots.txt disallows this page." };
    try {
      const html = await getText(url, { fetch: ctx.fetch });
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
      const text = htmlToText(html);
      if (/subscribe to (continue|read)|this content is for (paid )?subscribers|sign in to continue/i.test(text.slice(0, 3000)) && text.length < 3000) {
        return { status: "skipped", reason: "Page appears to be behind a paywall or login." };
      }
      return { status: "ok", items: [{ externalId: url, url, title, author: null, publishedAt: null, contentText: text.slice(0, 80_000) }] };
    } catch (err) {
      if (err instanceof SourceUnavailable) return { status: "skipped", reason: err.message };
      throw err;
    }
  },
};
