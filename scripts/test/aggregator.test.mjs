import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMatchers, findMentions } from "../lib/match.mjs";
import { scoreText, toneOf, topicsOf } from "../lib/sentiment.mjs";
import { assignThreadFamilies, extractMentions, mergeMentions, summarize, communityScore } from "../lib/aggregate.mjs";
import { parseFeed } from "../sources/rss.mjs";
import { parseText } from "../sources/imports.mjs";

const families = JSON.parse(readFileSync(new URL("../../data/families.json", import.meta.url))).families;
const matchers = buildMatchers(families);
const fams = (text, opts) => findMentions(text, matchers, opts).map((m) => m.family);

test("matches bat lines by name", () => {
  assert.deepEqual(fams("My Miken Freak Black has been mashing all season"), ["miken-freak"]);
  assert.deepEqual(fams("The Ronin 240 is a tank, no break in needed"), ["easton-ronin"]);
  assert.ok(fams("Picked up a Monsta Torch for USA play").includes("monsta-torch"));
  assert.ok(fams("Twisted Mistress vs KP23, which one?").includes("demarini-twisted-mistress"));
  assert.ok(fams("Twisted Mistress vs KP23, which one?").includes("miken-kp23"));
});

test("ignores everyday uses of ambiguous names", () => {
  assert.deepEqual(fams("We won on the mercy rule in the 4th"), []);
  assert.deepEqual(fams("That guy is a freak athlete"), []);
  assert.deepEqual(fams("We torched them last night"), []);
  assert.deepEqual(fams("you're trippin if you think we lose"), []);
});

test("ambiguous names count when the post is about bats", () => {
  assert.deepEqual(fams("The Mercy is the best balanced bat I've swung"), ["demarini-mercy"]);
  assert.deepEqual(fams("Torch is hot", { context: "Best USA bat for 2026?" }), ["monsta-torch"]);
});

test("scores tone for bat talk", () => {
  assert.equal(toneOf(scoreText("Cracked after two weeks, total garbage")), "bad");
  assert.equal(toneOf(scoreText("Hot out of the wrapper, love it")), "good");
  assert.equal(toneOf(scoreText("It's not hot at all, kind of dead")), "bad");
  assert.equal(toneOf(scoreText("Finally broken in and it's a beast")), "good");
  assert.equal(toneOf(scoreText("No sting at all on mis-hits")), "good");
  assert.equal(toneOf(scoreText("Bought it in March")), "mixed");
});

test("tags topics with the tone of their sentence", () => {
  const t = topicsOf(["Took about 200 hits to break in.", "Cracked in the cold though."]);
  assert.ok("breakIn" in t);
  assert.ok(t.durability < 0);
});

test("community score is pulled toward 50 with little data", () => {
  assert.equal(communityScore(0, 0), 50);
  assert.equal(communityScore(1, 0), 58);
  assert.ok(communityScore(40, 5) > 80);
  assert.ok(communityScore(2, 20) < 25);
});

test("comments inherit the bat named in the thread title", () => {
  const docs = assignThreadFamilies(
    [{ id: "c1", threadId: "t1", title: "Thoughts on the Easton Ronin 240?", text: "Love mine, been using it for two years", softball: true, sourceName: "r/Softball" }],
    matchers
  );
  const m = extractMentions(docs, matchers);
  assert.equal(m.length, 1);
  assert.equal(m[0].family, "easton-ronin");
  assert.equal(m[0].tone, "good");
});

test("summarize builds counts, sources and quotes", () => {
  const now = Date.parse("2026-10-01");
  const docs = [
    { id: "a", sourceName: "r/Softball", url: "https://x/a", text: "My Miken Freak is mashing, best bat I've owned and it's still hot after a full season.", date: "2026-09-01", votes: 30 },
    { id: "b", sourceName: "r/Softball", url: "https://x/b", text: "Miken Freak cracked on me in April, really disappointed with the durability on this one.", date: "2026-05-01", votes: 4 },
    { id: "c", sourceName: "YouTube", url: "https://x/c", text: "The Miken Freak swings nice and the pop is legit, great value on sale.", date: "2026-08-01", votes: 2 },
  ];
  const mentions = mergeMentions([], extractMentions(docs, matchers));
  const s = summarize(mentions, now)["miken-freak"];
  assert.equal(s.mentions, 3);
  assert.equal(s.positive, 2);
  assert.equal(s.negative, 1);
  assert.deepEqual(s.sources, { "r/Softball": 2, YouTube: 1 });
  assert.equal(s.quotes.length, 3);
  assert.ok(s.quotes.every((q) => q.url));
  assert.equal(s.topics.durability.n, 2);
  assert.equal(s.topics.pop.net, 2);
});

test("merge keeps one record per post and line", () => {
  const a = { key: "x::f", family: "f", date: "2026-01-01" };
  const b = { key: "x::f", family: "f", date: "2026-02-01" };
  assert.equal(mergeMentions([a], [b]).length, 1);
  assert.equal(mergeMentions([a], [b])[0].date, "2026-02-01");
});

test("parses RSS and Atom feeds", () => {
  const rss = `<rss><channel><item><title>Ronin 240 thoughts</title><link>https://f/t/1</link><description><![CDATA[<p>Great &amp; durable</p>]]></description><pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate><guid>t1</guid></item></channel></rss>`;
  const [item] = parseFeed(rss);
  assert.equal(item.title, "Ronin 240 thoughts");
  assert.equal(item.link, "https://f/t/1");
  assert.equal(item.text, "Great & durable");
  assert.equal(item.date, "2026-09-01T10:00:00.000Z");

  const atom = `<feed><entry><title>Freak review</title><link rel="alternate" href="https://r/x"/><content type="html">&lt;p&gt;hot bat&lt;/p&gt;</content><updated>2026-08-01T00:00:00Z</updated><id>e1</id></entry></feed>`;
  const [entry] = parseFeed(atom);
  assert.equal(entry.link, "https://r/x");
  assert.equal(entry.text, "hot bat");
});

test("parses pasted Facebook posts", () => {
  const entries = parseText("url: https://facebook.com/groups/x/posts/1\ndate: 2026-07-04\nMy Bedlam XL is fire\n---\nRonin cracked? never heard of that");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].url, "https://facebook.com/groups/x/posts/1");
  assert.equal(entries[0].text, "My Bedlam XL is fire");
  assert.equal(entries[1].text, "Ronin cracked? never heard of that");
});
