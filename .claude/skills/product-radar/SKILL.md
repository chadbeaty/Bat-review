---
name: product-radar
description: Early-warning product research for organic (TikTok/Reels/Shorts) dropshipping. Checks a list of YouTube dropshipping creators for new uploads, finds the physical products they feature, groups products sold under different names, checks how crowded each one is, scores them 0-100 on early momentum, and writes organic video ideas. Use when asked to run the product radar, find early or emerging dropshipping products, check what the tracked creators are showing, or update the product watch report. Runs entirely inside Claude with web search and web fetch, so it costs nothing beyond the existing Claude plan.
---

# Product Radar

Find physical products that are **starting** to get attention (days, not weeks), with **few sellers so far**,
that can be **shown in a 10-30 second video**. Early detection beats popularity: 15 mentions today after 2
yesterday matters more than 5,000 mentions that have been around for months.

Only use tools already available in the conversation (web search, web fetch, and file read/write when a
workspace exists). Never ask for API keys or paid services.

## Ground rules (always)

1. **Every fact needs a source link and a date.** Prices, costs, margins and video potential are estimates: label them "estimate".
2. **Unknown is not zero.** If you couldn't check something, write "not checked" or "unknown". Never treat missing data as low competition or low demand.
3. **Missing data can only lower a score**, never raise it (see `references/scoring.md`).
4. **Respect platform rules.** Read only public pages the fetch tool can open normally. Don't log in, don't get around blocks or paywalls. Don't fetch Amazon, AliExpress, Temu, Walmart, eBay or TikTok Shop pages directly (their terms forbid automated access). For those, use what web search results show.
5. **Never invent** products, view counts, seller counts, prices or sales. Never claim a video format is "viral" or "proven". Don't copy any creator's script.
6. **Look-alikes aren't duplicates.** Group names only when the product does the same job (a heated eyelash curler is not a regular eyelash curler).

## Step 1: Load the creator list and history

- Creators: `references/creators.md`. Check only creators marked **verified**. If the user gives a new channel, confirm it first: open the channel's upload feed (step 2) and check the recent titles match the person, then add it to the list.
- History: if a workspace is available, read `product-radar-data/history.md` (create it on the first run, using the format in `references/history-format.md`). History is what makes "first seen" and "accelerating" possible. In a chat without files, ask the user to paste or attach their last report if they have one; otherwise say this is a first run with no baseline.

## Step 2: Collect new uploads (free, no key)

For each verified creator, web-fetch the public upload feed:

`https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID>`

It lists the latest ~15 uploads with title, link, publish time, description and view count. Keep uploads from the
last 7 days (or the window the user asks for). If a feed fails, note "feed unavailable" for that creator and move
on. One failure never stops the run.

## Step 3: Pick out the products

For each new upload, read the title and description and report a product only when there is real evidence:
it is named, or clearly described, in the title or description. Quote the exact words.

- Ignore software, apps, AI tools, courses, services, stores, cars, cash and props. Report only physical goods a dropshipper could sell.
- Ignore vague teasers ("my $10k winning product") unless the product itself is identified.
- For each product, record: the name as written, a plain generic name (no brand or hype words), what it does, what it looks like, the category, other names sellers use, the creator, the video link, the publish date, the view count, and how it was presented: organic demo, affiliate, own store, paid ad (only if labelled), case study, or discussion.

## Step 4: Group names into one product

Different sellers call one product different names ("magnetic bag sealer" = "mini handheld food sealer" =
"rechargeable bag closer"). Merge sightings into one product only when the function and physical form match.
List every name in use. If you're unsure, keep them separate and flag "possibly the same as …".

## Step 5: Look for wider signals (web search)

For the products found, plus a few broad searches for new products, use web search with recent results:
- "<product> TikTok", "<product> TikTok made me buy it", "<product> review", "<product> reddit"
- Broad: "viral gadget" this week, "TikTok made me buy it" new, "where to buy" plus the category

Record what the results show: how many different stores or sellers appear, whether it is on Amazon or TikTok
Shop (from the search snippets), the earliest date you can see, and any Reddit or forum threads asking where to
buy it. Label all of this "seen in search results, low confidence". It is never a full count of sellers.

## Step 6: Score each product

Use `references/scoring.md`. Show all six category scores, the weighted total (0-100) and a confidence rating
(high / medium / low) with the reason. Compare with history: new this run, first seen date, mentions and creators
this week vs. last, and whether it is accelerating or now saturated.

## Step 7: Video ideas (top products only)

For products scoring 60 or more (or the top 5 if none do), write:
- Three hooks
- Three problem/solution concepts
- One 3-2-1 concept
- One run-to-the-store concept
- One POV demonstration
- One curiosity-driven concept
- One before/after concept, only if it suits the product
- Suggested length (seconds), first-frame visual and call to action

Prefer products that are obvious on sight without explanation.

## Step 8: Report and save

Write the report in this order:
1. **Worth testing now**: the top products with score, confidence, why, first seen, competition estimate, estimated price, sources, and three video ideas each
2. **First seen in the last 72 hours**
3. **Accelerating fastest** (vs. history)
4. **Avoid: getting crowded or saturated**
5. **Everything else found**: a short table
6. **What was checked**: creators checked, feeds that failed, and what wasn't checked (e.g. Google Trends, marketplace seller counts)

If a workspace exists, append this run to `product-radar-data/history.md` and save the full report as
`product-radar-data/reports/<YYYY-MM-DD>.md`. Tell the user where it was saved.
