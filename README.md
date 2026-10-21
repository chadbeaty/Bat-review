# Barrel Talk

A simple site for buying a slowpitch softball bat. It lists every current USSSA, USA (ASA), NSA, ISA and senior (SSUSA) bat and gathers what players say about them on Reddit, forums, YouTube and Facebook groups.

## What's in it

- **Bats**: 95 bats from 12 brands (Easton, DeMarini, Miken, Worth, Louisville Slugger, Monsta, Suncoast, Victus, Axe, Marucci, Anarchy, Anderson). You can filter by stamp, brand, end-load or balanced, one-piece or two-piece, material, barrel length, year and price.
- **Bat pages**: specs, a plain-English "who it fits", what players say (tone, topics, quotes with links to the original posts), links to compare prices, other versions and similar bats.
- **Bat Finder**: five questions (league, hitter type, feel, budget, priority) that return a ranked short list, with the reason each bat fits.
- **Compare**: up to four bats side by side, with the differences highlighted.
- **Saved**: a shortlist that stays on your device.
- **Buying guide**: stamps, load, one-piece vs two-piece, materials, weight, break-in and care.
- **Player reviews**: anyone can post a star rating and a review. These are saved on the device until you connect Supabase (below).

No build step and no dependencies. It's plain HTML, CSS and JavaScript modules.

## Run it locally

```sh
npm start          # http://localhost:8080
npm test           # catalog checks, matcher, scoring, finder
```

Use a local server like the one above. Opening `index.html` directly won't load the data files.

## How reviews are collected

`scripts/aggregate.mjs` collects posts, matches each one to a bat line ("Freak", "Ronin", "Bedlam"…), scores its tone and topics, and writes `data/community.json`, which the site reads. It also keeps `data/mentions.json` so data builds up week over week.

| Source | How | Setup |
| --- | --- | --- |
| Reddit | r/Softball, r/slowpitch, r/SlowPitchSoftball: new posts, a search for every bat line, and comments on those threads | Add `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` (see below) |
| Forums | RSS feeds listed in `scripts/sources.json` (SoftballFans by default) | None. Add more feeds to the file |
| YouTube | Comments on review and hitting videos for each bat line | Add `YOUTUBE_API_KEY` (free from Google Cloud, YouTube Data API v3) |
| Facebook groups | Paste posts into `data/imports/` (Facebook has no API for groups) | See `data/imports/README.md` |

Run it yourself with `npm run aggregate`. To run only some sources, use `node scripts/aggregate.mjs --only=imports,rss`. The GitHub Action in `.github/workflows/aggregate.yml` runs it every Monday and commits the new data.

### Reddit keys

1. Sign in to Reddit and go to https://www.reddit.com/prefs/apps, then create a **script** app.
2. Copy the client ID (under the app name) and the secret.
3. In GitHub, go to **Settings → Secrets and variables → Actions** and add `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET`.

Reddit now reviews new API access requests. If yours is pending, the aggregator falls back to Reddit's public JSON, which is slow and often blocked from cloud servers.

### How scoring works

- Names that are also everyday words ("mercy", "torch", "freak") only count when the post is clearly about bats. "Mercy rule" and "freak athlete" are excluded.
- Tone comes from a word list tuned for softball talk (`scripts/lib/sentiment.mjs`). "Hot", "mashing" and "pop" count as positive. "Dead", "cracked" and "sting" count as negative. "Broken in" is not counted as broken.
- The 0–100 community score only shows after 5 posts and is pulled toward 50 until there's more data.
- Quotes link to the original post. Usernames are not stored.

Until the first run, each bat line shows a few **starter notes**. They're labeled on the site as AI-written summaries, not player quotes, and posts replace them as they come in.

## Put it online (GitHub Pages)

1. Merge this branch into `main`.
2. In GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. The `Publish site` workflow deploys on every push to `main` and after every review collection run.

Any static host works too (Netlify, Vercel, Cloudflare Pages). Serve the repo root.

## Shared player reviews (optional)

Without a database, reviews stay on the reviewer's device. To share them with everyone:

1. Create a free project at https://supabase.com.
2. Open the SQL editor and run `supabase/reviews.sql`. It creates the table and lets the public key read and add reviews, but not edit or delete them.
3. Put the project URL and the **anon** public key in `assets/js/config.js`.

## Updating the bat catalog

Bats live in `data/bats.json`. Bat lines and the names used to match posts live in `data/families.json`. Each bat needs a `family` that exists in `families.json`, and `npm test` checks this. Specs come from manufacturer and retailer listings, and each bat links to the listing used. Prices marked `priceApprox` are typical retail prices.
