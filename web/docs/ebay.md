# eBay: "Elsewhere right now"

Bat model pages, the bottom of each bat listing page, and (while Gamer Bat has fewer than 6 live listings) the home page can show **used eBay listings for the same model**, in a clearly separate, clearly labeled section. Gamer Bat listings always come first. The links carry your eBay Partner Network (EPN) campaign, so you may earn a commission on purchases.

The feature is **off** until all three required environment variables are set. With them unset, no page shows any trace of eBay and nothing calls eBay.

## Owner steps

1. **Get API keys.** Create a developer account at https://developer.ebay.com, create an application keyset, and request **production** keys (the Browse API needs the production keyset; the sandbox has almost no listings). Note the **App ID (Client ID)** and **Cert ID (Client Secret)**.
2. **Join the eBay Partner Network** at https://partnernetwork.ebay.com, then create a **campaign**. Note its **campaign id** (a long number).
3. **Paste the values into Vercel** (Project > Settings > Environment Variables, Production and Preview as you like):

   | Variable | Value |
   | --- | --- |
   | `EBAY_CLIENT_ID` | App ID (Client ID) |
   | `EBAY_CLIENT_SECRET` | Cert ID (Client Secret) |
   | `EBAY_CAMPAIGN_ID` | EPN campaign id |
   | `EBAY_ENV` | optional: `production` (default) or `sandbox` |
   | `EBAY_CATEGORY_IDS` | optional: comma-separated eBay category ids, default `50797` (see below) |

4. **Redeploy.** The integration shows as configured under Admin > Integrations.

## How it works

- `src/lib/ebay/`: server-only. An OAuth client-credentials token (cached in memory until a minute before it expires), then the Browse API `item_summary/search` with `filter=conditions:{USED}`, the softball-bat category, and the header `X-EBAY-C-ENDUSERCTX: affiliateCampaignId=<id>` so that returned `itemAffiliateWebUrl` links are tagged. We use `itemAffiliateWebUrl` when present, otherwise `itemWebUrl`.
- **Relevance.** eBay search is fuzzy, so every title is checked against the catalog model (brand, product line and its aliases, variant words such as "Black" or "Maxload", model year, stamp) and obvious mismatches are dropped (fastpitch, baseball, youth, bags, grips, lots, rolled or shaved bats, other years and stamps). See `relevance.ts` and `tests/unit/ebay.test.ts`. When nothing matches, the section is not shown.
- **Caching.** Results are cached for one hour per search text with `unstable_cache` (eBay's API License asks for fresh data and the Browse API is rate limited). The home page makes at most 2 lookups per render, and most renders make none. After an error, the same search isn't retried for a minute.
- **Failures.** Any error or a timeout (3 seconds) renders nothing and logs `[ebay] search failed ...` on the server.
- **No storage.** eBay data is never written to our database.
- **Category.** `50797` is eBay's "Slowpitch Softball Bats" category (it appears in the URLs of eBay's own browse pages). **Verify it before launch** with the Taxonomy API (`GET /commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=slowpitch softball bat`) and set `EBAY_CATEGORY_IDS` if eBay says otherwise.

## Compliance notes (check the current terms yourself)

- **Disclosure.** Each section says "Listings from eBay. Gamer Bat may earn a commission if you buy through these links. Prices and availability are set on eBay." (the commission sentence appears only when the links really carry the campaign). Keep it visible and near the links.
- **Links.** They open in a new tab with `rel="sponsored noopener"`.
- **Attribution and marks.** The section says eBay is a trademark of eBay Inc. and that Gamer Bat is not affiliated with eBay. We use the word "eBay" only, not the logo. Don't add the eBay logo without following eBay's brand guidelines.
- **Data use.** Follow the eBay API License Agreement and EPN Participation Agreement: don't store listing data, keep it reasonably fresh, display prices as listed, and don't imply Gamer Bat sells these items or that buyer protection or the Bat Passport applies to them (the section says so).
- **Yellow is for Gamer Bat money.** eBay prices use plain steel styling, never the yellow price tag.

## Testing without eBay

Unit tests mock `fetch`. For screenshots only, `next dev` with `EBAY_MOCK_FILE=tests/fixtures/ebay-browse-sample.json` renders the section from an invented Browse-shaped response. That branch only runs when `NODE_ENV === "development"`, so it cannot run in a production build.
