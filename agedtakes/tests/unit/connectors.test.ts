import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/connectors/rss";
import { htmlToText, robotsAllows } from "@/lib/connectors/http";
import { edgarItems, houseItems, parseHouseIndex, readZipEntry, senateConnector, youtubeConnector } from "@/lib/connectors/official";
import { inferResolutionMode, resolvePriceTarget, type PriceSeries } from "@/lib/connectors/prices";
import { CONNECTORS } from "@/lib/connectors";

describe("RSS and Atom", () => {
  it("parses RSS items with CDATA and HTML bodies", () => {
    const xml = `<rss><channel><item><title><![CDATA[Episode 112 & more]]></title><link>https://example.com/112</link><guid>ep-112</guid><pubDate>Tue, 14 Mar 2023 15:00:00 GMT</pubDate><description><![CDATA[<p>I will <b>never</b> sell.</p>]]></description></item></channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item).toMatchObject({ externalId: "ep-112", url: "https://example.com/112", title: "Episode 112 & more", publishedAt: "2023-03-14T15:00:00.000Z", contentText: "I will never sell." });
  });
  it("parses Atom entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:x,1</id><title>Post</title><link href="https://example.com/p"/><published>2025-01-06T12:00:00Z</published><summary>Hello</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ externalId: "tag:x,1", url: "https://example.com/p", contentText: "Hello" });
  });
});

describe("polite fetching", () => {
  it("honours robots.txt for our agent and the wildcard", () => {
    const robots = "User-agent: *\nDisallow: /private\nAllow: /private/press\n\nUser-agent: AgedTakesResearchBot\nDisallow: /archive";
    expect(robotsAllows(robots, "/archive/1")).toBe(false);
    expect(robotsAllows(robots, "/private/x")).toBe(true); // our specific group applies instead of "*"
    expect(robotsAllows("User-agent: *\nDisallow: /private\nAllow: /private/press", "/private/press/1")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/anything")).toBe(false);
  });
  it("strips scripts and markup from pages", () => {
    expect(htmlToText("<html><script>alert(1)</script><p>Hello&nbsp;<b>world</b></p></html>")).toBe("Hello world");
  });
});

describe("official records", () => {
  it("builds SEC EDGAR filing links filtered by form", () => {
    const items = edgarItems("0001067983", {
      name: "Demo Holdings",
      filings: { recent: { accessionNumber: ["0001-23-000001", "0001-23-000002"], form: ["4", "10-K"], filingDate: ["2026-01-02", "2026-01-03"], primaryDocument: ["doc4.xml", "10k.htm"] } },
    }, ["4"]);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://www.sec.gov/Archives/edgar/data/1067983/000123000001/doc4.xml");
  });

  it("reads the House disclosure index from a ZIP and keeps only tracked members' PTRs", () => {
    const xml = Buffer.from(`<FinancialDisclosure><Member><Prefix>Hon.</Prefix><Last>Morrow</Last><First>Ada</First><Suffix></Suffix><FilingType>P</FilingType><StateDst>XX01</StateDst><Year>2025</Year><FilingDate>5/14/2025</FilingDate><DocID>20012345</DocID></Member><Member><Prefix></Prefix><Last>Other</Last><First>Pat</First><Suffix></Suffix><FilingType>P</FilingType><StateDst>YY02</StateDst><Year>2025</Year><FilingDate>5/1/2025</FilingDate><DocID>20099999</DocID></Member><Member><Prefix></Prefix><Last>Morrow</Last><First>Ada</First><Suffix></Suffix><FilingType>O</FilingType><StateDst>XX01</StateDst><Year>2025</Year><FilingDate>5/15/2025</FilingDate><DocID>1</DocID></Member></FinancialDisclosure>`);
    const zip = makeZip("2025FD.xml", xml);
    const out = readZipEntry(zip, (n) => n.endsWith(".xml"));
    expect(out?.toString()).toBe(xml.toString());
    const items = houseItems(parseHouseIndex(out!.toString()), ["Ada Morrow"], 2025);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "house-ptr-20012345", url: "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/20012345.pdf", publishedAt: "2025-05-14T00:00:00.000Z" });
  });

  it("never scrapes the Senate site (terms acceptance would have to be bypassed)", async () => {
    const res = await senateConnector.fetchItems({}, { fetch, env: {}, trackedNames: [], now: new Date() });
    expect(res.status).toBe("skipped");
  });

  it("reports missing optional credentials instead of failing", async () => {
    const res = await youtubeConnector.fetchItems({ channelId: "UC1234567890123456789012" }, { fetch, env: {}, trackedNames: [], now: new Date() });
    expect(res).toMatchObject({ status: "skipped" });
  });

  it("registers every connector the source monitor offers", () => {
    expect(Object.keys(CONNECTORS).sort()).toEqual(["coingecko", "fmp", "house_disclosures", "manual_url", "rss", "sec_edgar", "senate_disclosures", "youtube"]);
  });
});

describe("price prediction resolution", () => {
  const series = (values: [string, number][]): PriceSeries => ({
    provider: "coingecko", assetId: "democoin", currency: "USD", timezone: "UTC", methodology: "test", sourceUrl: "https://example.com",
    points: values.map(([d, v]) => ({ time: `${d}T23:59:00Z`, value: v })),
  });

  it("resolves correct as soon as a daily close reaches the target", () => {
    const r = resolvePriceTarget({ direction: "at_or_above", target: 100, deadline: "2025-12-31", series: series([["2025-03-01", 90], ["2025-06-01", 101]]), now: new Date("2025-07-01") });
    expect(r).toMatchObject({ result: "correct", observedValue: 101 });
  });

  it("never calls a prediction incorrect before its deadline", () => {
    const r = resolvePriceTarget({ direction: "at_or_above", target: 100, deadline: "2025-12-31", series: series([["2025-03-01", 90]]), now: new Date("2025-07-01") });
    expect(r.result).toBe("not_yet_resolvable");
  });

  it("resolves incorrect after the deadline, reporting the best close", () => {
    const r = resolvePriceTarget({ direction: "at_or_above", target: 100000, deadline: "2025-12-31", series: series([["2025-03-01", 60000], ["2025-08-01", 71400], ["2025-12-31", 58920]]), now: new Date("2026-01-02") });
    expect(r).toMatchObject({ result: "incorrect", observedValue: 71400 });
  });

  it("ignores closes after the deadline", () => {
    const r = resolvePriceTarget({ direction: "at_or_above", target: 100, deadline: "2025-12-31", series: series([["2025-06-01", 90], ["2026-01-05", 150]]), now: new Date("2026-02-01") });
    expect(r.result).toBe("incorrect");
  });

  it("judges deadline-close predictions on the deadline close only", () => {
    const s = series([["2027-06-01", 450], ["2027-12-31", 380]]);
    expect(resolvePriceTarget({ direction: "at_or_above", target: 400, deadline: "2027-12-31", series: s, now: new Date("2028-01-02"), mode: "deadline_close" })).toMatchObject({ result: "incorrect", observedValue: 380 });
    expect(resolvePriceTarget({ direction: "at_or_above", target: 400, deadline: "2027-12-31", series: s, now: new Date("2027-07-01"), mode: "deadline_close" }).result).toBe("not_yet_resolvable");
  });

  it("reads the resolution mode from the written criteria", () => {
    expect(inferResolutionMode("Correct if DMCO closes at or above $400 on 31 Dec 2027.")).toBe("deadline_close");
    expect(inferResolutionMode("Correct if any UTC daily close is at or above $100,000 before 1 Jan 2026.")).toBe("any_close");
  });

  it("leaves non-numeric predictions to an editor", () => {
    expect(resolvePriceTarget({ direction: "other", target: null, deadline: null, series: series([]) }).result).toBe("unscorable");
  });
});

/** Builds a one-file ZIP (deflate) in memory. */
function makeZip(name: string, content: Buffer): Buffer {
  const data = deflateRawSync(content);
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(0, 42);
  const cdOffset = local.length + nameBuf.length + data.length;
  const cd = Buffer.concat([central, nameBuf]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdOffset, 16);
  return Buffer.concat([local, nameBuf, data, cd, end]);
}
